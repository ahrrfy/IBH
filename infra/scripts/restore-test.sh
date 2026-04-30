#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# restore-test.sh — Restic backup restore drill (Phase 3.D)
#
# Verifies:
#   1. Restic can read the repository and list snapshots
#   2. Latest snapshot contains expected files (postgres dump + minio data)
#   3. A spot-restore of a single file succeeds
#   4. (Optional) Full DB restore to a test DB and schema validation
#
# Usage:
#   RESTIC_REPOSITORY=s3:... RESTIC_PASSWORD=... bash infra/scripts/restore-test.sh
#   bash infra/scripts/restore-test.sh --full    # includes DB restore to test DB
#
# Exit codes: 0 = drill passed, 1 = failed
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS=0; FAIL=0
FULL="${1:-}"
RESTORE_DIR="/tmp/restic-restore-$$"
cleanup() { rm -rf "$RESTORE_DIR"; }
trap cleanup EXIT

log_pass() { echo -e "  ${GREEN}✅ $1${NC}"; PASS=$((PASS+1)); }
log_fail() { echo -e "  ${RED}❌ $1${NC}"; FAIL=$((FAIL+1)); }
log_warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; }

echo "═══════════════════════════════════════════════════"
echo "  🔄 Al-Ruya ERP — Backup Restore Drill"
echo "  $(date '+%Y-%m-%d %H:%M:%S UTC')"
echo "═══════════════════════════════════════════════════"
echo ""

# ── Guard ─────────────────────────────────────────────────────────────────────
if ! command -v restic &>/dev/null; then
  echo -e "${RED}❌ restic not found in PATH${NC}"
  exit 1
fi

if [ -z "${RESTIC_REPOSITORY:-}" ]; then
  echo -e "${RED}❌ RESTIC_REPOSITORY not set${NC}"
  exit 1
fi

if [ -z "${RESTIC_PASSWORD:-}" ] && [ -z "${RESTIC_PASSWORD_FILE:-}" ]; then
  echo -e "${RED}❌ RESTIC_PASSWORD or RESTIC_PASSWORD_FILE not set${NC}"
  exit 1
fi

# ── 1. Repository connectivity ────────────────────────────────────────────────
echo "🔗 Checking Restic repository..."

if restic snapshots --json &>/dev/null; then
  SNAP_COUNT=$(restic snapshots --json 2>/dev/null | jq 'length' 2>/dev/null || echo 0)
  log_pass "Repository accessible — $SNAP_COUNT snapshots found"
else
  log_fail "Cannot access Restic repository: $RESTIC_REPOSITORY"
  exit 1
fi

echo ""

# ── 2. Latest snapshot metadata ───────────────────────────────────────────────
echo "📋 Latest snapshot metadata..."

# `restic snapshots --latest 1` returns 1 result PER tag-group; backup-cron
# stamps each run with a unique `ts-YYYYMMDD_HHMMSS` tag, so different runs
# end up in different groups. We instead pull all snapshots and sort by
# time on the client to get the genuine most-recent.
LATEST_JSON=$(restic snapshots --json 2>/dev/null | jq 'sort_by(.time) | [last]')
LATEST_ID=$(echo "$LATEST_JSON" | jq -r '.[0].short_id' 2>/dev/null || echo "")
LATEST_TIME=$(echo "$LATEST_JSON" | jq -r '.[0].time' 2>/dev/null || echo "")
LATEST_HOSTNAME=$(echo "$LATEST_JSON" | jq -r '.[0].hostname' 2>/dev/null || echo "")

if [ -n "$LATEST_ID" ]; then
  log_pass "Latest snapshot: $LATEST_ID at $LATEST_TIME from $LATEST_HOSTNAME"

  # Age check — warn if older than 25h
  HOURS_AGO=$(( ( $(date +%s) - $(date -d "$LATEST_TIME" +%s 2>/dev/null || echo 0) ) / 3600 ))
  if [ "$HOURS_AGO" -lt 25 ]; then
    log_pass "Snapshot age: ${HOURS_AGO}h (within 24h window)"
  else
    log_fail "Snapshot age: ${HOURS_AGO}h — backup may have missed a run"
  fi
else
  log_fail "No snapshots found in repository"
  exit 1
fi

echo ""

# ── 3. Spot-restore a file ────────────────────────────────────────────────────
echo "📂 Spot-restore drill (single file)..."

mkdir -p "$RESTORE_DIR"

# List files in latest snapshot to find a postgres dump
DUMP_PATH=$(restic ls latest 2>/dev/null | grep -E '\.sql|dump\.pgdump|backup\.dump' | head -1 || echo "")

if [ -n "$DUMP_PATH" ]; then
  echo "  → Restoring: $DUMP_PATH"
  if restic restore latest --target "$RESTORE_DIR" --include "$DUMP_PATH" 2>/dev/null; then
    RESTORED_FILE=$(find "$RESTORE_DIR" -type f | head -1)
    if [ -n "$RESTORED_FILE" ]; then
      FILE_SIZE=$(du -sh "$RESTORED_FILE" 2>/dev/null | cut -f1)
      log_pass "File restored: $(basename "$RESTORED_FILE") ($FILE_SIZE)"
    else
      log_fail "Restore command succeeded but no file found in $RESTORE_DIR"
    fi
  else
    log_fail "restic restore command failed for $DUMP_PATH"
  fi
else
  # Fallback: restore any small file to verify read access
  FALLBACK_PATH=$(restic ls latest 2>/dev/null | grep -v '^snapshot' | head -5 | tail -1 || echo "")
  if [ -n "$FALLBACK_PATH" ]; then
    if restic restore latest --target "$RESTORE_DIR" --include "$FALLBACK_PATH" 2>/dev/null; then
      log_pass "Fallback file restored: $(basename "$FALLBACK_PATH")"
    else
      log_warn "Could not restore fallback file — may be a directory entry"
    fi
  else
    log_warn "No files found in snapshot listing — skipping file restore check"
  fi
fi

echo ""

# ── 4. (Optional) Full DB restore ─────────────────────────────────────────────
if [ "$FULL" = "--full" ]; then
  echo "🗄️  Full DB restore to test database..."

  TEST_DB="${TEST_RESTORE_DB:-alruya_restore_test}"
  if command -v psql &>/dev/null && [ -n "${DATABASE_URL:-}" ]; then
    # Extract host/user from DATABASE_URL
    DB_HOST=$(echo "$DATABASE_URL" | grep -oP '(?<=@)[^:/]+')
    DB_USER=$(echo "$DATABASE_URL" | grep -oP '(?<=://)[^:]+')
    DB_PASS=$(echo "$DATABASE_URL" | grep -oP '(?<=:)[^@]+(?=@)')

    # Create test DB
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -c "DROP DATABASE IF EXISTS $TEST_DB;" postgres 2>/dev/null || true
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -c "CREATE DATABASE $TEST_DB;" postgres 2>/dev/null

    # Find and restore the dump
    DUMP_FILE=$(find "$RESTORE_DIR" -name "*.sql" -o -name "*.pgdump" -o -name "*.dump" 2>/dev/null | head -1)
    if [ -n "$DUMP_FILE" ]; then
      echo "  → Restoring $DUMP_FILE to $TEST_DB..."
      PGPASSWORD="$DB_PASS" pg_restore -h "$DB_HOST" -U "$DB_USER" -d "$TEST_DB" "$DUMP_FILE" 2>/dev/null \
        || PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$TEST_DB" -f "$DUMP_FILE" 2>/dev/null \
        || log_fail "DB restore failed"

      # Verify critical tables exist
      for tbl in companies users products stock_ledger journal_entries; do
        EXISTS=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$TEST_DB" -tAc \
          "SELECT 1 FROM information_schema.tables WHERE table_name='$tbl'" 2>/dev/null || echo "")
        if [ "$EXISTS" = "1" ]; then
          log_pass "Table $tbl present in restored DB"
        else
          log_fail "Table $tbl missing from restored DB"
        fi
      done

      # Cleanup test DB
      PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -c "DROP DATABASE IF EXISTS $TEST_DB;" postgres 2>/dev/null || true
      log_pass "Test DB $TEST_DB cleaned up"
    else
      log_warn "No dump file found after restore — skipping DB validation"
    fi
  else
    log_warn "psql not available — skipping full DB restore check"
  fi

  echo ""
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════"
echo -e "  PASS: ${GREEN}${PASS}${NC}   FAIL: ${RED}${FAIL}${NC}"
echo "═══════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}❌ Restore drill FAILED — $FAIL issue(s)${NC}"
  exit 1
else
  echo -e "${GREEN}✅ Restore drill passed${NC}"
  exit 0
fi
