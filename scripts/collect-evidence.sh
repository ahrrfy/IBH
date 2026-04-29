#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# collect-evidence.sh — capture API evidence for G5 gate (Phase 3.A)
#
# Calls every major API endpoint per wave, saves JSON responses to
# governance/evidence/wave{1-6}/ directories.
#
# Usage:
#   BASE_URL=https://api.ibherp.cloud \
#   ADMIN_EMAIL=testadmin@ci.test \
#   ADMIN_PASSWORD=... \
#   bash scripts/collect-evidence.sh
#
#   --wave 1      # only run wave 1
#   --wave 2      # only run wave 2
#   (default: all waves)
#
# Output:
#   governance/evidence/wave1/api-captures/*.json
#   governance/evidence/wave1/flow-recordings/*.md  ← links to flow docs
#   ...up to wave6
#
# Note: Screenshots must be captured manually in the browser — this script
# handles the API portion only.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

BASE_URL="${BASE_URL:-https://api.ibherp.cloud}"
ADMIN_EMAIL="${ADMIN_EMAIL:-testadmin@ci.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
ONLY_WAVE="${ONLY_WAVE:-}"
EVIDENCE_DIR="governance/evidence"
TIMESTAMP=$(date '+%Y-%m-%dT%H:%M:%S')

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS=0; FAIL=0

log_pass() { echo -e "  ${GREEN}✅ $1${NC}"; PASS=$((PASS+1)); }
log_fail() { echo -e "  ${RED}❌ $1${NC}"; FAIL=$((FAIL+1)); }
log_warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; }

# Parse --wave argument
while [[ $# -gt 0 ]]; do
  case $1 in
    --wave) ONLY_WAVE="$2"; shift 2 ;;
    *) shift ;;
  esac
done

echo "═══════════════════════════════════════════════════"
echo "  📸 Al-Ruya ERP — G5 Evidence Collection"
echo "  $TIMESTAMP"
echo "  Target: $BASE_URL"
echo "  Wave filter: ${ONLY_WAVE:-all}"
echo "═══════════════════════════════════════════════════"
echo ""

# ── Authenticate ──────────────────────────────────────────────────────────────
echo "🔐 Authenticating..."
if [ -z "$ADMIN_PASSWORD" ]; then
  echo -e "${RED}❌ ADMIN_PASSWORD not set${NC}"
  exit 1
fi

LOGIN_RESP=$(curl -sf -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" 2>/dev/null || echo "{}")

TOKEN=$(echo "$LOGIN_RESP" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4 || echo "")
if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Login failed — check ADMIN_EMAIL + ADMIN_PASSWORD${NC}"
  exit 1
fi
log_pass "Logged in as $ADMIN_EMAIL"
echo ""

AUTH_HEADER="Authorization: Bearer $TOKEN"
CONTENT_HEADER="Content-Type: application/json"

# ── Capture helper ────────────────────────────────────────────────────────────
# capture <wave> <label> <method> <path> [body]
capture() {
  local wave="$1" label="$2" method="$3" path="$4" body="${5:-}"
  local dir="$EVIDENCE_DIR/wave${wave}/api-captures"
  mkdir -p "$dir"
  local file="$dir/${label}.json"

  local args=(-sf -w '\n{"_meta":{"status":%{http_code},"time_ms":%{time_total}}}' \
    -X "$method" "$BASE_URL$path" \
    -H "$AUTH_HEADER" -H "$CONTENT_HEADER")
  [ -n "$body" ] && args+=(-d "$body")

  local response
  response=$(curl "${args[@]}" 2>/dev/null || echo '{"error":"curl failed"}')
  echo "$response" > "$file"

  local status
  status=$(echo "$response" | grep -o '"status":[0-9]*' | tail -1 | cut -d: -f2 || echo "0")
  if [[ "$status" =~ ^2 ]]; then
    log_pass "W${wave} $label → $method $path ($status)"
  elif [ "$status" = "401" ] || [ "$status" = "403" ]; then
    log_warn "W${wave} $label → $method $path ($status — permission)"
  else
    log_fail "W${wave} $label → $method $path ($status)"
  fi
}

should_run() { [ -z "$ONLY_WAVE" ] || [ "$ONLY_WAVE" = "$1" ]; }

# ── Wave 1 — Foundation ───────────────────────────────────────────────────────
if should_run "1"; then
  echo "🏗️  Wave 1 — Foundation..."
  capture 1 "auth-login"            POST "/auth/login"           "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}"
  capture 1 "users-list"            GET  "/users?limit=10"
  capture 1 "roles-list"            GET  "/roles"
  capture 1 "companies-list"        GET  "/companies"
  capture 1 "products-list"         GET  "/products?limit=10"
  capture 1 "products-categories"   GET  "/products/categories"
  capture 1 "inventory-balance"     GET  "/inventory/balance?limit=20"
  capture 1 "inventory-warehouses"  GET  "/inventory/warehouses"
  capture 1 "audit-logs"            GET  "/audit/logs?limit=10"
  echo ""
fi

# ── Wave 2 — Daily Ops ────────────────────────────────────────────────────────
if should_run "2"; then
  echo "💼 Wave 2 — Daily Operations..."
  capture 2 "pos-devices"           GET  "/pos/devices"
  capture 2 "pos-receipts"          GET  "/pos/receipts?limit=10"
  capture 2 "pos-shifts"            GET  "/pos/shifts?limit=10"
  capture 2 "quotations-list"       GET  "/sales/quotations?limit=10"
  capture 2 "sales-orders-list"     GET  "/sales/orders?limit=10"
  capture 2 "sales-invoices-list"   GET  "/sales/invoices?limit=10"
  capture 2 "customers-list"        GET  "/customers?limit=10"
  capture 2 "deliveries-list"       GET  "/deliveries?limit=10"
  capture 2 "reports-sales-summary" GET  "/reports/render?slug=sales-summary&from=$(date -d '30 days ago' '+%Y-%m-%d' 2>/dev/null || date -v-30d '+%Y-%m-%d')&to=$(date '+%Y-%m-%d')"
  capture 2 "reports-daily-sales"   GET  "/reports/render?slug=daily-sales&from=$(date '+%Y-%m-%d')&to=$(date '+%Y-%m-%d')"
  capture 2 "reports-top-products"  GET  "/reports/render?slug=top-products&from=$(date -d '30 days ago' '+%Y-%m-%d' 2>/dev/null || date -v-30d '+%Y-%m-%d')&to=$(date '+%Y-%m-%d')"
  echo ""
fi

# ── Wave 3 — Purchasing ───────────────────────────────────────────────────────
if should_run "3"; then
  echo "🛒 Wave 3 — Purchasing..."
  capture 3 "suppliers-list"        GET  "/suppliers?limit=10"
  capture 3 "purchase-orders"       GET  "/purchases/orders?limit=10"
  capture 3 "grn-list"              GET  "/purchases/grn?limit=10"
  capture 3 "vendor-invoices"       GET  "/purchases/vendor-invoices?limit=10"
  capture 3 "3way-match"            GET  "/purchases/three-way-match?limit=10"
  echo ""
fi

# ── Wave 4 — Finance ──────────────────────────────────────────────────────────
if should_run "4"; then
  echo "💰 Wave 4 — Finance..."
  FY_START="$(date '+%Y')-01-01"
  TODAY="$(date '+%Y-%m-%d')"
  capture 4 "chart-of-accounts"     GET  "/finance/accounts?limit=50"
  capture 4 "trial-balance"         GET  "/finance/gl/trial-balance?from=${FY_START}&to=${TODAY}"
  capture 4 "journal-entries"       GET  "/finance/gl/journal-entries?limit=10"
  capture 4 "bank-accounts"         GET  "/finance/bank-accounts"
  capture 4 "period-close-status"   GET  "/finance/period-close/status"
  capture 4 "financial-reports-bs"  GET  "/finance/reports/balance-sheet?asOf=${TODAY}"
  capture 4 "financial-reports-is"  GET  "/finance/reports/income-statement?from=${FY_START}&to=${TODAY}"
  capture 4 "fixed-assets"          GET  "/assets/fixed?limit=10"
  capture 4 "depreciation-schedule" GET  "/assets/depreciation/schedule?limit=10"
  capture 4 "kpis-dashboard"        GET  "/finance/kpis/dashboard"
  echo ""
fi

# ── Wave 5 — HR ───────────────────────────────────────────────────────────────
if should_run "5"; then
  echo "👥 Wave 5 — HR..."
  capture 5 "employees-list"        GET  "/hr/employees?limit=10"
  capture 5 "attendance-today"      GET  "/hr/attendance?date=$(date '+%Y-%m-%d')"
  capture 5 "leaves-list"           GET  "/hr/leaves?limit=10"
  capture 5 "payroll-runs"          GET  "/hr/payroll/runs?limit=5"
  capture 5 "recruitment-jobs"      GET  "/hr/recruitment/jobs?limit=10"
  capture 5 "hr-contracts"          GET  "/hr/contracts?limit=10"
  capture 5 "hr-policies"           GET  "/hr/policies?limit=10"
  capture 5 "salary-bands"          GET  "/hr/salary-bands?limit=10"
  echo ""
fi

# ── Wave 6 — CRM + Licensing ──────────────────────────────────────────────────
if should_run "6"; then
  echo "🤖 Wave 6 — CRM + AI + Licensing..."
  capture 6 "crm-leads"             GET  "/crm/leads?limit=10"
  capture 6 "crm-activities"        GET  "/crm/activities?limit=10"
  capture 6 "crm-pipeline"          GET  "/crm/pipeline"
  capture 6 "licensing-subs"        GET  "/licensing/subscriptions?limit=10"
  capture 6 "license-plans"         GET  "/licensing/plans"
  capture 6 "feature-flags"         GET  "/licensing/feature-flags"
  capture 6 "autopilot-exceptions"  GET  "/autopilot/exceptions?limit=10"
  capture 6 "autopilot-jobs"        GET  "/autopilot/jobs"
  capture 6 "ai-anomalies"          GET  "/ai/anomaly-detections?limit=10"
  echo ""
fi

# ── Write index ───────────────────────────────────────────────────────────────
mkdir -p "$EVIDENCE_DIR"
cat > "$EVIDENCE_DIR/README.md" <<MDEOF
# G5 Evidence — Al-Ruya ERP

**Collected:** $TIMESTAMP
**Target:** $BASE_URL

## Structure

\`\`\`
governance/evidence/
├── wave1/api-captures/*.json    ← Foundation
├── wave2/api-captures/*.json    ← Daily Ops
├── wave3/api-captures/*.json    ← Purchasing
├── wave4/api-captures/*.json    ← Finance
├── wave5/api-captures/*.json    ← HR
├── wave6/api-captures/*.json    ← CRM + Licensing
├── flows/                       ← End-to-end flow docs
│   ├── sale-lifecycle.md
│   ├── procurement-lifecycle.md
│   ├── payroll-lifecycle.md
│   └── license-lifecycle.md
└── README.md                    ← this file
\`\`\`

## Re-run

\`\`\`bash
BASE_URL=https://api.ibherp.cloud \\
ADMIN_EMAIL=testadmin@ci.test \\
ADMIN_PASSWORD=<password> \\
bash scripts/collect-evidence.sh
\`\`\`

## Wave coverage

| Wave | Status | Files |
|------|--------|-------|
| 1 Foundation     | $(ls "$EVIDENCE_DIR/wave1/api-captures"/*.json 2>/dev/null | wc -l || echo 0) captures |
| 2 Daily Ops      | $(ls "$EVIDENCE_DIR/wave2/api-captures"/*.json 2>/dev/null | wc -l || echo 0) captures |
| 3 Purchasing     | $(ls "$EVIDENCE_DIR/wave3/api-captures"/*.json 2>/dev/null | wc -l || echo 0) captures |
| 4 Finance        | $(ls "$EVIDENCE_DIR/wave4/api-captures"/*.json 2>/dev/null | wc -l || echo 0) captures |
| 5 HR             | $(ls "$EVIDENCE_DIR/wave5/api-captures"/*.json 2>/dev/null | wc -l || echo 0) captures |
| 6 CRM/Licensing  | $(ls "$EVIDENCE_DIR/wave6/api-captures"/*.json 2>/dev/null | wc -l || echo 0) captures |

**Screenshots:** Must be captured manually — open each module in the browser and save
PNGs to \`governance/evidence/wave{N}/screenshots/*.png\`.
MDEOF

echo "📄 Index written to $EVIDENCE_DIR/README.md"
echo ""

# ── Summary ───────────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════"
echo -e "  PASS: ${GREEN}${PASS}${NC}   FAIL: ${RED}${FAIL}${NC}"
echo "  Output: $EVIDENCE_DIR/"
echo "═══════════════════════════════════════════════════"

[ "$FAIL" -gt 0 ] && exit 1 || exit 0
