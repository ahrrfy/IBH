# SESSION_HANDOFF.md

# Session Handoff — 2026-04-25 (governance sync + acceptance test gap-fill)

## ما تم إنجازه اليوم
- تدقيق تغطية e2e عبر وكيل Explore: 17 ملف موجود، 7 كامل + 3 جزئي + 8 مفقود من متطلبات W1-W6 (ارتفعت بعد هذه الجلسة)
- تحديث `governance/SESSION_HANDOFF.md` §3 بمصفوفة تغطية حقيقية (كان يقول 7 e2e، الواقع 17)
- تحديث `governance/MODULE_STATUS_BOARD.md` — G4 صار صفّين (مكتوبة vs مُشغَّلة)، تم احتساب التقدم لكل Wave
- تشخيص I007 (login button) عبر وكيل static-analysis — السبب الأرجح: فشل hydration بسبب Zustand `persist` في `apps/web/src/lib/auth.ts:26-45`
- تحديث `governance/OPEN_ISSUES.md` بقسم §I007 يحتوي اختباراً تشخيصياً وتغييراً مقترحاً للجلسة القادمة
- إضافة test W2: `apps/api/test/shift-open-close.e2e-spec.ts` — يتحقق من partial unique index `shifts_one_open_per_device`
- إضافة test W4: `apps/api/test/depreciation-idempotency.e2e-spec.ts` — يتحقق من `@@unique([assetId, periodYear, periodMonth])`

## ما لم يكتمل
- اختبار I007 التشخيصي على المتصفح — يتطلب runtime متصفح فعلي (غير متاح في بيئة Claude)
- تشغيل أيٍّ من 19 e2e test (17 سابقة + 2 جديدة) — Docker غير متاح، لا DB
- W3 GRN→inventory test — أُجِّل، يحتاج integration runtime ليكون ذا قيمة (الإشارات polymorphic، invariant DB-only ضعيف)
- 7 من متطلبات W1-W6 لا تزال مفقودة: W2 shift open/close ✅ تم · W3 GRN→inv + vendor-invoice posting · W4 period close 7-step · W5 Iraqi tax brackets + attendance link · W6 lead→customer + license heartbeat

## القرارات الجديدة
- لا قرارات معمارية جديدة هذه الجلسة (لا تحديث لـ DECISIONS_LOG)

## الملفات المتأثرة
- `governance/SESSION_HANDOFF.md` — مصفوفة تغطية + قسم session log جديد
- `governance/MODULE_STATUS_BOARD.md` — G4 split + progress per Wave
- `governance/OPEN_ISSUES.md` — §I007 diagnosis section
- `apps/api/test/shift-open-close.e2e-spec.ts` — جديد (W2)
- `apps/api/test/depreciation-idempotency.e2e-spec.ts` — جديد (W4)

## الاختبارات المنفذة
- ❌ لم يُشغَّل أي e2e test (Docker غير متاح في بيئة Claude — لا Postgres)
- ❌ **`pnpm --filter api build` → فشل بـ 14 خطأ** — pre-existing من commit `cdd169c` (2FA foundation): `User` model في schema لا يحوي `username/isSystemOwner/totpSecret/totpEnabledAt/backupCodes/requires2FA`، و `otplib/qrcode` غير مُثبَّتَين. **سُجِّل كـ I010 (🔴 حرج).** ليس regression من هذه الجلسة.
- ✅ بناء حزم workspace (`shared-types`, `validation-schemas`, `domain-events`) نجح — هي عملت قبل I010 لكن I010 يحجب build api نهائياً
- ✅ ملفات الـ test الجديدة بنية مطابقة 1:1 لـ `pos-idempotency.e2e-spec.ts` العامل
- ✅ `git diff --check` نظيف على كل commit

## المخاطر المفتوحة
- 🔴 I007 لا يزال يحجب أول دخول ناجح للمتصفح → 2FA UI لم يُختبر → UAT متوقف
- 🟡 19 e2e test لم يُشغَّل أيٌّ منها — لا ضمان أن أيّ invariant يعمل فعلياً عند migration
- 🟡 110 TypeScript error في `apps/api/src/` عند تشغيل tsc مباشرة — يحتاج build لحزم workspace أولاً (يجب توثيق الإجراء الصحيح)
- 🟢 environment بدون `.env` فعلي — فقط `.env.example`، runtime يحتاج إعداد محلياً

## ممنوع تغييره في الجلسة القادمة
- مصفوفة تغطية e2e (في §3) — مُحدَّثة من تدقيق فعلي 2026-04-25
- تشخيص §I007 — هو فرضية H1 hydration بثقة متوسطة، لا تُحذف بل تُحدَّث بنتيجة الاختبار التشخيصي
- بنية commits اليوم: `c7e0d97`, `db62dea`, `355c94c`, `b3f7e6b` — كلها مدفوعة على origin/main

## الخطوة التالية بالضبط
1. **🔴 أولوية أولى — أصلِح I010 (build regression):**
   - حدِّث `User` model في `apps/api/prisma/schema.prisma`: `username`, `isSystemOwner`, `totpSecret`, `totpEnabledAt`, `backupCodes`, `requires2FA` + علاقات `company` و `userRoles`
   - `pnpm --filter api add otplib qrcode @types/qrcode`
   - `pnpm --filter api exec prisma migrate dev --name auth_foundation_fields`
   - `pnpm --filter api build` ← يجب أن ينجح قبل أي شيء آخر
2. **اختبار I007 على المتصفح** (دقيقة واحدة): افتح `/login` واكتب في حقل البريد:
   - ظهر النص → I007 ليس hydration، حقق في مكان آخر
   - لم يظهر → H1 مؤكد، طبّق التغيير المقترح في §I007
3. بعد إصلاح I007، سيناريو دخول كامل: login → 2FA → /dashboard (يُغلِق I009)
4. (موازٍ) أنشئ `.env` محلي + Docker → migrate → `pnpm --filter api test:e2e` لتشغيل 19 e2e test
5. ابدأ سيكل لكتابة test مفقود واحد (مثلاً W6 license heartbeat — الأبسط)

---

## 📚 السجل التاريخي (الجلسات السابقة)



## 🛑 الحالة عند الإغلاق

**أوقف المستخدم الجلسة** بسبب: زر "تسجيل الدخول" لا يستجيب في المتصفح
رغم أن API يعمل بشكل صحيح من curl.

### ما يعمل (متحقَّق منه فعلياً على VPS)
- ✅ API `/api/v1/auth/login` يُرجع JWT صحيحاً (algo=HS256, iss/aud صحيحان)
- ✅ User `ahrrfy` موجود في DB، `isSystemOwner=true`, `mfaEnforced=true`
- ✅ Refresh tokens تُحفظ في `refresh_tokens` table
- ✅ Audit logs مع hash chain (SHA-256 + previousHash) لكل دخول
- ✅ Helmet headers صارمة (CSP, HSTS, X-Frame DENY)
- ✅ Owner credentials فقط في `/opt/al-ruya-erp/infra/.env` (chmod 600)
- ✅ كل الكود نظيف من credentials، .gitignore يغطي كل الأنواع الحساسة

### المشكلة المفتوحة (لم تُحلّ)
- 🔴 **زر "تسجيل الدخول" في المتصفح لا يستجيب** بعد 5 محاولات إصلاح متتالية:
  - حاولت `<form onSubmit>` → 503 (native submit)
  - حاولت `type="button" onClick` → لا يستجيب
  - حاولت إزالة Suspense + useSearchParams → لا يستجيب
  - حاولت إزالة `<form>` نهائياً → لا يستجيب
- آخر bundle منشور: `page-ec7eae910f7a5e78.js`
- DevTools Console نظيف (لا exceptions)
- DevTools Issues panel: تحذير عن "form field needs id/name" (حتى بعد إزالة form)
- لم نصل لجذر المشكلة — قد يكون: hydration issue أعمق، CSP يحجب inline JS،
  أو شيء في useAuth/QueryProvider يفشل صامتاً

### الحدّ المنخفض
- لم يدخل المستخدم لـ /dashboard ولا مرة من المتصفح
- 2FA UI مكتوب لكن لم يُختبَر فعلياً (يحتاج دخول ناجح أولاً)

---

## ✅ ما هو منجَز (مع دليل)

### البناء
- **`pnpm --filter api exec tsc --noEmit` → 0 errors** ✅
- **`pnpm --filter api build` → dist/main.js produced** ✅
- 6 Prisma migrations + ~75 models + Iraqi CoA seeded
- CI workflow (`.github/workflows/ci.yml`) — postgres 16 + migrate deploy
- **`grep -r "@ts-nocheck" apps/api/src/modules` → 0 matches** ✅

### Modules بالحالة الحقيقية

| Wave | Module | Files clean | Files w/ @ts-nocheck |
|---|---|---:|---:|
| W1 | Core (auth/users/companies) | 4 | 0 |
| W1 | Engines (audit/posting/policy/sequence/workflow) | 5 | 0 |
| W1 | Products + Price Lists + Inventory | 3 | 0 |
| W2 | Sales (invoices/orders/quotations/returns/customers) | 5 | 0 |
| W2 | POS (shifts/receipts/cash/devices) | 4 | 0 |
| W2 | Delivery | 1 | 0 |
| W3 | Purchases (suppliers/PO/GRN/vendor-invoices) | 4 | 0 |
| W4 | Finance bank-accounts | 1 | 0 |
| W4 | **Finance GL/AR/period/reports/banks-recon** | **5** | 0 ✅ |
| W4 | **Assets + depreciation** | **2** | 0 ✅ |
| W5 | HR (employees/leaves/payroll) | 3 | 0 |
| W5 | Job Orders + Marketing (campaigns/promotions) | 3 | 0 |
| W6 | CRM (leads/activities) | 2 | 0 |
| W6 | AI (forecasting) + Licensing | 2 | 0 |
| **TOTAL** | | **44 clean** | **0 remaining** ✅ |

### الإنجاز الكلي من الخطة: **~75%** (Iraqi CoA wired + 25+ web pages
+ POS Tauri commands real + AI Brain + WhatsApp Bridge + License Server
+ Mobile scaffold w/ CustomerDetail + 7 e2e specs)

### Web admin pages الإضافية (هذه الجلسة):
- `/purchases/suppliers` (list + [id] + new) — supplier management
- `/assets` (list + [id]) — Fixed Assets module + sidebar entry
- `/finance/income-statement` — P&L parameterized by date range
- `/finance/balance-sheet` — Assets vs Liab+Equity with balanced check
- `/reports/[slug]` — generic viewer for 16 report endpoints
- `/job-orders` (list + [id]) — manufacturing orders + sidebar entry
- `/marketing/promotions` + `/marketing/campaigns` — sidebar entry
- `/crm/leads/new` — new lead form
- supplier+warehouse pickers in `/purchases/orders/new`

---

## 🔴 ما لم يُنجَز (الحقائق بصراحة)

### 1. ~~Account Code Placeholders~~ ✅ منجَز
كل placeholders (`AR`/`CASH`/`BANK-FEES`/...) استُبدلت بأكواد الدليل العراقي
المُسرَّع في `prisma/seed.ts`:

| كان | أصبح | المعنى |
|---|---|---|
| AR / 1200 | 221 | الذمم المدينة (العملاء) |
| AP / 2100 | 321 | الموردون |
| CASH / 1100 / 1010 | 2411 | صندوق الفرع الرئيسي |
| BANK-FEES | 662 | عمولات بنكية |
| MISC-INCOME / GAIN-DISPOSAL / 4900 | 593 | إيرادات متنوعة |
| MAINT-EXP | 636 | صيانة عامة |
| LOSS-DISPOSAL | 69 | مصروفات متنوعة |
| 4100 | 511 / 512 | مبيعات نقدية / آجلة (شرطي) |
| 5100 | 611 | تكلفة البضاعة المباعة |
| 1300 / 1320 | 212 | بضاعة جاهزة |
| 2150 | 331 | GR/IR (مصروفات مستحقة) |
| 6200 | 643 | نقل ومواصلات |
| 6210 | 621 | رواتب موظفين |
| 3410 | 341 / 342 | ضرائب الدخل / مستقطعة |
| 3320 | 331 | ضمان اجتماعي مستحق |

تطبيق على: sales-invoices, sales-returns, vendor-invoices, grn, payroll,
payment-receipts, reconciliation, assets.

الباقي (NI/DEP في cash-flow) رموز اصطناعية لتقرير فقط — ليست postings.

### 2. ملاحظات تقنية من جلسة Wave 4 cleanup
- `ChartOfAccount` schema يستخدم `category` (AccountCategory enum) و `accountType` (debit_normal/credit_normal) — **ليس** `type` ولا `level`.
  - financial-reports.service.ts و gl.service.ts الآن يستخدمان `category` للتصنيف و `code.startsWith('5')` لتمييز COGS داخل المصروفات.
  - تمييز Depreciation accounts الآن بمطابقة nameAr `LIKE '%إهلاك%'` — قابل للتحسين بإضافة category فرعي مستقبلاً.
- `JournalEntryLine` لا يحوي علاقات إلى `account` أو `costCenter` — الحقول denormalized (`accountCode`, `accountNameAr`). لجلب أسماء أو cost centers، fetch منفصل بـ `findMany`.
- `JournalEntry` يستخدم `referenceType`/`referenceId` (ليس `refType`/`refId`).
- `PostingService.postJournalEntry(params, session, tx?)` يأخذ `lines: { accountCode, debit?, credit?, description? }` بأرقام — يحوّلها داخلياً إلى side/amountIqd.
- `FixedAsset.branchId` إلزامي — أضفنا guards.
- `BankReconciliation.createdBy` و `PaymentReceipt.createdBy` إلزامية.

### 3. Acceptance Tests (G4) — تحديث 2026-04-25 بعد تدقيق
**الواقع:** 17 ملف e2e موجود في `apps/api/test/` — **لم يُشغَّل أيٌّ منها** (Docker غير متاح في بيئة Claude)

**تغطية متطلبات W1-W6 الـ 17 المعلَنة في الـ Starter Prompt (5 per Wave):**

| Wave | Requirement | الحالة | الملف |
|---|---|---|---|
| W1 | auth login | ✅ كامل | `auth.e2e-spec.ts` |
| W1 | RBAC deny | ✅ كامل | `rbac-deny.e2e-spec.ts` |
| W1 | MWA | ⚠️ جزئي (test مهم بـ `.skip`) | `inventory-mwa.e2e-spec.ts` |
| W1 | double-entry CHECK | ✅ كامل | `double-entry.e2e-spec.ts` |
| W1 | period lock | ✅ كامل | `period-lock.e2e-spec.ts` |
| W2 | shift open/close | ❌ مفقود | — |
| W2 | receipt + clientUlid idempotency | ✅ كامل | `pos-idempotency.e2e-spec.ts` |
| W2 | invoice posting | ✅ كامل | `sales-invoice-flow.e2e-spec.ts` |
| W3 | 3-way match | ⚠️ جزئي (validation فقط، لا integration flow) | `3-way-match.e2e-spec.ts` |
| W3 | GRN→inventory | ❌ مفقود | — |
| W3 | vendor invoice posting | ❌ مفقود | — |
| W4 | trial balance balanced | ✅ كامل | `trial-balance.e2e-spec.ts` |
| W4 | depreciation monthly | ❌ مفقود | — |
| W4 | period close 7-step | ❌ مفقود | — |
| W5 | Iraqi tax brackets | ❌ مفقود | — |
| W5 | attendance+payroll | ⚠️ جزئي (math فقط، لا attendance link) | `payroll-balanced.e2e-spec.ts` |
| W6 | lead→customer | ❌ مفقود | — |
| W6 | license heartbeat | ❌ مفقود | — |

**خلاصة التغطية:** 7 كامل / 3 جزئي / 8 مفقود = **~41% بعد احتساب الجزئي**

**اختبارات إضافية مكتوبة (خارج المتطلبات الـ 17):**
- `health.e2e-spec.ts` — smoke
- `sequence-uniqueness.e2e-spec.ts` — Sequence engine
- `rls-isolation.e2e-spec.ts` — multi-tenant RLS
- `audit-append-only.e2e-spec.ts` — append-only triggers
- `inventory-no-negative.e2e-spec.ts` — balance ≥ 0 guard
- `stock-ledger-balance.e2e-spec.ts` — ledger reconciliation

### 4. Runtime لم يُختَبر
- لم يُشغَّل `prisma migrate dev` على DB حقيقية (Docker غير متوفر في هذه البيئة)
- لم يُشغَّل seed
- لم يُشغَّل API + curl /health

### 5. التطبيقات الأخرى
- `apps/web` (admin): list pages + detail pages لـ sales (invoices/orders/customers),
  purchases (orders/invoices), HR (employees), CRM (leads) ✅
- `apps/storefront`: scaffolded ✅
- `apps/pos` (Tauri): real ESC/POS + hardware fingerprint + license heartbeat ✅
- `apps/mobile`: scaffolded ✅ — Expo + React Navigation + JWT auth
  + Login/Home/Orders/Customers
- `apps/ai-brain` (Python FastAPI): scaffolded ✅
  — /anomaly (PyOD) + /forecast (Prophet) + fallbacks
- `apps/whatsapp-bridge`: scaffolded ✅ — Fastify + Cloud API webhook + /send
- `apps/license-server` (standalone): scaffolded ✅
  — RSA-2048 sign/verify + heartbeat + revoke + CLI issuer

---

## 🚦 Starter Prompt للجلسة القادمة

```
نظام Al-Ruya ERP — راجع governance/SESSION_HANDOFF.md.

الحالة:
- Build يمر بدون أخطاء
- 44/44 service file نظيفة type-safe (لا @ts-nocheck في أي مكان) ✅
- Wave 1-6 الكود موجود
- لم يُختبَر على DB حقيقية بعد

الأولويات:

1. ✅ ~~استبدل placeholder account codes~~ — منجَز (انظر القسم 1)

2. شغّل runtime:
   docker compose -f infra/docker-compose.dev.yml up -d
   pnpm --filter api exec prisma migrate dev
   pnpm --filter api exec prisma db seed
   pnpm --filter api dev
   curl http://localhost:3000/health

3. اكتب 5 acceptance tests فعلية لكل module:
   - W1: auth login, RBAC deny, MWA, double-entry CHECK, period lock
   - W2: shift open/close, receipt + clientUlid idempotency, invoice posting
   - W3: 3-way match, GRN→inventory, vendor invoice posting
   - W4: trial balance balanced, depreciation monthly, period close 7-step
   - W5: Iraqi tax brackets, attendance+payroll
   - W6: lead→customer, license heartbeat

4. (اختياري) Mobile / AI Brain / WhatsApp Bridge.
```

---

## 🔒 القرارات المقفلة (لا تُعدَّل)

- IDs: ULID (`gen_ulid()`)
- StockLedgerEntry / JournalEntryLine / AuditLog: Append-Only (DB triggers)
- MWA: محسوب في `inventory.service.ts#move()`
- Double-Entry: DB CHECK constraint
- RLS: PostgreSQL Row Level Security
- Auth: JWT 15m + Refresh 30d (SHA-256 hashed)
- JournalEntryLine schema: **side-based** (`side: 'debit'|'credit' + amountIqd`) — غير قابل للنقاش
- ChartOfAccount: **category + accountType** (ليس `type`/`level`) — قرار schema مقفل

---

## 📊 الإنجاز الفعلي

| البُعد | النسبة |
|---|---:|
| Schema + migrations | 100% |
| Services (code written) | 95% |
| Type safety (real Prisma types) | **100% (44/44)** ✅ |
| Acceptance tests (written) | 41% (7 كامل + 3 جزئي من 17 متطلب) |
| Acceptance tests (executed) | 0% (Docker غير متاح) |
| Runtime verified | 0% |
| Production deployed | 0% |
| **الإنجاز الكلي من الخطة** | **~75%** |

---

*آخر تحديث: 2026-04-25 — governance sync (e2e coverage audit + commit reconciliation)*
