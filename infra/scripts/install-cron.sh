#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Al-Ruya ERP — Install Cron Entries on VPS
#
# Idempotent: removes prior al-ruya-erp entries and re-adds the canonical
# set. Safe to re-run after deploys.
#
# Schedules:
#   - backup-cron.sh        @ 02:00 daily
#   - backup-offsite.sh     @ 02:30 daily (B2 mirror — skipped if not configured)
#   - ssl-renew.sh          @ 03:17 + 15:17 daily (LE recommends twice/day)
#   - ssl-expiry-check.sh   @ 04:42 daily (proactive notAfter monitor)
#
# Usage (on VPS, as root):
#   bash /opt/al-ruya-erp/infra/scripts/install-cron.sh
#
# Verify:
#   crontab -l | grep al-ruya-erp
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/al-ruya-erp}"
BACKUP_WRAPPER="${REPO_ROOT}/infra/scripts/backup-cron.sh"
OFFSITE_WRAPPER="${REPO_ROOT}/infra/scripts/backup-offsite.sh"
SSL_WRAPPER="${REPO_ROOT}/infra/scripts/ssl-renew.sh"
EXPIRY_WRAPPER="${REPO_ROOT}/infra/scripts/ssl-expiry-check.sh"
LOG_DIR="${LOG_DIR:-/var/log/al-ruya-erp}"
TAG="# al-ruya-erp:cron"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: must run as root (need to edit root crontab)" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

for f in "$BACKUP_WRAPPER" "$OFFSITE_WRAPPER" "$SSL_WRAPPER" "$EXPIRY_WRAPPER"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: wrapper missing: $f" >&2
    exit 1
  fi
  chmod +x "$f" 2>/dev/null || true
done

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# Strip prior al-ruya-erp lines.
crontab -l 2>/dev/null \
  | grep -vF "$TAG" \
  | grep -vF "$BACKUP_WRAPPER" \
  | grep -vF "$OFFSITE_WRAPPER" \
  | grep -vF "$SSL_WRAPPER" \
  | grep -vF "$EXPIRY_WRAPPER" \
  > "$TMP" || true

cat >> "$TMP" <<EOF
$TAG backup (daily 02:00)
0 2 * * * $BACKUP_WRAPPER >> $LOG_DIR/cron.log 2>&1
$TAG backup-offsite (daily 02:30 — B2 mirror, skipped if not configured)
30 2 * * * $OFFSITE_WRAPPER >> $LOG_DIR/cron.log 2>&1
$TAG ssl-renew (twice daily, randomized minutes per LE recommendation)
17 3 * * * $SSL_WRAPPER >> $LOG_DIR/cron.log 2>&1
17 15 * * * $SSL_WRAPPER >> $LOG_DIR/cron.log 2>&1
$TAG ssl-expiry-check (daily 04:42 — proactive notAfter monitor)
42 4 * * * $EXPIRY_WRAPPER >> $LOG_DIR/cron.log 2>&1
EOF

crontab "$TMP"

echo "Installed cron entries:"
crontab -l | grep -E "al-ruya-erp|backup-cron|backup-offsite|ssl-renew|ssl-expiry"
echo ""
echo "Logs:"
echo "  $LOG_DIR/backup-YYYYMMDD.log"
echo "  $LOG_DIR/offsite-YYYYMMDD.log"
echo "  $LOG_DIR/ssl-renew-YYYYMMDD.log"
echo "  $LOG_DIR/ssl-expiry-YYYYMMDD.log"
echo "  $LOG_DIR/cron.log  (combined stdout/stderr)"
echo ""
echo "Verify next fire:  systemctl status cron  (or: grep CRON /var/log/syslog)"
