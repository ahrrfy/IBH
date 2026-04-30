# ARCHITECTURE.md
## القرارات المعمارية المقفلة
### لا يُعدَّل أي قرار بدون إضافة صف في DECISIONS_LOG.md

---

## 1. قرارات التقنية النهائية

| البند | القرار | الإصدار |
|---|---|---|
| Backend | NestJS 11+ TypeScript | Node.js 22 LTS |
| Frontend | React 19 + Next.js 15 + Tailwind 4 | shadcn/ui RTL |
| Desktop/POS | Tauri 2 + SQLite (SQLCipher) | Offline-first |
| Mobile | React Native (Expo) + WatermelonDB | Android + iOS |
| Database | PostgreSQL 16 | ACID + RLS + pgvector |
| Cache/Queue | Redis 7 + BullMQ | Sessions + Jobs |
| Storage | MinIO (self-hosted S3) | All file attachments |
| AI | Tiered: Qwen 7B + PyOD + Prophet | See Section 4 |
| VPS | Hostinger KVM4 · Frankfurt · 16GB · 200GB | ماجور حتى 2028 |
| Deployment | Docker Compose + Nginx + Let's Encrypt | |
| IDs | ULID | Sequential + offline-safe |
| ORM | Prisma 6 | Type-safe + migrations |
| Monorepo | pnpm workspaces + Turborepo | |
| Backup | Restic + 3-2-1-1 model | |

---

## 2. البنية المعمارية

```
┌──────────────────────────────────────────────────────────┐
│  Presentation Layer                                       │
│  Tauri Desktop · React Web · React Native · POS UI       │
├──────────────────────────────────────────────────────────┤
│  API Layer (NestJS REST)                                 │
│  Controllers → Guards → Interceptors → Pipes             │
├──────────────────────────────────────────────────────────┤
│  Application Layer                                        │
│  Services → Engines → Workflows → Events                 │
├──────────────────────────────────────────────────────────┤
│  Domain Layer                                             │
│  Entities · Value Objects · Domain Events · Invariants   │
├──────────────────────────────────────────────────────────┤
│  Infrastructure Layer                                     │
│  PostgreSQL · Redis · MinIO · Ollama · Print Service     │
└──────────────────────────────────────────────────────────┘
```

---

## 3. قواعد كل طبقة

### API Layer
- REST only. JSON responses.
- Standard envelope: `{ success, data, meta }` or `{ success: false, error }`
- Rate limiting: 100 req/min global, 10 req/min auth endpoints
- JWT 15-min access + 30-day refresh
- Argon2id for passwords

### Application Layer (Services)
- Every service method follows: `authorize → validate policy → guardian check → transaction → emit event → audit`
- No direct DB calls from controllers — always through services
- All mutations inside `prisma.$transaction()`

### Domain Layer
- No framework imports — pure TypeScript
- Domain events for cross-module communication via BullMQ
- No direct calls between modules — only via events or shared interfaces

### Infrastructure
- PostgreSQL: RLS enabled on ALL multi-tenant tables
- Redis: keyspace `erp:{companyId}:{concern}`
- All file uploads via MinIO presigned URLs — never direct HTTP
- Qwen 7B: lazy loaded, released after 2 min idle

---

## 4. Tiered AI Architecture

```
Tier 3 — Rules (0ms, 0 RAM, 100% reliability)
  - Workflow Guardian, Double-Entry Check, Period Lock, etc.
  - Handles 80% of daily cases

Tier 2 — ML Light (~2 GB, always running)
  - PyOD: Anomaly Detection every 10 min
  - Prophet: Sales forecasting nightly
  - scikit-learn: Customer segmentation weekly
  - nomic-embed: Semantic search on-demand

Tier 1 — Qwen 7B Q4 (~4.5 GB, lazy loaded)
  - NL Queries (Arabic → SQL → Result)
  - OCR for supplier invoices (Arabic + English)
  - AI Copilot suggestions
  - Anomaly explanation (why is this suspicious?)

RAM budget:
  Core services:    ~7.1 GB
  Tier 2 (always):  ~1.3 GB
  Normal total:     ~8.4 GB ✅ (within 16GB)
  With Qwen active: ~12.9 GB ✅ (within 16GB with 3.1 GB buffer)
```

---

## 5. Offline Strategy (POS)

```
POS Device (Tauri + SQLite SQLCipher)
├── Last 5,000 products + prices (refreshed hourly)
├── Frequent customers data
├── Pending invoices queue
└── Current shift data

Sync Strategy:
  Online:  push every 30 sec via HTTPS
  Offline: queue locally → sync on reconnect
  IDs:     ULID prevents merge conflicts
  Conflicts: Last-Write-Wins + CRDT for aggregates
```

---

## 6. Security Architecture (6 Levels)

1. **PostgreSQL RLS** — all tenant data isolated at DB level, no API bypass
2. **JWT + Argon2id + 2FA** — for admins/accountants/CFO mandatory
3. **RBAC + ABAC + Field-Level** — 7 permission actions per entity
4. **Append-Only + Hash Chain** — financial tables immutable + tamper detectable
5. **DB Constraints** — double-entry, positive amounts, valid states enforced at DB
6. **Network** — TLS 1.3, HSTS, rate limiting, CORS whitelist, HMAC webhooks

---

## 7. Monorepo Structure

```
al-ruya-erp/
├── apps/
│   ├── api/          NestJS backend
│   ├── web/          Next.js admin panel
│   ├── desktop/      Tauri desktop wrapper
│   ├── pos/          Tauri POS (SQLite offline)
│   ├── mobile/       React Native (Expo)
│   ├── storefront/   Next.js e-commerce
│   └── ai-brain/     Python FastAPI (Ollama + PyOD + Prophet)
├── packages/
│   ├── shared-types/        TypeScript types (no logic)
│   ├── ui-components/       shadcn/ui customized + RTL
│   ├── validation-schemas/  Zod schemas (shared frontend/backend)
│   ├── domain-events/       Event bus interface + builders
│   └── sdk/                 Public API SDK
├── migration/               ETL from old system
├── infra/                   Docker + Nginx + Backup scripts
├── governance/              This folder
└── docs/                    User guides (Arabic) + API docs
```

---

## 8. Hybrid Trial & Marketing Funnel (Wave 7 — قائم للتنفيذ)

> **القرار المعماري:** صفحة الهبوط ≠ brochure، بل acquisition funnel كامل يدمج التسويق بالتجربة الفعلية.

### النموذج المرجعي
- **HubSpot trial funnel** — manual approval + drip nurturing
- **Stripe "Test = Real" mode** — البيئة التجريبية مطابقة 100% للحقيقية
- **Notion upgrade triggers** — feature gating يولّد upgrade pressure طبيعي

### تكييف السوق العراقي
| البُعد | المعيار العالمي | تكييف العراق |
|--------|-----------------|---------------|
| القناة الأساسية | Email | **WhatsApp** (الأعلى استخداماً + أعلى open-rate ×5) |
| Signup | Auto-instant | **Manual approval** (يبني ثقة، يطابق ثقافة B2B) |
| اللغة | Bilingual | **عربي أولاً** (Cairo font, RTL، أرقام عربية في الواجهة) |
| العملة | USD/EUR | **IQD أولاً** (1 USD ≈ 1,500 د.ع) ثم USD ثانوياً |
| الدفع | Card-first | **Bank transfer + Cash + USDT** + Card |
| المدة | 14-30 يوم | **7 trial + 7 grace = 14 إجمالي** ثم archive |
| WhatsApp Method | Meta Business API | **Free wa.me URLs** الآن · Meta API لاحقاً (مع عزل tenant-per-tenant) |
| CAPTCHA | reCAPTCHA | **Cloudflare Turnstile** (لا يتطلب حساب Google، أسرع للسوق) |

### دورة حياة العميل (Lifecycle)

```
زائر → /signup → TrialRequest (pending)
   ↓
admin يراجع → approve → Company + User + Subscription(trial, +7d)
   ↓
WhatsApp (yدوي) ← admin يفتح wa.me link مع البيانات
   ↓
المستخدم يدخل → النظام الحقيقي بكل الميزات
   ↓ ─── Day 1-6: in-app engagement (banner, tour, tips)
   ↓ ─── Day -1: WhatsApp "تنتهي غداً + خصم 30%"
   ↓
Day 7: trial_expired → grace period
   ↓ ─── WhatsApp "ارفع لباقة بـ 40%"
   ↓ ─── Day +3: "آخر فرصة 50% + تدريب مجاني"
   ↓
Day +7 (إجمالي 14): TrialArchive
   ↓ ─── حذف: credentials + business data
   ↓ ─── حفظ: contact + usageMetrics + tags (للتسويق المستقبلي)
```

### مكونات النظام
- **`TrialRequest`** — public signup queue (pending → approved/rejected)
- **`TrialEngagement`** — eventType log per company (login, module:X, invoice_created, ...)
- **`TrialArchive`** — denormalized post-archive data (no FKs to deleted Company)
- **`DiscountCode`** — TRIAL30 / UPGRADE40 / LASTCHANCE50 / EXTEND7 / ANNUAL40
- **Cloudflare Turnstile** — anti-spam على نموذج الـ signup
- **WhatsApp queue** (Phase 2) — admin يضغط "افتح + ارسل" للطريقة المجانية الحالية، أو auto-send عند تفعيل Meta API

### Pricing Strategy
| Plan | Monthly (IQD/USD) | Yearly (-20%) | 3-Year (-33%) |
|------|-------------------|---------------|----------------|
| Starter (3 users, 1 branch) | 35,000 / $25 | 336,000 / $240 | 840,000 / $600 |
| Business (15 users, 3 branches) | 100,000 / $75 | 960,000 / $720 | 2,400,000 / $1,800 |
| Enterprise (unlimited) | custom | custom | custom |

> **Note:** كل الأسعار تُعرض IQD كأساسية و USD ثانوية (`F2 — currency display order`).

### Tasks المرتبطة
**TASK_QUEUE.md** → T72-T75 (4 PRs منفصلة، deployable كل واحدة على حدة)

---
