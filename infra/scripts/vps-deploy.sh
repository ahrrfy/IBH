#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Al-Ruya ERP — Safe VPS Deploy (preserves sirajalquran.org)
#
# This script REPLACES the old ibh deployment on ibherp.cloud
# while leaving sirajalquran.org untouched.
#
# Steps:
#   1. Detect existing ibh containers/dirs and STOP them (don't delete data yet)
#   2. Install Docker if missing (only adds, never removes host nginx)
#   3. Clone/update repo at /opt/al-ruya-erp
#   4. Generate .env (auto secrets if openssl available)
#   5. Build images, start stack on 127.0.0.1:8080 (no host port conflict)
#   6. Run prisma migrate + seed
#   7. Install host-nginx vhost for ibherp.cloud (port 80 → 8080)
#   8. Issue Let's Encrypt cert for ibherp.cloud
#   9. Reload host nginx
#  10. Verify https://ibherp.cloud/health
#
# Pre-flight check:
#   bash infra/scripts/vps-inspect.sh
#
# Usage on VPS as root:
#   bash /opt/al-ruya-erp/infra/scripts/vps-deploy.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/ahrrfy/IBH.git}"
REPO_DIR="${REPO_DIR:-/opt/al-ruya-erp}"
BRANCH="${BRANCH:-main}"
DOMAIN="${DOMAIN:-ibherp.cloud}"
ADMIN_EMAIL="${ADMIN_EMAIL:-alarabiya2017@gmail.com}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR]${NC} $*" >&2; }
sec()  { echo -e "\n${CYAN}══════ $* ══════${NC}"; }

require_root() {
  [ "$EUID" -eq 0 ] || { err "Run as root: sudo bash $0"; exit 1; }
}

# ── 1. Detect & stop OLD ibh deployment ─────────────────────────────────────
stop_old_ibh() {
  sec "1. Stopping old ibh deployment (preserving data)"
  local old_containers
  old_containers=$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -Ei '^ibh[-_]|^old-?ibh' || true)
  if [ -n "$old_containers" ]; then
    warn "Found old ibh containers — stopping (data volumes preserved):"
    echo "$old_containers"
    echo "$old_containers" | xargs -r docker stop || true
    log "Old containers stopped. Volumes NOT removed (manual: docker volume ls)."
  else
    log "No old ibh containers found."
  fi

  # Disable any host-nginx vhost that points to old ibh on port 80
  if [ -f /etc/nginx/sites-enabled/ibh ] || [ -f /etc/nginx/sites-enabled/ibherp.cloud ]; then
    warn "Found existing nginx vhost for ibh — backing up and replacing"
    for f in /etc/nginx/sites-enabled/ibh /etc/nginx/sites-enabled/ibherp.cloud /etc/nginx/sites-enabled/ibherp; do
      [ -f "$f" ] && mv "$f" "${f}.disabled.$(date +%s)"
    done
  fi
}

# ── 2. Install dependencies (additive only) ─────────────────────────────────
install_deps() {
  sec "2. Installing dependencies (apt — additive only)"
  apt-get update -y -qq
  apt-get install -y -qq ca-certificates curl gnupg git ufw

  if ! command -v docker &>/dev/null; then
    log "Installing Docker Engine…"
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -y -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
  fi
  log "Docker: $(docker --version)"

  if ! command -v nginx &>/dev/null; then
    log "Installing host nginx (will host the ibherp.cloud vhost)…"
    apt-get install -y -qq nginx
    systemctl enable --now nginx
  fi
  log "Host nginx: $(nginx -v 2>&1)"

  if ! command -v certbot &>/dev/null; then
    log "Installing certbot…"
    apt-get install -y -qq certbot python3-certbot-nginx
  fi
}

# ── 3. Clone repo ───────────────────────────────────────────────────────────
clone_repo() {
  sec "3. Syncing repository"
  if [ -d "$REPO_DIR/.git" ]; then
    git -C "$REPO_DIR" fetch --all
    git -C "$REPO_DIR" reset --hard "origin/$BRANCH"
  else
    git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
  fi
  log "Repo at: $(git -C "$REPO_DIR" rev-parse --short HEAD)"
}

# ── 4. Prepare .env ─────────────────────────────────────────────────────────
prepare_env() {
  sec "4. Preparing .env"
  cd "$REPO_DIR/infra"
  if [ -f .env ]; then
    log ".env already exists — leaving untouched"
    return
  fi
  cp .env.production.example .env
  PG_PWD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
  REDIS_PWD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
  JWT=$(openssl rand -base64 48 | tr -d '/+=' | head -c 64)
  MINIO_PWD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$PG_PWD|"   .env
  sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$REDIS_PWD|"      .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|"                    .env
  sed -i "s|^MINIO_SECRET_KEY=.*|MINIO_SECRET_KEY=$MINIO_PWD|"  .env
  sed -i "s|^APP_URL=.*|APP_URL=https://${DOMAIN}|"             .env
  sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=https://${DOMAIN}|"   .env
  chmod 600 .env
  log "Generated .env (chmod 600)"
}

# ── 5. Build & start ────────────────────────────────────────────────────────
build_start() {
  sec "5. Building & starting Docker stack"
  cd "$REPO_DIR/infra"
  docker compose -f docker-compose.bootstrap.yml --env-file .env build --pull
  docker compose -f docker-compose.bootstrap.yml --env-file .env up -d
  log "Waiting for postgres…"
  for _ in {1..60}; do
    docker compose -f docker-compose.bootstrap.yml --env-file .env exec -T postgres \
      pg_isready -U erp_app -d alruya_erp &>/dev/null && break
    sleep 2
  done
  log "Postgres ready"
}

# ── 6. Migrations + seed ────────────────────────────────────────────────────
migrate() {
  sec "6. Running prisma migrate + seed"
  cd "$REPO_DIR/infra"
  docker compose -f docker-compose.bootstrap.yml --env-file .env exec -T api \
    sh -c 'cd /app && npx prisma migrate deploy --schema=prisma/schema.prisma' \
    || warn "migrate deploy returned non-zero"
  docker compose -f docker-compose.bootstrap.yml --env-file .env exec -T api \
    sh -c 'cd /app && npx prisma db seed' \
    || warn "seed returned non-zero (may already be seeded)"
}

# ── 7. Host nginx vhost ─────────────────────────────────────────────────────
install_vhost() {
  sec "7. Installing host nginx vhost for ibherp.cloud"
  install -m 644 "$REPO_DIR/infra/nginx/host-vhost-ibherp.conf" \
    /etc/nginx/sites-available/ibherp.cloud
  # First pass: HTTP-only (so certbot can do ACME challenge)
  cat > /etc/nginx/sites-available/ibherp.cloud.bootstrap <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ibherp.cloud www.ibherp.cloud;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { proxy_pass http://127.0.0.1:8080; proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr; }
}
EOF
  ln -sf /etc/nginx/sites-available/ibherp.cloud.bootstrap /etc/nginx/sites-enabled/ibherp.cloud
  mkdir -p /var/www/certbot
  nginx -t && systemctl reload nginx
  log "HTTP vhost active for $DOMAIN"
}

# ── 8. Let's Encrypt ────────────────────────────────────────────────────────
issue_cert() {
  sec "8. Issuing Let's Encrypt certificate"
  if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    log "Cert for $DOMAIN already exists — skipping issuance"
  else
    certbot certonly --webroot -w /var/www/certbot \
      -d "$DOMAIN" -d "www.$DOMAIN" \
      --non-interactive --agree-tos --email "$ADMIN_EMAIL" \
      || { err "certbot failed — DNS may not be pointing to this VPS yet"; exit 1; }
  fi
  # Switch to full HTTPS vhost
  ln -sf /etc/nginx/sites-available/ibherp.cloud /etc/nginx/sites-enabled/ibherp.cloud
  nginx -t && systemctl reload nginx
  log "HTTPS vhost active for $DOMAIN"
}

# ── 9. Verify ───────────────────────────────────────────────────────────────
verify() {
  sec "9. Verifying"
  sleep 3
  if curl -fsS "https://$DOMAIN/health" >/dev/null 2>&1; then
    log "✅ https://$DOMAIN/health responding"
    curl -s "https://$DOMAIN/health" && echo
  else
    warn "https://$DOMAIN/health not responding yet — check 'docker compose logs api'"
  fi
  echo
  log "Stack status:"
  docker compose -f "$REPO_DIR/infra/docker-compose.bootstrap.yml" --env-file "$REPO_DIR/infra/.env" ps
}

main() {
  require_root
  echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
  echo -e "${CYAN} Al-Ruya ERP — VPS Deploy${NC}"
  echo -e "${CYAN} Domain:  $DOMAIN${NC}"
  echo -e "${CYAN} Repo:    $REPO_DIR (branch: $BRANCH)${NC}"
  echo -e "${CYAN} Note:    sirajalquran.org will NOT be touched${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
  stop_old_ibh
  install_deps
  clone_repo
  prepare_env
  build_start
  migrate
  install_vhost
  issue_cert
  verify
  echo -e "\n${GREEN}═══════════════════════════════════════════════════${NC}"
  echo -e "${GREEN} ✅ Done${NC}"
  echo -e "${GREEN} → Open: https://$DOMAIN/${NC}"
  echo -e "${GREEN} → Logs: docker compose -f $REPO_DIR/infra/docker-compose.bootstrap.yml logs -f${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
}

main "$@"
