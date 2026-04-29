#!/usr/bin/env bash
# Regenerates dynamic sections of README.md from real project state.
# Designed to run in CI (ubuntu) and locally (bash on Windows/macOS/Linux).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
README="$ROOT/README.md"
BOARD="$ROOT/governance/MODULE_STATUS_BOARD.md"

# ── Collect real stats ──────────────────────────────────────────

PRISMA_MODELS=$(grep -c '^model ' "$ROOT/apps/api/prisma/schema.prisma" 2>/dev/null || echo 0)
MIGRATIONS=$(find "$ROOT/apps/api/prisma/migrations" -maxdepth 1 -type d 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')
TS_FILES=$(find "$ROOT/apps" "$ROOT/packages" -name "*.ts" -o -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')
LOC=$(find "$ROOT/apps" "$ROOT/packages" -name "*.ts" -o -name "*.tsx" 2>/dev/null | xargs cat 2>/dev/null | wc -l | tr -d ' ')
E2E_TESTS=$(find "$ROOT/apps/api/test" -name "*.e2e-spec.ts" 2>/dev/null | wc -l | tr -d ' ')

# Wave / module counts from MODULE_STATUS_BOARD (no grep -P — portable)
extract_ratio() {
  # $1 = keyword to match, $2 = file
  # Matches lines like: | Waves مكتملة (كود) | **6 / 6** ✅ |
  # Extracts the two numbers from **N / N**
  grep "$1" "$2" 2>/dev/null | sed -E 's/.*\*\*([0-9]+)\s*\/\s*([0-9]+)\*\*.*/\1 \2/' | head -1
}

WAVES_RATIO=$(extract_ratio 'Waves' "$BOARD")
WAVES_DONE=$(echo "$WAVES_RATIO" | awk '{print $1}')
WAVES_TOTAL=$(echo "$WAVES_RATIO" | awk '{print $2}')
WAVES_DONE=${WAVES_DONE:-?}
WAVES_TOTAL=${WAVES_TOTAL:-?}

MODULES_RATIO=$(extract_ratio 'Modules' "$BOARD")
MODULES_DONE=$(echo "$MODULES_RATIO" | awk '{print $1}')
MODULES_TOTAL=$(echo "$MODULES_RATIO" | awk '{print $2}')
MODULES_DONE=${MODULES_DONE:-?}
MODULES_TOTAL=${MODULES_TOTAL:-?}

# ── Build module table from BOARD ───────────────────────────────

generate_module_table() {
  echo "| # | الوحدة | الحالة | الموجة |"
  echo "|---|---|---|---|"

  # Module display names (consolidated from sub-rows)
  local -A MOD_NAMES=(
    [M01]="Core Engines (Auth/RBAC/Workflow/Audit/Posting)"
    [M02]="Products & Variants & Price Lists"
    [M03]="Inventory (MWA + Ledger + Transfers)"
    [M04]="POS (Offline + Shifts + Cash)"
    [M05]="Sales (Customers + Orders + Invoices + Returns)"
    [M06]="Purchases (PO + GRN + 3-Way Match)"
    [M07]="Finance (GL + Banks + AR + Period Close + Reports)"
    [M08]="HR (Employees + Attendance + Leaves + Payroll)"
    [M09]="CRM (Leads + Pipeline + Forecast)"
    [M10]="Custom Orders (Job + BOM + Stages)"
    [M11]="Reporting (17 reports + 5 dashboards)"
    [M12]="Licensing (RSA/HMAC + Heartbeat)"
    [M13]="AI Tiered (Anomaly + NL Query + Forecast)"
    [M14]="Marketing (Campaigns + Promotions)"
    [M15]="E-commerce Storefront"
    [M16]="Delivery (Dispatch + GPS + COD)"
    [M17]="Fixed Assets (Depreciation + Disposal)"
    [M18]="Administration (Users + Companies)"
  )

  # Scan BOARD for per-module best status and wave
  local -A MOD_STATUS MOD_WAVE
  local in_wave=""
  while IFS= read -r line; do
    if echo "$line" | grep -q '##.*Wave [0-9]'; then
      in_wave=$(echo "$line" | sed -E 's/.*Wave ([0-9]+).*/\1/')
      continue
    fi
    if echo "$line" | grep -q '^|.*M[0-9][0-9]'; then
      local mid
      mid=$(echo "$line" | awk -F'|' '{print $2}' | sed -E 's/.*(M[0-9]{2}).*/\1/')
      local st
      st=$(echo "$line" | awk -F'|' '{print $3}')
      # Keep the best status seen: ✅ > 🟢 > 🟡 > 🔴
      if [ -z "${MOD_STATUS[$mid]+x}" ]; then
        MOD_STATUS[$mid]="$st"
        MOD_WAVE[$mid]="$in_wave"
      else
        # Upgrade if we see a better status
        if echo "$st" | grep -q '✅'; then
          MOD_STATUS[$mid]="✅"
        fi
      fi
    fi
  done < "$BOARD"

  # Emit sorted by module ID
  for mid in $(echo "${!MOD_NAMES[@]}" | tr ' ' '\n' | sort); do
    local name="${MOD_NAMES[$mid]}"
    local wave="${MOD_WAVE[$mid]:-?}"
    local status
    if echo "${MOD_STATUS[$mid]:-}" | grep -q '✅'; then
      status="🟢"
    elif echo "${MOD_STATUS[$mid]:-}" | grep -q '🟢'; then
      status="🟢"
    elif echo "${MOD_STATUS[$mid]:-}" | grep -q '🟡'; then
      status="🟡"
    else
      status="🔴"
    fi
    # Special: M15 is scaffolded
    if [ "$mid" = "M15" ] && [ -z "${MOD_STATUS[$mid]+x}" ]; then
      status="🟡 scaffolded"
      wave="3+6"
    fi
    echo "| $mid | $name | $status | $wave |"
  done
}

MODULE_TABLE=$(generate_module_table)

# ── Determine today's date ──────────────────────────────────────
TODAY=$(date +%Y-%m-%d)

# ── GitHub repo for badge URLs ──────────────────────────────────
REPO_SLUG=""
if command -v gh &>/dev/null; then
  REPO_SLUG=$(gh repo view --json nameWithOwner -q '.nameWithOwner' 2>/dev/null || true)
fi
if [ -z "$REPO_SLUG" ]; then
  REPO_SLUG=$(git remote get-url origin 2>/dev/null | sed -E 's#.*github\.com[:/]([^/]+/[^/.]+)(\.git)?$#\1#' || echo "ahrrfy/IBH")
fi

# ── Rewrite README ──────────────────────────────────────────────

cat > "$README" << READMEEOF
# Al-Ruya ERP — الرؤية العربية

> Operating System for Business — نظام تخطيط موارد مؤسسي كامل للسوق العراقي

[![CI](https://github.com/${REPO_SLUG}/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/${REPO_SLUG}/actions/workflows/ci.yml)
[![Modules](https://img.shields.io/badge/modules-${MODULES_DONE}%2F${MODULES_TOTAL}-brightgreen)](./governance/MODULE_STATUS_BOARD.md)
[![Waves](https://img.shields.io/badge/waves-${WAVES_DONE}%2F${WAVES_TOTAL}-blue)](./governance/MODULE_STATUS_BOARD.md)
[![Models](https://img.shields.io/badge/prisma_models-${PRISMA_MODELS}-purple)](./apps/api/prisma/schema.prisma)
[![LoC](https://img.shields.io/badge/lines_of_code-${LOC}-informational)]()
[![License](https://img.shields.io/badge/license-proprietary-red)]()

---

## 🎯 الرؤية

بناء **Operating System for Business** يُشغِّل دورة العمل كاملة من البيع حتى المحاسبة حتى الموارد البشرية، بحيث:
- النظام يفكر، الموظف ينقر
- صفر اشتراكات خارجية — ملكية كاملة
- قابل للبيع التجاري بترخيص
- مقاوم لبيئة العراق (كهرباء، إنترنت، تذبذب أسعار)

---

## 📦 ما المشمول

### الوحدات (${MODULES_DONE} من ${MODULES_TOTAL})

${MODULE_TABLE}

### الفلسفات الست (F1-F6) المُطبَّقة
- **F1 الصلاحيات:** RBAC bitmask + ABAC + PostgreSQL RLS
- **F2 المحاسبة:** Double-Entry DB constraint + Append-Only + Period Lock
- **F3 المخزون:** StockLedger append-only + Moving Weighted Average
- **F4 التشغيل:** Policies في DB + Wizards + defaults ذكية
- **F5 AI الثلاثي:** Tier 3 (قواعد) + Tier 2 (ML) + Tier 1 (Qwen on-demand)
- **F6 التراخيص:** RSA-2048 signed + hardware fingerprint + heartbeat

---

## 🧰 الحزمة التقنية

| الطبقة | التقنية |
|---|---|
| Backend | NestJS 11 + TypeScript 5.5 |
| Database | PostgreSQL 16 (RLS + pgvector + pg_trgm) |
| ORM | Prisma 6 |
| Cache/Queue | Redis 7 + BullMQ |
| Storage | MinIO (self-hosted S3) |
| Frontend | Next.js 15 + React 19 + Tailwind 4 |
| Desktop | Tauri 2 |
| Mobile | React Native (Expo) |
| AI | Ollama + Qwen 2.5 7B + PyOD + Prophet |
| VPS | Hostinger KVM4 · Frankfurt · 16GB |
| Deploy | Docker Compose + Nginx + Let's Encrypt |
| Backup | Restic (3-2-1-1) |

**صفر اشتراكات سنوية.**

---

## 📊 حالة البناء

| المقياس | القيمة |
|---|---|
| Prisma Models | **${PRISMA_MODELS}** |
| Migrations | **${MIGRATIONS}** |
| TypeScript Files | **${TS_FILES}** |
| Lines of Code | **~${LOC}** |
| E2E Test Suites | **${E2E_TESTS}** |
| Waves Complete | **${WAVES_DONE} / ${WAVES_TOTAL}** |
| Modules Complete | **${MODULES_DONE} / ${MODULES_TOTAL}** |

---

## 🚀 البدء السريع

### 1. المتطلبات
\`\`\`bash
- Node.js 22 LTS
- pnpm 9+
- Docker + Docker Compose
- PostgreSQL 16 (أو شغّل عبر Docker)
\`\`\`

### 2. التثبيت
\`\`\`bash
git clone https://github.com/${REPO_SLUG}.git al-ruya-erp
cd al-ruya-erp
pnpm install
\`\`\`

### 3. بيئة التطوير (Docker)
\`\`\`bash
# تشغيل PostgreSQL + Redis + MinIO
docker compose -f infra/docker-compose.dev.yml up -d

# نسخ إعدادات البيئة
cp .env.example .env.local
# عدّل .env.local بقيم مناسبة (DATABASE_URL, JWT_SECRET, ...)
\`\`\`

### 4. Database Migrations + Seed
\`\`\`bash
pnpm --filter api exec prisma generate
pnpm --filter api exec prisma migrate dev
pnpm --filter api exec prisma db seed
\`\`\`

### 5. تشغيل API
\`\`\`bash
pnpm --filter api dev
\`\`\`

### 6. التحقق
\`\`\`bash
curl http://localhost:3000/health
# Expected: {"status":"ok","checks":{"database":"ok"}}

curl -X POST http://localhost:3000/auth/login \\
  -H 'Content-Type: application/json' \\
  -d '{"email":"super@ruya.iq","password":"Admin@2026!"}'
\`\`\`

---

## 🏗️ هيكل المستودع

\`\`\`
al-ruya-erp/
├── apps/
│   ├── api/                    ✅ NestJS API (17 modules, ~${TS_FILES} files)
│   ├── web/                    🟡 Next.js Admin (scaffolded)
│   ├── storefront/             🟡 Next.js E-commerce (scaffolded)
│   ├── pos/                    ⚪ Tauri POS Desktop (planned)
│   ├── mobile/                 ⚪ React Native (planned)
│   └── ai-brain/               ⚪ Python FastAPI AI (planned Wave 10)
│
├── packages/
│   ├── shared-types/           TypeScript types shared
│   ├── validation-schemas/     Zod schemas
│   └── domain-events/          Event bus types
│
├── infra/
│   ├── docker-compose.vps.yml  Production stack (14 services)
│   ├── docker-compose.dev.yml  Dev stack
│   ├── nginx/                  Reverse proxy + SSL
│   └── scripts/                Deploy + backup scripts
│
└── governance/                 ← ابدأ من هنا لفهم المشروع
    ├── MASTER_SCOPE.md
    ├── ARCHITECTURE.md
    ├── DOMAIN_DICTIONARY.md
    ├── MODULE_STATUS_BOARD.md
    ├── DECISIONS_LOG.md
    ├── OPEN_ISSUES.md
    ├── ACCEPTANCE_TESTS.md
    └── SESSION_HANDOFF.md
\`\`\`

---

## 📖 قواعد المشاركة

1. **لا تُضاف فكرة جديدة** إلا بعد الإجابة على: ماذا تحل؟ ما كلفتها؟ ما أثرها؟ هل أولويتها الآن؟
2. **لا يُعدَّل قرار معماري** بدون صف جديد في \`governance/DECISIONS_LOG.md\`
3. **كل ميزة تمر بـ 6 بوابات** قبل اعتبارها منجزة (G1-G6)
4. **لا تعديل بأثر رجعي** على: تكلفة مخزون، سعر فاتورة مرحَّلة، راتب معتمد، Audit Trail

---

## 🔒 الأمان المتعدد الطبقات

| الطبقة | التقنية |
|---|---|
| DB | Row Level Security + Append-Only triggers + CHECK constraints |
| Data | Hash Chain على Audit + Double-Entry enforced |
| Auth | Argon2id + JWT 15m + Refresh 30d (SHA-256 hashed) |
| Transport | TLS 1.3 + HSTS + Certificate Pinning |
| API | Rate limiting + Zod validation + CORS strict |
| Operations | 4-Eyes principle + Maker-Checker + Period Lock |

---

## 📜 الترخيص

Proprietary — جميع الحقوق محفوظة لشركة الرؤية العربية للتجارة.
قابل للبيع التجاري عبر نظام التراخيص (M12).

---

*آخر تحديث تلقائي: ${TODAY}*
READMEEOF

echo "✅ README.md updated — ${PRISMA_MODELS} models, ${TS_FILES} files, ~${LOC} LoC, ${MODULES_DONE}/${MODULES_TOTAL} modules"
