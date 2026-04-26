#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Al-Ruya ERP — Backup Cron Wrapper (host-side, docker-compose-aware)
#
# Why this exists: postgres runs INSIDE a docker container (no host-mapped
# port, by design — security). pg_dump on the host can't reach it directly.
# So this wrapper does pg_dump via `docker exec` instead of relying on a host
# pg_dump and a host-routable POSTGRES_HOST.
#
# Steps:
#   1. acquire flock (cron-safe — concurrent runs are blocked, not queued)
#   2. source /opt/al-ruya-erp/infra/.env (POSTGRES_*, RESTIC_*, RETENTION_*)
#   3. docker exec postgres pg_dump → /tmp/<dump>
#   4. restic backup the dump dir, prune, integrity-check
#   5. cleanup tmp
#
# Exit codes:
#   0   — completed OK
#   10  — env file missing or env var missing
#   11  — another backup is already running (lock held)
#   12  — pg_dump failed (postgres container down or wrong creds)
#   13  — restic failed (repo unreachable, password wrong, integrity error)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/al-ruya-erp/infra/.env}"
LOG_DIR="${LOG_DIR:-/var/log/al-ruya-erp}"
LOCK_FILE="${LOCK_FILE:-/var/run/al-ruya-erp-backup.lock}"
PG_CONTAINER="${PG_CONTAINER:-infra-postgres-1}"

mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/backup-$(date +%Y%m%d).log"

log() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# ── 1. Lock ──────────────────────────────────────────────────────────────────
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    log "ERROR: another backup is already running (lock: $LOCK_FILE)"
    exit 11
  fi
else
  if ! mkdir "$LOCK_FILE" 2>/dev/null; then
    log "ERROR: another backup is already running (lock dir: $LOCK_FILE)"
    exit 11
  fi
  trap 'rmdir "$LOCK_FILE" 2>/dev/null || true' EXIT
fi

log "=== backup-cron starting (pid=$$) ==="

# ── 2. Load env ──────────────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  log "FATAL: env file not found: $ENV_FILE"
  exit 10
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# pg_dump runs inside the postgres container — we don't need a host-routable
# POSTGRES_HOST. We DO need POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD
# to authenticate inside the container.
: "${POSTGRES_DB:?missing in $ENV_FILE}"
: "${POSTGRES_USER:?missing in $ENV_FILE}"
: "${POSTGRES_PASSWORD:?missing in $ENV_FILE}"
: "${RESTIC_REPOSITORY:?missing in $ENV_FILE}"
: "${RESTIC_PASSWORD:?missing in $ENV_FILE}"

# ── 3. Dump postgres via docker exec ─────────────────────────────────────────
DUMP_DIR="/tmp/al-ruya-backup-$$"
mkdir -p "$DUMP_DIR"
trap 'rm -rf "$DUMP_DIR"' EXIT

TS=$(date +%Y%m%d_%H%M%S)
DUMP_FILE="$DUMP_DIR/postgres_${TS}.dump"

log "dumping postgres ($POSTGRES_DB) via docker exec $PG_CONTAINER ..."
if ! docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$PG_CONTAINER" \
       pg_dump -h localhost -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
               --format=custom --no-password \
       > "$DUMP_FILE" 2>>"$LOG_FILE"; then
  log "FATAL: pg_dump failed (container=$PG_CONTAINER, db=$POSTGRES_DB)"
  exit 12
fi

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
log "dump OK: $DUMP_FILE ($DUMP_SIZE)"

# ── 4. Restic backup + prune + verify ────────────────────────────────────────
if ! restic snapshots >/dev/null 2>&1; then
  log "initializing restic repo: $RESTIC_REPOSITORY"
  restic init >>"$LOG_FILE" 2>&1
fi

log "restic backup ..."
if ! restic backup --tag erp-backup --tag "ts-$TS" --compression max \
       "$DUMP_DIR" >>"$LOG_FILE" 2>&1; then
  log "FATAL: restic backup failed"
  exit 13
fi

log "restic prune (daily=${RETENTION_DAILY:-7} weekly=${RETENTION_WEEKLY:-4} monthly=${RETENTION_MONTHLY:-3}) ..."
restic forget \
  --keep-daily   "${RETENTION_DAILY:-7}" \
  --keep-weekly  "${RETENTION_WEEKLY:-4}" \
  --keep-monthly "${RETENTION_MONTHLY:-3}" \
  --prune >>"$LOG_FILE" 2>&1

log "restic integrity check (5% sample) ..."
if ! restic check --read-data-subset=5% >>"$LOG_FILE" 2>&1; then
  log "FATAL: restic integrity check failed — repo may be corrupted"
  exit 13
fi

# ── 5. Done ──────────────────────────────────────────────────────────────────
log "=== backup-cron completed OK (snapshot=$TS, size=$DUMP_SIZE) ==="
exit 0
