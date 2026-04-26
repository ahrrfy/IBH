#!/usr/bin/env bash
# Al-Ruya ERP — SSL Auto-Renewal Wrapper
# Wraps `certbot renew` with flock + log + deploy-hook (host nginx + docker
# nginx). Let's Encrypt recommends running twice a day at random minutes.
#
# Exit codes: 0 OK · 11 lock held · 20 certbot failed · 21 nginx -t failed
#
# Optional alerting (closes DR_RUNBOOK §10.5): set SSL_HEALTHCHECK_URL in
# .env. Pings /start, bare URL on success, /fail-<code> on failure.

set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/al-ruya-erp/infra/.env}"
LOG_DIR="${LOG_DIR:-/var/log/al-ruya-erp}"
LOCK_FILE="${LOCK_FILE:-/var/run/al-ruya-erp-ssl-renew.lock}"
NGINX_CONTAINER="${NGINX_CONTAINER:-infra-nginx-1}"

mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/ssl-renew-$(date +%Y%m%d).log"
log() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE" 2>/dev/null || true; set +a
fi

hc_ping() {
  local suffix="${1:-}"
  local url="${SSL_HEALTHCHECK_URL:-}"
  [[ -z "$url" ]] && return 0
  curl -fsS -m 10 --retry 2 -o /dev/null \
    "${url%/}${suffix:+/$suffix}" 2>/dev/null || true
}

on_exit() {
  local code=$?
  if [[ "$code" -eq 0 ]]; then hc_ping; else hc_ping "fail-${code}"; fi
}
trap on_exit EXIT

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then log "ERROR: another renewal running"; exit 11; fi
fi

log "=== ssl-renew starting (pid=$$) ==="
hc_ping start

DEPLOY_HOOK_CMD='nginx -t && systemctl reload nginx; docker exec '"$NGINX_CONTAINER"' nginx -t && docker exec '"$NGINX_CONTAINER"' nginx -s reload || true'

if ! certbot renew --quiet --no-random-sleep-on-renew \
       --deploy-hook "$DEPLOY_HOOK_CMD" >>"$LOG_FILE" 2>&1; then
  log "FATAL: certbot renew failed"; exit 20
fi

if ! nginx -t >>"$LOG_FILE" 2>&1; then
  log "FATAL: host nginx config invalid"; exit 21
fi

log "=== ssl-renew completed OK ==="
exit 0
