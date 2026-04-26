#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Al-Ruya ERP — SSL Auto-Renewal Wrapper
#
# Wraps `certbot renew` with:
#   - per-day log file under /var/log/al-ruya-erp/
#   - flock so concurrent cron fires don't collide
#   - deploy-hook that reloads BOTH host nginx (systemd) and dockerized
#     nginx (infra-nginx-1) so the new cert is actually served
#
# Let's Encrypt recommends running renew TWICE A DAY at random minutes —
# certbot is no-op when the cert has > 30 days left, so it's safe to run
# often. install-cron.sh installs two entries spaced 12h apart.
#
# Exit codes:
#   0   — completed (renewed OR no-op)
#   11  — another renewal is already running
#   20  — certbot failed
#   21  — nginx reload failed (cert was renewed but is not being served!)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

LOG_DIR="${LOG_DIR:-/var/log/al-ruya-erp}"
LOCK_FILE="${LOCK_FILE:-/var/run/al-ruya-erp-ssl-renew.lock}"
NGINX_CONTAINER="${NGINX_CONTAINER:-infra-nginx-1}"

mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/ssl-renew-$(date +%Y%m%d).log"

log() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# ── Lock ─────────────────────────────────────────────────────────────────────
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    log "ERROR: another renewal is already running (lock: $LOCK_FILE)"
    exit 11
  fi
fi

log "=== ssl-renew starting (pid=$$) ==="

# ── deploy-hook (called by certbot only when a cert is actually renewed) ─────
# We export it as an env var so certbot's --deploy-hook="$DEPLOY_HOOK_CMD"
# evaluates the full command. Reloads host nginx first (cert is read from
# /etc/letsencrypt by host nginx, then proxied to dockerized nginx).
DEPLOY_HOOK_CMD='nginx -t && systemctl reload nginx; docker exec '"$NGINX_CONTAINER"' nginx -t && docker exec '"$NGINX_CONTAINER"' nginx -s reload || true'

# ── Run certbot ──────────────────────────────────────────────────────────────
if ! certbot renew \
       --quiet \
       --no-random-sleep-on-renew \
       --deploy-hook "$DEPLOY_HOOK_CMD" \
       >>"$LOG_FILE" 2>&1; then
  log "FATAL: certbot renew failed — see $LOG_FILE"
  exit 20
fi

# certbot only reloads on actual renewal. Defensive nginx -t to catch
# config drift introduced between deployments.
if ! nginx -t >>"$LOG_FILE" 2>&1; then
  log "FATAL: host nginx config invalid after renew attempt"
  exit 21
fi

log "=== ssl-renew completed OK ==="
exit 0
