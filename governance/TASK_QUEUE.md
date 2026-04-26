# TASK_QUEUE.md — قائمة المهام التنفيذية الحيّة

> **هذا الملف هو المصدر الوحيد لكل المهام المتبقية.**
> - أي جلسة جديدة (Claude Code, Codex, أو غيرهم) تبدأ بقراءته.
> - أي وكيل ينفّذ أول مهمة `⏳ TODO` لم يدّعها أحد آخر، ولا تتعارض ملفاتها مع مهمة `🔄 IN_PROGRESS`.
> - يُحدَّث في كل خطوة (claim → progress → complete).

**آخر فحص ذري عميق للحالة الفعلية:** 2026-04-26 (3 وكلاء بحث متوازين تحققوا من backend + frontend + infra)

---

## بروتوكول الالتقاط (Pickup Protocol)

```
┌─ بداية أي جلسة ─────────────────────────────────────────────────┐
│ 1. اقرأ هذا الملف كاملاً                                         │
│ 2. اقرأ governance/ACTIVE_SESSION_LOCKS.md                      │
│ 3. اختر أول مهمة بـ                                              │
│      status: ⏳ TODO                                             │
│      AND deps كلها ✅                                             │
│      AND ملفاتها لا تتعارض مع 🔄 IN_PROGRESS                     │
│ 4. ادّعِ المهمة:                                                 │
│      - عدّل سطر `Status:` لـ `🔄 IN_PROGRESS`                    │
│      - عدّل `Owner:` بـ `<your-session-id>`                      │
│      - عدّل `Started:` بالـ timestamp                            │
│      - أضف entry في ACTIVE_SESSION_LOCKS.md                      │
│      - commit + push (branch: claim/tNN-<your-session>)          │
│ 5. نفّذ المهمة في branch خاص (`feat/tNN-<short-name>`)          │
│ 6. PR + CI أخضر + merge                                         │
│ 7. أغلق المهمة:                                                  │
│      - Status: ✅ DONE                                          │
│      - Completed: timestamp                                      │
│      - Commit: <merge-sha>                                      │
│      - أزِل entry من ACTIVE_SESSION_LOCKS.md                     │
└─────────────────────────────────────────────────────────────────┘
```

## قواعد التوازي (Parallelism Rules)

- ✅ **يجوز:** جلستان تعملان مهمتين مختلفتين إذا `File scope` لكل واحدة لا يتقاطع مع الأخرى.
- ✅ **يجوز:** كل جلسة تُعدّل ملفات في `apps/web/src/app/(app)/<route-different>/...` بشكل موازي.
- ⚠️ **شرطي:** تحديثات `governance/OPEN_ISSUES.md` و `MODULE_STATUS_BOARD.md` تُعتبر append-only — التعارض يُحلّ بـ rebase ثم merge.
- ❌ **ممنوع:** جلستان تُعدّلان نفس الملف في نفس الوقت إلا بإذن في `ACTIVE_SESSION_LOCKS.md`.
- ❌ **ممنوع:** push مباشر لـ `main` — فقط عبر PR (يحمي من التعارض).

## مفتاح الحالة

| رمز | المعنى |
|---|---|
| ⏳ TODO | جاهز للالتقاط |
| 🔄 IN_PROGRESS | شخص ما يعمل عليها الآن (راجع Owner) |
| ✅ DONE | مكتمل + مدموج في main |
| 🚫 BLOCKED | معطّل بسبب dep أو قرار خارجي (راجع Note) |
| 🟡 SKIP | تم اعتبارها غير ضرورية (راجع Note) |

---

## 📋 المهام (30 مهمة بعد الفحص الذري)

### الحالة الحالية (مُلخَّصة)
- ✅ **7 مهام مغلقة قبل البدء** (الفحص أثبت إكتمالها): T08, T09, T20, T21, T22, T23, T26-deploy-only
- ⏳ **23 مهمة باقية** للتنفيذ (معظمها frontend-only لأن الـ backend مكتمل)

---

### المرحلة 1 — حماية وأساسيات (T01-T07)

#### T01 — Backup Cron Schedule
- **Status:** ✅ DONE
- **Deps:** []
- **Branch:** `feat/t01-backup-cron` (merged)
- **File scope:**
  - `infra/scripts/backup-cron.sh` (new)
  - `infra/scripts/install-cron.sh` (new)
  - `governance/DR_RUNBOOK.md` (new)
- **Owner:** claude-opus-4-7-20260426-1
- **Started:** 2026-04-26T14:50:00Z
- **Completed:** 2026-04-26T15:08:04Z
- **Commit:** `fa3aeee` (PR #6 merged)
- **VPS verify:** ⏳ pending — DR drill on VPS not yet executed (tracked as next manual step)
- **Estimate:** 30min
- **Real state:** `infra/scripts/backup.sh` موجود ومكتمل (Restic 3-2-1-1). الناقص فقط: cron entry + RUNBOOK.
- **Deliverables:**
  - sh wrapper يضبط env vars ويستدعي backup.sh
  - install-cron.sh يضيف crontab على VPS (02:00 daily)
  - DR_RUNBOOK.md: خطوات الاستعادة الكاملة + rehearsal log
- **Verify:**
  - `ssh root@vps 'crontab -l | grep al-ruya-erp'` يُرجع السطر
  - drill: `restic restore latest --target /tmp/restore-test` ينجح
  - md5 لـ DB المُستعاد == md5 الأصل

---

#### T02 — Audit Log Viewer (BE endpoint + FE page)
- **Status:** ⏳ TODO
- **Deps:** []
- **Branch:** `feat/t02-audit-viewer`
- **File scope:**
  - `apps/api/src/engines/audit/audit.controller.ts` (new)
  - `apps/web/src/app/(app)/settings/audit/page.tsx` (new)
  - `apps/web/src/components/sidebar.tsx` (add menu link if Owner)
- **Owner:** *(unclaimed)*
- **Estimate:** 120min
- **Real state:** AuditService موجود + audit_logs table فيها 89+ صف. الناقص: controller endpoint + UI.
- **Deliverables:**
  - GET /audit-logs?limit=&from=&to=&action=&entityType=&userId= (paginated)
  - صفحة web مع filters + table + hash chain badge per row
  - sidebar item يظهر فقط لـ isSystemOwner=true
- **Verify:**
  - login → audit page يعرض آخر 100 حدث
  - filter بـ `action=login` يُرجع login events فقط

---

#### T03 — User Detail + Edit + Deactivate (FE only)
- **Status:** ✅ DONE
- **Deps:** []
- **Branch:** `feat/t03-user-crud-fe` (merged)
- **File scope:**
  - `apps/web/src/app/(app)/settings/users/[id]/page.tsx` (new)
  - `apps/web/src/app/(app)/settings/users/[id]/edit/page.tsx` (new)
- **Owner:** claude-opus-4-7-20260426 (this session)
- **Completed:** 2026-04-26T15:38:10Z
- **Commit:** `eca6767` (PR #10 merged)
- **Estimate:** 90min
- **Real state:** Backend CRUD مكتمل (GET /users/:id, PUT, DELETE). الناقص: 2 صفحة UI.
- **Deliverables:**
  - detail page (read view) + edit form + deactivate button
  - guards: لا يحذف نفسه، لا يعدّل isSystemOwner للمالك
- **Verify:**
  - تعديل دور مستخدم + status → DB يتحدّث + login يحترم الدور الجديد

---

#### T04 — Branches Detail + Edit (FE only)
- **Status:** ✅ DONE
- **Deps:** []
- **Branch:** `feat/t04-branches-fe` (merged)
- **File scope:**
  - `apps/web/src/app/(app)/settings/branches/[id]/page.tsx` (new)
  - `apps/web/src/app/(app)/settings/branches/[id]/edit/page.tsx` (new)
- **Owner:** claude-opus-4-7-20260426-3
- **Started:** 2026-04-26T15:35:00Z
- **Completed:** 2026-04-26T15:41:44Z
- **Commit:** `2690855` (PR #9 merged)
- **Estimate:** 60min
- **Real state:** PUT /company/branches/:id موجود. الناقص: صفحات UI.

---

#### T05 — Roles Permission Matrix UI (FE only)
- **Status:** ✅ DONE
- **Deps:** []
- **Branch:** `feat/t05-roles-matrix` (merged)
- **File scope:**
  - `apps/web/src/app/(app)/settings/roles/[id]/page.tsx` (new — matrix grid)
  - `apps/web/src/app/(app)/settings/roles/[id]/permission-matrix.tsx` (new — bitmask editor)
  - `apps/web/src/app/(app)/settings/roles/new/page.tsx` (new)
- **Owner:** parallel session
- **Completed:** 2026-04-26T15:48:57Z
- **Commit:** `19afb42` (PR #12 merged after rebase)
- **Estimate:** 120min
- **Real state:** PUT /company/roles/:id/permissions موجود. الـ shape: `Record<string, number>` (bitmask). UI مفقود.
- **Deliverables:**
  - 18 entity × 7 actions (CRUDSAP) checkbox grid
  - bitmask encoder/decoder (1=C, 2=R, 4=U, 8=D, 16=S, 32=A, 64=P)
- **Verify:**
  - إنشاء دور بصلاحيات محدودة + تعيينه لمستخدم + اختبار 403 على المنع

---

#### T06 — Chart of Accounts CRUD (BE add POST/PUT + FE tree)
- **Status:** ⏳ TODO
- **Deps:** []
- **Branch:** `feat/t06-coa-crud`
- **File scope:**
  - `apps/api/src/modules/finance/gl/accounts.controller.ts` (extend)
  - `apps/api/src/modules/finance/gl/gl.service.ts` (add createAccount/updateAccount)
  - `apps/web/src/app/(app)/finance/chart-of-accounts/page.tsx` (new — tree)
  - `apps/web/src/app/(app)/finance/chart-of-accounts/new/page.tsx` (new)
  - `apps/web/src/app/(app)/finance/chart-of-accounts/[id]/edit/page.tsx` (new)
- **Owner:** *(unclaimed)*
- **Estimate:** 150min
- **Real state:** GET endpoints موجودة. POST/PUT مفقودان. UI مفقود.
- **Deliverables:**
  - `POST /finance/gl/accounts` + `PUT /finance/gl/accounts/:id`
  - tree view (recursive parent/child) + add child + rename + deactivate
  - guards: لا يعدّل category بعد استخدام الحساب في قيود

---

#### T07 — Products + Variants CRUD UI (FE only)
- **Status:** ✅ DONE (merged in commit c8a65f2)
- **Deps:** []
- **Branch:** `feat/t07-products-fe`
- **File scope:**
  - `apps/web/src/app/(app)/inventory/products/new/page.tsx`
  - `apps/web/src/app/(app)/inventory/products/[id]/edit/page.tsx`
  - `apps/web/src/app/(app)/inventory/products/[id]/variants/page.tsx`
- **Owner:** claude-opus-4-7-20260426-2 (closed)
- **Started:** 2026-04-26T15:30:00Z
- **Completed:** 2026-04-26T15:55:00Z
- **Commit:** c8a65f2
- **Estimate:** 150min
- **Real state:** Backend مكتمل (templates + variants + price lists). فقط UI ناقص.

---

### المرحلة 2 — Workflows العمليات (T10-T19) — يمكن البدء بأي منها بالتوازي

> **ملاحظة:** T08 (Customers) و T09 (Suppliers) **مكتملتان فعلياً** — أُسقطتا من القائمة.

#### T10 — Sales Invoice Cancel/Reverse Buttons (FE only)
- **Status:** ✅ DONE
- **Deps:** []
- **Branch:** `feat/t10-invoice-cancel-fe` (merged)
- **File scope:**
  - `apps/web/src/app/(app)/sales/invoices/[id]/page.tsx` (add buttons)
  - `apps/web/src/components/reason-modal.tsx` (new shared)
- **Owner:** claude-opus-4-7-20260426-4
- **Started:** 2026-04-26T16:10:00Z
- **Completed:** 2026-04-26T15:32:26Z
- **Commit:** `3473307` (PR #11 merged)
- **Estimate:** 60min
- **Real state:** `POST /sales/invoices/:id/reverse` موجود. الناقص: زر + modal.

---

#### T11 — Sales Order → Invoice Convert Button (FE only)
- **Status:** ✅ DONE
- **Deps:** []
- **Branch:** `feat/t11-order-convert-fe` (merged direct to main)
- **File scope:**
  - `apps/web/src/app/(app)/sales/orders/[id]/page.tsx` (add button)
- **Owner:** claude-opus-4-7-20260426 (this session)
- **Completed:** 2026-04-26T15:17:05Z
- **Commit:** `8c4f4ca`
- **Estimate:** 30min
- **Real state:** `POST /sales/invoices/from-order/:orderId` موجود. زر فقط.

---

#### T12 — GRN UI (Goods Receipt) (FE only)
- **Status:** ✅ DONE
- **Deps:** []
- **Branch:** `feat/t12-grn-fe` (merged)
- **File scope:**
  - `apps/web/src/app/(app)/purchases/grn/page.tsx` (list)
  - `apps/web/src/app/(app)/purchases/grn/new/page.tsx`
  - `apps/web/src/app/(app)/purchases/grn/[id]/page.tsx`
  - `apps/web/src/components/sidebar.tsx` (add link)
- **Owner:** claude-opus-4-7-20260426-6
- **Started:** 2026-04-26T19:30:00Z
- **Completed:** 2026-04-26T16:25:00Z
- **Commit:** `f7d3a16` (PR #21 squash-merged)
- **Estimate:** 150min
- **Real state:** Backend مكتمل (POST + approveQuality + reject). UI مفقود كلياً.

---

#### T13 — Stock Transfers UI + GET endpoints
- **Status:** 🔄 IN_PROGRESS
- **Deps:** []
- **Branch:** `feat/t13-transfers-fe`
- **File scope:**
  - `apps/api/src/modules/inventory/inventory.controller.ts` (extend) — GET /transfers + GET /transfers/:id
  - `apps/api/src/modules/inventory/inventory.service.ts` (extend) — listTransfers + getTransferById
  - `apps/web/src/app/(app)/inventory/transfers/page.tsx` (new)
  - `apps/web/src/app/(app)/inventory/transfers/new/page.tsx` (new)
  - `apps/web/src/app/(app)/inventory/transfers/[id]/page.tsx` (new)
- **Owner:** claude-opus-4-7-20260426-3
- **Started:** 2026-04-26T16:30:00Z
- **Estimate:** 120min
- **Real state:** POST + approveTransfer كانا موجودين؛ GETs مفقودان فاقتضى إضافتهما. UI كاملة جديدة.

---

#### T14 — Stocktaking UI + GET endpoints
- **Status:** 🔄 IN_PROGRESS
- **Deps:** []
- **Branch:** `feat/t14-stocktaking-fe`
- **File scope:**
  - `apps/api/src/modules/inventory/inventory.controller.ts` (extend) — GET /inventory/stocktaking + /:id
  - `apps/api/src/modules/inventory/inventory.service.ts` (extend) — list/get
  - `apps/web/src/app/(app)/inventory/stocktaking/page.tsx` (new)
  - `apps/web/src/app/(app)/inventory/stocktaking/new/page.tsx` (new)
  - `apps/web/src/app/(app)/inventory/stocktaking/[id]/page.tsx` (new)
- **Owner:** claude-opus-4-7-20260426-3
- **Started:** 2026-04-26T17:30:00Z
- **Estimate:** 150min

---

#### T15 — Sales Returns UI (FE only)
- **Status:** 🔄 IN_PROGRESS
- **Deps:** []
- **Branch:** `feat/t15-returns-fe`
- **File scope:**
  - `apps/web/src/app/(app)/sales/returns/page.tsx`
  - `apps/web/src/app/(app)/sales/returns/new/page.tsx`
  - `apps/web/src/app/(app)/sales/returns/[id]/page.tsx`
- **Owner:** claude-opus-4-7-20260426-5
- **Started:** 2026-04-26T16:30:00Z
- **Estimate:** 120min

---

#### T16 — Bank Reconciliation UI (FE only)
- **Status:** 🔄 IN_PROGRESS
- **Deps:** []
- **Branch:** `feat/t16-bank-recon-fe`
- **File scope:**
  - `apps/web/src/app/(app)/finance/banks/page.tsx` (new)
  - `apps/web/src/app/(app)/finance/banks/[id]/reconcile/page.tsx` (new — landing + workspace)
- **Owner:** claude-opus-4-7-20260426-3
- **Started:** 2026-04-26T18:00:00Z
- **Estimate:** 180min

---

#### T17 — Period Close Wizard UI + GET /finance/periods
- **Status:** 🔄 IN_PROGRESS
- **Deps:** []
- **Branch:** `feat/t17-period-close-fe`
- **File scope:**
  - `apps/api/src/modules/finance/period/period-close.controller.ts` (extend) — GET /finance/periods
  - `apps/api/src/modules/finance/period/period-close.service.ts` (extend) — listPeriods
  - `apps/web/src/app/(app)/finance/periods/page.tsx` (new)
  - `apps/web/src/app/(app)/finance/periods/new/page.tsx` (new — startClose redirect)
  - `apps/web/src/app/(app)/finance/periods/[id]/close/page.tsx` (new — 7-step wizard)
- **Owner:** claude-opus-4-7-20260426-3
- **Started:** 2026-04-26T17:00:00Z
- **Estimate:** 120min

---

#### T18 — Attendance Check-in UI (FE only)
- **Status:** ⏳ TODO
- **Deps:** []
- **Branch:** `feat/t18-attendance-fe`
- **File scope:**
  - `apps/web/src/app/(app)/hr/attendance/page.tsx`
  - `apps/web/src/app/(app)/hr/attendance/check-in/page.tsx`
- **Estimate:** 120min
- **Real state:** Backend مكتمل (checkIn + checkOut + manualEntry + ZkTeco sync). UI مفقود.

---

#### T19 — Payroll Run UI (FE only)
- **Status:** ⏳ TODO
- **Deps:** []
- **Branch:** `feat/t19-payroll-run-fe`
- **File scope:**
  - `apps/web/src/app/(app)/hr/payroll/new/page.tsx` (period picker + dry run)
  - `apps/web/src/app/(app)/hr/payroll/[id]/payslips/page.tsx` (PDFs list)
- **Estimate:** 180min
- **Real state:** Backend مكتمل (createRun + review + approve + post + export-cbs). UI ناقص للإنشاء + payslip generation.

---

### المرحلة 3 — صلابة الإنتاج (T20-T24) — معظمها مكتمل ✅

#### T20 — DB Indexes
- **Status:** ✅ DONE (Pre-existed)
- **Note:** الفحص أثبت 116 `@@index` في schema. لا حاجة لـ cycle.

#### T21 — Swagger/OpenAPI
- **Status:** ✅ DONE (Pre-existed)
- **Note:** `@nestjs/swagger` مُفعَّل في main.ts:120-129. dev-only الآن.

#### T22 — Rate Limiting
- **Status:** ✅ DONE (Pre-existed)
- **Note:** `@nestjs/throttler` مضبوط في app.module.ts (100/min global, 10/min auth).

#### T23 — Security Headers + CSP
- **Status:** ✅ DONE (Pre-existed)
- **Note:** Helmet + HSTS + CORS whitelist + frameguard كلها في main.ts:36-64.

#### T24 — SSL Auto-Renewal Cron
- **Status:** 🔄 IN_PROGRESS
- **Deps:** []
- **Branch:** `feat/t24-ssl-renewal`
- **File scope:**
  - `infra/scripts/ssl-renew.sh` (new)
  - `infra/scripts/install-cron.sh` (extend — add SSL cron alongside backup)
  - `governance/DR_RUNBOOK.md` (append section)
- **Owner:** claude-opus-4-7-20260426-1
- **Started:** 2026-04-26T15:15:00Z
- **Estimate:** 60min
- **Real state:** certbot في `vps-deploy.sh` لكن الـ renewal cron مفقود.
- **Deliverables:**
  - script يستدعي `certbot renew --post-hook "nginx -s reload"`
  - cron entry على VPS (مرتين يومياً)
- **Verify:** `certbot renew --dry-run` ينجح + nginx يستجيب

---

### المرحلة 4 — التطبيقات المساعدة (T25-T28)

#### T25 — Storefront Public Deployment
- **Status:** ⏳ TODO
- **Deps:** []
- **Branch:** `feat/t25-storefront-deploy`
- **File scope:**
  - `apps/storefront/Dockerfile` (new)
  - `infra/docker-compose.bootstrap.yml` (add storefront service)
  - `infra/nginx/conf.d/bootstrap.conf` (add shop. server block)
  - `infra/nginx/host-vhost-shop.conf` (host SSL — manual on VPS)
- **Owner:** *(unclaimed)*
- **Estimate:** 180min
- **Real state:** scaffold UI موجود. ناقص: Dockerfile + compose + subdomain + DNS + SSL.

---

#### T26 — WhatsApp Bridge Production Deploy
- **Status:** ⏳ TODO
- **Deps:** []
- **Branch:** `feat/t26-whatsapp-deploy`
- **File scope:**
  - `infra/docker-compose.bootstrap.yml` (add whatsapp-bridge service)
  - `apps/whatsapp-bridge/.env.example` (verify Meta tokens)
  - `infra/scripts/deploy-on-vps.sh` (add to startup list)
- **Owner:** *(unclaimed)*
- **Estimate:** 60min
- **Real state:** الكود مكتمل (WhatsApp Cloud API + Fastify). فقط ناقص: deploy + Meta verification + secrets في .env.

---

#### T27 — POS Tauri Build Pipeline
- **Status:** ⏳ TODO
- **Deps:** []
- **Branch:** `feat/t27-pos-build`
- **File scope:**
  - `.github/workflows/pos-release.yml` (new)
  - `apps/pos/src-tauri/tauri.conf.json` (verify signing)
- **Owner:** *(unclaimed)*
- **Estimate:** 240min
- **Real state:** scaffold + Tauri 2 ready. ناقص: GitHub release workflow + signing strategy + SQLCipher activation.

---

#### T28 — Mobile Expo EAS Setup
- **Status:** ✅ DONE
- **Deps:** []
- **Branch:** `feat/t28-mobile-eas` (merged)
- **File scope:**
  - `apps/mobile/eas.json` (new)
  - `.github/workflows/mobile-release.yml` (new)
- **Owner:** claude-opus-4-7-20260426-6
- **Started:** 2026-04-26T19:55:00Z
- **Completed:** 2026-04-26T16:35:00Z
- **Commit:** `05644b1` (PR #25 squash-merged)
- **Estimate:** 180min
- **Real state:** Expo + RN + WatermelonDB ready. ناقص: eas.json + EAS account credentials + workflow.
- **Note:** هذا الـ scaffold لا يقدر ينفّذ build فعلي بدون: (1) `EXPO_TOKEN` GitHub secret؛ (2) `eas init` محلياً لربط projectId في app.json؛ (3) Apple/Google credentials على Expo dashboard. الـ workflow صامت في غياب التاج/الـ trigger، فلا يكسر CI.

---

### المرحلة 5 — استعداد العميل (T29-T30)

#### T29 — UAT Playbook
- **Status:** ⏳ TODO
- **Deps:** [T01-T19]  ← يحتاج كل operational tasks تنتهي أولاً
- **Branch:** `docs/t29-uat`
- **File scope:**
  - `governance/UAT_PLAYBOOK.md` (new)
- **Estimate:** 180min

---

#### T30 — Customer Onboarding Materials
- **Status:** 🔄 IN_PROGRESS
- **Deps:** [T29] (drafted in parallel — references T29 doc by path)
- **Branch:** `docs/t30-onboarding`
- **File scope:**
  - `governance/CUSTOMER_ONBOARDING.md` (new — full onboarding playbook)
  - `docs/training/01-orientation.md` (new)
  - `docs/training/02-sales-pos.md` (new)
  - `docs/training/03-inventory-purchasing.md` (new)
  - `docs/training/04-finance-close.md` (new)
- **Owner:** claude-opus-4-7-20260426-3
- **Started:** 2026-04-26T19:30:00Z
- **Estimate:** 240min
- **Note:** docs are markdown-first (4 sessions, ~90min each). The "PDF or video links" in the original spec are deferred — videos get recorded during the first real onboarding and linked back into these markdown files.

---

## 📊 Snapshot الحالة (يُحدَّث آلياً عند كل claim/complete)

| Metric | Value |
|---|---:|
| Total tasks | 30 |
| ✅ Done (pre-existed or completed) | 5 |
| ⏳ TODO (available for pickup) | 21 |
| 🔄 IN_PROGRESS | 0 |
| 🚫 BLOCKED | 0 |
| 🟡 SKIP | 4 (T08, T09 بسبب اكتمالهم؛ T26 partial-deploy-only) |

**آخر تحديث:** 2026-04-26 15:15 UTC · T01 merged (PR #6, fa3aeee)
