#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# health-check.sh — verify all 8 Docker Compose services are healthy
#
# Usage:
#   bash scripts/health-check.sh                        # defaults to prod
#   bash scripts/health-check.sh --env dev              # dev stack
#   COMPOSE_FILE=infra/docker-compose.dev.yml bash scripts/health-check.sh
#
# Exit codes: 0 = all healthy, 1 = one or more degraded/missing
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS=0; FAIL=0

log_pass() { echo -e "  ${GREEN}✅ $1${NC}"; PASS=$((PASS+1)); }
log_fail() { echo -e "  ${RED}❌ $1${NC}"; FAIL=$((FAIL+1)); }
log_warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; }

BASE_URL="${BASE_URL:-https://api.ibherp.cloud}"
COMPOSE_FILE="${COMPOSE_FILE:-infra/docker-compose.vps-override.yml}"

echo "═══════════════════════════════════════════════════"
echo "  🏥 Al-Ruya ERP — Health Check"
echo "  $(date '+%Y-%m-%d %H:%M:%S UTC')"
echo "  Base URL: $BASE_URL"
echo "═══════════════════════════════════════════════════"
echo ""

# ── 1. Docker service health ─────────────────────────────────────────────────
echo "🐳 Docker Compose service status..."

SERVICES=(api postgres redis minio nginx whatsapp-bridge license-server)

for svc in "${SERVICES[@]}"; do
  STATUS=$(docker compose -f "$COMPOSE_FILE" ps --status running --format json 2>/dev/null \
    | grep -o "\"$svc\"" | head -1 || echo "")
  if [ -z "$STATUS" ]; then
    # Try plain docker ps
    RUNNING=$(docker ps --filter "name=${svc}" --filter "status=running" --format "{{.Names}}" 2>/dev/null | head -1)
    if [ -n "$RUNNING" ]; then
      log_pass "Docker: $svc running ($RUNNING)"
    else
      log_fail "Docker: $svc not running"
    fi
  else
    log_pass "Docker: $svc running"
  fi
done

echo ""

# ── 2. API health endpoint ────────────────────────────────────────────────────
echo "🔗 API health endpoints..."

check_url() {
  local label="$1" url="$2" expected="${3:-200}"
  HTTP=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
  if [ "$HTTP" = "$expected" ]; then
    log_pass "$label → HTTP $HTTP"
  else
    log_fail "$label → HTTP $HTTP (expected $expected)"
  fi
}

check_url "GET /health"                  "$BASE_URL/health"
check_url "GET /health/db"               "$BASE_URL/health/db"
check_url "GET /health/redis"            "$BASE_URL/health/redis"
check_url "GET /health/minio"            "$BASE_URL/health/minio"
check_url "API (no auth → 401)"          "$BASE_URL/products" 401
check_url "Storefront root"              "https://shop.ibherp.cloud" 200
check_url "License server /health"       "https://license.ibherp.cloud/health" 200

echo ""

# ── 3. SSL certificate validity ───────────────────────────────────────────────
echo "🔒 SSL certificate expiry..."

check_ssl() {
  local domain="$1"
  local days_left
  days_left=$(echo | openssl s_client -servername "$domain" -connect "${domain}:443" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null \
    | sed 's/notAfter=//' \
    | xargs -I{} sh -c 'echo $(( ( $(date -d "{}" +%s 2>/dev/null || date -jf "%b %d %T %Y %Z" "{}" +%s 2>/dev/null) - $(date +%s) ) / 86400 ))' 2>/dev/null || echo "-1")
  if [ "$days_left" -gt 14 ] 2>/dev/null; then
    log_pass "SSL $domain: ${days_left}d remaining"
  elif [ "$days_left" -gt 0 ] 2>/dev/null; then
    log_warn "SSL $domain: ${days_left}d remaining (renew soon)"
  else
    log_fail "SSL $domain: certificate expired or unreachable"
  fi
}

check_ssl "api.ibherp.cloud"
check_ssl "shop.ibherp.cloud"
check_ssl "license.ibherp.cloud"

echo ""

# ── 4. Database connectivity ──────────────────────────────────────────────────
echo "🗄️  Database checks..."

if command -v psql &>/dev/null && [ -n "${DATABASE_URL:-}" ]; then
  TABLES=$(psql "$DATABASE_URL" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null || echo "0")
  if [ "$TABLES" -gt 50 ] 2>/dev/null; then
    log_pass "PostgreSQL: $TABLES tables in public schema"
  else
    log_fail "PostgreSQL: only $TABLES tables found (expected 50+)"
  fi

  # Verify critical extensions
  for ext in pgcrypto pg_trgm vector; do
    EXISTS=$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM pg_extension WHERE extname='$ext'" 2>/dev/null || echo "")
    if [ "$EXISTS" = "1" ]; then
      log_pass "Extension $ext installed"
    else
      log_fail "Extension $ext missing"
    fi
  done
else
  log_warn "psql not in PATH or DATABASE_URL not set — skipping direct DB checks"
fi

echo ""

# ── 5. Redis connectivity ─────────────────────────────────────────────────────
echo "📦 Redis check..."

if command -v redis-cli &>/dev/null && [ -n "${REDIS_URL:-}" ]; then
  PONG=$(redis-cli -u "$REDIS_URL" ping 2>/dev/null || echo "FAIL")
  if [ "$PONG" = "PONG" ]; then
    log_pass "Redis: PONG"
  else
    log_fail "Redis: no response"
  fi
else
  log_warn "redis-cli not in PATH or REDIS_URL not set — skipping Redis check"
fi

echo ""

# ── 6. Backup freshness ───────────────────────────────────────────────────────
echo "💾 Backup freshness..."

if command -v restic &>/dev/null && [ -n "${RESTIC_REPOSITORY:-}" ]; then
  LATEST=$(restic snapshots --latest 1 --json 2>/dev/null | jq -r '.[0].time' 2>/dev/null || echo "")
  if [ -n "$LATEST" ]; then
    HOURS_AGO=$(( ( $(date +%s) - $(date -d "$LATEST" +%s 2>/dev/null || echo 0) ) / 3600 ))
    if [ "$HOURS_AGO" -lt 25 ]; then
      log_pass "Restic: last snapshot ${HOURS_AGO}h ago"
    else
      log_fail "Restic: last snapshot ${HOURS_AGO}h ago (>24h — backup may have missed)"
    fi
  else
    log_fail "Restic: no snapshots found"
  fi
else
  log_warn "restic not in PATH or RESTIC_REPOSITORY not set — skipping backup check"
fi

echo ""

# ── Summary ───────────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════"
echo -e "  PASS: ${GREEN}${PASS}${NC}   FAIL: ${RED}${FAIL}${NC}"
echo "═══════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}❌ Health check FAILED — $FAIL issue(s) detected${NC}"
  exit 1
else
  echo -e "${GREEN}✅ All checks passed${NC}"
  exit 0
fi
