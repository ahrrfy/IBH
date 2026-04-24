# SESSION_HANDOFF.md
## جسر الجلسات — يُحدَّث في نهاية كل جلسة عمل
### الجلسة: 2026-04-24 · Wave 1 مكتمل

---

## ✅ ما تم إنجازه — Wave 1

### M01 Core Engines
- Auth: JWT 15m + Refresh Token 30d (SHA-256 hashed in DB)
- RBAC: bitmask-based (7 levels: C/R/U/D/S/A/P), DB-loaded, SuperAdmin bypass
- Guards: JwtAuthGuard (global) + RbacGuard + @Public() decorator
- RlsInterceptor: sets PostgreSQL `app.current_company` per request
- Workflow Engine: State Machine (Draft→Submitted→Approved→Posted→Reversed)
- Audit Engine: append-only with SHA-256 hash chain
- Sequence Engine: INV-{COMPANY}-{BRANCH}-{YEAR}-{SEQ:6}
- Policy Engine: reads from DB policies table (max_discount_cashier, etc.)
- Posting Engine: template-based double-entry journal creation
- DB Migration: gen_ulid(), RLS, triggers (append-only, period lock, double-entry), Iraqi CoA
- Seed: Company (RUA) + 2 Branches + 10 Roles + 11 Policies + 14 Units + ~70 GL Accounts + 12 Periods

### M02 Products & Variants
- ProductTemplate: CRUD + soft delete (blocked if stock > 0)
- ProductVariant: SKU + barcode uniqueness, attribute values
- Barcode lookup for POS
- Price Lists: temporal (effectiveFrom/effectiveTo), auto end-date on setPrice
- Categories, Attributes, Units

### M03 Inventory
- `move()` — الطريقة الوحيدة لكتابة StockLedger:
  - 'in': Moving Weighted Average = (qty × avgCost + newQty × unitCost) / total
  - 'out': checks prevent_negative_stock policy
  - 'adjust': for stocktaking reconciliation
- `reserve()` / `releaseReservation()` — حجز الكمية
- Warehouses CRUD
- Stock Transfers: createTransfer → approveTransfer (atomic OUT+IN)
- Stocktaking: create → submitCount → approveStocktaking
- Reorder Points + Low Stock Alerts

### M18 Core Admin
- Users: CRUD, role assignment, soft delete (blocks self-deletion)
- Companies: settings, branches, role/permission management

### Infrastructure
- `app.module.ts` — يستورد: ProductsModule + InventoryModule + HealthModule
- `GET /health` — endpoint عام (DB check)
- `.env.example` — قالب متكامل
- `infra/docker-compose.vps.yml` — Production stack (14 services)
- `infra/docker-compose.dev.yml` — Dev stack (PostgreSQL + Redis + MinIO)
- `infra/nginx/conf.d/erp-api.conf` — Nginx reverse proxy + SSL
- `infra/nginx/ssl/ssl-params.conf` — TLS hardening
- `infra/scripts/postgres-init.sql` — Extensions init
- `infra/scripts/deploy.sh` — Deployment script
- `infra/scripts/backup.sh` — Restic 3-2-1-1 backup
- `apps/api/Dockerfile` — Multi-stage build

---

## 📁 هيكل الملفات الكامل لـ Wave 1

```
apps/api/src/
├── engines/
│   ├── auth/         (jwt.strategy, guards, decorators, auth.service, auth.controller)
│   ├── audit/        (audit.service, audit.module)
│   ├── sequence/     (sequence.service, sequence.module)
│   ├── policy/       (policy.service, policy.module)
│   ├── posting/      (posting.service, posting.module)
│   └── workflow/     (workflow.service, workflow.types, workflow.module)
├── modules/
│   ├── core/         (users, companies — controllers + services + module)
│   ├── products/     (products.service, products.controller, products.module)
│   │   └── price-lists/ (price-lists.service)
│   └── inventory/    (inventory.service, inventory.controller, inventory.module)
├── platform/
│   ├── prisma/       (prisma.service, prisma.module)
│   ├── redis/        (redis.module, redis.constants)
│   ├── health/       (health.controller, health.module)
│   ├── pipes/        (zod-validation.pipe)
│   ├── interceptors/ (rls.interceptor)
│   └── filters/      (http-exception.filter)
└── app.module.ts

apps/api/prisma/
├── schema.prisma
├── migrations/0001_initial/migration.sql
└── seed.ts
```

---

## 🚦 متطلبات اجتياز Wave 1 قبل بدء Wave 2

```bash
# 1. TypeScript compilation
pnpm --filter api build

# 2. Start dev infrastructure
docker compose -f infra/docker-compose.dev.yml up -d

# 3. Run migrations
pnpm --filter api prisma migrate dev

# 4. Seed database
pnpm --filter api prisma db seed

# 5. Start API
pnpm --filter api dev

# 6. Verify health
curl http://localhost:3000/health
# Expected: {"status":"ok","checks":{"database":"ok"}}

# 7. Verify auth
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"super@ruya.iq","password":"Admin@2026!"}'
```

---

## ⚠️ مخاطر مفتوحة

| المخطر | الوصف | الأولوية |
|---|---|---|
| TypeScript compilation | لم يُشغَّل `build` بعد — قد توجد أخطاء نوع | عالية — شغّل قبل Wave 2 |
| Prisma client | يحتاج `prisma generate` قبل أول `build` | عالية |
| Docker AI images | ai-brain + whatsapp-bridge لم تُبنَ بعد | منخفضة — مجدولة Wave 6 |

---

## 🔒 القرارات المقفلة (لا تُعدَّل بدون Decision Log)

| القرار | التفاصيل |
|---|---|
| IDs | ULID فقط (`gen_ulid()` في PostgreSQL) |
| Stock Ledger | Append-Only — DB trigger يمنع UPDATE/DELETE |
| MWA | Moving Weighted Average — محسوب في `inventory.service.ts#move()` |
| Double-Entry | DB CHECK: `total_debit_iqd = total_credit_iqd` |
| Period Lock | DB trigger يرفض INSERT على فترة مقفلة |
| RLS | PostgreSQL Row Level Security على كل جدول حساس |
| Auth | JWT 15m + Refresh 30d (SHA-256 hashed) + Argon2id passwords |
| Validation | Zod فقط (لا class-validator) |
| Errors | `{success, error:{code,messageAr}, meta}` موحَّد |

---

## 🎯 Wave 2 — الخطوة التالية

**الأسبوع 11-20**

```
M04: POS (Offline-first + Shifts + Cash Drawers + Print)
M05: Sales (Orders + Invoices + Delivery + Returns + Quotations)
M16: Delivery (Dispatch + GPS + COD)
```

**أول ملف يُنشأ في Wave 2:**
```
apps/api/prisma/migrations/0002_pos_sales/migration.sql   ← إضافة جداول POS + Sales
apps/api/src/modules/pos/pos.module.ts
apps/api/src/modules/pos/shift/shift.service.ts
```

**نموذج بيانات POS المطلوب:**
```prisma
model Shift {
  id            String   @id @default(dbgenerated("gen_ulid()")) @db.VarChar(26)
  companyId     String   @db.VarChar(26)
  branchId      String   @db.VarChar(26)
  cashierId     String   @db.VarChar(26)
  openingCash   Decimal  @db.Decimal(15,3)
  closingCash   Decimal? @db.Decimal(15,3)
  expectedCash  Decimal? @db.Decimal(15,3)
  difference    Decimal? @db.Decimal(15,3)
  status        String   @default("open")  // open | closed
  openedAt      DateTime @default(now())
  closedAt      DateTime?
}
```

---

## 📋 Starter Prompt للجلسة القادمة

```
نحن نبني نظام ERP (Al-Ruya ERP) للسوق العراقي.
Wave 1 مكتمل 100%. راجع governance/SESSION_HANDOFF.md للتفاصيل الكاملة.

المطلوب الآن: بدء Wave 2 — POS + Sales + Delivery

أبدأ بـ M04 POS Offline-first:

1. أضف migration جديدة (0002_pos_sales) بجداول:
   - shifts (الورديات) — مع opening/closing cash بالفئات
   - shift_logs (سجل حركات الوردية)
   - pos_devices (أجهزة POS)
   - pos_receipts (الفواتير — linked to shift)
   - pos_receipt_lines (سطور الفواتير)
   - cash_movements (حركات النقد داخل الوردية)

2. ShiftService:
   - openShift(cashierId, openingCash, branchId)
   - closeShift(shiftId, actualCash) — يحسب الفرق، يطلب موافقة مدير إذا > 5,000 IQD
   - generateXReport(shiftId) — معاينة
   - generateZReport(shiftId) — نهائي (مرة واحدة فقط)

3. POSService:
   - createReceipt(lines, paymentMethods) — يستدعي inventory.service.move('out')
   - voidReceipt(receiptId, reason) — يعكس الحركة
   - offlineSync(pendingReceipts[]) — معالجة الفواتير المتراكمة

المستودع: D:/al-ruya-erp/
اقرأ governance/SESSION_HANDOFF.md و governance/ARCHITECTURE.md قبل البدء.
```
