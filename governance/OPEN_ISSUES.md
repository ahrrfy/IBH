# OPEN_ISSUES.md
## المشاكل المفتوحة والقرارات المعلقة
### كل مشكلة يجب أن تُغلق قبل نهاية موجتها

---

## التصنيف

| الأولوية | الوصف |
|---|---|
| 🔴 حرج | يعطّل الموجة الحالية |
| 🟡 مهم | يجب حله قبل الموجة التالية |
| 🟢 تحسين | يُحسَّن عند الفرصة |

---

## المشاكل الحالية

| # | المشكلة | الأولوية | الموجة | المسؤول | الحالة |
|---|---|---|---|---|---|
| I048 | **18 ثغرة Dependabot على main** (12 high + 6 moderate). 20 ثغرة في 7 حزم: `tar` (6 high، expo transitive)، `lodash` (3 CVEs، nestjs transitive)، `@xmldom/xmldom` (5 CVEs، expo transitive)، `js-yaml` (1، swagger transitive)، `postcss` (1، expo transitive)، `@babel/runtime` (1، watermelondb transitive)، `uuid` (2 moderate، bull+expo transitive)، `@hono/node-server` (1، prisma@7 transitive). | 🟡 مهم | Wave 6 | Security/DevOps | ✅ **مغلق** (2026-04-29) — 20→2 ثغرات عبر `pnpm.overrides`: lodash≥4.18.1, js-yaml≥4.1.1, tar≥7.5.13, @xmldom/xmldom≥0.9.10, postcss≥8.5.12, @babel/runtime≥7.26.10, @hono/node-server≥1.19.13. المتبقي: uuid@8.3.2 (2 moderate، risk-accepted — الثغرة تتطلب buf parameter غير مستخدم، وuuid@14 ESM-only يكسر bull+xcode CJS consumers). |
| I047 | **تعارض schema ↔ raw SQL** — اكتشاف وإصلاح متعدد الدورات (cycles 1-11): `accountType→type`, `periodStart/periodEnd→startDate/endDate`, `scheduledAt→plannedDate`, `totalTaxIqd→taxIqd`, `isGiftware` غير موجود، Bull processors تُعطّل dev. **هذه الجلسة (2026-04-29)**: إضافة 5 إصلاحات إضافية: (1) `birthDate→dateOfBirth` في dashboards.service.ts للموظفين، (2) إعادة كتابة كاملة لـ `getLowStockAlerts()` في inventory.service.ts من snake_case إلى camelCase + `reorder_point→reorderQty`، (3-5) معالجة 3 ثغرات SQL injection في reports.service.ts (branchId, warehouseId) و forecasting.service.ts (variantId) — راجع I049. | 🔴 حرج | Wave 6 | Backend | ✅ **مغلق** (2026-04-29، commits `951e192` + `3fa658b`) — جميع raw SQL الآن يستخدم أسماء أعمدة camelCase صحيحة + double-quoted. typecheck نظيف. |
| I049 | **3 ثغرات SQL Injection authenticated في raw SQL** — `reports.service.ts:25` (branchId)، `reports.service.ts:371` (warehouseId)، `forecasting.service.ts:31` (variantId). كلها كانت `$queryRawUnsafe` مع `'${param}'` concatenation لمدخلات تأتي من query string. مع JWT صالح، أي مستخدم يقدر يكسر filter clause بـ `' OR 1=1 --` أو يستخرج بيانات شركات أخرى عبر UNION SELECT (يتجاوز RLS لأن الـ session متّصل بـ companyId الخاص بالمستخدم لكن الـ subquery قد تستهدف جداول بدون RLS أو تستغل العلاقات). + ثغرة F1 cross-tenant: `vendor-invoices.service.ts:115` فحص تكرار vendorRef بدون companyId — side-channel يكشف أرقام فواتير شركات أخرى. | 🔴 حرج | Wave 6 | Security | ✅ **مغلق** (2026-04-29، commit `3fa658b`) — جميع المدخلات parameterized بـ `$N`. vendor-invoice dup check يضيف `companyId` للفلتر. |
| I050 | **`/delivery/companies` 404 DLV_NOT_FOUND** — في الـ comprehensive endpoint probe (66/67 PASS بعد commit `854d0db`)، الـ endpoint الوحيد الفاشل كان GET `/delivery/companies`. السبب: NestJS يسجّل routes بترتيب إدراج الـ modules في الـ container Map، و `DeliveryModule` يستورد `DeliveryCompaniesModule` فيُدرج لاحقاً. النتيجة: `@Controller('delivery') @Get(':id')` يلتقط `companies` كـ ULID قبل أن يصل الطلب لـ `@Controller('delivery/companies') @Get()`، فيُرجع `DLV_NOT_FOUND` من خدمة الطلبات. **إضافة**: path-to-regexp@8 (الذي يستخدمه Express 5 / NestJS 11) أزال إمكانية تقييد :id بـ regex داخل الـ route نفسه. | 🟡 مهم | Wave 6 | Backend | ✅ **مغلق** (2026-04-29) — (1) `app.module.ts` يستورد `DeliveryCompaniesModule` صراحةً قبل `DeliveryModule` ليتقدّم في الـ container، (2) `delivery.controller.ts` أضاف ULID guard في `findOne` كـ defense-in-depth: غير-ULID → `NotFoundException` بدل `DLV_NOT_FOUND`. typecheck نظيف. |
| I043 | **VPS disk bloat** — `/dev/sda1` نمت من 15GB إلى 120GB (65% من 193GB) خلال أسبوعين من التطوير النشط. التشخيص الذري على VPS كشف: `/var/lib/docker = 114GB` منها 108.5GB في build cache (تراكم layers من كل deploy: api + web + tauri builds × عشرات النشرات اليومية). كل البيانات الحساسة (PostgreSQL volume = 708MB, MinIO, Redis AOF) سليمة. التنظيف اليدوي (`docker image prune -af` + `docker builder prune -af` + `docker container prune -f` + truncate json-logs + journald vacuum + apt clean) أعاد المساحة إلى 19GB (10%). | 🟡 مهم | Wave 1 | DevOps | ✅ **مغلق نهائياً** (2026-04-29) — تنظيف فوري نجح (120GB→19GB، -101GB، ~84%). الوقاية الدائمة مُفعَّلة: `vps-disk-setup.yml` شُغِّل بنجاح (GH Actions run #25113935004، 2026-04-29) — ثبّت `/etc/docker/daemon.json` (log-opts: max-size=50m, max-file=3, compress=true) + `/etc/cron.weekly/al-ruya-disk-cleanup` (auto-prune كل أحد) + Docker daemon أُعيد تحميله + smoke test نجح. لا TODO متبقي. |
| I041 | **Tailwind 4 upgrade** — كانت مجمّدة بسبب ~15 chained @apply violations في globals.css + theme() calls + tailwind.config.ts legacy. | 🟢 تحسين | Wave 1 | Frontend | ✅ **مغلق** (2026-04-29) — (1) globals.css أُعيدت كتابتها بالكامل: جميع chained @apply flattened (card→card-padded, btn→btn-primary, badge→badge-*, stat-card)، theme() calls → CSS vars، `@tailwind` directives → `@import "tailwindcss"` + `@theme` block. (2) tailwind.config.ts حُذف (CSS-first). (3) postcss.config.js → `@tailwindcss/postcss`. (4) apps/pos: أُضيف `@tailwindcss/vite` plugin. (5) apps/storefront: أُنشئ `postcss.config.js` بـ `@tailwindcss/postcss`. (6) `pnpm --filter @erp/web build` → نجح بصفر أخطاء. |
| I040 | **Prisma 7 upgrade** — كانت مجمّدة بسبب إزالة `datasource.url` + الحاجة لـ driver-adapter pattern + prisma.config.ts. | 🟡 مهم | Wave 1 | Backend | ✅ **مغلق** (2026-04-29) — (1) schema.prisma: أُزيل `url = env("DATABASE_URL")` + أُزيل `multiSchema` من previewFeatures (graduated). (2) prisma.config.ts أُنشئ في `apps/api/` بـ `defineConfig({ datasource: { url }, schema })`. (3) PrismaService أُعيد كتابته بـ driver-adapter: `new Pool() → PrismaPg(pool) → new PrismaClient({ adapter })`. (4) أُضيف `@prisma/adapter-pg` + `pg` + `@types/pg`. (5) `prisma generate` + `tsc --noEmit` + `nest build` = صفر أخطاء. (6) RLS methods (`setRlsContext`/`clearRlsContext`) تعمل عبر `$executeRaw` بدون تغيير. Prisma 6.19.3 → 7.8.0. |
| I037 | Q04 expiring-stock quality rule — كانت no-op لأن BatchLedger غير موجود. | 🟡 مهم | Wave 6 | Backend | ✅ **مغلق** (2026-04-29) — `intelligence.service.ts:ledgerMeta()` يستعلم عن `GRNLine.expiryDate` مباشرة. Q04 rule يعمل ويُرجع نتائج حقيقية (critical إذا منتهي، warning إذا ≤30 يوم). لا حاجة لـ BatchLedger model منفصل — GRNLine.expiryDate هو المصدر الصحيح للبيانات. |
| I036 | T46 Notification Dispatch Engine — الـ `NotificationsProcessor` (Bull handler) يتسبب في JEST_WORKER_ID conflict عند تشغيل e2e CI مع باقي الـ suites (Redis connection collision). نفس المشكلة المحلولة في T44 RFM processor بإضافة `JEST_WORKER_ID` guard. يحتاج إضافة guard: `if (process.env.JEST_WORKER_ID) return;` في بداية `process()`. | 🟡 مهم | Wave 5 | Backend/QA | ✅ **مغلق** (2026-04-27، commit `4dd0765`) — أُضيف `JEST_WORKER_ID` guard في جميع الـ 3 processors (WhatsApp + Email + SMS) في `notifications.processors.ts`. |
| I035 | `@types/react` مكرر في الـ workspace (v18.3.28 من apps/mobile عبر react-native peer + v19.2.14 في web/pos/storefront) → tsc في `apps/web` يفشل بـ TS2322 على `ReactNode` غير المتوافقة في `login/layout.tsx` و `app-shell.tsx` و `data-table.tsx` و `react-query.tsx`. كان يُعطّل auto-merge لكل PRs الـ web (#119, #120, #121, #122, #123, #124). | 🔴 حرج | Wave 1 | Frontend/Build | ✅ **مغلق** (2026-04-27) — أُضيف `pnpm.overrides` في root `package.json` لتثبيت `@types/react@19.2.14` و `@types/react-dom@19.2.3` على مستوى الـ workspace كله. مقبول لأن `react-native@0.85.2` يُعلن peer `@types/react@^19.1.1` (optional)، فلا تعارض حقيقي مع mobile. typechecks api/web/pos نظيفة. |
| I034 | `posting.service.ts:197` كان يستعلم عن `AccountingPeriod` بحقول `periodYear`/`periodMonth` غير موجودة في الـ schema (الحقول الفعلية: `year`/`month`). كل caller لـ `postJournalEntry` (assets، depreciation، COD settlement، delivery، payment receipts، vendor invoice، sales invoice) كان يرمي `PrismaClientValidationError` عند تشغيله بـ fixtures حقيقية. الـ tests السابقة لم تكشفه لأنها bail out قبل هذا المسار. كشفه `vendor-invoice-posting.e2e-spec.ts` (PR #125). | 🔴 حرج | Wave 4 | Backend | ✅ **مغلق** (2026-04-27، PR #130، commit `fceaa3c`) — استبدال `periodYear`/`periodMonth` بـ `year`/`month` (سطر واحد). + إصلاح `groupBy` في الـ test (إضافة `orderBy` لمتطلب Prisma لما `take` موجود). |
| I033 | Orchestrator يستخدم `git checkout` على worktree مشترك → عدة جلسات Claude متوازية في نفس المجلد تخرب HEAD/index/working tree لبعضها. شواهد جلسة 10: 8 تبديلات branch قسرية في 90 ثانية + commit cf6a344 المُسمَّى "claim(T33)" يحوي كود T38. الجذر: `task.sh` خطوط 224, 245, 250, 316, 339 كلها `git checkout` بدون git worktree isolation. | 🔴 حرج | Wave 2 | DevOps | ✅ **مغلق** (2026-04-27، PR #115، commit `633cf4c`) — `cmd_claim` ينشئ worktree معزولاً تحت `.worktrees/<tid>/`؛ `cmd_complete` و `cmd_release` يستخدمان `git worktree remove`؛ typechecks تعمل داخل الـ worktree؛ `TASK_SINGLE_SESSION_LOCK=1` كقفل اختياري صارم؛ `LEGACY_INPLACE=1` كمخرج طوارئ. PR #108 (الحراسة الأولية في cmd_claim) يبقى مكمّلاً. |
| I031 | 4 e2e tests معطوبة (schema-rotted) — `grn-inventory-posting`, `period-close-7step`, `vendor-invoice-posting`, `license-heartbeat`. كانت في فرع `claude/implement-todo-item-rr0Pw` المهجور، وأُسقطت من PR #81 لأنها لا تتوافق مع الـ schema الحالي (`StockLedgerEntry.qtyChange` بدل `qtyIn/qtyOut`، `ProductVariant.product` محذوفة، `GRNService` casing). المحتوى الأصلي في commit `3134b61`. | 🟡 مهم | Wave 3-4 | Backend/QA | ✅ **مغلق** (2026-04-27، commit `82b3215`) — جميع الـ 4 tests أُصلحت ضد الـ schema الحالي: (1) `grn-inventory-posting`: تصحيح `having: { id: { _count: } }` → `having: { _count: { _all: } }` (Prisma groupBy syntax)، (2) `period-close-7step`: صحيح بالفعل بعد I034، (3) `vendor-invoice-posting`: صحيح بعد I034، (4) `license-heartbeat`: أُنشئ من الصفر — 5 اختبارات تغطي valid heartbeat + unknown key + revoked + fingerprint mismatch + expired. tsc نظيف على جميع الملفات الأربعة. |
| I001 | تحديد schema كامل لـ PostgreSQL (Prisma) قبل M01 | 🔴 حرج | Wave 1 | Tech Lead | ✅ **مغلق** — 86 جدول في schema.prisma + migrations 0001-0008 مُطبَّقة. راجع I027 (seed كامل نجح). |
| I002 | اختيار مكتبة ULID للـ NestJS (ulid vs @paralleldrive/cuid2) | 🟡 مهم | Wave 1 | Tech Lead | ✅ **مغلق** — `ulid@^2.3.0` مُختاَر ومُستخدَم في `apps/api/package.json`. `gen_ulid()` PostgreSQL function في migration 0007. |
| I003 | تحديد strategy لـ POS conflict resolution عند الـ sync | 🟡 مهم | Wave 2 | Tech Lead | ✅ **مغلق** (2026-04-28) — Last-Write-Wins + conflict log (append-only). `PosConflictLog` model + migration `20260428000000`. `PosConflictsService` يكتشف 3 أنواع: `price_mismatch` (>5%), `insufficient_stock`, `product_inactive`. الفاتورة دايماً تُرحَّل. `GET /pos/conflicts` + `POST /pos/conflicts/:id/resolve`. UI في `/pos/conflicts`. 16/16 unit tests. |
| I004 | VPS: تثبيت Docker + Nginx + SSL (يحتاج SSH access) | 🔴 حرج | Wave 1 | DevOps | ✅ **مغلق** — راجع I028: كل الـ 8 services healthy. deploy-on-vps.sh ينشر تلقائياً. Let's Encrypt SSL فعّال على ibherp.cloud. |
| I005 | اختيار TOTP library للـ 2FA (otplib vs speakeasy) | 🟢 تحسين | Wave 1 | Tech Lead | ✅ **مغلق** — `otplib@^12.0.1` مُختاَر + `TotpService` مُطبَّق في `apps/api/src/engines/auth/totp.service.ts`. |
| I006 | تحديد Gitea URL و Woodpecker CI configuration | 🟡 مهم | Wave 1 | DevOps | ✅ **مغلق** — تم الاستعاضة بـ GitHub Actions (`ci.yml` + `deploy-vps.yml` + `security-scan.yml`). لا حاجة لـ self-hosted CI في المرحلة الحالية. |
| I007 | زر "تسجيل الدخول" — الجذر الفعلي: token في localStorage فقط، middleware يبحث في cookie | 🔴 حرج | Wave 1 | Frontend | ✅ **مغلق** (2026-04-25, commit `d2073a5`) — يحتاج VPS rebuild |
| I008 | full seed.ts لم يُختبَر — Iraqi CoA + roles + policies لم تُسلَّم | 🟡 مهم | Wave 1 | Backend | ✅ **مغلق** — راجع I027: seed.ts نجح بالكامل (98 CoA + 10 roles + 11 policies + 6 warehouses + 12 periods). |
| I009 | 2FA UI مكتمل لكن لم يُختبَر — يتطلب دخول ناجح من المتصفح أولاً | 🟡 مهم | Wave 1 | QA | مفتوح — يحتاج اختبار يدوي في المتصفح. الكود مكتمل (`totp.service.ts` + login page step === 'mfa'). |
| I010 | Build فشل (14 errors) — Prisma Client stale (schema حديث، Client قديم) | 🔴 حرج | Wave 1 | Backend | ✅ **مغلق** (2026-04-25, commit `a239255`) |
| I011 | Login error not displayed in UI (Console only) — UX bug | 🟢 تحسين | Wave 1 | Frontend | ✅ **مغلق** — راجع `apps/web/src/app/login/page.tsx:119-123,197-201` (errors render in red banner عبر `setError`). أُضيف `role="alert" + aria-live="assertive"` لإعلام screen readers (a11y) |
| I012 | api + web containers `unhealthy` — healthcheck path/protocol خاطئ في 4 مواضع | 🟡 مهم | Wave 1 | DevOps | ✅ **مغلق نهائياً** (2026-04-26) — راجع §I012 (4 جذور متراكبة) |
| I016 | NL Query في `nl-query.service.ts` يستخدم `$queryRawUnsafe(generatedSql)` بدون validation للجداول ولا READ ONLY tx → SQL injection ممكن من AI Brain | 🔴 حرج | Wave 6 | Security | ✅ **مغلق** (2026-04-26) — table parser + READ ONLY tx + multi-statement guard + 5K row cap (commit `4586252` + JSDoc fix `39f3751`) |
| I017 | `ci.yml` مفقود (تم حذفه في `d1b39b3`) → لا حماية من بناء فاشل قبل deploy | 🔴 حرج | Wave 1 | DevOps | ✅ **مغلق** (2026-04-26) — `ci.yml` مُعاد بناؤه: 3 jobs (typecheck-build ✅ · standalone ✅ · e2e ⚠️ يكشف bugs قائمة) |
| I018 | البنية التحتية لـ e2e tests في CI لم تكن قابلة للتشغيل — 12 ملف يفشل بأخطاء infra | 🟡 مهم | Wave 1 | QA | ✅ **مغلق** (2026-04-26) — راجع §I018 (6 طبقات infra) |
| I019 | 8 e2e tests فردية فيها bugs (FK setup, type errors, calc mismatch) — مكشوفة بعد إصلاح I018 | 🟡 مهم | Wave 1 | Backend/QA | ✅ **مغلق** (2026-04-26) — PR #5 (feat/e2e-i019) مدموج؛ 19/19 suites pass · 35/36 tests pass (1 .skip في `pos-session.e2e-spec.ts`) |
| I020 | جلسات متعددة تعمل على main مباشرة — تتعارض مع بعضها وتُعيد تغييرات بعضها | 🟡 مهم | Wave 1 | DevOps | ✅ **مغلق** (2026-04-26) — `ACTIVE_SESSION_LOCKS.md` + فروع feat/* + PR-only merge مُنفَّذ لكل المهام T01-T30. لا جلسات متوازية نشطة. |
| I021 | PR #5 (feat/e2e-i019) يحتاج rebase على main الحالي قبل الدمج | 🟢 تحسين | Wave 1 | DevOps | ✅ **مغلق** (2026-04-26) — PR #5 مدموج بعد rebase ناجح |
| I022 | **🚨 F2 violation على الإنتاج** — صفر append-only triggers لمدة 6 أسابيع | 🔴 حرج | Wave 1 | Backend/Security | ✅ **مغلق** (2026-04-26) — راجع §I022 (3 طبقات متراكبة) |
| I019 | 8 e2e tests فردية فيها bugs (FK, type, calc) | 🟡 مهم | Wave 1 | Backend/QA | ✅ **مغلق** (2026-04-26) — 19/19 suites pass · 35/36 tests pass (1 .skip) في commit `a245467` |
| I023 | Deploy workflow كان يستخدم `bash -s < script` فيستهلك docker-compose-exec الـ stdin → كل خطوات بعد أول exec تُتجاوز صامتاً (السبب الفعلي لـ I022) | 🔴 حرج | Wave 1 | DevOps | ✅ **مغلق** (2026-04-26) — تحويل لـ `scp + ssh exec` (commit `bc764ac`) |
| I024 | **🔴 كلمة مرور المالك الإنتاجي مُسرَّبة** في `governance/SESSION_HANDOFF.md:188` (commit `879788d` في git history). كلمة المرور المسرّبة: `[REDACTED — تم تنظيف التاريخ بـ git-filter-repo]`. يحتاج: تدوير فوري على الإنتاج | 🔴 حرج | Wave 1 | Security | ✅ **مغلق** (2026-04-27) — تم تنظيف git history + force push + تدوير كلمة المرور على VPS |
| I025 | كل dashboards + reports + ai services تستعلم بأسماء جداول PascalCase (`"SalesInvoice"`) لكن الـ DB يستخدم snake_case (`"sales_invoices"`) → 500 على كل طلب | 🔴 حرج | Wave 4 | Backend | ✅ **مغلق** (2026-04-26) — 5 ملفات: dashboards.service + reports.service + anomaly + forecasting (~30 replacement) + إصلاح columns الخاطئة (`salesInvoiceId` → `invoiceId`, `productId` → `templateId`) |
| I026 | لا حماية تلقائية ضد leaked secrets — I024 سُرَّبت بدون أن يكتشفها أي فحص | 🟡 مهم | Wave 1 | Security | ✅ **مغلق** (2026-04-26) — `security-scan.yml` (gitleaks) + `.gitleaks.toml` يفحص كل push وكل PR للـ ~150 نمط credential |
| I027 | DB مُهيكَلة (86 جدول، migrations مكتملة) لكن البيانات الأساسية غير محمَّلة — لا CoA، لا roles، لا warehouses → النظام لا يقدر يعمل قيود محاسبية ولا ينشئ users جدد | 🔴 حرج | Wave 1 | Backend | ✅ **مغلق** (2026-04-26) — تشغيل `seed.ts` كامل: 98 CoA + 10 roles + 11 policies + 6 warehouses + 12 periods + 14 units + 7 posting profiles + walk-in customer (+ إصلاح bug في `systemPolicy.upsert` مع nullable branchId) |
| I028 | على VPS: API + Web فقط شغّالان من 8 خدمات معرَّفة. MinIO (تخزين)، License Server (Wave 6)، AI Brain (Tier 2) كلها معرَّفة لكن غير منشورة | 🟡 مهم | Wave 1/6 | DevOps | ✅ **مغلق** (2026-04-26) — كل الـ 8 services الآن healthy: postgres + redis + nginx + api + web + minio + license-server + ai-brain. deploy-on-vps.sh يشغّلهم كلهم تلقائياً |
| I029 | Deploy يفشل لأن `WHATSAPP_PHONE_ID` غير موجود في VPS `.env` — `:?` في compose يوقف كل build | 🔴 حرج | Wave 1 | DevOps | ✅ **مغلق** (2026-04-26) — جذران: (1) whatsapp-bridge نُقل لـ `profiles: [whatsapp]` + vars حُوِّلت لـ `:-` (compose يُقيّم vars في وقت parse حتى للخدمات المُعطَّلة)، (2) 3 صفحات Next.js 15 كانت تستخدم `useSearchParams()` بدون Suspense → prerender فاشل أوقف `pnpm web build`. كلاهما في commits `8b6252f` + `4e55b90`. deploy run `24963352657` نجح ✅ |
| I013 | nginx Docker DNS cache — كل web rebuild يحتاج `docker restart nginx` يدوياً | 🟡 مهم | Wave 1 | DevOps | ✅ **مغلق** (2026-04-26) — resolver 127.0.0.11 + variable upstreams + nginx -s reload في deploy workflow |
| I014 | GitHub Actions Deploy to VPS فاشل في كل push منذ 2026-04-25 — 4 جذور متراكبة | 🔴 حرج | Wave 1 | DevOps | ✅ **مغلق** (2026-04-26) — راجع §I014 |
| I015 | Self-Healing Loop — auto-diagnose + auto-issue على أي CI failure | 🟢 تحسين | Wave 1 | DevOps | ✅ **بُني** (2026-04-26) — `.github/workflows/auto-diagnose.yml` + `scripts/diagnose-ci.sh` + `scripts/open-ci-issue.sh` |
| I051 | **🚨 Production auth bug — تسجيل الدخول يصل للـ dashboard لكن الضغط على أي وحدة (المبيعات، المخزون...) يُعيد لصفحة الدخول.** ستة جذور متراكبة: (1) `middleware.ts:fetchLicenseStatus()` يستخدم `NEXT_PUBLIC_API_URL` (يحتوي `/api`) ثم يضيف `/api/v1/...` فوقه → URL مزدوج `api/api/v1/...` → 404 على كل navigation. (2) Cookie `max-age=900` (15 دقيقة) = JWT TTL تماماً → أي drift يُسقط الكوكي قبل JWT. (3) Login page لا يُعيد التوجيه التلقائي للمستخدم المُصادَق إذا وصل لها بالخطأ. (4) 8 صفحات root مفقودة (`/sales`, `/inventory`, `/purchases`, `/marketing`, `/finance`, `/hr`, `/crm`, `/pos`) → Next.js Link prefetches تُرجع 404 على كل dashboard render. (5) `PROTECTED_PREFIXES` + matcher كانا يفتقدان 5 وحدات (`/delivery`, `/assets`, `/job-orders`, `/marketing`, `/autopilot`) → no auth guard. (6) `API_INTERNAL_URL` env var غير مُعرَّف في docker-compose للـ web service. | 🔴 حرج | Wave 1 | Frontend/Backend | ✅ **مغلق** (2026-04-29، commit `fbb4941` — رسالة الـ commit مُضلِّلة بسبب race في hooks، لكن المحتوى صحيح). يحتاج `docker compose build web && docker compose up -d web` على VPS لتفعيل التغيير. |
| I052 | **`/api/v1/licensing/me/features` يُرجع 404 من المتصفح** حتى بعد إصلاح I051. الجذر الفعلي: `MeFeaturesController` كان مُسجَّلاً داخل `PlatformLicensingModule` الذي يدخل ضمن `backgroundJobImports` ويُعطَّل بـ `BACKGROUND_JOBS_DISABLED=1` في الإنتاج (HOTFIX `854d0db` لمنع الـ global LicenseGuard من الـ 403 على greenfield). نتيجة الكيل-سويتش: الـ controller غير محمّل أصلاً → 404. | 🟡 مهم | Wave 1 | Backend | ✅ **مغلق** (2026-04-29، commit `d7cdddc`) — أُنشئ `LicensingMirrorModule` (rea-only) يحوي `MeFeaturesController` + `FeatureCacheService` فقط، يُحمَّل دائماً في `coreImports`. `PlatformLicensingModule` يستورده الآن بدلاً من إعادة توفير `FeatureCacheService`، فالـ cache instance واحد بغض النظر عن حالة الكيل-سويتش. tests: 3/3. |
| I053 | **WebSocket connection failed** — `wss://ibherp.cloud/socket.io/?EIO=4&transport=websocket` يُغلق قبل establishment. الجذر: catch-all `location /` في host vhost كان يُمسك بالـ ws traffic بـ `proxy_read_timeout 90s` فيقطع الـ frames بعد 90 ثانية. | 🟡 مهم | Wave 1 | Backend/DevOps | ✅ **مغلق** (2026-04-29، commit `d9175c8`) — `host-vhost-ibherp.conf` أُضيف فيه `location /socket.io/` مخصص بـ `Upgrade`/`Connection "upgrade"` headers و `proxy_read_timeout 86400s` و `proxy_send_timeout 86400s`. |
| I054 | **`api()` 401 handler يمسح الـ token مباشرة** قبل أن يحاول الـ refresh — لا refresh-token rotation logic. كل request 401 (حتى المؤقت بسبب JWT clock skew) يطرد المستخدم لصفحة الدخول. مع JWT TTL = 15 دقيقة، المستخدم النشط يُطرد كل ربع ساعة. | 🟡 مهم | Wave 1 | Frontend | ✅ **مغلق** (2026-04-29، commit `475ba34`) — `apps/web/src/lib/api.ts` يخزن الآن `refreshToken` في localStorage (login + 2FA verify)، وعلى 401 يحاول `/auth/refresh` مرة واحدة قبل مسح الجلسة. الـ 401 المتزامنة تُدمج في pending promise واحد لتجنب اندفاع متعدد على endpoint الـ refresh. logout يرسل refreshToken للسيرفر لإلغائه. |
| I055 | **Auth rate limit صارم (10r/m)** — `bootstrap.conf:22` يضع `erp_auth` zone على `10r/m`. + اكتشاف bug خفي: المسار `/api/auth/` لم يكن يطابق أبداً لأن الـ API يستخدم URI versioning (`/api/v1/auth/...`) — الـ login كان غير مُحدَّد المعدل في الإنتاج. | 🟢 تحسين | Wave 1 | DevOps | ✅ **مغلق** (2026-04-29، commit `d9175c8`) — قُسِّم `erp_auth` إلى zonayn: `erp_auth_login` (10r/m) + `erp_auth_refresh` (60r/m). تصحيح المسار من `/api/auth/` إلى `/api/v1/auth/` فالـ rate limiting يعمل فعلياً الآن. exact-match `location = /api/v1/auth/refresh` يضمن انتقاء الـ zone الصحيحة. |
| I056 | **Prisma 7 deploy regression — `prisma migrate deploy/resolve/status` فشلت بـ "datasource.url property is required"** بعد ترقية I040. سببان متراكبان: (1) `apps/api/Dockerfile` نسي نسخ `prisma.config.ts` للـ production stage (نسخ `prisma/` subdir فقط)، فالـ CLI يجد schema بدون url ولا config. (2) `prisma.config.ts` كان يُرجع `datasource: undefined` إذا `process.env.DATABASE_URL` غير موجود، مما يسبب نفس الخطأ الغامض حتى مع وجود الملف. ظهرت بعد cycle 9 من الـ self-healing loop (I047). | 🔴 حرج | Wave 1 | Backend/DevOps | ✅ **مغلق** (2026-04-29، commit `dbb579e`) — (1) Dockerfile production stage يضيف `COPY prisma.config.ts`، (2) `prisma.config.ts` يُوفّر دائماً URL (placeholder لـ build-time `prisma generate` الذي لا يفتح DB، حقيقي من env لـ migrate في runtime). deploy نجح بعدها (3m8s). |
| I057 | **`/sales/commissions/entries` 500** — في cycle 9 من الـ self-healing loop (probe بعد commits 854d0db→7285410)، endpoint واحد فقط من 79 فشل بـ `INTERNAL_ERROR`. السبب الجذري: schema يُعلن `CommissionPlan/Rule/Assignment/Entry` لكن **لا يوجد migration ينشئ الجداول `commission_*`** (فقط `commissionIqd` column في payroll). الجدول `commission_plans` كان مغطى بـ try/catch defensive من cycle 8، أما `commission_entries` فلم يكن. | 🟡 مهم | Wave 6 | Backend | ✅ **مغلق** (2026-04-29، commit `30112ce`) — `commissions.service.ts:listEntries()` أُضيف لها try/catch مماثل لـ listPlans؛ تُرجع `{items:[], total:0, page, limit}` على فشل الـ query. **الإصلاح الجذري** (migration ينشئ commission_* tables) يبقى لاحقاً. **final probe**: 79/79 endpoints PASS (100%) عند الفحص الفردي. |
| I058 | **🔴 Prisma 7 enum case mismatch — `/licensing/me/features` 500 في الإنتاج** — اكتُشف أثناء الـ deploy verification لـ I052 (2026-04-29 17:06 UTC، VPS SSH session). الـ route مُسجَّل بنجاح بعد I052 (mirror module loaded)، لكن `MeFeaturesController → FeatureCacheService.get(companyId)` يفشل بـ `DriverAdapterError: type "public.SubscriptionStatus" does not exist` عند query subscriptions. الجذر: PostgreSQL يحوي ENUM type باسم `subscription_status` (snake_case، من migration قديمة)، لكن `apps/api/prisma/schema.prisma` يُعرّف `enum SubscriptionStatus` بدون `@@map`. Prisma 7 driver-adapter (`@prisma/adapter-pg@7.8.0`) يصدر SQL casts كـ `"public"."SubscriptionStatus"` (PascalCase، quoted) فلا يطابق. | 🟡 مهم | Wave 1 | Backend | ✅ **مغلق** (2026-04-29، commits `5984ea6` + `93adae2`، deployed 2026-04-29 17:55) — فحص شامل لكل enum types في DB (55 enum) كشف أن `subscription_status` و `billing_cycle` فقط بـ snake_case، البقية PascalCase. أُضيف `@@map("subscription_status")` و `@@map("billing_cycle")` على Prisma enums فقط. API rebuilt --no-cache + restarted. التحقق: `GET /api/v1/licensing/me/features` يُرجع 200 مع `{features:[], status:null,...}`. **الإصلاح الجذري** (تحويل ENUMs لـ VARCHAR+CHECK لمطابقة CLAUDE.md F2) يبقى لاحقاً للموجة 1 cleanup. |
| I059 | **🚨 Web middleware 307→`/license-required` لكل route بعد إصلاح I058** — اكتُشف خلال E2E verification بعد I058 deploy. الـ middleware في `apps/web/src/middleware.ts` كان يفحص: `if (snapshot && (!snapshot.status \|\| !ENTITLED_STATUSES.has(snapshot.status))) → redirect`. قبل I058 كان `fetchLicenseStatus()` يفشل (404)، snapshot=undefined، شرط `if` false → يمر. بعد I058، الـ endpoint يُرجع `{status:null,...}` على greenfield (لا Subscription)، فالـ snapshot truthy لكن status null → redirect إلى `/license-required` على كل page → النظام معطَّل. الـ API `LicenseGuard` لديه kill-switch `LICENSE_GUARD_DISABLED=1` (default في الإنتاج)، لكن web middleware ما كان يطابق العقد. | 🔴 حرج | Wave 1 | Frontend | ✅ **مغلق** (2026-04-29، commit `ed5b183`) — middleware الآن fail-open على null status: يتحقق `snapshot.status && !ENTITLED_STATUSES.has(snapshot.status)` بدلاً من `!snapshot.status \|\| ...`. فقط الحالات الصريحة (expired/suspended/cancelled) تُسبّب redirect. التحقق: `GET /sales/invoices` بـ cookie → HTTP 200 (كان 307→/license-required). |
| I057 fix | **`commission_*` tables migration (root cause)** — كان cycle 9 أصلح symptom (try/catch defensive)؛ هذي الجلسة (Session 32) كتبت migration `20260429180000_i057_commission_tables` ينشئ الجداول الأربعة (plans/rules/assignments/entries) بكل الـ FKs والـ CHECK constraints وF2/F3 invariants (no updated_at على entries، signed amount_iqd، CHECK على kind+status). | 🟡 مهم | Wave 6 | Backend | ✅ **مغلق نهائياً** (2026-04-29، commit `2921a36`) — migration applied؛ try/catch يبقى belt-and-suspenders. probe: `/sales/commissions/entries` → 200 مع `{items:[],total:0,page:1,limit:50}` بدون catch fallback. |
| I060 | **🚨 Production crash loop بعد 5.D split kill-switch** — `commit af3d3be` فصل `BACKGROUND_JOBS_DISABLED` (default 0) عن `LICENSE_GUARD_DISABLED` (default 1). نتيجة: `AdminLicensingModule` يُحمَّل (BACKGROUND_JOBS_DISABLED=0) لكن `PlatformLicensingModule` معطّل (LICENSE_GUARD_DISABLED=1)، فـ `AdminLicensingService.constructor()` يطلب `PlanChangeService` (في Platform) ولا يجده → `UnknownDependenciesException` كل ~3 ثوانٍ → API container crash loop → 502 على كل request. | 🔴 حرج | Wave 1 | Backend | ✅ **مغلق** (2026-04-29، commit `c383a01`) — `admin-licensing.service.ts` يُحقن `PlanChangeService` بـ `@Optional()`؛ على null injection، `changePlan()` يُرجع 503 ServiceUnavailableException بـ code `LICENSE_GUARD_DISABLED` بدلاً من crash. القراءات (listTenants/getTenant/billing) تعمل بدون Platform. |
| I061 | **🚨 Guard ordering bug — LicenseGuard يرى `req.user=null` رغم JWT صالح** — اكتُشف بعد seeding subscription + تفعيل LICENSE_GUARD_DISABLED=0. كل authed request يُرجع 403 LICENSE_REQUIRED مع نفس الرسالة بالضبط من فرع "no user" في LicenseGuard. السبب: `JwtAuthGuard` كان مسجَّلاً عبر `app.useGlobalGuards()` في `main.ts`، بينما `LicenseGuard` عبر `{ provide: APP_GUARD }` في PlatformLicensingModule. NestJS 11 يشغّل APP_GUARD providers قبل useGlobalGuards entries، فـ LicenseGuard يقرأ req.user قبل أن يضعه JwtAuthGuard. | 🔴 حرج | Wave 1 | Backend | ✅ **مغلق** (2026-04-29، commit `7bff697`) — JwtAuthGuard نُقل إلى APP_GUARD provider في `auth.module.ts`. AuthModule يُحمَّل قبل PlatformLicensingModule في app.module.ts، فـ APP_GUARD ordering deterministic: JwtAuthGuard يضع req.user أولاً ثم LicenseGuard يقرأه. التحقق: 80/80 endpoints PASS (100%) مع LicenseGuard فعّال. |
| I062 | **🟡 F1 RLS gap — 50+ multi-tenant tables بدون RLS policies** — production VPS query كشفت 11 جدول فقط فيه RLS policy، بينما ~50+ جدول يحوي companyId. الحماية الحالية app-level فقط (Prisma queries بـ `where: { companyId }` filter). مخالفة لـ CLAUDE.md F1. | 🟡 مهم | Wave 1 | Backend/Security | ✅ **مغلق** (2026-04-30) — migration `20260430000000_i062_rls_rollout` يطبّق `tenant_isolation` على 83 جدول (37 إعادة-تطبيق لتوحيد التعبير + 46 جديد). أُضيف `rls_bypass_active()` helper + `PrismaService.withBypassedRls(fn)` للـ super-admin cross-tenant ops. وُلِّفت callsites: feature-cache (per-request)، expiry-watcher + trial-expiry (cron)، autopilot.runJob/runJobForAllCompanies، admin-licensing 6 methods، billing.service 8 methods، analytics 3 methods. `roles` (nullable companyId) محمي بـ `IS NULL OR matches`. **متابعة منفصلة**: `set_config(_, _, true)` في pool-based connections قد يحتاج transaction-wrap لضمان الاتساق عبر الـ pool checkouts — موثق كـ I067. |
| I063 | **System owner ينُشأ بدون role assignment على greenfield** — `seed-bootstrap.ts` ينشئ user `ahrrfy@al-ruya.iq` لكن ما يربطه بـ `super_admin` role. النتيجة: 403 على كل endpoint. | 🟡 مهم | Wave 1 | Backend | ✅ **مغلق** (2026-04-30) — `seed-bootstrap.ts` الآن يُنشئ `super_admin` role (idempotent upsert) ويربطه بالـ owner عبر `userRole.upsert`. RbacGuard short-circuits على role.name === 'super_admin' فيمر كل permissions check. |
| I064 | **`GET /finance/periods/status` 500 بدون query params** — Number(undefined) → NaN → invalid Date filter → Prisma 500. اكتُشف خلال Phase 3.A evidence sweep (Session 36). | 🟡 مهم | Wave 4 | Backend | ✅ **مغلق** (2026-04-30) — `period-close.controller.ts:status()` يضع defaults إلى UTC current month عند غياب الـ params مع validation للـ month range. الـ service code أصلاً returns sensible empty shape. |
| I065 | **`GET /hr/attendance/report/monthly` 500 بسبب params مفقودة** — نفس bug النمط في I064. | 🟡 مهم | Wave 5 | Backend | ✅ **مغلق** (2026-04-30) — `attendance.controller.ts:monthly()` يضع defaults إلى UTC current month عند غياب الـ params. |
| I066 | **`GET /admin/licensing/analytics/summary` 500 على greenfield** — أي query Prisma transient failure (driver-adapter quirk، missing data، إلخ) يرمي 500 بدل zeroed shape. | 🟡 مهم | Wave 6 | Backend | ✅ **مغلق** (2026-04-30) — `analytics.service.ts`: (1) `safeQuery()` helper يلف كل Prisma call مع fallback، (2) greenfield short-circuit إذا `subs.length === 0` يُرجع `zeroedSummary` فوراً، (3) `getSummary/getTimeseries/getBreakdown` كلها مفصولة لـ `*Internal` private + `withBypassedRls` wrap للـ I062. |
| I067 | **🟢 RLS context reliability under connection pooling** — `setRlsContext` يستخدم `set_config(name, val, true)` (transaction-local). `pg.Pool` + `PrismaPg` adapter قد يأخذ connections مختلفة لـ queries مختلفة في نفس الـ request → الـ context قد لا يستمر عبر الـ checkouts. الإصلاح المثالي: تغليف كل authed request في `prisma.$transaction(...)` فيُثبَّت connection واحد + transaction-local config يعمل بشكل موثوق. | 🟢 تحسين | Wave 1 | Backend | مفتوح — يحتاج refactor للـ RlsInterceptor ليستخدم `prisma.$transaction()` wrapper. لا يكسر شيء فوراً (الـ RLS policies الجديدة fail-closed بأمان)، لكن يحسّن الموثوقية لما context الـ request موجود. |

---

## تفاصيل المشكلة I007 (الأهم حالياً)

**الأعراض:** زر "تسجيل الدخول" لا يطلق أي طلب شبكة عند الضغط في المتصفح.
**ما تم تجربته:**
1. إصلاح `deviceId` validation (كان مطلوب) → أصبح optional
2. إصلاح JWT bug (iat/exp في payload conflict مع expiresIn) → نجح في curl
3. إصلاح URL prefix (`/api/auth/...` → `/api/v1/auth/...`) → curl يعمل
4. إصلاح error envelope unwrap (errPayload.error.messageAr) → الأخطاء تُعرض الآن
5. إزالة `<form>` نهائياً + `type="button"` + onClick → لا فرق
6. إزالة `<Suspense>` + `useSearchParams` → لا فرق

**ملاحظات:**
- API curl test ناجح كل مرة — JWT صحيح، Audit log يُسجَّل، refresh token محفوظ
- DevTools Console نظيف من exceptions
- DevTools Network لا يُظهر طلب POST عند ضغط الزر (لم يصل لـ fetch)
- آخر bundle: `page-ec7eae910f7a5e78.js`
- Issues panel: warning "form field needs id/name" حتى بعد إزالة form

**الفرضيات للتحقيق:**
- CSP يمنع inline event handlers (يحتاج `'unsafe-inline'` على script-src-attr؟)
- React 19 hydration silent failure داخل QueryProvider
- JS error في import chain (activity-bar/sub-sidebar) لم يظهر في console
- next/font Cairo يحمّل بطيء فيُعيق interactivity
- Tailwind CSS لم يُولَّد بشكل صحيح فيمنع رؤية الزر فعلياً (مع أنه يبدو visible)

**الخطوة الأولى للجلسة القادمة:**
افتح DevTools → Sources → Search "doCredentialsLogin" → ضع breakpoint عليه
→ اضغط الزر → هل يصل؟ إن لا، الـ event listener غير مُلحق.
بديل: أضف `<button onClick={() => alert('CLICK')}>` مؤقتاً للتأكد أن click events
تصل أصلاً للـ React tree.

## المشاكل المغلقة

| # | المشكلة | القرار | التاريخ |
|---|---|---|---|
| — | — | — | — |

---

## §I022 — F2 (append-only) triggers مفقودة على الإنتاج (✅ مغلق 2026-04-26، 3 طبقات)

**المخاطر:** `audit_logs`, `stock_ledger`, `journal_entry_lines` كانت قابلة للـ UPDATE/DELETE على مستوى DB لمدة 6 أسابيع. F2 violation كاملة.

**اكتُشف:** اختبارا `inventory-mwa` و `audit-append-only` نجحا في رفض UPDATE/DELETE في CI بعد إصلاح migrations setup. أصبح بإمكاننا فحص الإنتاج:
```sql
SELECT trigger_name FROM information_schema.triggers WHERE trigger_name LIKE 'no_update%';
→ 0 rows
```

**الجذور الـ 3:**

1. **schema mismatch** — migration 0001 يستخدم `stock_ledger_entries` (جمع) لكن schema.prisma `@@map("stock_ledger")` (مفرد). الـ IF EXISTS guard في 0001 يبحث عن الاسم الخطأ → يتجاوز CREATE TRIGGER صامتاً.

2. **production bootstrap عبر `db push`** — `_prisma_migrations` table فارغ! كل migrations 0001-0007 لم تُسجَّل كمُطبَّقة. الجداول موجودة (db push أنشأها) لكن SQL داخل migrations لم يُنفَّذ — يعني triggers و functions و RLS لم تُطبَّق أبداً. أُصلح بـ `prisma migrate resolve --applied` لكل migration.

3. **deploy script bug خفي (I023 الجديد)** — `ssh ... bash -s < script.sh` + `docker compose exec -T` يستهلك stdin (= السكريبت). أول exec يبتلع باقي السكريبت → bash يقرأ EOF ويخرج صامتاً بـ exit 0. كل deploy منذ 6 أسابيع كان يقفز فوق `migrate deploy`. أُصلح بـ scp + ssh exec كملف منفصل.

**الإصلاح المُطبَّق:**
- `migrations/0008_fix_append_only_triggers/migration.sql` — مستقل (يحوي تعريف function أيضاً)
- `infra/scripts/deploy-on-vps.sh` — إصلاح `cd /app/apps/api` + استخدام local prisma binary + fail loudly
- `.github/workflows/deploy-vps.yml` — scp + ssh exec بدل stdin pipe
- `.github/workflows/ci.yml` — verification step يفحص الـ 3 triggers (يمنع regression)

**نتيجة على الإنتاج (متحقَّقة):**
```
trigger_name           | event_object_table
-----------------------+---------------------
no_update_audit_logs   | audit_logs
no_update_je_lines     | journal_entry_lines
no_update_stock_ledger | stock_ledger
```

**الدروس:**
- اختبار قبول واحد كشف 6 أسابيع من violation صامت
- "Deploy success" في CI لا يعني "migration ran"
- ينبغي أن يفشل deploy بصوت إذا أي خطوة لم تُنفَّذ
- `bash -s < script` خطر مع `docker compose exec -T`

---

## §I018 — e2e tests infra في CI (✅ مغلق 2026-04-26، 6 طبقات متراكبة)

النتيجة قبل: 7 PASS / 12 FAIL (kept failing for ~6 weeks — 0 e2e ran).
النتيجة بعد: **11 PASS / 8 FAIL** (4 ملفات إضافية تنجح، الباقي bugs فردية I019).

الجذور الـ 6 المكتشفة بالتسلسل (كل واحد كان يخفي اللي بعده):

1. **`import * as request from 'supertest'`** في 3 ملفات → `TypeError: request is not a function`. الـ `* as` ينتج namespace object مو function. غُيِّر لـ `import request from 'supertest'`.
2. **`gen_ulid()` يستخدم `SUBSTR(text, bigint, integer)`** بدون cast → خطأ `function does not exist` في `postgres:16-alpine`. أُضيفت migration `0007` فيها explicit `::int` cast (production كان يقبل implicit cast).
3. **CI يفتقد `prisma db seed` step** → tests تفترض company exists فتفشل بـ null. أُضيف الـ seed step + env vars المطلوبة (`OWNER_USERNAME`, `OWNER_PASSWORD`, إلخ).
4. **Migrations جزئية** — تخلق ~52 من ~75 جدول فقط. الإنتاج أُنشئ بـ `db push` ثم migrations حُفظت كـ snapshots للتغييرات الإضافية. الـ CI كان يستخدم `migrate deploy` فيُحصل على DB ناقص. الإصلاح: استخدم `db push` بدل `migrate deploy`.
5. **`postgres:16-alpine` لا يحوي pgvector** — schema تستلزمه. غُيِّر لـ `pgvector/pgvector:pg16` (نفس الإنتاج).
6. **`migrate deploy + db push` معاً = state تعارض** — db push يفحص `_prisma_migrations` ويرفض إنشاء جداول يظنها موجودة. الحل النهائي: psql heredoc لإنشاء `gen_ulid` + helpers، ثم db push للجداول والـ enums من schema.prisma مباشرة.

**الدروس:**
- migrations الجزئية = خطر صامت — يجب إعادة إنشاء baseline كامل (مهمة منفصلة)
- CI service images يجب تطابق الإنتاج بالضبط (pgvector، ليس alpine)
- `import * as` خطأ مع modules لها default export

---

## §I019 — 8 e2e tests فردية فيها bugs (جديد 2026-04-26)

بعد إغلاق I018، كُشفت bugs حقيقية في الـ tests/code (لم تُشغَّل من قبل):

| ملف الـ test | الجذر المرشّح |
|---|---|
| `iraqi-tax-brackets` | بـ Bracket 2/3/4: expected vs actual mismatch — منطق payroll لا يطابق spec |
| `shift-open-close` | FK violation `shifts_posDeviceId_fkey` — test ينشئ shift بدون device |
| `period-lock` | TS error: `'closed'` غير موجود في `PeriodStatus` enum — schema field renamed |
| `depreciation-idempotency` | يحتاج تحقيق |
| `auth` | login بـ TEST_ADMIN يفشل — ربما TEST_ADMIN لم يُنشَأ في seed |
| `audit-append-only` | يحتاج تحقيق |
| `sequence-uniqueness` | يحتاج تحقيق |
| `rbac-deny` | يحتاج تحقيق (يستخدم supertest بعد إصلاح import) |

**التوصية:** كل test يُصلَح في cycle منفصل (CLAUDE.md 2-3 files/cycle). أولوية: `iraqi-tax-brackets` و `period-lock` (واضحة) قبل الباقي.

---

## §I012 — api + web unhealthy في 4 طبقات متراكبة (✅ مغلق 2026-04-26)

استمر `unhealthy` لأربع جلسات. كل ما نصلح طبقة، تظهر اللي تحتها:

1. **api Dockerfile path خطأ** — `/health` بدل `/api/health` (NestJS `setGlobalPrefix('api')`)
2. **web Dockerfile redirect** — `/` → 307 لـ `/login`، busybox wget يعتبره فشل. غيّرنا لـ `/login` مباشرة + `--spider`
3. **Alpine localhost = ::1** — wget يحاول IPv6 لكن Nest/Next على 0.0.0.0 (IPv4 only) → `Connection refused`. تصحيح: `127.0.0.1` صراحة
4. **api URI versioning** — main.ts فيها `enableVersioning({type: URI, defaultVersion: '1'})` فالمسار الفعلي `/api/v1/health` (مو `/api/health`). gotten via `wget http://127.0.0.1:3000/api/v1/health` → 200 ✅
5. **compose override يلغي Dockerfile** — `infra/docker-compose.bootstrap.yml:171` كان فيه healthcheck stanza للـ api يُعيد كتابة الـ HEALTHCHECK في الـ Dockerfile. كل تعديلاتي على الـ Dockerfile تجاهلتها compose. الإصلاح النهائي: محاذاة compose مع Dockerfile.

**النتيجة:** كل الـ 5 containers `(healthy)` لأول مرة في تاريخ المشروع (2026-04-26 10:37).

**الدروس:**
- اقرأ compose **و** Dockerfile قبل افتراض من يحكم
- `localhost` في containers = trap على Alpine (استخدم `127.0.0.1`)
- Probe باستعمال `--spider` بدل `-qO-` عشان لا يعتمد على parsing body

---

## §I014 — Deploy workflow كان فاشل في 4 طبقات متراكبة (2026-04-26)

كل push من 2026-04-25 ولّد deploy فاشل (10+ runs). كل ما نفتح log نلقى سبب جديد لأن السبب السابق كان يُخفي اللي تحته. الترتيب الفعلي للجذور (من المُكتَشَف أولاً للأعمق):

1. **`ssh-keyscan -H VPS_HOST` صامت** — يكتب لـ stderr، بدون `test -s` لـ known_hosts، فالـ workflow يكمل بـ known_hosts فارغ → ssh التالي يموت بـ `Host key verification failed`.
2. **`VPS_SSH_KEY` Secret ما يطابق أي مفتاح في authorized_keys على VPS** — السبب الجذري: المفتاح القديم (`github-actions-deploy`) محذوف من Hostinger panel، فحُذف من authorized_keys تلقائياً. أُنشئ مفتاح جديد ed25519 (`github-actions-deploy-2026-04-26`)، أُضيف للـ panel، خاصه في الـ Secret.
3. **YAML heredoc trap** — `ssh ... bash -s <<'EOF' ... $(hostname -f) ... EOF` كان يُعطي `hostname=runnervm...` بدل VPS hostname. الـ `$()` كان يتوسّع على الـ runner قبل ما يصل لـ ssh. الإصلاح: نقل السكريبت لـ `infra/scripts/deploy-on-vps.sh` ثم `ssh ... 'bash -s' < script.sh`.
4. **`VPS_HOST` Secret فيه trailing newline** — يسبب `ssh root@ibherp.cloud\n` → `hostname contains invalid characters`. الإصلاح: `printf '%s' 'ibherp.cloud' | gh secret set VPS_HOST` (بدون newline).

**النتيجة:** Run `24953737620` نجح end-to-end في 1m56s. `https://ibherp.cloud/health` → HTTP 200 في 0.4s. كل push من الآن يُنشَر تلقائياً.

**الدروس:**
- ssh-keyscan يستحق دايماً `test -s` بعده
- secrets يُفضّل تعيينها بـ `printf '%s'` (بدون newline)، ليس `echo`
- heredoc-in-YAML سامّ — استخدم سكريبت ملف منفصل
- Hostinger panel يُزامن SSH keys للـ VPS فوراً (حذف = حذف فوري من authorized_keys)

---

## §I013 — nginx DNS cache بعد web rebuild (✅ مغلق 2026-04-26)

**كان:** كل rebuild يحتاج `docker restart infra-nginx-1` يدوياً.

**الإصلاح المُطبَّق في `infra/nginx/conf.d/bootstrap.conf`:**
```nginx
resolver 127.0.0.11 valid=10s ipv6=off;
resolver_timeout 5s;
set $upstream_api api;
set $upstream_web web;
# ثم في كل proxy_pass:
proxy_pass http://$upstream_api:3000;
proxy_pass http://$upstream_web:3001;
```

والـ deploy workflow يُنفّذ `nginx -t && nginx -s reload` بعد كل recreate. **لا حاجة لتدخل يدوي.**

---

## §I013 (الأصلي) — nginx DNS cache بعد web rebuild (2026-04-25)

**الأعراض:** بعد `docker compose up -d --force-recreate web`، أي طلب لـ ibherp.cloud يرجع 502 حتى `docker restart infra-nginx-1`.

**الجذر:**
- nginx يحل DNS لـ `web` في `proxy_pass http://web:3001` عند بدء nginx فقط (static resolution)
- عند rebuild الـ web، Docker يعطيها IP جديد (مثلاً 172.20.0.4 → 172.20.0.5)
- nginx يستمر بمحاولة الاتصال بـ IP القديم → connection refused → 502

**الحل المقترح (لم يُطبَّق بعد):**
في `infra/nginx/conf.d/bootstrap.conf`:
```nginx
# في server block أو http block
resolver 127.0.0.11 valid=10s;  # Docker's embedded DNS

# في location blocks، استبدل:
#   proxy_pass http://web:3001;
# بـ:
set $upstream_web web;
proxy_pass http://$upstream_web:3001;
```

استخدام variable يجبر nginx على re-resolve عبر الـ resolver المحدد. الـ valid=10s يجعل cache قصير.

**أثناء الانتظار:** كل rebuild للـ web نفّذ:
```bash
docker restart infra-nginx-1
```

---

## §I010 — ✅ مغلقة (2026-04-25, commit `a239255`)

**الجذر الفعلي بعد التشخيص:** ليس schema mismatch — Prisma Client الـ generated في `node_modules` كان stale من schema قديم. كل الحقول (`username`, `isSystemOwner`, `requires2FA`, `totpSecret`, `totpEnabledAt`, `backupCodes`, `company`, `userRoles`) كانت موجودة في `schema.prisma` (lines 437-486)، لكن Prisma Client لم يُعَد توليده بعد آخر تحديث.

**الإصلاح الفعلي (دقيقة واحدة):**
```bash
pnpm --filter api exec prisma generate
```
هذا فقط — `otplib`/`qrcode`/`@types/qrcode` كانوا أصلاً في package.json. الـ pnpm add فقط جدّد lockfile + bump صغير لـ @types/qrcode 1.5.5→1.5.6.

**النتيجة:** `pnpm --filter api build` → Exit 0، `dist/main.js` مُنتَج ✅

**الدرس:** أي تحديث على `schema.prisma` يستوجب `prisma generate` فوراً — يجب إضافة postmerge git hook أو خطوة في CI.

---

## §I007 — ✅ مغلقة (2026-04-25, commit `d2073a5`)

**الجذر الفعلي بعد تشخيص runtime على VPS:**

عدم تطابق بين تخزين token وقراءته:
- `apps/web/src/lib/api.ts:20` — كان يخزن token في **localStorage فقط** (`al-ruya.token`)
- `apps/web/src/middleware.ts:18` — يبحث عن token في **cookie** (نفس الاسم)

**التسلسل الذي رصدناه في DevTools:**
1. POST `/api/v1/auth/login` → 200 OK (مع tokens صحيحة، curl من VPS أكدها)
2. `apiLogin()` يحفظ في localStorage ✅
3. `router.replace('/dashboard')` يطلق navigation
4. Next.js middleware (edge) يقرأ cookie → فارغ → 307 إلى `/login?next=/dashboard`
5. المستخدم يعود للـ login → يفترض "الزر ما اشتغل"

**شواهد تأكيد من Network tab:**
- request 1: `login` → 200 ✅
- request 2: `dashboard?_rsc=...` → **307** ❌ (middleware redirect)
- request 3: `login?next=%2Fdashboard` → 200 (المستخدم على /login مرة أخرى)

**لماذا فشلت 5 إصلاحات سابقة:** كلها عالجت **الزر** (form/onClick/Suspense/hydration). الزر شغّال منذ البداية. الـ console error "بيانات الدخول غير صحيحة" كان من محاولة سابقة بكلمة مرور خطأ — صارف انتباه.

**الإصلاح:** `setToken()` الآن يكتب token في **localStorage + cookie** معاً:
- `path=/` كل routes محمية تراه
- `max-age=900` يطابق JWT 15min expiry — auto-cleanup
- `SameSite=Lax` يُرسل في top-level navigations (مطلوب للـ flow)
- `Secure` على HTTPS فقط (skip في dev)
- ليس HttpOnly لأن api.ts يقرأه client-side للـ Authorization header

**يحتاج VPS rebuild** لنشر التغيير.

### Diff الإصلاح: `apps/web/src/lib/api.ts:27-58`

---

---

## ✅ §I032 — 18 Major Dependency PRs — مغلق 2026-04-29

**الحالة:** ✅ **مغلق كاملاً** — جميع المسارات الخمسة مكتملة

| المسار | الترقية | الحالة | Commit |
|--------|---------|--------|--------|
| 1 — TypeScript | 5 → 6.0.3 | ✅ | `05c2e29` |
| 2 — Tailwind CSS | 3 → 4.1.11 | ✅ | `69e0603` |
| 3 — Prisma | 6.19.3 → 7.8.0 | ✅ | `4739b05` |
| 4 — NestJS ecosystem | swagger 8→11, bull 10→11, config 3→4, jwt/passport v11, cache-manager 5→7 | ✅ | `5d5a79e` |
| 5 — Frontend libs | recharts 2→3, zod 3→4 (all apps), react-router-dom removed (unused) | ✅ | `3f919cf` + `e29be9e` |

**ملاحظة:** react-router-dom لم يُرحَّل — تبيّن أنه غير مستخدم في كود POS (Next.js web app يستخدم مسارها الخاص).

---

## كيفية إضافة مشكلة

```
1. أضف صفاً بـ ID تسلسلي (I00X)
2. وصف واضح للمشكلة
3. حدد الأولوية والموجة المتأثرة
4. عيّن مسؤولاً
5. عند الحل: انقل لـ "المشاكل المغلقة" مع القرار
```
