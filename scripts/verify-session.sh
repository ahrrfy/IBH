#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  verify-session.sh — فحص تلقائي لصحة المشروع بعد كل جلسة
#  Claude Code يشغّله قبل ما ينهي الجلسة
# ═══════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "═══════════════════════════════════════"
echo "  🔍 فحص صحة المشروع"
echo "  $(date '+%Y-%m-%d %H:%M')"
echo "═══════════════════════════════════════"
echo ""

PASS=0
FAIL=0
WARN=0

# ─── 1. فحص Governance Files ───
echo "📋 فحص ملفات الحوكمة..."

files=(
  "governance/SESSION_HANDOFF.md"
  "governance/DECISIONS_LOG.md"
  "governance/MODULE_STATUS_BOARD.md"
  "governance/OPEN_ISSUES.md"
  "governance/ARCHITECTURE.md"
  "governance/DOMAIN_DICTIONARY.md"
  "CLAUDE.md"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    # تحقق إن الملف ما هو فارغ
    if [ -s "$file" ]; then
      echo -e "  ${GREEN}✅${NC} $file"
      ((PASS++))
    else
      echo -e "  ${YELLOW}⚠️${NC} $file (فارغ!)"
      ((WARN++))
    fi
  else
    echo -e "  ${RED}❌${NC} $file (مفقود!)"
    ((FAIL++))
  fi
done

echo ""

# ─── 2. فحص SESSION_HANDOFF freshness ───
echo "📅 فحص حداثة Session Handoff..."

if [ -f "governance/SESSION_HANDOFF.md" ]; then
  # استخراج التاريخ من أول سطر
  handoff_date=$(head -1 governance/SESSION_HANDOFF.md | grep -oP '\d{4}-\d{2}-\d{2}' || echo "")
  today=$(date '+%Y-%m-%d')
  yesterday=$(date -d "yesterday" '+%Y-%m-%d' 2>/dev/null || date '+%Y-%m-%d')

  if [ "$handoff_date" = "$today" ] || [ "$handoff_date" = "$yesterday" ]; then
    echo -e "  ${GREEN}✅${NC} محدّث ($handoff_date)"
    ((PASS++))
  elif [ -n "$handoff_date" ]; then
    echo -e "  ${YELLOW}⚠️${NC} آخر تحديث: $handoff_date (قديم!)"
    ((WARN++))
  else
    echo -e "  ${RED}❌${NC} لا يوجد تاريخ في الملف"
    ((FAIL++))
  fi
else
  echo -e "  ${RED}❌${NC} الملف غير موجود"
  ((FAIL++))
fi

echo ""

# ─── 3. فحص البنية ───
echo "🏗️ فحص هيكل المشروع..."

dirs=(
  "apps/api/src/engines"
  "apps/api/src/modules"
  "apps/api/src/platform"
  "apps/api/prisma"
  "apps/api/test"
  "packages/shared-types"
  "packages/validation-schemas"
  "governance"
)

for dir in "${dirs[@]}"; do
  if [ -d "$dir" ]; then
    echo -e "  ${GREEN}✅${NC} $dir/"
    ((PASS++))
  else
    echo -e "  ${YELLOW}⚠️${NC} $dir/ (غير موجود بعد)"
    ((WARN++))
  fi
done

echo ""

# ─── 4. فحص TypeScript ───
echo "💻 فحص TypeScript..."

if [ -d "apps/api" ]; then
  # تحقق من tsconfig.json
  if [ -f "apps/api/tsconfig.json" ]; then
    if grep -q '"strict": true' apps/api/tsconfig.json; then
      echo -e "  ${GREEN}✅${NC} TypeScript strict mode مفعّل"
      ((PASS++))
    else
      echo -e "  ${RED}❌${NC} TypeScript strict mode غير مفعّل!"
      ((FAIL++))
    fi
  fi

  # تحقق من أي type
  any_count=$(rg ': any[^a-zA-Z]' apps/api/src --type ts -l 2>/dev/null | wc -l || echo "0")
  if [ "$any_count" -eq 0 ]; then
    echo -e "  ${GREEN}✅${NC} لا يوجد 'any' type"
    ((PASS++))
  else
    echo -e "  ${RED}❌${NC} يوجد 'any' type في $any_count ملف"
    ((FAIL++))
  fi
fi

echo ""

# ─── 5. فحص Prisma Schema ───
echo "🗄️ فحص Prisma Schema..."

if [ -f "apps/api/prisma/schema.prisma" ]; then
  # تحقق من وجود journal_entries
  if grep -q 'model journal_entries' apps/api/prisma/schema.prisma 2>/dev/null; then
    echo -e "  ${GREEN}✅${NC} journal_entries موجود"
    ((PASS++))
  fi

  # تحقق من وجود stock_ledger
  if grep -q 'model stock_ledger' apps/api/prisma/schema.prisma 2>/dev/null; then
    echo -e "  ${GREEN}✅${NC} stock_ledger موجود"
    ((PASS++))
  fi
fi

echo ""

# ─── النتيجة النهائية ───
TOTAL=$((PASS + FAIL + WARN))

echo "═══════════════════════════════════════"
echo "  📊 النتيجة"
echo "═══════════════════════════════════════"
echo -e "  ${GREEN}✅ ناجح:${NC}  $PASS"
echo -e "  ${RED}❌ فاشل:${NC}  $FAIL"
echo -e "  ${YELLOW}⚠️ تحذير:${NC} $WARN"
echo "  ─────────────────────────"
echo "  الإجمالي: $TOTAL فحص"
echo ""

if [ "$FAIL" -eq 0 ] && [ "$WARN" -eq 0 ]; then
  echo -e "  ${GREEN}🟢 مجتاز — لا مشاكل${NC}"
  exit 0
elif [ "$FAIL" -eq 0 ]; then
  echo -e "  ${YELLOW}🟡 جيد مع ملاحظات — راجع التحذيرات${NC}"
  exit 0
else
  echo -e "  ${RED}🔴 يحتاج إصلاح — هناك $FAIL مشكلة${NC}"
  exit 1
fi
