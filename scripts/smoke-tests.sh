#!/usr/bin/env bash
# Phase 3.D — Production smoke tests. Runs from a workstation against the
# VPS over SSH (no agent installed on the box). Outputs a markdown report
# under governance/evidence/smoke-tests/run-<UTC>.md plus prints a summary
# to stdout. Each check exits 0 on pass, non-zero on fail; the runner keeps
# going either way and totals at the end.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_HOST="${SSH_HOST:-ibherp}"
DOMAIN="${DOMAIN:-ibherp.cloud}"
API_BASE="${API_BASE:-https://${DOMAIN}/api/v1}"

TS=$(date -u +%FT%TZ)
OUT_DIR="$ROOT/governance/evidence/smoke-tests"
mkdir -p "$OUT_DIR"
REPORT="$OUT_DIR/run-${TS//:/-}.md"

PASS=0
FAIL=0
WARN=0

green() { printf "\033[0;32m%s\033[0m\n" "$1"; }
red()   { printf "\033[0;31m%s\033[0m\n" "$1"; }
yellow(){ printf "\033[1;33m%s\033[0m\n" "$1"; }

# section <id> <title>
section() {
  echo
  echo "═══ $2 ═══"
  echo
  echo "## $2" >> "$REPORT"
  echo >> "$REPORT"
}

# pass <msg>
pass() { green "  ✅ $1"; echo "- ✅ $1" >> "$REPORT"; PASS=$((PASS+1)); }
fail() { red   "  ❌ $1"; echo "- ❌ $1" >> "$REPORT"; FAIL=$((FAIL+1)); }
warn() { yellow "  ⚠️  $1"; echo "- ⚠️ $1" >> "$REPORT"; WARN=$((WARN+1)); }

# ── Header ───────────────────────────────────────────────────────────────────
{
  echo "# Production smoke tests — $TS"
  echo
  echo "Host: \`$SSH_HOST\` · Domain: \`$DOMAIN\` · API: \`$API_BASE\`"
} > "$REPORT"

# ── 1. Docker service health ─────────────────────────────────────────────────
section "docker" "1. Docker service health"

DOCKER_STATUS=$(ssh "$SSH_HOST" 'docker ps --format "{{.Names}}|{{.Status}}"' 2>&1)
EXPECTED_SERVICES="api postgres redis nginx minio web storefront license-server ai-brain"
for svc in $EXPECTED_SERVICES; do
  line=$(echo "$DOCKER_STATUS" | grep "infra-${svc}-1" || true)
  if [ -z "$line" ]; then
    fail "$svc — container missing"
  elif echo "$line" | grep -q "healthy"; then
    pass "$svc — $(echo "$line" | cut -d'|' -f2)"
  elif echo "$line" | grep -q "Up"; then
    warn "$svc — running but no healthcheck or unhealthy: $(echo "$line" | cut -d'|' -f2)"
  else
    fail "$svc — $line"
  fi
done

# ── 2. Public API health ─────────────────────────────────────────────────────
section "api" "2. Public API health"

HEALTH=$(curl -sf -o /tmp/health.json -w "%{http_code}|%{time_total}" --max-time 15 "$API_BASE/health" 2>&1 || echo "fail")
if [[ "$HEALTH" =~ ^200 ]]; then
  pass "GET $API_BASE/health → 200 ($(echo "$HEALTH" | cut -d'|' -f2)s)"
  if grep -q '"database":"ok"' /tmp/health.json 2>/dev/null; then
    pass "Database probe = ok"
  else
    fail "Database probe missing or not ok in health body"
  fi
else
  fail "Health endpoint failed: $HEALTH"
fi

# ── 3. SSL certificate validity ──────────────────────────────────────────────
section "ssl" "3. SSL certificate"

CERT_INFO=$(echo | timeout 10 openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | \
  openssl x509 -noout -subject -issuer -enddate 2>/dev/null || echo "fail")
if echo "$CERT_INFO" | grep -q "fail"; then
  fail "Could not retrieve certificate from $DOMAIN:443"
else
  END_DATE=$(echo "$CERT_INFO" | grep notAfter | sed 's/notAfter=//')
  END_EPOCH=$(date -d "$END_DATE" +%s 2>/dev/null || echo 0)
  NOW_EPOCH=$(date -u +%s)
  DAYS_LEFT=$(( (END_EPOCH - NOW_EPOCH) / 86400 ))
  if [ "$DAYS_LEFT" -gt 30 ]; then
    pass "Certificate valid until $END_DATE ($DAYS_LEFT days)"
  elif [ "$DAYS_LEFT" -gt 14 ]; then
    warn "Certificate expires in $DAYS_LEFT days — within renewal window"
  else
    fail "Certificate expires in $DAYS_LEFT days — renewal urgent"
  fi
  ISSUER=$(echo "$CERT_INFO" | grep issuer | sed 's/issuer=//')
  pass "Issuer: $ISSUER"
fi

# HSTS + cipher
HEADERS=$(curl -sI --max-time 10 "https://$DOMAIN/" 2>/dev/null)
if echo "$HEADERS" | grep -qi "strict-transport-security"; then
  HSTS_LINE=$(echo "$HEADERS" | grep -i "strict-transport-security" | tr -d '\r')
  pass "HSTS header present: $HSTS_LINE"
else
  fail "HSTS header missing"
fi

# ── 4. Security headers ──────────────────────────────────────────────────────
section "headers" "4. Security headers"

for hdr in "X-Frame-Options" "X-Content-Type-Options" "Content-Security-Policy" "Referrer-Policy"; do
  if echo "$HEADERS" | grep -qi "^$hdr:"; then
    pass "$hdr present"
  else
    fail "$hdr missing"
  fi
done

# ── 5. Postgres + Redis volumes ──────────────────────────────────────────────
section "data" "5. Database connectivity + volumes"

PG_SIZE=$(ssh "$SSH_HOST" 'docker exec infra-postgres-1 psql -U erp_app -d alruya_erp -tAc "SELECT pg_size_pretty(pg_database_size(current_database()));"' 2>/dev/null | tr -d ' ')
if [ -n "$PG_SIZE" ]; then
  pass "Postgres alive · DB size: $PG_SIZE"
else
  fail "Could not query Postgres"
fi

PG_TABLES=$(ssh "$SSH_HOST" 'docker exec infra-postgres-1 psql -U erp_app -d alruya_erp -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='"'"'public'"'"';"' 2>/dev/null | tr -d ' ')
if [ -n "$PG_TABLES" ] && [ "$PG_TABLES" -gt 50 ]; then
  pass "Schema present: $PG_TABLES public tables"
else
  fail "Schema sparse or missing: $PG_TABLES tables"
fi

REDIS_PING=$(ssh "$SSH_HOST" 'docker exec infra-redis-1 redis-cli -a "$(grep REDIS_PASSWORD /opt/al-ruya-erp/infra/.env | cut -d= -f2)" ping 2>/dev/null' 2>&1 | tail -1)
if [ "$REDIS_PING" = "PONG" ]; then
  pass "Redis PING → PONG"
else
  fail "Redis ping failed: $REDIS_PING"
fi

# ── 6. Backup + restore drill ────────────────────────────────────────────────
section "backup" "6. Backup verification"

BACKUP_LIST=$(ssh "$SSH_HOST" 'ls -lh /var/backups/al-ruya/*.sql.gz 2>/dev/null | tail -3' 2>&1 || echo "")
if [ -n "$BACKUP_LIST" ] && echo "$BACKUP_LIST" | grep -q ".sql.gz"; then
  RECENT=$(echo "$BACKUP_LIST" | tail -1 | awk '{print $NF}')
  AGE=$(ssh "$SSH_HOST" "stat -c '%Y' '$RECENT' 2>/dev/null" || echo 0)
  AGE_DAYS=$(( ($(date -u +%s) - AGE) / 86400 ))
  if [ "$AGE_DAYS" -le 1 ]; then
    pass "Recent backup found: $RECENT (${AGE_DAYS}d old)"
  else
    warn "Most recent backup is ${AGE_DAYS}d old — check cron"
  fi
else
  warn "No local pg backups found in /var/backups/al-ruya"
fi

# Restic offsite
RESTIC=$(ssh "$SSH_HOST" 'ls /opt/al-ruya-erp/infra/backup/ 2>/dev/null | head -3' 2>&1 || echo "")
if [ -n "$RESTIC" ]; then
  pass "Backup config present: $(echo "$RESTIC" | tr '\n' ' ')"
else
  warn "No backup config in infra/backup/"
fi

# ── 7. Disk + memory usage ───────────────────────────────────────────────────
section "resources" "7. Host resources"

DISK=$(ssh "$SSH_HOST" "df -h / | tail -1" 2>&1)
DISK_PCT=$(echo "$DISK" | awk '{print $5}' | tr -d '%')
if [ "$DISK_PCT" -lt 80 ]; then
  pass "Disk: $DISK"
elif [ "$DISK_PCT" -lt 90 ]; then
  warn "Disk: $DISK"
else
  fail "Disk: $DISK"
fi

MEM=$(ssh "$SSH_HOST" "free -m | awk '/^Mem:/ {printf \"%dMB used / %dMB total (%d%%)\", \$3, \$2, \$3*100/\$2}'" 2>&1)
pass "Memory: $MEM"

LOAD=$(ssh "$SSH_HOST" "uptime | awk -F'load average: ' '{print \$2}'" 2>&1)
pass "Load average: $LOAD"

# ── 8. Critical RLS + append-only invariants ────────────────────────────────
section "rls" "8. F2/F3 invariants on production DB"

# Append-only triggers
for trg in no_update_audit_logs no_update_je_lines no_update_stock_ledger; do
  EXISTS=$(ssh "$SSH_HOST" "docker exec infra-postgres-1 psql -U erp_app -d alruya_erp -tAc \"SELECT 1 FROM pg_trigger WHERE tgname='$trg';\"" 2>/dev/null | tr -d ' ')
  if [ "$EXISTS" = "1" ]; then
    pass "Trigger $trg present (F2/F3 append-only)"
  else
    fail "Trigger $trg MISSING — F2/F3 invariant unprotected"
  fi
done

# RLS enabled on a sample of multi-tenant tables
for tbl in users sales_invoices stock_ledger journal_entries; do
  RLS=$(ssh "$SSH_HOST" "docker exec infra-postgres-1 psql -U erp_app -d alruya_erp -tAc \"SELECT relrowsecurity FROM pg_class WHERE relname='$tbl';\"" 2>/dev/null | tr -d ' ')
  if [ "$RLS" = "t" ]; then
    pass "RLS enabled on $tbl"
  else
    fail "RLS DISABLED on $tbl — F1 tenant isolation broken"
  fi
done

# ── 9. Cron jobs registered in BullMQ ────────────────────────────────────────
section "cron" "9. BullMQ cron registration"

REDIS_PASS=$(ssh "$SSH_HOST" 'grep REDIS_PASSWORD /opt/al-ruya-erp/infra/.env | cut -d= -f2' 2>/dev/null)
CRON_KEYS=$(ssh "$SSH_HOST" "docker exec infra-redis-1 redis-cli -a '$REDIS_PASS' --scan --pattern 'erp:queue:*:repeat:*'" 2>/dev/null | wc -l)
if [ "$CRON_KEYS" -gt 0 ]; then
  pass "BullMQ repeatable jobs registered: $CRON_KEYS keys"
  ssh "$SSH_HOST" "docker exec infra-redis-1 redis-cli -a '$REDIS_PASS' --scan --pattern 'erp:queue:*:repeat:*'" 2>/dev/null | head -10 | while read -r k; do
    echo "    · $k"
    echo "  · $k" >> "$REPORT"
  done
else
  warn "No BullMQ repeatable jobs registered (BillingSweep should be there)"
fi

# ── 10. Summary ──────────────────────────────────────────────────────────────
{
  echo
  echo "## Summary"
  echo
  echo "| Result | Count |"
  echo "|--------|-------|"
  echo "| ✅ Pass | $PASS |"
  echo "| ❌ Fail | $FAIL |"
  echo "| ⚠️ Warn | $WARN |"
} >> "$REPORT"

echo
echo "═══ Summary ═══"
green "  ✅ $PASS pass"
[ "$WARN" -gt 0 ] && yellow "  ⚠️  $WARN warn"
[ "$FAIL" -gt 0 ] && red    "  ❌ $FAIL fail"
echo
echo "Report: $REPORT"

[ "$FAIL" -eq 0 ]
