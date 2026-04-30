# Al-Ruya ERP — الرؤية العربية

> Operating System for Business — نظام تخطيط موارد مؤسسي كامل للسوق العراقي

[![CI](https://github.com/ahrrfy/IBH/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ahrrfy/IBH/actions/workflows/ci.yml)
[![Modules](https://img.shields.io/badge/modules-18%2F18-brightgreen)](./governance/MODULE_STATUS_BOARD.md)
[![Waves](https://img.shields.io/badge/waves-6%2F6-blue)](./governance/MODULE_STATUS_BOARD.md)
[![Models](https://img.shields.io/badge/prisma_models-128-purple)](./apps/api/prisma/schema.prisma)
[![LoC](https://img.shields.io/badge/lines_of_code-103047-informational)]()
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

### الوحدات (18 من 18)

| # | الوحدة | الحالة | الموجة |
|---|---|---|---|
| M01 | Core Engines (Auth/RBAC/Workflow/Audit/Posting) | 🟢 | 1 |
| M02 | Products & Variants & Price Lists | 🟢 | 1 |
| M03 | Inventory (MWA + Ledger + Transfers) | 🟢 | 1 |
| M04 | POS (Offline + Shifts + Cash) | 🟢 | 2 |
| M05 | Sales (Customers + Orders + Invoices + Returns) | 🟢 | 2 |
| M06 | Purchases (PO + GRN + 3-Way Match) | 🟢 | 3 |
| M07 | Finance (GL + Banks + AR + Period Close + Reports) | 🟢 | 4 |
| M08 | HR (Employees + Attendance + Leaves + Payroll) | 🟢 | 5 |
| M09 | CRM (Leads + Pipeline + Forecast) | 🟢 | 6 |
| M10 | Custom Orders (Job + BOM + Stages) | 🟢 | 5 |
| M11 | Reporting (17 reports + 5 dashboards) | 🟢 | 6 |
| M12 | Licensing (RSA/HMAC + Heartbeat) | 🟢 | 6 |
| M13 | AI Tiered (Anomaly + NL Query + Forecast) | 🟢 | 6 |
| M14 | Marketing (Campaigns + Promotions) | 🟢 | 5 |
| M15 | E-commerce Storefront | 🟢 | 6 |
| M16 | Delivery (Dispatch + GPS + COD) | 🟢 | 2 |
| M17 | Fixed Assets (Depreciation + Disposal) | 🟢 | 4 |
| M18 | Administration (Users + Companies) | 🟢 | 1 |

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
| Prisma Models | **128** |
| Migrations | **31** |
| TypeScript Files | **693** |
| Lines of Code | **~103047** |
| E2E Test Suites | **35** |
| Waves Complete | **6 / 6** |
| Modules Complete | **18 / 18** |

---

## 🚀 البدء السريع

### 1. المتطلبات
```bash
- Node.js 22 LTS
- pnpm 9+
- Docker + Docker Compose
- PostgreSQL 16 (أو شغّل عبر Docker)
```

### 2. التثبيت
```bash
git clone https://github.com/ahrrfy/IBH.git al-ruya-erp
cd al-ruya-erp
pnpm install
```

### 3. بيئة التطوير (Docker)
```bash
# تشغيل PostgreSQL + Redis + MinIO
docker compose -f infra/docker-compose.dev.yml up -d

# نسخ إعدادات البيئة
cp .env.example .env.local
# عدّل .env.local بقيم مناسبة (DATABASE_URL, JWT_SECRET, ...)
```

### 4. Database Migrations + Seed
```bash
pnpm --filter api exec prisma generate
pnpm --filter api exec prisma migrate dev
pnpm --filter api exec prisma db seed
```

### 5. تشغيل API
```bash
pnpm --filter api dev
```

### 6. التحقق
```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","checks":{"database":"ok"}}

curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"super@ruya.iq","password":"Admin@2026!"}'
```

---

## 🏗️ هيكل المستودع

```
al-ruya-erp/
├── apps/
│   ├── api/                    ✅ NestJS API (17 modules, ~693 files)
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
```

---

## 📖 قواعد المشاركة

1. **لا تُضاف فكرة جديدة** إلا بعد الإجابة على: ماذا تحل؟ ما كلفتها؟ ما أثرها؟ هل أولويتها الآن؟
2. **لا يُعدَّل قرار معماري** بدون صف جديد في `governance/DECISIONS_LOG.md`
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

*آخر تحديث تلقائي: 2026-04-30*
