#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# smoke-test-prod.sh — Operational end-to-end smoke test for ibherp.cloud
#
# Tests REAL user workflows by calling actual API endpoints in sequence.
# Reports a PASS/FAIL matrix so we know exactly what works vs what's broken.
#
# Usage:
#   bash scripts/smoke-test-prod.sh OWNER_USER OWNER_PASS
# Example:
#   bash scripts/smoke-test-prod.sh ahrrfy 'Ahrrfy@6399137'
# ─────────────────────────────────────────────────────────────────────────────

set -u

USER="${1:-}"
PASS="${2:-}"
BASE="${BASE:-https://ibherp.cloud}"

if [ -z "$USER" ] || [ -z "$PASS" ]; then
  echo "Usage: $0 USERNAME PASSWORD"
  exit 2
fi

PASS_COUNT=0
FAIL_COUNT=0
FAILURES=""

# ── helper ────────────────────────────────────────────────────────────────
run() {
  local label="$1"; shift
  local expected_min="$1"; shift   # min expected http code (e.g. 200)
  local expected_max="$1"; shift   # max expected http code (e.g. 299)
  local resp
  resp=$(curl -sS -m 15 -w "\n__HTTP__%{http_code}" "$@" 2>&1)
  local http
  http=$(echo "$resp" | grep -oE '__HTTP__[0-9]+$' | sed 's/__HTTP__//')
  local body
  body=$(echo "$resp" | sed -E '$d')

  # data-content peek: first 80 chars of body
  local peek
  peek=$(echo "$body" | tr -d '\n' | cut -c1-80)

  if [ -z "$http" ]; then
    echo "  ❌ $label  (no response)"
    FAIL_COUNT=$((FAIL_COUNT+1))
    FAILURES="${FAILURES}\n  - $label : NO RESPONSE"
  elif [ "$http" -ge "$expected_min" ] && [ "$http" -le "$expected_max" ]; then
    echo "  ✅ $label  http=$http  data:[$peek]"
    PASS_COUNT=$((PASS_COUNT+1))
  else
    echo "  ❌ $label  http=$http  body:[$peek]"
    FAIL_COUNT=$((FAIL_COUNT+1))
    FAILURES="${FAILURES}\n  - $label : http=$http body=$peek"
  fi
}

echo "═══════════════════════════════════════════════════════════════"
echo "  Al-Ruya ERP — Production Operational Smoke Test"
echo "  Target: $BASE"
echo "  User:   $USER"
echo "  Time:   $(date -u +%FT%TZ)"
echo "═══════════════════════════════════════════════════════════════"
echo

# ── 1. AUTH FLOW ──────────────────────────────────────────────────────────
echo "── 1. AUTH FLOW ──"
LOGIN_RESP=$(curl -sS -m 15 -w "\n__HTTP__%{http_code}" \
  -X POST "$BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}" 2>&1)
LOGIN_HTTP=$(echo "$LOGIN_RESP" | grep -oE '__HTTP__[0-9]+$' | sed 's/__HTTP__//')
LOGIN_BODY=$(echo "$LOGIN_RESP" | sed -E '$d')

if [ "$LOGIN_HTTP" != "200" ] && [ "$LOGIN_HTTP" != "201" ]; then
  echo "  ❌ POST /auth/login  http=$LOGIN_HTTP"
  echo "  body: $LOGIN_BODY"
  echo
  echo "❌ ABORT — cannot authenticate, rest of tests would fail"
  exit 1
fi

TOKEN=$(echo "$LOGIN_BODY" | grep -oE '"accessToken"\s*:\s*"[^"]+"' | head -1 | sed -E 's/.*"accessToken"\s*:\s*"([^"]+)".*/\1/')
if [ -z "$TOKEN" ]; then
  TOKEN=$(echo "$LOGIN_BODY" | grep -oE '"token"\s*:\s*"[^"]+"' | head -1 | sed -E 's/.*"token"\s*:\s*"([^"]+)".*/\1/')
fi

if [ -z "$TOKEN" ]; then
  echo "  ❌ login OK but no token in response"
  echo "  body: $LOGIN_BODY"
  exit 1
fi

echo "  ✅ POST /auth/login           http=$LOGIN_HTTP  (token: ${TOKEN:0:20}...)"
PASS_COUNT=$((PASS_COUNT+1))

H="-H Authorization:Bearer\ $TOKEN"
AUTH_HEADER="Authorization: Bearer $TOKEN"

run "GET /auth/me"                   200 299 -H "$AUTH_HEADER" "$BASE/api/v1/auth/me"
echo

# ── 2. CORE / COMPANY / BRANCHES ──────────────────────────────────────────
echo "── 2. CORE: COMPANY + BRANCHES + USERS ──"
run "GET /company"                   200 299 -H "$AUTH_HEADER" "$BASE/api/v1/company"
run "GET /company/branches"          200 299 -H "$AUTH_HEADER" "$BASE/api/v1/company/branches"
run "GET /company/users"             200 299 -H "$AUTH_HEADER" "$BASE/api/v1/company/users"
run "GET /company/roles"             200 299 -H "$AUTH_HEADER" "$BASE/api/v1/company/roles"
echo

# ── 3. INVENTORY ──────────────────────────────────────────────────────────
echo "── 3. INVENTORY ──"
run "GET /inventory/warehouses"      200 299 -H "$AUTH_HEADER" "$BASE/api/v1/inventory/warehouses"
run "GET /inventory/stock"           200 299 -H "$AUTH_HEADER" "$BASE/api/v1/inventory/stock"
run "GET /products"                  200 299 -H "$AUTH_HEADER" "$BASE/api/v1/products"
echo

# ── 4. SALES ──────────────────────────────────────────────────────────────
echo "── 4. SALES ──"
run "GET /customers"                 200 299 -H "$AUTH_HEADER" "$BASE/api/v1/customers"
run "GET /sales-invoices"            200 299 -H "$AUTH_HEADER" "$BASE/api/v1/sales-invoices"
run "GET /sales-orders"              200 299 -H "$AUTH_HEADER" "$BASE/api/v1/sales-orders"
run "GET /sales-returns"             200 299 -H "$AUTH_HEADER" "$BASE/api/v1/sales-returns"
run "GET /quotations"                200 299 -H "$AUTH_HEADER" "$BASE/api/v1/quotations"
echo

# ── 5. POS ────────────────────────────────────────────────────────────────
echo "── 5. POS ──"
run "GET /pos/devices"               200 299 -H "$AUTH_HEADER" "$BASE/api/v1/pos/devices"
run "GET /pos/shifts"                200 299 -H "$AUTH_HEADER" "$BASE/api/v1/pos/shifts"
echo

# ── 6. PURCHASES ──────────────────────────────────────────────────────────
echo "── 6. PURCHASES ──"
run "GET /suppliers"                 200 299 -H "$AUTH_HEADER" "$BASE/api/v1/suppliers"
run "GET /purchases/orders"          200 299 -H "$AUTH_HEADER" "$BASE/api/v1/purchases/orders"
run "GET /purchases/grn"             200 299 -H "$AUTH_HEADER" "$BASE/api/v1/purchases/grn"
run "GET /purchases/invoices"        200 299 -H "$AUTH_HEADER" "$BASE/api/v1/purchases/invoices"
echo

# ── 7. FINANCE ────────────────────────────────────────────────────────────
echo "── 7. FINANCE ──"
run "GET /finance/gl/accounts"       200 299 -H "$AUTH_HEADER" "$BASE/api/v1/finance/gl/accounts"
run "GET /finance/gl/journal-entries" 200 299 -H "$AUTH_HEADER" "$BASE/api/v1/finance/gl/journal-entries"
run "GET /finance/periods"           200 299 -H "$AUTH_HEADER" "$BASE/api/v1/finance/periods"
run "GET /finance/banks"             200 299 -H "$AUTH_HEADER" "$BASE/api/v1/finance/banks"
run "GET /finance/budgets"           200 299 -H "$AUTH_HEADER" "$BASE/api/v1/finance/budgets"
run "GET /finance/reports/equity"    200 299 -H "$AUTH_HEADER" "$BASE/api/v1/finance/reports/equity"
echo

# ── 8. HR ─────────────────────────────────────────────────────────────────
echo "── 8. HR ──"
run "GET /hr/employees"              200 299 -H "$AUTH_HEADER" "$BASE/api/v1/hr/employees"
run "GET /hr/departments"            200 299 -H "$AUTH_HEADER" "$BASE/api/v1/hr/departments"
run "GET /hr/payroll"                200 299 -H "$AUTH_HEADER" "$BASE/api/v1/hr/payroll"
run "GET /hr/attendance"             200 299 -H "$AUTH_HEADER" "$BASE/api/v1/hr/attendance"
echo

# ── 9. CRM ────────────────────────────────────────────────────────────────
echo "── 9. CRM ──"
run "GET /crm/leads"                 200 299 -H "$AUTH_HEADER" "$BASE/api/v1/crm/leads"
run "GET /crm/pipeline"              200 299 -H "$AUTH_HEADER" "$BASE/api/v1/crm/pipeline"
run "GET /crm/activities"            200 299 -H "$AUTH_HEADER" "$BASE/api/v1/crm/activities"
echo

# ── 10. DELIVERY ──────────────────────────────────────────────────────────
echo "── 10. DELIVERY ──"
run "GET /delivery/companies"        200 299 -H "$AUTH_HEADER" "$BASE/api/v1/delivery/companies"
run "GET /delivery"                  200 299 -H "$AUTH_HEADER" "$BASE/api/v1/delivery"
echo

# ── 11. ASSETS / JOB ORDERS / MARKETING ──────────────────────────────────
echo "── 11. ASSETS + JOB ORDERS + MARKETING ──"
run "GET /assets"                    200 299 -H "$AUTH_HEADER" "$BASE/api/v1/assets"
run "GET /job-orders"                200 299 -H "$AUTH_HEADER" "$BASE/api/v1/job-orders"
run "GET /marketing/campaigns"       200 299 -H "$AUTH_HEADER" "$BASE/api/v1/marketing/campaigns"
echo

# ── 12. DASHBOARDS + REPORTS ──────────────────────────────────────────────
echo "── 12. DASHBOARDS + REPORTS ──"
run "GET /dashboards/executive"      200 299 -H "$AUTH_HEADER" "$BASE/api/v1/dashboards/executive"
run "GET /dashboards/operations"     200 299 -H "$AUTH_HEADER" "$BASE/api/v1/dashboards/operations"
run "GET /dashboards/finance"        200 299 -H "$AUTH_HEADER" "$BASE/api/v1/dashboards/finance"
run "GET /reports/sales-summary"     200 299 -H "$AUTH_HEADER" "$BASE/api/v1/reports/sales-summary"
echo

# ── 13. NOTIFICATIONS + AUDIT + AI ────────────────────────────────────────
echo "── 13. INFRA: NOTIFICATIONS + AUDIT + AI ──"
run "GET /notifications"             200 299 -H "$AUTH_HEADER" "$BASE/api/v1/notifications"
run "GET /audit-logs"                200 299 -H "$AUTH_HEADER" "$BASE/api/v1/audit-logs"
run "GET /ai/health"                 200 299 -H "$AUTH_HEADER" "$BASE/api/v1/ai/health"
echo

# ── 14. DB DIRECT COUNTS (via api fallback) ──────────────────────────────
echo "── 14. DASHBOARD DATA SAMPLE ──"
echo "  (a sample of /dashboards/executive payload to inspect zero values):"
curl -sS -m 15 -H "$AUTH_HEADER" "$BASE/api/v1/dashboards/executive" 2>&1 | head -c 500
echo
echo

# ── SUMMARY ──────────────────────────────────────────────────────────────
TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo "═══════════════════════════════════════════════════════════════"
echo "  RESULTS"
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ Passed: $PASS_COUNT / $TOTAL"
echo "  ❌ Failed: $FAIL_COUNT / $TOTAL"
if [ "$FAIL_COUNT" -gt 0 ]; then
  echo
  echo "  Failed endpoints:"
  echo -e "$FAILURES"
fi
echo "═══════════════════════════════════════════════════════════════"

exit 0
