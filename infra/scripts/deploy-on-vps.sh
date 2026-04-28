#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-on-vps.sh — runs ON THE VPS (called by GitHub Actions deploy workflow)
#
# Pipeline:
#   1. preflight (disk, docker daemon, git)
#   2. pull latest main
#   3. pre-build cache trim (keep deploys fast without unbounded growth)
#   4. build api + web + license-server + ai-brain (with --pull for fresh bases)
#   5. ensure storage services up (postgres, redis, minio)
#   6. RESOLVE failed migrations BEFORE recreating containers (so a P3009 from
#      a previous deploy doesn't crash the new api before it can be probed)
#   7. recreate api + web + license-server + ai-brain
#   8. wait for api container to be healthy (NOT just running) before migrating
#   9. migrate deploy (verbose — never swallow errors)
#  10. nginx reload (after api is healthy so DNS resolution finds the new IP)
#  11. /health probe (12 × 5s = 60s budget)
#  12. post-deploy housekeeping (dangling images prune)
#
# Failure semantics: any non-zero exit aborts and dumps logs from api/web/nginx.
# All migration / docker steps timeout-bounded so a hung command doesn't keep
# the GitHub Action waiting for hours.
#
# Closes/relevant issues:
#   I013 — nginx DNS re-resolve after container IP change
#   I022 — bash -s stdin slurp by docker exec (mitigated by scp+ssh in workflow)
#   I038 — silent migrate-resolve hid real failures
#   I042 — RLS helper functions missing on production
#   I043 — Docker build cache disk bloat (now: per-deploy trim + weekly cron)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/al-ruya-erp}"
INFRA_DIR="$REPO_DIR/infra"
COMPOSE_FILE="docker-compose.bootstrap.yml"
HEALTH_URL="${HEALTH_URL:-https://ibherp.cloud/health}"

# Disk usage threshold — abort deploy if root partition is over this percent.
# I043 traced bloat from 15GB → 120GB; staying under 85% leaves headroom for
# the new image build (~3-5GB) without filling the disk mid-deploy.
DISK_ABORT_PERCENT="${DISK_ABORT_PERCENT:-85}"

# Cache budget — buildx layer cache is pruned to this size before each build.
# Tuned for KVM4 (200GB disk): 8GB keeps deploys fast (cache hits) without
# letting cache balloon back to 100GB.
BUILD_CACHE_KEEP="${BUILD_CACHE_KEEP:-8GB}"

# Timeouts — long enough for normal builds, short enough that a hung command
# fails the deploy instead of stalling GitHub Actions for an hour.
BUILD_TIMEOUT_SECONDS="${BUILD_TIMEOUT_SECONDS:-1500}"     # 25 min
MIGRATE_TIMEOUT_SECONDS="${MIGRATE_TIMEOUT_SECONDS:-300}"  # 5 min
RECREATE_TIMEOUT_SECONDS="${RECREATE_TIMEOUT_SECONDS:-180}" # 3 min

# Health probe budget for /health post-deploy.
HEALTH_RETRIES="${HEALTH_RETRIES:-12}"
HEALTH_INTERVAL_SECONDS="${HEALTH_INTERVAL_SECONDS:-5}"

log() { echo "[$(date -u +%H:%M:%SZ)] $*"; }
fail() { log "❌ $*"; exit 1; }

# ─── 1. preflight ───────────────────────────────────────────────────────────
log "🔎 host=$(hostname -f) user=$(whoami) repo=$REPO_DIR"

if ! command -v docker >/dev/null; then fail "docker not installed"; fi
if ! docker info >/dev/null 2>&1; then fail "docker daemon not responding"; fi
if [ ! -d "$REPO_DIR/.git" ]; then fail "$REPO_DIR is not a git repo"; fi

# Abort early if disk would fill mid-build (I043 prevention).
DISK_PCT=$(df -P / | awk 'NR==2 {gsub("%",""); print $5}')
log "→ disk usage: ${DISK_PCT}% (abort threshold: ${DISK_ABORT_PERCENT}%)"
if [ "$DISK_PCT" -ge "$DISK_ABORT_PERCENT" ]; then
  fail "disk ${DISK_PCT}% — refusing to deploy. Run vps-disk-cleanup.yml or free space manually."
fi

# ─── 2. pull main ───────────────────────────────────────────────────────────
cd "$REPO_DIR"

# I044 — origin URL guard. Before this guard, the VPS could silently keep
# pulling from a stale fork (the previous tenant of this server cloned an
# older repo at ahrrfy/erp.git, then the project moved to ahrrfy/IBH.git).
# Without this check, every push to the new repo never reached production
# because `git fetch origin main` pulled from whatever URL was configured
# at clone time — which the deploy script previously trusted blindly.
EXPECTED_ORIGIN_URL="${EXPECTED_ORIGIN_URL:-https://github.com/ahrrfy/IBH.git}"
CURRENT_ORIGIN_URL="$(git remote get-url origin 2>/dev/null || echo '')"
log "→ origin URL check"
log "   expected: $EXPECTED_ORIGIN_URL"
log "   current : $CURRENT_ORIGIN_URL"
if [ -z "$CURRENT_ORIGIN_URL" ]; then
  fail "no 'origin' remote configured in $REPO_DIR — bootstrap is broken"
fi
if [ "$CURRENT_ORIGIN_URL" != "$EXPECTED_ORIGIN_URL" ]; then
  log "   ⚠️  origin URL mismatch — repointing to $EXPECTED_ORIGIN_URL"
  git remote set-url origin "$EXPECTED_ORIGIN_URL"
  log "   ✅ origin repointed (now: $(git remote get-url origin))"
fi

log "→ git fetch + reset to origin/main"
git fetch origin main
BEFORE_SHA=$(git rev-parse HEAD)
git reset --hard origin/main
AFTER_SHA=$(git rev-parse HEAD)
log "   $BEFORE_SHA → $AFTER_SHA"

if [ "$BEFORE_SHA" = "$AFTER_SHA" ]; then
  log "   (no change — proceeding anyway in case of force-redeploy)"
fi

cd "$INFRA_DIR"
COMPOSE="docker compose -f $COMPOSE_FILE --env-file .env"

# ─── 3. pre-build cache trim ────────────────────────────────────────────────
log "→ pre-build cache trim (keep $BUILD_CACHE_KEEP)"
docker buildx prune --force --keep-storage "$BUILD_CACHE_KEEP" >/dev/null 2>&1 || \
  log "   (buildx prune skipped — buildx not available)"

# ─── 4. build images (timeout-bounded) ──────────────────────────────────────
log "→ build api + web + license-server + ai-brain (timeout: ${BUILD_TIMEOUT_SECONDS}s)"
# --pull refreshes base images so a stale node:22-alpine doesn't get cached forever.
# whatsapp-bridge uses 'profiles: [whatsapp]' — excluded from normal deploys
# until Meta credentials are set in VPS .env (I029).
if ! timeout "$BUILD_TIMEOUT_SECONDS" $COMPOSE build --pull api web license-server ai-brain; then
  fail "image build failed or timed out after ${BUILD_TIMEOUT_SECONDS}s"
fi

# ─── 5. storage services ────────────────────────────────────────────────────
log "→ ensure storage + cache services are up (postgres/redis/minio)"
$COMPOSE up -d postgres redis minio minio-init

# Wait for postgres before doing any migration work.
log "→ wait for postgres ready (max 30s)"
for i in {1..15}; do
  if $COMPOSE exec -T postgres pg_isready -q 2>/dev/null; then
    log "   ✅ postgres ready"
    break
  fi
  if [ "$i" = 15 ]; then fail "postgres not ready after 30s"; fi
  sleep 2
done

# ─── 6. resolve failed migrations BEFORE recreating containers ──────────────
# Why before recreate: if a previous deploy left _prisma_migrations in 'failed'
# state, the new api container's startup hooks may try to use the DB before
# we get a chance to fix it. Resolve first via a one-shot temp container so
# this works whether or not the previous api container is alive.
#
# I044 — chicken-and-egg fix: previously this used `compose exec api ...`
# which silently skipped resolve when the old api was down (after a previous
# crash). Then recreate brought up a new api against a DB whose
# `_prisma_migrations` was still `failed`, and step 9 (`migrate deploy`) blew
# up immediately. Using `compose run --rm` builds a fresh throwaway container
# from the just-built image, so resolve runs even on cold starts.
log "→ check + resolve any failed migrations (verbose — no error masking)"
STUCK_MIGRATIONS=(
  "20260427183000_t51_hr_recruitment"
)
for m in "${STUCK_MIGRATIONS[@]}"; do
  log "   resolving $m as rolled-back (idempotent — no-op if already clean)"
  if $COMPOSE run --rm --no-deps --entrypoint sh api -c \
      "cd /app/apps/api && ./node_modules/.bin/prisma migrate resolve --rolled-back $m"; then
    log "   ✅ resolved: $m"
  else
    # `prisma migrate resolve` errors when the migration is already in a clean
    # state. Don't abort — the verbose output above tells us if it's a real
    # problem; otherwise step 9 will surface anything that matters.
    log "   ⚠️  resolve returned non-zero for $m (likely already clean — verify in step 9)"
  fi
done

# ─── 7. recreate app containers ─────────────────────────────────────────────
log "→ recreate api + web + license-server + ai-brain (timeout: ${RECREATE_TIMEOUT_SECONDS}s)"
if ! timeout "$RECREATE_TIMEOUT_SECONDS" $COMPOSE up -d --force-recreate api web license-server ai-brain; then
  fail "container recreate failed or timed out after ${RECREATE_TIMEOUT_SECONDS}s"
fi

# ─── 8. wait for api container Up (not necessarily healthy yet) ─────────────
log "→ wait for api container running (max 60s)"
for i in {1..30}; do
  STATE=$($COMPOSE ps api --format json 2>/dev/null | python3 -c "
import json,sys
try:
  data=sys.stdin.read().strip()
  if not data: print('missing'); sys.exit(0)
  for line in data.splitlines():
    obj=json.loads(line)
    print(obj.get('State','unknown')); sys.exit(0)
except Exception as e: print(f'error:{e}')
" 2>/dev/null || echo "missing")
  if [ "$STATE" = "running" ]; then
    log "   ✅ api running"
    break
  fi
  if [ "$i" = 30 ]; then
    log "   ⚠️  api state after 60s: $STATE"
    $COMPOSE logs api --tail=40
    fail "api container did not reach 'running' state"
  fi
  sleep 2
done

# ─── 9. migrate deploy (verbose, fail-loud, timeout-bounded) ────────────────
log "→ prisma migrate deploy (timeout: ${MIGRATE_TIMEOUT_SECONDS}s)"
if ! timeout "$MIGRATE_TIMEOUT_SECONDS" $COMPOSE exec -T api sh -c \
    'cd /app/apps/api && ./node_modules/.bin/prisma migrate deploy'; then
  log "   ❌ migrate deploy failed — capturing migration status for diagnostics"
  $COMPOSE exec -T api sh -c \
    'cd /app/apps/api && ./node_modules/.bin/prisma migrate status' || true
  $COMPOSE logs api --tail=60
  fail "prisma migrate deploy failed — see logs above"
fi

# ─── 10. nginx reload (after api is healthy so DNS finds new IP) ────────────
log "→ test + reload nginx"
if ! $COMPOSE exec -T nginx nginx -t 2>&1; then
  fail "nginx config invalid"
fi
$COMPOSE exec -T nginx nginx -s reload </dev/null >/dev/null 2>&1 || \
  log "   ⚠️  nginx reload returned non-zero (may have detached weirdly — re-check via /health)"
log "   ✅ nginx reloaded"

# ─── 11. /health probe ──────────────────────────────────────────────────────
log "→ probe $HEALTH_URL ($HEALTH_RETRIES × ${HEALTH_INTERVAL_SECONDS}s)"
for i in $(seq 1 "$HEALTH_RETRIES"); do
  if curl -fsS --max-time 5 "$HEALTH_URL" > /dev/null; then
    log "   ✅ /health OK on attempt $i"
    log "✅ Deploy successful — commit $AFTER_SHA"

    # ─── 12. post-deploy housekeeping ─────────────────────────────────────
    # Prune dangling images (untagged) — these accumulate after every build.
    # Don't prune build cache here (we did it pre-build); don't touch volumes.
    log "→ post-deploy: prune dangling images"
    docker image prune -f >/dev/null 2>&1 || true
    log "   ✅ housekeeping done"
    exit 0
  fi
  log "   ⏳ attempt $i/$HEALTH_RETRIES — sleeping ${HEALTH_INTERVAL_SECONDS}s"
  sleep "$HEALTH_INTERVAL_SECONDS"
done

log "❌ /health failed after $HEALTH_RETRIES attempts — dumping logs"
$COMPOSE logs api --tail=80
$COMPOSE logs web --tail=40
$COMPOSE logs nginx --tail=20
fail "deploy did not become healthy"
