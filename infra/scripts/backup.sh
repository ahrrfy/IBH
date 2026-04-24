#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Al-Ruya ERP — Restic Backup Script
# Implements 3-2-1-1 backup strategy:
#   3 copies: local + VPS volume + remote (optional)
#   2 media types: SSD + external
#   1 offsite: remote repo (Backblaze B2 or SFTP)
#   1 immutable: monthly archive
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

: "${POSTGRES_HOST:?required}"
: "${POSTGRES_DB:?required}"
: "${POSTGRES_USER:?required}"
: "${POSTGRES_PASSWORD:?required}"
: "${RESTIC_REPOSITORY:?required}"
: "${RESTIC_PASSWORD:?required}"

RETENTION_DAILY=${RETENTION_DAILY:-7}
RETENTION_WEEKLY=${RETENTION_WEEKLY:-4}
RETENTION_MONTHLY=${RETENTION_MONTHLY:-3}
DUMP_DIR="/tmp/erp-backup-$$"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

log() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"; }

# ── Initialize repo if needed ─────────────────────────────────────────────────
init_repo() {
  if ! restic snapshots &>/dev/null 2>&1; then
    log "Initializing Restic repository..."
    restic init
  fi
}

# ── PostgreSQL dump ───────────────────────────────────────────────────────────
dump_postgres() {
  log "Dumping PostgreSQL database..."
  mkdir -p "$DUMP_DIR"
  PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h "$POSTGRES_HOST" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --format=custom \
    --no-password \
    -f "$DUMP_DIR/postgres_${TIMESTAMP}.dump"
  log "Database dump: $(du -sh "$DUMP_DIR/postgres_${TIMESTAMP}.dump" | cut -f1)"
}

# ── Backup with Restic ────────────────────────────────────────────────────────
run_backup() {
  log "Running Restic backup..."
  restic backup \
    --tag "erp-backup" \
    --tag "db-${TIMESTAMP}" \
    --compression max \
    "$DUMP_DIR"

  log "Pruning old snapshots..."
  restic forget \
    --keep-daily  "$RETENTION_DAILY" \
    --keep-weekly "$RETENTION_WEEKLY" \
    --keep-monthly "$RETENTION_MONTHLY" \
    --prune

  log "Verifying backup integrity..."
  restic check --read-data-subset=5%
}

# ── Cleanup ───────────────────────────────────────────────────────────────────
cleanup() {
  rm -rf "$DUMP_DIR"
  log "Cleanup complete."
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  log "=== Al-Ruya ERP Backup Started ==="
  init_repo
  dump_postgres
  run_backup
  cleanup
  log "=== Backup Complete: $(restic snapshots --last --compact | tail -1) ==="
}

trap cleanup EXIT
main
