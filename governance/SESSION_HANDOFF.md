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

### الإنجاز الكلي من الخطة: **~55%**

---

## 🔴 ما لم يُنجَز (الحقائق بصراحة)

### 1. Account Code Placeholders (الأولوية #1 الآن)
agents استخدموا في الـ Posting calls أكواد مثل:
- `'AR'` → يجب `'221'` (العملاء)
- `'CASH'` → يجب `'2411'` (صندوق الفرع)
- `'BANK-FEES'` → يجب `'662'` (عمولات بنكية)
- `'MISC-INCOME'` → يجب `'593'` (إيرادات متنوعة)
- `'MAINT-EXP'` → يجب `'636'` (صيانة)
- `'GAIN-DISPOSAL'` → يجب `'593'` (إيرادات متنوعة)
- `'LOSS-DISPOSAL'` → يجب `'69'` (مصروفات متنوعة)

موجودة في: sales-invoices, sales-returns, vendor-invoices, assets, payroll, payment-receipts, reconciliation.
Iraqi CoA seeded في `prisma/seed.ts` بالأكواد الصحيحة.

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
- مكتوبة فقط: 4 smoke specs scaffolds (لم تُشغَّل)
- المطلوب: 85+ test (5 لكل module على الأقل)
- موقع: `apps/api/test/*.e2e-spec.ts`

### 4. Runtime لم يُختَبر
- لم يُشغَّل `prisma migrate dev` على DB حقيقية (Docker غير متوفر في هذه البيئة)
- لم يُشغَّل seed
- لم يُشغَّل API + curl /health

### 5. التطبيقات الأخرى
- `apps/web` (admin): scaffolded ✅ — صفحات List موجودة، لا detail/edit forms
- `apps/storefront`: scaffolded ✅
- `apps/pos` (Tauri): scaffolded ✅ — Rust commands stubs
- `apps/mobile`: 🔴 لم يُبدأ
- `apps/ai-brain` (Python FastAPI): 🔴 لم يُبدأ
- `apps/whatsapp-bridge`: 🔴 لم يُبدأ
- `apps/license-server` (standalone): 🔴 لم يُبدأ

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

1. استبدل placeholder account codes (AR/CASH/BANK-FEES/MISC-INCOME/...) بأكواد الدليل العراقي
   في: sales-invoices, sales-returns, vendor-invoices, payment-receipts, reconciliation,
       assets, payroll.
   AR=221, CASH=2411, BANK-FEES=662, MISC-INCOME=593, MAINT-EXP=636, ...

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
