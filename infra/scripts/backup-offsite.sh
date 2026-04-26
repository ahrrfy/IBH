#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Al-Ruya ERP — Offsite Mirror to Backblaze B2
#
# Mirrors the local restic repo (RESTIC_REPOSITORY) to a remote B2 repo
# (RESTIC_B2_REPOSITORY) via `restic copy`. Closes the "1 offsite" leg of
# the 3-2-1-1 strategy — local stays the primary for fast restore, B2 is
# the disaster-recovery copy when the VPS is gone.
#
# Why a separate script (not extending backup-cron.sh):
#   - The local backup is the critical path; an offsite outage (B2
#     credentials revoked, network blip) MUST NOT mark the daily backup
#     as failed. Decoupling lets the alert noise surface independently.
#   - `restic copy` reads the source repo, so it can run any time after
#     backup-cron finishes — separate cron slot at 02:30.
#
# Steps:
#   1. flock (offsite-specific, separate from backup-cron's lock)
#   2. source /opt/al-ruya-erp/infra/.env
#   3. Verify both source repo and B2 repo are reachable
#   4. `restic -r <local> copy --repo2 <b2>` — incremental, only ships
#      new snapshots
#   5. Run a light `restic check` against the B2 repo monthly (no-op on
#      other days) to detect silent corruption
#
# Exit codes:
#   0   — completed OK (or skipped because B2 not configured)
#   10  — env file missing
#   11  — another offsite mirror is running (lock held)
#   14  — restic copy failed (B2 credentials, network, quota)
#   15  — restic check on B2 failed (potential silent corruption)
#
# Optional alerting: BACKUP_OFFSITE_HEALTHCHECK_URL — pings /start, bare
# URL on success, /fail-<exit-code> on failure. No-op when unset. The
# script also pings (and exits 0) when B2 is not configured — operators
# get a "skipped" signal rather than red.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/al-ruya-erp/infra/.env}"
LOG_DIR="${LOG_DIR:-/var/log/al-ruya-erp}"
LOCK_FILE="${LOCK_FILE:-/var/run/al-ruya-erp-offsite.lock}"

mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/offsite-$(date +%Y%m%d).log"
log() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

hc_ping() {
  local suffix="${1:-}"
  local url="${BACKUP_OFFSITE_HEALTHCHECK_URL:-}"
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
  if ! flock -n 9; then log "ERROR: another offsite mirror running"; exit 11; fi
fi

log "=== backup-offsite starting (pid=$$) ==="
hc_ping start

if [[ ! -f "$ENV_FILE" ]]; then log "FATAL: env file not found: $ENV_FILE"; exit 10; fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# Hard requirements for the source side (mirrors backup-cron.sh)
: "${RESTIC_REPOSITORY:?missing in $ENV_FILE}"
: "${RESTIC_PASSWORD:?missing in $ENV_FILE}"

# Soft requirements for the B2 side. If any are missing, log and exit 0
# (a green ping) so operators distinguish "not configured yet" from
# "tried and failed".
B2_OK=1
for var in RESTIC_B2_REPOSITORY B2_ACCOUNT_ID B2_ACCOUNT_KEY; do
  if [[ -z "${!var:-}" ]]; then
    log "INFO: $var not set — offsite mirror skipped (configure to enable)"
    B2_OK=0
  fi
done
if [[ "$B2_OK" -eq 0 ]]; then
  log "=== backup-offsite skipped (B2 not configured) ==="
  exit 0
fi

# Restic copy needs a password for the destination too. We allow a
# separate RESTIC_B2_PASSWORD; if unset, default to RESTIC_PASSWORD.
export RESTIC_FROM_PASSWORD="$RESTIC_PASSWORD"
export RESTIC_PASSWORD2="${RESTIC_B2_PASSWORD:-$RESTIC_PASSWORD}"

# Initialise the B2 repo on first run (idempotent — `restic init` errors
# on existing repos, which we treat as "already initialised").
log "checking B2 repo: $RESTIC_B2_REPOSITORY"
if ! restic -r "$RESTIC_B2_REPOSITORY" --password-file <(echo "$RESTIC_PASSWORD2") \
        snapshots --no-lock >>"$LOG_FILE" 2>&1; then
  log "B2 repo not yet initialised — running restic init"
  if ! restic -r "$RESTIC_B2_REPOSITORY" --password-file <(echo "$RESTIC_PASSWORD2") \
          init >>"$LOG_FILE" 2>&1; then
    log "FATAL: restic init on B2 failed"; exit 14
  fi
fi

# Mirror new snapshots from local to B2.
log "restic copy local -> B2 ..."
if ! restic -r "$RESTIC_B2_REPOSITORY" \
       --password-file <(echo "$RESTIC_PASSWORD2") \
       --from-repo "$RESTIC_REPOSITORY" \
       --from-password-file <(echo "$RESTIC_FROM_PASSWORD") \
       copy >>"$LOG_FILE" 2>&1; then
  log "FATAL: restic copy failed (check B2 credentials and bucket quota)"
  exit 14
fi

# Light B2-side integrity check, but only on the 1st of the month (cheap
# enough to ship daily, but read traffic on B2 is metered). 5% sample
# matches the local check.
DAY_OF_MONTH=$(date +%d)
if [[ "$DAY_OF_MONTH" == "01" ]]; then
  log "monthly restic check on B2 (5% sample) ..."
  if ! restic -r "$RESTIC_B2_REPOSITORY" --password-file <(echo "$RESTIC_PASSWORD2") \
          check --read-data-subset=5% >>"$LOG_FILE" 2>&1; then
    log "FATAL: B2 integrity check failed — potential silent corruption"
    exit 15
  fi
fi

SNAP_COUNT=$(restic -r "$RESTIC_B2_REPOSITORY" --password-file <(echo "$RESTIC_PASSWORD2") \
               snapshots --json --no-lock 2>/dev/null | grep -c '"id"' || echo 0)
log "=== backup-offsite OK (B2 snapshots=$SNAP_COUNT) ==="
exit 0
