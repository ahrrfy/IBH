#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Al-Ruya ERP — Proactive SSL Certificate Expiry Check
#
# Reads `notAfter` from the live cert via openssl s_client and compares
# to a threshold (default 14 days). Independent of ssl-renew.sh — that
# script only pings on run-failure; THIS script catches the case where
# certbot silently stopped renewing (e.g. ACME challenge broken, DNS
# misconfigured) and the cert is sliding toward expiry.
#
# Closes DR_RUNBOOK §10.5 known limit #1.
#
# Exit codes:
#   0   — cert exists and has > THRESHOLD_DAYS left
#   30  — cert expires in < THRESHOLD_DAYS (alerting fired)
#   31  — could not reach host or read cert (TLS handshake failed)
#   32  — could not parse notAfter from cert output
#
# Optional alerting: SSL_EXPIRY_HEALTHCHECK_URL — pings bare URL on OK,
# /fail-<exit-code> when below threshold or on error. No-op when unset.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/al-ruya-erp/infra/.env}"
LOG_DIR="${LOG_DIR:-/var/log/al-ruya-erp}"
HOSTNAME="${CERT_HOSTNAME:-ibherp.cloud}"
PORT="${CERT_PORT:-443}"
THRESHOLD_DAYS="${THRESHOLD_DAYS:-14}"

mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/ssl-expiry-$(date +%Y%m%d).log"
log() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# Best-effort env load so SSL_EXPIRY_HEALTHCHECK_URL is available without
# making .env a hard requirement.
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE" 2>/dev/null || true
  set +a
fi

hc_ping() {
  local suffix="${1:-}"
  local url="${SSL_EXPIRY_HEALTHCHECK_URL:-}"
  [[ -z "$url" ]] && return 0
  curl -fsS -m 10 --retry 2 -o /dev/null \
    "${url%/}${suffix:+/$suffix}" 2>/dev/null || true
}

on_exit() {
  local code=$?
  if [[ "$code" -eq 0 ]]; then hc_ping; else hc_ping "fail-${code}"; fi
}
trap on_exit EXIT

log "=== ssl-expiry-check starting (host=$HOSTNAME:$PORT, threshold=${THRESHOLD_DAYS}d) ==="

# Pull cert via TLS handshake. -servername sets SNI (required because the
# IP serves multiple vhosts). Closing stdin via </dev/null prevents the
# s_client REPL from hanging.
CERT_PEM=$(echo | openssl s_client -servername "$HOSTNAME" \
  -connect "${HOSTNAME}:${PORT}" -showcerts 2>/dev/null </dev/null \
  | openssl x509 2>/dev/null) || {
    log "FATAL: TLS handshake failed for $HOSTNAME:$PORT"
    exit 31
}

if [[ -z "$CERT_PEM" ]]; then
  log "FATAL: empty cert output (host=$HOSTNAME)"
  exit 31
fi

# `openssl x509 -dates` outputs lines like:
#   notBefore=Mar  1 12:00:00 2026 GMT
#   notAfter=May 30 12:00:00 2026 GMT
NOT_AFTER=$(echo "$CERT_PEM" | openssl x509 -noout -enddate 2>/dev/null \
  | sed 's/^notAfter=//')

if [[ -z "$NOT_AFTER" ]]; then
  log "FATAL: could not parse notAfter from cert"
  exit 32
fi

# Convert both timestamps to seconds since epoch and diff in days.
EXPIRY_EPOCH=$(date -d "$NOT_AFTER" +%s 2>/dev/null) || {
  log "FATAL: date(1) cannot parse notAfter='$NOT_AFTER'"
  exit 32
}
NOW_EPOCH=$(date +%s)
DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))

log "cert notAfter=$NOT_AFTER → ${DAYS_LEFT} days remaining"

if (( DAYS_LEFT < THRESHOLD_DAYS )); then
  log "ALERT: cert expires in ${DAYS_LEFT}d (threshold=${THRESHOLD_DAYS}d) — investigate ssl-renew.sh"
  exit 30
fi

log "=== ssl-expiry-check OK (${DAYS_LEFT}d > ${THRESHOLD_DAYS}d threshold) ==="
exit 0
