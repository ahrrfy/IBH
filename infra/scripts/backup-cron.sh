#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Al-Ruya ERP — Backup Cron Wrapper
#
# Loads env vars from /opt/al-ruya-erp/infra/.env and invokes backup.sh
# with file logging + lockfile + structured exit codes for cron monitoring.
#
# Designed to be called by crontab on the VPS (see install-cron.sh).
#
# Exit codes:
#   0   — backup completed
#   10  — env file missing
#   11  — another backup is already running (lock held)
#   12  — backup.sh failed (see log for restic/pg_dump error)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/al-ruya-erp/infra/.env}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/backup.sh"
LOG_DIR="${LOG_DIR:-/var/log/al-ruya-erp}"
LOCK_FILE="${LOCK_FILE:-/var/run/al-ruya-erp-backup.lock}"

mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/backup-$(date +%Y%m%d).log"

log() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

if [[ ! -f "$ENV_FILE" ]]; then
  log "FATAL: env file not found: $ENV_FILE"
  exit 10
fi

# Acquire lock (atomic via flock if available, fallback to mkdir)
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    log "ERROR: another backup is already running (lock held: $LOCK_FILE)"
    exit 11
  fi
else
  if ! mkdir "$LOCK_FILE" 2>/dev/null; then
    log "ERROR: another backup is already running (lock dir exists: $LOCK_FILE)"
    exit 11
  fi
  trap 'rmdir "$LOCK_FILE" 2>/dev/null || true' EXIT
fi

log "=== backup-cron starting (pid=$$) ==="

# Load env vars (POSTGRES_*, RESTIC_*, RETENTION_*) — never echo to stdout
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# Required by backup.sh — fail fast if missing
: "${POSTGRES_HOST:?missing in $ENV_FILE}"
: "${POSTGRES_DB:?missing in $ENV_FILE}"
: "${POSTGRES_USER:?missing in $ENV_FILE}"
: "${POSTGRES_PASSWORD:?missing in $ENV_FILE}"
: "${RESTIC_REPOSITORY:?missing in $ENV_FILE}"
: "${RESTIC_PASSWORD:?missing in $ENV_FILE}"

if ! bash "$BACKUP_SCRIPT" >>"$LOG_FILE" 2>&1; then
  log "FATAL: backup.sh exited non-zero — see $LOG_FILE"
  exit 12
fi

log "=== backup-cron completed OK ==="
exit 0
