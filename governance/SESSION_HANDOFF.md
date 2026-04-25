# SESSION_HANDOFF.md
## Al-Ruya ERP — Type Safety Pass Complete (Wave 4 Done)
### آخر commit: قادم بعد هذه الجلسة · main · GitHub ahrrfy/IBH

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

### الإنجاز الكلي من الخطة: **~70%** (Iraqi CoA wired + 9 detail pages
+ POS Tauri commands real + AI Brain + WhatsApp Bridge + License Server
+ Mobile scaffold + 7 e2e specs)

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

### 3. Acceptance Tests (G4)
- مكتوبة: 7 e2e specs (auth, health, double-entry, inventory-mwa,
  sequence-uniqueness, pos-idempotency, period-lock) — **لم تُشغَّل** (DB غير متوفرة)
- المطلوب: 85+ test (5 لكل module على الأقل) — يحتاج Docker/Postgres
- موقع: `apps/api/test/*.e2e-spec.ts`

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
| Acceptance tests | 5% |
| Runtime verified | 0% |
| Production deployed | 0% |
| **الإنجاز الكلي من الخطة** | **~55%** |

---

*آخر تحديث: نهاية جلسة Wave 4 cleanup · 0 ملفات مع @ts-nocheck · جاهز لجلسة جديدة*
