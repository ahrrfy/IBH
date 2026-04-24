# SESSION_HANDOFF.md
## Al-Ruya ERP — Full Stack Complete (Waves 1-6)
### Date: 2026-04-24

---

## 🎯 ملخص تنفيذي

تم إنجاز **الكود الكامل لـ Waves 1 → 6** في جلسة واحدة، بتسليم:
- **6 Prisma migrations** تغطي كل النظام
- **~95+ NestJS file** (services + controllers + modules)
- **~16,000+ سطر كود تنفيذي**
- **GitHub repo:** https://github.com/ahrrfy/IBH (branch `main`)

---

## 📊 المنجَزات بالموجة

### ✅ Wave 1 — الأساس (M01, M02, M03, M18)
- **M01 Core Engines:** Auth (JWT + Refresh 30d + Argon2id), RBAC (bitmask 7 levels), RLS, Workflow State Machine, Audit (append-only + hash chain), Sequence, Policy, Posting (template-based JE)
- **M02 Products:** Templates + Variants + Barcodes + Price Lists (temporal)
- **M03 Inventory:** Stock Ledger (append-only) + **Moving Weighted Average** + Warehouses + Transfers + Stocktaking + Reorder Points + Low-Stock Alerts
- **M18 Admin:** Users + Companies + Roles

### ✅ Wave 2 — العمل اليومي (M04, M05, M16)
- **M04 POS:** Devices + Shifts (opening/closing cash with denominations, tolerance check, X/Z reports) + Receipts (transactional + **clientUlid idempotency** for offline) + Cash Movements
- **M05 Sales:** Customers (loyalty, aging) + Quotations (convert to order) + Sales Orders (credit limit, inventory reserve) + Sales Invoices (MWA COGS snapshot, JE posting) + Sales Returns (reverse JE + restock)
- **M16 Delivery:** Full state machine, COD tracking, driver endpoints, status log (append-only)

### ✅ Wave 3 — المشتريات (M06)
- **M06 Purchases:** Suppliers (scorecard + AP aging) + Supplier Prices (temporal) + Purchase Orders + GRN (inventory in) + **Vendor Invoices with 3-Way Match** (price ±2% + qty tolerance via policy)

### ✅ Wave 4 — المالية (M07, M17, M11 core)
- **M07 Finance:** GL (trial balance + ledger + voucher) + Bank Accounts + **Bank Reconciliation** (auto-match + adjustments) + Payment Receipts (AR) + **Period Close (7-step workflow)** + Financial Reports (Balance Sheet, Income Statement, Cash Flow, Statement of Equity)
- **M17 Fixed Assets:** Asset Register + **Monthly Depreciation** (straight-line + declining-balance) + Maintenance + Disposal (gain/loss)

### ✅ Wave 5 — HR + Jobs + Marketing (M08, M10, M14)
- **M08 HR:** Departments (tree) + Pay Grades + Employees (onboard/terminate/gratuity) + Attendance (ZKTeco + mobile geofence 500m Haversine + manual) + Leaves (entitlement tracking: 21 annual, 14 sick, 98 maternity, 7 emergency, 30 hajj) + **Payroll** (full cycle: calculate → review → approve → post → paid, with **Iraqi tax brackets** 3%/5%/10% + SS 5% + 1.5× overtime + CBS bank file export)
- **M10 Custom Orders:** Job Orders with BOM + 6-stage workflow (quotation → design → approved → production → ready → delivered)
- **M14 Marketing:** Campaigns (WhatsApp/SMS/Email/Social) + Audience calculation + Recipient tracking + ROI + Promotions (percent/amount/bxgy/bundle/free_shipping with validation)

### ✅ Wave 6 — CRM + AI + Licensing + Reporting (M09, M11, M12, M13)
- **M09 CRM:** Leads (rule-based scoring 0-100) + Activities (call/email/meeting/whatsapp) + Pipeline (Kanban + weighted forecast)
- **M11 Reporting:** 17 reports + 5 dashboards (executive, operations, finance, branch, HR) + CSV exporter
- **M12 Licensing:** RSA-2048 / HMAC signed licenses, hardware fingerprint, activation, heartbeat (30-day grace), revoke
- **M13 AI (Tiered):** AIService orchestrator + **Tier 2** (Anomaly Detection: 2σ cash variance, 3× returns, 20% price spikes, 7-day stock runway) + **Tier 1** (NL Query stub → Python brain) + Forecasting (moving avg fallback)

---

## 🗂️ هيكل الكود النهائي

```
apps/api/src/
├── engines/                                    # M01 — Core
│   ├── auth/ (guards + strategies + services + decorators)
│   ├── audit/ · sequence/ · policy/ · posting/ · workflow/
│
├── modules/
│   ├── core/             # Users + Companies (M18)
│   ├── products/         # M02
│   ├── inventory/        # M03
│   ├── pos/              # M04 (devices, shifts, receipts, cash)
│   ├── sales/            # M05 (customers, quotations, orders, invoices, returns)
│   ├── delivery/         # M16
│   ├── purchases/        # M06 (suppliers, orders, grn, invoices)
│   ├── finance/          # M07 (gl, banks, ar, period, reports)
│   ├── assets/           # M17
│   ├── hr/               # M08 (employees, departments, paygrades, attendance, leaves, payroll)
│   ├── job-orders/       # M10
│   ├── marketing/        # M14 (campaigns, promotions)
│   ├── crm/              # M09 (leads, activities, pipeline)
│   ├── licensing/        # M12
│   ├── ai/               # M13 (anomaly, nl-query, forecasting)
│   └── reporting/        # M11 (reports, dashboards)
│
└── platform/
    ├── prisma/ · redis/ · health/
    ├── pipes/       (zod-validation)
    ├── interceptors/ (rls)
    └── filters/      (http-exception)

apps/api/prisma/
├── schema.prisma                              # ~1,800 lines, ~75 models
└── migrations/
    ├── 0001_initial/                          # Wave 1 — core + inventory
    ├── 0002_wave2_pos_sales_delivery/
    ├── 0003_wave3_purchases/
    ├── 0004_wave4_finance_assets/
    ├── 0005_wave5_hr_jobs_marketing/
    └── 0006_wave6_crm_licensing/

infra/                                         # Docker Compose, Nginx, scripts
governance/                                    # 8 governance files
```

---

## 🔒 الفلسفات الست المحفوظة (F1-F6)

| الفلسفة | التطبيق الفعلي |
|---|---|
| **F1 الصلاحيات** | RBAC bitmask + ABAC (branch/amount scoping) + RLS في PostgreSQL |
| **F2 المحاسبة** | Double-Entry DB CHECK `total_debit = total_credit` + Append-Only `journal_entry_lines` + Period Lock trigger |
| **F3 المخزون** | Append-Only `stock_ledger_entries` + MWA + كل حركة مرتبطة بـ `referenceType + referenceId` |
| **F4 التشغيل** | Policies في DB (قابلة للتخصيص) + Wizards + defaults ذكية |
| **F5 AI الثلاثي** | Tier 3 (قواعد) + Tier 2 (ML خلفي) + Tier 1 (Qwen on-demand) — كلها مع graceful degradation |
| **F6 التراخيص** | RSA-2048 signed licenses + hardware fingerprint + heartbeat |

---

## 🚦 الخطوات التالية (قبل Go-Live)

### إلزامية قبل أول تشغيل حقيقي:
1. **TypeScript compilation check:** `pnpm --filter api build` — سيكشف أي mismatch في signatures بين ما كتبه agent وما هو موجود في Prisma generated types
2. **Prisma migration dry run:** `docker compose -f infra/docker-compose.dev.yml up -d postgres` ثم `pnpm --filter api prisma migrate dev`
3. **Seed extensions:** يحتاج إضافة seed rows لـ:
   - Posting profiles (pos_sale, cash_movement, goods_receipt, salary_payment, depreciation)
   - Pay Grades افتراضية
   - Bank accounts مرتبطة بحسابات ChartOfAccount
   - Warehouses من نوع `damaged` / `quality_hold` (لتسلسل المشتريات والمرتجعات)
4. **Integration tests:** كتابة acceptance tests لكل module (لم تُكتب في هذه الجلسة)

### مخاطر معروفة:
- **Signature mismatches:** كل agent افترض signatures معينة لـ `PostingService.postJournalEntry`, `SequenceService.next`, `InventoryService.move`, `AuditService.log`. قد تحتاج تعديلات عند أول build.
- **Account code placeholders:** Wave 4 Finance استخدم رموز مثل `AR`, `CASH`, `BANK-FEES`. تحتاج mapping إلى أكواد الدليل العراقي الفعلي (221, 2411, 662, ...).
- **RLS session context:** RlsInterceptor يعمل فقط للطلبات التي تمر عبر JWT guard. Endpoints الـ public (`/health`, `/licensing/activate`) لا تُعيّن `app.current_company` — هذا مقبول.
- **Concurrent shift creation:** الـ partial unique index `shifts_one_open_per_device` يحمي من race conditions، لكن يحتاج catch specific لـ P2002 في الـ service.

---

## 📋 Starter Prompt للجلسة القادمة (التحقق + Go-Live)

```
نظام Al-Ruya ERP — الكود كامل من Wave 1 → Wave 6.
المستودع: https://github.com/ahrrfy/IBH (main branch)
المحلي: D:/al-ruya-erp/

المطلوب الآن: التحقق والتشغيل الفعلي.

1. شغّل:
   docker compose -f infra/docker-compose.dev.yml up -d
   pnpm install
   pnpm --filter api prisma generate
   pnpm --filter api build          ← صحح أي أخطاء TypeScript

2. migrate + seed:
   pnpm --filter api prisma migrate dev
   pnpm --filter api prisma db seed

3. ابدأ API:
   pnpm --filter api dev
   curl http://localhost:3000/health
   curl -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' \
     -d '{"email":"super@ruya.iq","password":"Admin@2026!"}'

4. Acceptance tests: ابدأ بـ M04 POS (أهم سيناريو: فتح وردية → بيع → إغلاق → Z-Report).

5. أي signature mismatch بين services: عدّل signature الخدمة المُستدعية أو عدّل الـ caller حسب الأبسط.
```

---

*آخر تحديث: 2026-04-24 — كل الأكواد مرفوعة على GitHub*
