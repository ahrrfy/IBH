#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Al-Ruya ERP — VPS Bootstrap (run ONCE on a fresh Ubuntu 24.04 VPS)
#
# What this does:
#   1. Installs Docker + Docker Compose plugin
#   2. Clones repo to /opt/al-ruya-erp
#   3. Creates .env from template (you must fill in passwords)
#   4. Starts the bootstrap stack (postgres, redis, minio, api, web, nginx)
#   5. Runs prisma migrate deploy + seed
#   6. Verifies /health
#
# Usage on VPS as root:
#   curl -fsSL https://raw.githubusercontent.com/ahrrfy/IBH/main/infra/scripts/vps-bootstrap.sh | bash
#   # OR after cloning:
#   bash /opt/al-ruya-erp/infra/scripts/vps-bootstrap.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/ahrrfy/IBH.git}"
REPO_DIR="${REPO_DIR:-/opt/al-ruya-erp}"
BRANCH="${BRANCH:-main}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR]${NC} $*" >&2; }

require_root() {
  if [ "$EUID" -ne 0 ]; then
    err "Run as root: sudo bash $0"
    exit 1
  fi
}

install_docker() {
  if command -v docker &>/dev/null && docker compose version &>/dev/null; then
    log "Docker + Compose already installed: $(docker --version)"
    return
  fi
  log "Installing Docker Engine + Compose plugin…"
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg git ufw
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
    | tee /etc/apt/sources.list.d/docker.list >/dev/null
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  log "Docker installed: $(docker --version)"
}

setup_firewall() {
  log "Configuring UFW firewall (22, 80, 443)…"
  ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
  log "Firewall: $(ufw status | head -1)"
}

clone_repo() {
  if [ -d "$REPO_DIR/.git" ]; then
    log "Repo exists at $REPO_DIR — pulling latest…"
    git -C "$REPO_DIR" fetch --all
    git -C "$REPO_DIR" reset --hard "origin/$BRANCH"
  else
    log "Cloning $REPO_URL → $REPO_DIR…"
    git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
  fi
  log "Repo at: $(git -C "$REPO_DIR" rev-parse --short HEAD)"
}

prepare_env() {
  cd "$REPO_DIR/infra"
  if [ -f .env ]; then
    log ".env already exists — skipping creation"
    return
  fi
  log "Creating .env from template…"
  cp .env.production.example .env
  # Auto-generate secrets if openssl is available
  if command -v openssl &>/dev/null; then
    PG_PWD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
    REDIS_PWD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
    JWT=$(openssl rand -base64 48 | tr -d '/+=' | head -c 64)
    MINIO_PWD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
    sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$PG_PWD|" .env
    sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$REDIS_PWD|" .env
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" .env
    sed -i "s|^MINIO_SECRET_KEY=.*|MINIO_SECRET_KEY=$MINIO_PWD|" .env
    log "Auto-generated secrets in $REPO_DIR/infra/.env"
  else
    warn "openssl not found — edit .env manually before continuing"
  fi
  chmod 600 .env
}

build_and_start() {
  cd "$REPO_DIR/infra"
  log "Building images (this may take 5–10 minutes on first run)…"
  docker compose -f docker-compose.bootstrap.yml --env-file .env build --pull
  log "Starting stack…"
  docker compose -f docker-compose.bootstrap.yml --env-file .env up -d
  log "Waiting for postgres health…"
  for i in {1..60}; do
    if docker compose -f docker-compose.bootstrap.yml --env-file .env exec -T postgres pg_isready -U erp_app -d alruya_erp &>/dev/null; then
      log "Postgres ready"
      break
    fi
    sleep 2
  done
}

run_migrations() {
  cd "$REPO_DIR/infra"
  log "Running prisma migrate deploy…"
  docker compose -f docker-compose.bootstrap.yml --env-file .env exec -T api \
    sh -c 'cd /app && npx prisma migrate deploy --schema=prisma/schema.prisma' || \
    warn "migrate deploy returned non-zero — check logs"
  log "Running seed (Iraqi CoA + admin user)…"
  docker compose -f docker-compose.bootstrap.yml --env-file .env exec -T api \
    sh -c 'cd /app && npx prisma db seed' || \
    warn "seed returned non-zero — check logs"
}

verify() {
  log "Verifying API /health…"
  for i in {1..30}; do
    if curl -fsS http://localhost/health >/dev/null 2>&1; then
      log "✅ API responding via Nginx"
      curl -s http://localhost/health
      echo
      break
    fi
    sleep 3
  done
  log "Stack status:"
  docker compose -f "$REPO_DIR/infra/docker-compose.bootstrap.yml" --env-file "$REPO_DIR/infra/.env" ps
}

main() {
  require_root
  log "═══════════════════════════════════════════════════"
  log "Al-Ruya ERP — VPS Bootstrap"
  log "Target: $REPO_DIR (branch: $BRANCH)"
  log "═══════════════════════════════════════════════════"
  install_docker
  setup_firewall
  clone_repo
  prepare_env
  build_and_start
  run_migrations
  verify
  log "═══════════════════════════════════════════════════"
  log "✅ Done. Open http://$(curl -s ifconfig.me)/ in your browser."
  log "Secrets stored in: $REPO_DIR/infra/.env (chmod 600)"
  log "Logs:  docker compose -f $REPO_DIR/infra/docker-compose.bootstrap.yml logs -f"
  log "═══════════════════════════════════════════════════"
}

main "$@"
