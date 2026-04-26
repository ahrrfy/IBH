#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# diagnose-ci.sh — classify a failed GitHub Actions run from its logs
#
# Reads .ci-logs/failed.log and .ci-logs/full.log, runs known-pattern matching,
# and emits two GitHub Actions outputs on $GITHUB_OUTPUT:
#   - category: short tag (ssh-auth | ssh-host | docker-build | migration |
#               health-fail | type-error | test-fail | unknown)
#   - summary:  one-line human summary, used as the issue title's tail
#
# Adding new patterns: just append a `match` block. The first match wins; put
# the most specific patterns first.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

LOG_FAILED=".ci-logs/failed.log"
LOG_FULL=".ci-logs/full.log"
LOG="${LOG_FAILED}"
[ -s "$LOG" ] || LOG="$LOG_FULL"
[ -s "$LOG" ] || { echo "no logs to diagnose"; exit 0; }

emit() {
  local cat="$1" sum="$2"
  echo "category=$cat" >> "$GITHUB_OUTPUT"
  # Escape for single-line output
  printf 'summary=%s\n' "${sum//$'\n'/ }" >> "$GITHUB_OUTPUT"
  echo "→ classified as: [$cat] $sum"
}

# Order matters — most specific first.
if grep -q "Permission denied (publickey" "$LOG"; then
  emit ssh-auth "SSH key in VPS_SSH_KEY secret no longer matches an authorized_keys entry on VPS — likely the deploy key was rotated/removed in Hostinger panel"
elif grep -qE "Host key verification failed|hostname contains invalid characters|Could not resolve hostname" "$LOG"; then
  emit ssh-host "VPS_HOST secret is malformed (trailing newline, port, or DNS issue)"
elif grep -qE "ssh-keyscan.*empty|ssh-keyscan produced empty" "$LOG"; then
  emit ssh-host "ssh-keyscan returned empty — VPS unreachable or VPS_HOST wrong"
elif grep -q "No such file or directory" "$LOG" && grep -q "/opt/al-ruya-erp" "$LOG"; then
  emit ssh-host "deploy script ran on wrong host — /opt/al-ruya-erp missing"
elif grep -qE "ERR! .* npm|pnpm.*ERR|Cannot find module" "$LOG"; then
  emit docker-build "node/npm dependency error during image build"
elif grep -qE "error TS[0-9]+" "$LOG"; then
  N=$(grep -cE "error TS[0-9]+" "$LOG" || echo 0)
  emit type-error "TypeScript compilation failed (${N} TS errors)"
elif grep -qE "P[0-9]{4}" "$LOG"; then
  emit migration "Prisma migration failure (P-code present in logs)"
elif grep -qE "/health failed|health did not respond" "$LOG"; then
  emit health-fail "App started but /health endpoint not responding — check api/web container logs"
elif grep -qE "FAIL .*\.spec\.ts|✗.*test|tests failed" "$LOG"; then
  emit test-fail "test suite failed"
elif grep -qE "nginx: \[emerg\]|nginx config invalid" "$LOG"; then
  emit nginx-conf "nginx config syntax error after change"
elif grep -qE "exit code 137|killed.*OOM|out of memory" "$LOG"; then
  emit oom "build/run killed for OOM — VPS may need swap or container memory limits"
else
  # Last resort: grab the last error-like line
  LINE=$(grep -E "error|Error|FAIL|fatal|denied" "$LOG" | tail -1 | sed 's/^[^a-zA-Z]*//' | head -c 200)
  emit unknown "${LINE:-classification failed — open $RUN_URL}"
fi
