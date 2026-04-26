#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-on-vps.sh — runs ON THE VPS (called by GitHub Actions deploy workflow)
#
# Pulls latest main, rebuilds api+web containers, reloads nginx (so it picks
# up new container IPs via Docker DNS — closes I013), runs migrations, and
# health-probes /health with retries.
#
# Exits non-zero on any failure so the workflow surfaces it.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/al-ruya-erp}"
INFRA_DIR="$REPO_DIR/infra"
COMPOSE_FILE="docker-compose.bootstrap.yml"
HEALTH_URL="${HEALTH_URL:-https://ibherp.cloud/health}"

echo "🔎 host=$(hostname -f) user=$(whoami) repo=$REPO_DIR"

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "❌ $REPO_DIR is not a git repo on this host"
  exit 1
fi

cd "$REPO_DIR"
echo "→ git fetch + reset to origin/main"
git fetch origin main
BEFORE_SHA=$(git rev-parse HEAD)
git reset --hard origin/main
AFTER_SHA=$(git rev-parse HEAD)
echo "   $BEFORE_SHA → $AFTER_SHA"

cd "$INFRA_DIR"
COMPOSE="docker compose -f $COMPOSE_FILE --env-file .env"

echo "→ build api + web + license-server + ai-brain"
# whatsapp-bridge uses 'profiles: [whatsapp]' — excluded from normal deploys
# until Meta credentials are set in VPS .env (closes I029).
# To enable manually: docker compose --profile whatsapp up -d whatsapp-bridge
$COMPOSE build api web license-server ai-brain

echo "→ ensure storage + cache services are up (postgres/redis/minio)"
# These don't get recreated normally (their state matters), but `up -d`
# is idempotent and starts any that aren't running. Closes the gap where
# MinIO was defined in compose but never started after VPS reboot.
$COMPOSE up -d postgres redis minio minio-init

echo "→ recreate api + web + license-server + ai-brain"
$COMPOSE up -d --force-recreate api web license-server ai-brain

# Reload nginx so it picks up any conf changes AND re-resolves new container
# IPs via Docker DNS (resolver 127.0.0.11). Closes I013 — no more manual
# `docker restart nginx` after deploy.
echo "→ test + reload nginx"
if $COMPOSE exec -T nginx nginx -t 2>&1; then
  # nginx -s reload returns 0 immediately but on some compose+ssh combos it
  # appears to close the parent shell's stdin (or something equally weird).
  # We saw the script bail right after this line — never reaching migrations.
  # Detach explicitly so even if the child does something to our TTY we
  # don't inherit the issue.
  $COMPOSE exec -T nginx nginx -s reload </dev/null >/dev/null 2>&1 || true
  echo "   ✅ nginx reloaded"
else
  echo "   ❌ nginx config invalid"
  exit 1
fi

echo "→ post-nginx checkpoint reached"
echo "→ run any new prisma migrations"
# Two bugs were here for ~6 weeks (silently, causing missing F2 triggers — I022):
#   1. cd /app — schema is at /app/apps/api/prisma/schema.prisma, not /app
#   2. npx prisma — npx fetches the LATEST prisma (currently v7) which has
#      breaking changes vs the v6 client baked into our image. Use the local
#      binary at node_modules/.bin/prisma directly.
# We also fail loudly now: a silently-skipped migration is what hid the bug
# in the first place. If migrate deploy fails, abort the deploy.
if ! $COMPOSE exec -T api sh -c 'cd /app/apps/api && ./node_modules/.bin/prisma migrate deploy'; then
  echo "   ❌ prisma migrate deploy failed — aborting"
  exit 1
fi

echo "→ probe $HEALTH_URL (6 × 5s)"
for i in 1 2 3 4 5 6; do
  if curl -fsS --max-time 5 "$HEALTH_URL" > /dev/null; then
    echo "   ✅ /health OK on attempt $i"
    echo "✅ Deploy successful (commit $AFTER_SHA)"
    exit 0
  fi
  echo "   ⏳ attempt $i/6 — sleeping 5s"
  sleep 5
done

echo "❌ /health failed after 6 attempts — dumping logs"
$COMPOSE logs api --tail=80
$COMPOSE logs web --tail=40
$COMPOSE logs nginx --tail=20
exit 1
