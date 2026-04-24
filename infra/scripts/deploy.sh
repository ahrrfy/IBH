#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Al-Ruya ERP — VPS Deployment Script
# Run on: VPS (Ubuntu 24.04) as root or sudo user
# Usage: bash infra/scripts/deploy.sh [--first-run]
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

COMPOSE_FILE="infra/docker-compose.vps.yml"
ENV_FILE=".env"
REPO_DIR="/opt/al-ruya-erp"
GIT_REPO="git@github.com:al-ruya/erp.git"   # adjust to your Gitea/GitHub URL

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR]${NC} $*" >&2; }

# ── Check dependencies ────────────────────────────────────────────────────────
check_deps() {
  for cmd in docker git curl; do
    if ! command -v "$cmd" &>/dev/null; then
      err "$cmd is not installed. Run: apt install -y $cmd"
      exit 1
    fi
  done
  if ! docker compose version &>/dev/null; then
    err "Docker Compose v2 required. Install: https://docs.docker.com/compose/install/"
    exit 1
  fi
}

# ── First-time system setup ───────────────────────────────────────────────────
first_run_setup() {
  log "Installing system dependencies..."
  apt-get update -qq
  apt-get install -y -qq \
    docker.io docker-compose-plugin \
    git curl wget nginx certbot python3-certbot-nginx \
    ufw fail2ban unattended-upgrades

  log "Configuring UFW firewall..."
  ufw --force reset
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp   comment 'SSH'
  ufw allow 80/tcp   comment 'HTTP'
  ufw allow 443/tcp  comment 'HTTPS'
  ufw --force enable

  log "Starting Docker..."
  systemctl enable docker
  systemctl start docker

  log "First-run setup complete."
}

# ── Pull latest code ──────────────────────────────────────────────────────────
pull_code() {
  if [ -d "$REPO_DIR" ]; then
    log "Pulling latest code..."
    cd "$REPO_DIR"
    git fetch origin
    git reset --hard origin/main
  else
    log "Cloning repository..."
    git clone "$GIT_REPO" "$REPO_DIR"
    cd "$REPO_DIR"
  fi
}

# ── Validate environment ──────────────────────────────────────────────────────
validate_env() {
  if [ ! -f "$ENV_FILE" ]; then
    err ".env file not found at $REPO_DIR/.env"
    err "Copy .env.example to .env and fill in all values."
    exit 1
  fi

  # Check required vars
  REQUIRED_VARS=(
    "POSTGRES_PASSWORD"
    "REDIS_PASSWORD"
    "JWT_SECRET"
    "MINIO_ACCESS_KEY"
    "MINIO_SECRET_KEY"
    "RESTIC_PASSWORD"
    "GRAFANA_ADMIN_PASSWORD"
  )
  for var in "${REQUIRED_VARS[@]}"; do
    if ! grep -q "^${var}=" "$ENV_FILE" || grep -q "^${var}=CHANGE_ME" "$ENV_FILE"; then
      err "Required env var $var is missing or not configured in .env"
      exit 1
    fi
  done
  log "Environment validation passed."
}

# ── Build and deploy ──────────────────────────────────────────────────────────
deploy() {
  log "Building Docker images..."
  docker compose -f "$COMPOSE_FILE" build --no-cache api

  log "Running database migrations..."
  docker compose -f "$COMPOSE_FILE" run --rm api \
    pnpm --filter api prisma migrate deploy

  log "Starting services..."
  docker compose -f "$COMPOSE_FILE" up -d \
    postgres redis minio api nginx certbot backup

  log "Waiting for API health check..."
  for i in {1..30}; do
    if docker compose -f "$COMPOSE_FILE" exec -T api \
        wget -qO- http://localhost:3000/health 2>/dev/null | grep -q '"status":"ok"'; then
      log "API is healthy ✓"
      break
    fi
    if [ $i -eq 30 ]; then
      err "API health check failed after 30 attempts."
      docker compose -f "$COMPOSE_FILE" logs --tail=50 api
      exit 1
    fi
    sleep 3
  done

  log "Running database seed (idempotent)..."
  docker compose -f "$COMPOSE_FILE" run --rm api \
    pnpm --filter api prisma db seed || warn "Seed already applied or failed — check logs"
}

# ── SSL certificate setup ─────────────────────────────────────────────────────
setup_ssl() {
  DOMAINS=(
    "api.al-ruya.iq"
    "app.al-ruya.iq"
    "store.al-ruya.iq"
    "minio.al-ruya.iq"
    "grafana.al-ruya.iq"
  )

  log "Obtaining SSL certificates..."
  for domain in "${DOMAINS[@]}"; do
    certbot certonly \
      --webroot -w /var/www/certbot \
      --email admin@al-ruya.iq \
      --agree-tos \
      --no-eff-email \
      --non-interactive \
      -d "$domain" || warn "Certificate for $domain already exists or failed"
  done

  log "Reloading Nginx..."
  docker compose -f "$COMPOSE_FILE" exec nginx nginx -s reload
}

# ── Cleanup old images ────────────────────────────────────────────────────────
cleanup() {
  log "Removing unused Docker images..."
  docker image prune -f
  docker volume prune -f --filter "label!=keep"
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  check_deps

  if [ "${1:-}" = "--first-run" ]; then
    first_run_setup
  fi

  cd "$REPO_DIR"
  pull_code
  validate_env
  deploy

  if [ "${1:-}" = "--first-run" ]; then
    setup_ssl
  fi

  cleanup
  log "Deployment complete! ✓"
  log "API: https://api.al-ruya.iq"
  log "App: https://app.al-ruya.iq"
}

main "$@"
