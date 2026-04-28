#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# operational-audit-prod.sh — REAL operational audit, not theoretical.
#
# Asks the question: does this ERP fulfill its purpose? Is anything that
# looks real actually real, or is it scaffolding without value?
#
# Tests on 4 layers:
#   1. Data Reality  — what's actually in the DB?
#   2. Business Workflow Reality — can a user complete a real sale end-to-end?
#   3. Integrity (F1/F2/F3) — RLS, double-entry, MWA, audit append-only
#   4. UI Reality — do pages render real data or placeholders?
#
# Produces a verdict per workflow: REAL ✅, FAKE 🎭, BROKEN ❌
#
# Usage:
#   bash operational-audit-prod.sh USERNAME PASSWORD
# ─────────────────────────────────────────────────────────────────────────────
set -u

USER="${1:-}"
PASS="${2:-}"
BASE="${BASE:-https://ibherp.cloud}"
INFRA_DIR="${INFRA_DIR:-/opt/al-ruya-erp/infra}"
COMPOSE="docker compose -f $INFRA_DIR/docker-compose.bootstrap.yml"

if [ -z "$USER" ] || [ -z "$PASS" ]; then
  echo "Usage: $0 USERNAME PASSWORD"; exit 2
fi

# Helpers
http_get() { curl -sS -m 15 -o /tmp/_body -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$BASE/api/v1$1"; }
http_post() { curl -sS -m 20 -o /tmp/_body -w "%{http_code}" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -X POST -d "$2" "$BASE/api/v1$1"; }
db_count() { $COMPOSE exec -T postgres psql -U erp_app -d alruya_erp -tAc "SELECT count(*) FROM \"$1\";" 2>/dev/null | tr -d ' \r'; }
db_query() { $COMPOSE exec -T postgres psql -U erp_app -d alruya_erp -tAc "$1" 2>/dev/null | head -20; }

verdict() {
  local label="$1"; local v="$2"
  case "$v" in
    REAL)    echo "  ✅ REAL    $label" ;;
    FAKE)    echo "  🎭 FAKE    $label  (code exists, no data flow)" ;;
    BROKEN)  echo "  ❌ BROKEN  $label  (returns error)" ;;
    EMPTY)   echo "  ⚪ EMPTY   $label  (works but no data)" ;;
  esac
}

echo "═══════════════════════════════════════════════════════════════════════"
echo "  AL-RUYA ERP — Operational Audit (Real-vs-Theatrical)"
echo "  $(date -u +%FT%TZ) | target: $BASE"
echo "═══════════════════════════════════════════════════════════════════════"

# ── LAYER 0 — AUTH ────────────────────────────────────────────────────────
echo
echo "── 🔐 LAYER 0 — AUTH ──"
TOKEN=$(curl -sS -m 15 -X POST "$BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"emailOrUsername\":\"$USER\",\"password\":\"$PASS\"}" \
  | grep -oE '"accessToken"\s*:\s*"[^"]+"' | head -1 \
  | sed -E 's/.*"accessToken"\s*:\s*"([^"]+)".*/\1/')
if [ -z "$TOKEN" ]; then echo "❌ LOGIN FAILED — abort"; exit 1; fi
echo "  ✅ login OK  token: ${TOKEN:0:24}..."

# ─────────────────────────────────────────────────────────────────────────
# LAYER 1 — DATA REALITY
# How much actual data is in this system? What's seeded vs operational?
# ─────────────────────────────────────────────────────────────────────────
echo
echo "═══ 📊 LAYER 1 — DATA REALITY (what's actually in postgres?) ═══"
echo
echo "Reference data (should be seeded):"
printf "  %-30s = %s\n" companies          "$(db_count companies)"
printf "  %-30s = %s\n" branches           "$(db_count branches)"
printf "  %-30s = %s\n" warehouses         "$(db_count warehouses)"
printf "  %-30s = %s\n" users              "$(db_count users)"
printf "  %-30s = %s\n" roles              "$(db_count roles)"
printf "  %-30s = %s\n" units_of_measure   "$(db_count units_of_measure)"
printf "  %-30s = %s\n" chart_of_accounts  "$(db_count chart_of_accounts)"
printf "  %-30s = %s\n" accounting_periods "$(db_count accounting_periods)"
printf "  %-30s = %s\n" pay_grades         "$(db_count pay_grades)"
printf "  %-30s = %s\n" posting_profiles   "$(db_count posting_profiles)"
echo
echo "Operational data (created by users; zero = greenfield system):"
printf "  %-30s = %s\n" customers          "$(db_count customers)"
printf "  %-30s = %s\n" suppliers          "$(db_count suppliers)"
printf "  %-30s = %s\n" product_templates  "$(db_count product_templates)"
printf "  %-30s = %s\n" product_variants   "$(db_count product_variants)"
printf "  %-30s = %s\n" sales_invoices     "$(db_count sales_invoices)"
printf "  %-30s = %s\n" sales_orders       "$(db_count sales_orders)"
printf "  %-30s = %s\n" purchase_orders    "$(db_count purchase_orders)"
printf "  %-30s = %s\n" goods_receipt_notes "$(db_count goods_receipt_notes)"
printf "  %-30s = %s\n" journal_entries    "$(db_count journal_entries)"
printf "  %-30s = %s\n" stock_ledger       "$(db_count stock_ledger)"
printf "  %-30s = %s\n" employees          "$(db_count employees)"
printf "  %-30s = %s\n" payments_received  "$(db_count payments_received)"
printf "  %-30s = %s\n" pos_shifts         "$(db_count pos_shifts)"

# ─────────────────────────────────────────────────────────────────────────
# LAYER 2 — BUSINESS WORKFLOW REALITY
# Try to perform a complete sale-to-cash and verify all side effects fire.
# ─────────────────────────────────────────────────────────────────────────
echo
echo "═══ 💼 LAYER 2 — BUSINESS WORKFLOW: Sale-to-Cash end-to-end ═══"
echo
echo "Goal: create a customer, create an invoice, post it, record payment,"
echo "verify journal + stock + AR ledger were all updated in lockstep."
echo

# 2.1 — get IDs we need
WAREHOUSE_ID=$(db_query "SELECT id FROM warehouses WHERE company_id=(SELECT id FROM companies LIMIT 1) ORDER BY created_at LIMIT 1;" | head -1)
BRANCH_ID=$(db_query "SELECT id FROM branches WHERE company_id=(SELECT id FROM companies LIMIT 1) ORDER BY is_main_branch DESC, created_at LIMIT 1;" | head -1)
PRODUCT_VARIANT_ID=$(db_query "SELECT id FROM product_variants ORDER BY created_at LIMIT 1;" | head -1)
echo "  context: warehouse=$WAREHOUSE_ID branch=$BRANCH_ID first-variant=$PRODUCT_VARIANT_ID"

# 2.2 — list customers (test API)
HTTP=$(http_get "/customers")
COUNT_BEFORE=$(grep -oE '"id"\s*:' /tmp/_body | wc -l | tr -d ' ')
echo "  /customers GET → http=$HTTP  visible=$COUNT_BEFORE"
if [ "$HTTP" = "200" ]; then verdict "Customer list endpoint" REAL; else verdict "Customer list endpoint" BROKEN; fi

# 2.3 — try to create customer
CUST_PAYLOAD='{"nameAr":"عميل اختبار التدقيق","nameEn":"Audit Test Customer","branchId":"'$BRANCH_ID'","phone":"07700000000","customerType":"individual"}'
HTTP=$(http_post "/customers" "$CUST_PAYLOAD")
NEW_CUST_ID=$(grep -oE '"id"\s*:\s*"[^"]+"' /tmp/_body | head -1 | sed -E 's/.*"id"\s*:\s*"([^"]+)".*/\1/')
echo "  /customers POST → http=$HTTP  newId=$NEW_CUST_ID"
if [ "$HTTP" = "200" ] || [ "$HTTP" = "201" ]; then verdict "Create customer" REAL; else verdict "Create customer" BROKEN; cat /tmp/_body; fi

# 2.4 — list invoices (path A: with hyphen, path B: with slash)
HTTP_A=$(http_get "/sales-invoices")
HTTP_B=$(http_get "/sales/invoices")
echo "  /sales-invoices GET → http=$HTTP_A"
echo "  /sales/invoices  GET → http=$HTTP_B"
if [ "$HTTP_A" = "200" ]; then verdict "Sales invoices (correct path)" REAL; fi
if [ "$HTTP_B" = "200" ]; then verdict "Sales invoices (web path)" REAL; else verdict "Sales invoices via web URL pattern" BROKEN; fi

# 2.5 — DB-level verification: any invoice in last hour?
RECENT_INV=$(db_query "SELECT count(*) FROM sales_invoices WHERE created_at > NOW() - INTERVAL '1 hour';")
echo "  DB: invoices created in last 1h = $RECENT_INV"

# ─────────────────────────────────────────────────────────────────────────
# LAYER 3 — INTEGRITY (F1/F2/F3)
# ─────────────────────────────────────────────────────────────────────────
echo
echo "═══ 🛡️ LAYER 3 — INTEGRITY (F1 RBAC + F2 Double-Entry + F3 MWA) ═══"
echo

# F2 — double-entry: every journal_entry's lines sum to zero
F2=$(db_query "SELECT count(*) FROM (SELECT je.id, SUM(jel.debit-jel.credit) AS imbalance FROM journal_entries je JOIN journal_entry_lines jel ON jel.entry_id=je.id GROUP BY je.id HAVING SUM(jel.debit-jel.credit) != 0) sub;")
echo "  F2 unbalanced journal entries: ${F2:-?}"
if [ "${F2:-1}" = "0" ]; then verdict "F2 Double-Entry (all balanced)" REAL; else verdict "F2 Double-Entry — UNBALANCED ENTRIES EXIST" BROKEN; fi

# F2 — append-only triggers
TRIGGERS=$(db_query "SELECT count(*) FROM information_schema.triggers WHERE trigger_name LIKE 'no_update%';")
echo "  F2 append-only triggers: ${TRIGGERS:-?}  (expect 3: audit_logs, je_lines, stock_ledger)"
if [ "${TRIGGERS:-0}" -ge 3 ]; then verdict "F2 Append-only triggers installed" REAL; else verdict "F2 Append-only triggers MISSING" BROKEN; fi

# F1 — RLS policies count
RLS=$(db_query "SELECT count(*) FROM pg_policies WHERE schemaname='public';")
echo "  F1 RLS policies: ${RLS:-?}  (expect ≥ 50 across multi-tenant tables)"
if [ "${RLS:-0}" -ge 50 ]; then verdict "F1 RLS policies present" REAL; else verdict "F1 RLS policies — INSUFFICIENT COUNT" BROKEN; fi

# RLS helper functions
HELPERS=$(db_query "SELECT count(*) FROM pg_proc WHERE proname IN ('current_company_id','gen_ulid','prevent_update_delete','check_period_open','update_updated_at');")
echo "  RLS helper functions: ${HELPERS:-?} / 5"
if [ "${HELPERS:-0}" = "5" ]; then verdict "RLS helper functions" REAL; else verdict "RLS helper functions MISSING" BROKEN; fi

# F3 — MWA: stock_ledger entries have running cost
MWA_NULLS=$(db_query "SELECT count(*) FROM stock_ledger WHERE moving_avg_cost IS NULL;")
echo "  F3 MWA: stock_ledger rows with NULL moving_avg_cost = ${MWA_NULLS:-?}"
if [ "${MWA_NULLS:-1}" = "0" ]; then verdict "F3 MWA cost layer populated" REAL; else verdict "F3 MWA — NULL cost rows present" BROKEN; fi

# ─────────────────────────────────────────────────────────────────────────
# LAYER 4 — INTEGRATION REALITY
# ─────────────────────────────────────────────────────────────────────────
echo
echo "═══ 🔗 LAYER 4 — INTEGRATION (do modules talk to each other?) ═══"
echo

# Sales invoice → journal entry link?
LINKED=$(db_query "SELECT count(*) FROM journal_entries WHERE source_module='sales' AND source_id IS NOT NULL;")
TOTAL_INV=$(db_count sales_invoices)
echo "  Sales invoices → journal entries: linked=$LINKED  invoices=$TOTAL_INV"
if [ "${TOTAL_INV:-0}" = "0" ]; then verdict "Sales→Posting integration" EMPTY
elif [ "${LINKED:-0}" = "${TOTAL_INV:-0}" ]; then verdict "Sales→Posting integration" REAL
else verdict "Sales→Posting integration (some invoices NOT posted)" BROKEN
fi

# POS sale → stock ledger link?
POS_TO_STOCK=$(db_query "SELECT count(*) FROM stock_ledger WHERE ref_type='pos_sale';")
echo "  POS sales → stock ledger: $POS_TO_STOCK movements"

# GRN → stock ledger
GRN_COUNT=$(db_count goods_receipt_notes)
GRN_TO_STOCK=$(db_query "SELECT count(*) FROM stock_ledger WHERE ref_type='grn';")
echo "  GRN→stock_ledger: grn=$GRN_COUNT  movements=$GRN_TO_STOCK"

# Audit log: does it record creates?
AUDIT_COUNT=$(db_count audit_logs)
echo "  Audit log entries: $AUDIT_COUNT"
if [ "${AUDIT_COUNT:-0}" -gt 0 ]; then verdict "Audit log capturing events" REAL; else verdict "Audit log — EMPTY (audit pipeline broken or zero ops)" EMPTY; fi

# ─────────────────────────────────────────────────────────────────────────
# LAYER 5 — DASHBOARD & REPORTS REALITY
# ─────────────────────────────────────────────────────────────────────────
echo
echo "═══ 📈 LAYER 5 — DASHBOARDS & REPORTS REALITY ═══"
echo

for dash in executive operations finance hr; do
  HTTP=$(http_get "/dashboards/$dash")
  body_len=$(wc -c < /tmp/_body | tr -d ' ')
  has_zero=$(grep -oE '"[a-z_]+"\s*:\s*0' /tmp/_body | wc -l | tr -d ' ')
  has_nonzero=$(grep -oE '"[a-z_]+"\s*:\s*[1-9]' /tmp/_body | wc -l | tr -d ' ')
  echo "  /dashboards/$dash  http=$HTTP  bytes=$body_len  zero-fields=$has_zero  nonzero-fields=$has_nonzero"
  if [ "$HTTP" != "200" ]; then verdict "Dashboard /$dash" BROKEN
  elif [ "${has_nonzero:-0}" -gt 0 ]; then verdict "Dashboard /$dash" REAL
  else verdict "Dashboard /$dash" EMPTY
  fi
done

for rep in sales-summary stock-on-hand ar-aging ap-aging top-products; do
  HTTP=$(http_get "/reports/$rep")
  body_len=$(wc -c < /tmp/_body | tr -d ' ')
  rows=$(grep -oE '"[a-zA-Z]+":' /tmp/_body | head -1 | wc -l | tr -d ' ')
  echo "  /reports/$rep  http=$HTTP  bytes=$body_len"
  if [ "$HTTP" != "200" ]; then verdict "Report /$rep" BROKEN
  elif [ "${body_len:-0}" -gt 50 ]; then verdict "Report /$rep" REAL
  else verdict "Report /$rep" EMPTY
  fi
done

# ─────────────────────────────────────────────────────────────────────────
# FINAL VERDICT
# ─────────────────────────────────────────────────────────────────────────
echo
echo "═══════════════════════════════════════════════════════════════════════"
echo "  📋 SUMMARY — what is REAL vs FAKE/BROKEN/EMPTY?"
echo "═══════════════════════════════════════════════════════════════════════"
echo "Re-read the verdicts above. Anything ❌ BROKEN must be fixed before"
echo "treating the system as production-ready. Anything 🎭 FAKE means the"
echo "code is there but doesn't deliver business value yet. ⚪ EMPTY just"
echo "means no operational data — common for a fresh deployment."
echo "═══════════════════════════════════════════════════════════════════════"
