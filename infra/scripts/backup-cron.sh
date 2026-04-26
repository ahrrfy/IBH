#!/usr/bin/env bash
# Al-Ruya ERP — Backup Cron Wrapper (host-side, docker-compose-aware)
# pg_dump runs INSIDE the postgres container (no host port).
#
# Exit codes:
#   0 OK · 10 env missing · 11 lock held · 12 pg_dump failed · 13 restic failed
#
# Optional alerting (closes DR_RUNBOOK §8): set BACKUP_HEALTHCHECK_URL in
# .env (e.g. https://hc-ping.com/<UUID>). Pings /start, bare URL on
# success, /fail-<code> on failure. No-op when unset.

set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/al-ruya-erp/infra/.env}"
LOG_DIR="${LOG_DIR:-/var/log/al-ruya-erp}"
LOCK_FILE="${LOCK_FILE:-/var/run/al-ruya-erp-backup.lock}"
PG_CONTAINER="${PG_CONTAINER:-infra-postgres-1}"

mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/backup-$(date +%Y%m%d).log"
log() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

hc_ping() {
  local suffix="${1:-}"
  local url="${BACKUP_HEALTHCHECK_URL:-}"
  [[ -z "$url" ]] && return 0
  curl -fsS -m 10 --retry 2 -o /dev/null \
    "${url%/}${suffix:+/$suffix}" 2>/dev/null || true
}

DUMP_DIR=""
on_exit() {
  local code=$?
  if [[ "$code" -eq 0 ]]; then hc_ping; else hc_ping "fail-${code}"; fi
  [[ -n "$DUMP_DIR" && -d "$DUMP_DIR" ]] && rm -rf "$DUMP_DIR"
}
trap on_exit EXIT

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then log "ERROR: another backup running"; exit 11; fi
else
  if ! mkdir "$LOCK_FILE" 2>/dev/null; then log "ERROR: another backup running"; exit 11; fi
  USED_MKDIR_LOCK=1
fi

log "=== backup-cron starting (pid=$$) ==="
hc_ping start

if [[ ! -f "$ENV_FILE" ]]; then log "FATAL: env file not found: $ENV_FILE"; exit 10; fi
set -a; source "$ENV_FILE"; set +a
: "${POSTGRES_DB:?missing in $ENV_FILE}"
: "${POSTGRES_USER:?missing in $ENV_FILE}"
: "${POSTGRES_PASSWORD:?missing in $ENV_FILE}"
: "${RESTIC_REPOSITORY:?missing in $ENV_FILE}"
: "${RESTIC_PASSWORD:?missing in $ENV_FILE}"

DUMP_DIR="/tmp/al-ruya-backup-$$"
mkdir -p "$DUMP_DIR"
TS=$(date +%Y%m%d_%H%M%S)
DUMP_FILE="$DUMP_DIR/postgres_${TS}.dump"

log "dumping postgres ($POSTGRES_DB) via docker exec $PG_CONTAINER ..."
if ! docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$PG_CONTAINER" \
       pg_dump -h localhost -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
               --format=custom --no-password \
       > "$DUMP_FILE" 2>>"$LOG_FILE"; then
  log "FATAL: pg_dump failed"; exit 12
fi
log "dump OK: $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"

if ! restic snapshots >/dev/null 2>&1; then
  log "initializing restic repo: $RESTIC_REPOSITORY"
  restic init >>"$LOG_FILE" 2>&1
fi

log "restic backup ..."
if ! restic backup --tag erp-backup --tag "ts-$TS" --compression max \
       "$DUMP_DIR" >>"$LOG_FILE" 2>&1; then
  log "FATAL: restic backup failed"; exit 13
fi

log "restic prune ..."
restic forget \
  --keep-daily   "${RETENTION_DAILY:-7}" \
  --keep-weekly  "${RETENTION_WEEKLY:-4}" \
  --keep-monthly "${RETENTION_MONTHLY:-3}" \
  --prune >>"$LOG_FILE" 2>&1

log "restic integrity check (5%) ..."
if ! restic check --read-data-subset=5% >>"$LOG_FILE" 2>&1; then
  log "FATAL: restic integrity check failed"; exit 13
fi

if [[ "${USED_MKDIR_LOCK:-0}" == "1" ]]; then rmdir "$LOCK_FILE" 2>/dev/null || true; fi
log "=== backup-cron completed OK (snapshot=$TS) ==="
exit 0
