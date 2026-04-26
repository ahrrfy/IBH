#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Al-Ruya ERP — Install Backup Cron on VPS
#
# Idempotent: adds (or replaces) a single root crontab entry that runs
# backup-cron.sh nightly at 02:00 server time.
#
# Usage (on VPS, as root):
#   bash /opt/al-ruya-erp/infra/scripts/install-cron.sh
#
# Verify:
#   crontab -l | grep al-ruya-erp
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/al-ruya-erp}"
WRAPPER="${REPO_ROOT}/infra/scripts/backup-cron.sh"
SCHEDULE="${SCHEDULE:-0 2 * * *}"  # 02:00 daily
TAG="# al-ruya-erp:backup-cron"     # marker line for idempotent replace

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: must run as root (need to edit root crontab)" >&2
  exit 1
fi

if [[ ! -x "$WRAPPER" ]]; then
  chmod +x "$WRAPPER" 2>/dev/null || {
    echo "ERROR: wrapper not executable and chmod failed: $WRAPPER" >&2
    exit 1
  }
fi

# Build new crontab: keep all lines that are NOT ours, then append our 2 lines
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# Capture existing crontab (empty if none)
crontab -l 2>/dev/null | grep -vF "$TAG" | grep -vF "$WRAPPER" > "$TMP" || true

cat >> "$TMP" <<EOF
$TAG
$SCHEDULE $WRAPPER >> /var/log/al-ruya-erp/cron.log 2>&1
EOF

crontab "$TMP"

echo "Installed cron entry:"
crontab -l | grep -A1 -F "$TAG"
echo ""
echo "Logs: /var/log/al-ruya-erp/backup-YYYYMMDD.log"
echo "Verify next run:  systemctl status cron  (or: grep CRON /var/log/syslog)"
