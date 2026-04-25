# SESSION_HANDOFF.md
## Al-Ruya ERP — Type Safety Pass Complete
### Last commit: 42fff7c · main · GitHub ahrrfy/IBH

---

## ✅ ما هو منجَز (مع دليل)

### البناء
- **`pnpm --filter api exec tsc --noEmit` → 0 errors** ✅
- **`pnpm --filter api build` → dist/main.js produced** ✅
- 6 Prisma migrations + ~75 models + Iraqi CoA seeded
- CI workflow (`.github/workflows/ci.yml`) — postgres 16 + migrate deploy

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
| W4 | **Finance GL/AR/period/reports/banks-recon** | 0 | **5** ⚠️ |
| W4 | **Assets + depreciation** | 0 | **2** ⚠️ |
| W5 | HR (employees/leaves/payroll) | 3 | 0 |
| W5 | Job Orders + Marketing (campaigns/promotions) | 3 | 0 |
| W6 | CRM (leads/activities) | 2 | 0 |
| W6 | AI (forecasting) + Licensing | 2 | 0 |
| **TOTAL** | | **37 clean** | **7 remaining** |

### الإنجاز الكلي من الخطة: **~50%**

---

## 🔴 ما لم يُنجَز (الحقائق بصراحة)

### 1. السبعة ملفات المتبقية (Finance + Assets)
كلها فيها `// @ts-nocheck -- TODO: refactor to use side-based JournalEntryLine schema...`

**الإصلاح المطلوب نمط واحد لكل الملفات:**
```ts
// ❌ ما كتبه agent (لا يطابق schema):
agg._sum.debitIqd
agg._sum.creditIqd
{ entry: { status: 'posted' } }

// ✅ ما يجب أن يكون:
const debit  = await prisma.journalEntryLine.aggregate({
  where: { side: 'debit',  journalEntry: { status: 'posted' } },
  _sum: { amountIqd: true },
});
const credit = await prisma.journalEntryLine.aggregate({
  where: { side: 'credit', journalEntry: { status: 'posted' } },
  _sum: { amountIqd: true },
});
```

**الملفات السبعة:**
- `apps/api/src/modules/finance/gl/gl.service.ts` (56 errors عند إزالة nocheck)
- `apps/api/src/modules/finance/banks/reconciliation.service.ts` (18)
- `apps/api/src/modules/finance/ar/payment-receipts.service.ts` (9)
- `apps/api/src/modules/finance/period/period-close.service.ts` (9)
- `apps/api/src/modules/finance/reports/financial-reports.service.ts` (22)
- `apps/api/src/modules/assets/assets.service.ts` (13)
- `apps/api/src/modules/assets/depreciation.service.ts` (15)

### 2. Account Code Placeholders
agents استخدموا في الـ Posting calls أكواد مثل:
- `'AR'` → يجب `'221'` (العملاء)
- `'CASH'` → يجب `'2411'` (صندوق الفرع)
- `'BANK-FEES'` → يجب `'662'` (عمولات بنكية)
- `'MAINT-EXP'` → يجب `'636'` (صيانة)
- `'GAIN-DISPOSAL'` → يجب `'593'` (إيرادات متنوعة)
- `'LOSS-DISPOSAL'` → يجب `'69'` (مصروفات متنوعة)

موجودة في: sales-invoices, sales-returns, vendor-invoices, assets, payroll.
Iraqi CoA seeded في `prisma/seed.ts` بالأكواد الصحيحة.

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
- `apps/storefront`: scaffolded ✅ — كل الصفحات موجودة
- `apps/pos` (Tauri): scaffolded ✅ — Rust commands stubs
- `apps/mobile`: 🔴 لم يُبدأ
- `apps/ai-brain` (Python FastAPI): 🔴 لم يُبدأ
- `apps/whatsapp-bridge`: 🔴 لم يُبدأ
- `apps/license-server` (standalone): 🔴 لم يُبدأ

---

## 🚦 Starter Prompt للجلسة القادمة

```
نظام Al-Ruya ERP — راجع governance/SESSION_HANDOFF.md للحالة الحقيقية.

الحالة:
- Build يمر بدون أخطاء
- 37/44 service file نظيفة type-safe
- 7 ملفات Finance/Assets فيها @ts-nocheck مع TODO صريح
- Wave 1-6 الكود موجود
- لم يُختبَر على DB حقيقية بعد

مرتَّبة بالأولوية:

1. تنظيف 7 ملفات Finance/Assets (نمط واحد):
   - استبدال debitIqd/creditIqd → amountIqd + side
   - استبدال entry → journalEntry
   - إضافة createdBy على create() calls

2. بدّل placeholder account codes (AR/CASH/BANK-FEES) بأكواد الدليل العراقي:
   AR=221, CASH=2411, BANK-FEES=662, MAINT-EXP=636, ...

3. شغّل runtime:
   docker compose -f infra/docker-compose.dev.yml up -d
   pnpm --filter api exec prisma migrate dev
   pnpm --filter api exec prisma db seed
   pnpm --filter api dev
   curl http://localhost:3000/health

4. اكتب 5 acceptance tests فعلية لكل module:
   - W1: auth login, RBAC deny, MWA correctness, double-entry CHECK, period lock
   - W2: shift open/close, receipt + clientUlid idempotency, sales invoice posting
   - W3: 3-way match (price + qty), GRN to inventory, vendor invoice posting
   - W4: trial balance balanced, depreciation monthly, period close 7-step
   - W5: Iraqi tax brackets, attendance + payroll cycle
   - W6: lead → customer conversion, license heartbeat

5. (اختياري) ابدأ Mobile / AI Brain / WhatsApp Bridge.

المستودع: D:/al-ruya-erp/  ·  GitHub: ahrrfy/IBH (main)
آخر commit: 42fff7c
```

---

## 🔒 القرارات المقفلة (لا تُعدَّل)

- IDs: ULID (`gen_ulid()`)
- StockLedgerEntry / JournalEntryLine / AuditLog: Append-Only (DB triggers)
- MWA: محسوب في `inventory.service.ts#move()`
- Double-Entry: DB CHECK constraint
- RLS: PostgreSQL Row Level Security
- Auth: JWT 15m + Refresh 30d (SHA-256 hashed)
- JournalEntryLine schema: **side-based** (`side: 'debit'|'credit' + amountIqd`) — هذا القرار غير قابل للنقاش

---

## 📊 الإنجاز الفعلي

| البُعد | النسبة |
|---|---:|
| Schema + migrations | 100% |
| Services (code written) | 95% |
| Type safety (real Prisma types) | 84% (37/44) |
| Acceptance tests | 5% |
| Runtime verified | 0% |
| Production deployed | 0% |
| **الإنجاز الكلي من الخطة** | **~50%** |

---

*آخر تحديث: نهاية الجلسة الحالية · جاهز لجلسة جديدة*
