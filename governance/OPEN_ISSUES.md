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
| I048 | **18 ثغرة Dependabot على main** (12 high + 6 moderate). GitHub أبلغ عن الثغرات بعد `git push` في 2026-04-29. ثغرات في حزم npm (transitive + direct) — ليست في كود المشروع. تفاصيل: https://github.com/ahrrfy/IBH/security/dependabot — يحتاج دورة `pnpm audit --prod` مخصصة لتقييم: (1) أيها direct dep vs transitive، (2) أيها له patch بدون breaking changes، (3) أيها يُعالج بـ `pnpm.overrides`. ملاحظة: I032 يُجمّد عمداً 18 حزمة (TypeScript 5.9.3, Tailwind 3.4.19, Prisma 6.19.3, إلخ) لـ Wave 6 — إذا كانت بعض ثغرات Dependabot في هذه الحزم المجمّدة، يجب توثيق الإستثناء أو قبول المخاطرة حتى نهاية Wave 6. | 🟡 مهم | Wave 6 | Security/DevOps | مفتوح — يحتاج جلسة `pnpm audit` مخصصة |
| I047 | **تعارض schema ↔ raw SQL** — اكتشاف وإصلاح متعدد الدورات (cycles 1-11): `accountType→type`, `periodStart/periodEnd→startDate/endDate`, `scheduledAt→plannedDate`, `totalTaxIqd→taxIqd`, `isGiftware` غير موجود، Bull processors تُعطّل dev. **هذه الجلسة (2026-04-29)**: إضافة 5 إصلاحات إضافية: (1) `birthDate→dateOfBirth` في dashboards.service.ts للموظفين، (2) إعادة كتابة كاملة لـ `getLowStockAlerts()` في inventory.service.ts من snake_case إلى camelCase + `reorder_point→reorderQty`، (3-5) معالجة 3 ثغرات SQL injection في reports.service.ts (branchId, warehouseId) و forecasting.service.ts (variantId) — راجع I049. | 🔴 حرج | Wave 6 | Backend | ✅ **مغلق** (2026-04-29، commits `951e192` + `3fa658b`) — جميع raw SQL الآن يستخدم أسماء أعمدة camelCase صحيحة + double-quoted. typecheck نظيف. |
| I049 | **3 ثغرات SQL Injection authenticated في raw SQL** — `reports.service.ts:25` (branchId)، `reports.service.ts:371` (warehouseId)، `forecasting.service.ts:31` (variantId). كلها كانت `$queryRawUnsafe` مع `'${param}'` concatenation لمدخلات تأتي من query string. مع JWT صالح، أي مستخدم يقدر يكسر filter clause بـ `' OR 1=1 --` أو يستخرج بيانات شركات أخرى عبر UNION SELECT (يتجاوز RLS لأن الـ session متّصل بـ companyId الخاص بالمستخدم لكن الـ subquery قد تستهدف جداول بدون RLS أو تستغل العلاقات). + ثغرة F1 cross-tenant: `vendor-invoices.service.ts:115` فحص تكرار vendorRef بدون companyId — side-channel يكشف أرقام فواتير شركات أخرى. | 🔴 حرج | Wave 6 | Security | ✅ **مغلق** (2026-04-29، commit `3fa658b`) — جميع المدخلات parameterized بـ `$N`. vendor-invoice dup check يضيف `companyId` للفلتر. |
| I043 | **VPS disk bloat** — `/dev/sda1` نمت من 15GB إلى 120GB (65% من 193GB) خلال أسبوعين من التطوير النشط. التشخيص الذري على VPS كشف: `/var/lib/docker = 114GB` منها 108.5GB في build cache (تراكم layers من كل deploy: api + web + tauri builds × عشرات النشرات اليومية). كل البيانات الحساسة (PostgreSQL volume = 708MB, MinIO, Redis AOF) سليمة. التنظيف اليدوي (`docker image prune -af` + `docker builder prune -af` + `docker container prune -f` + truncate json-logs + journald vacuum + apt clean) أعاد المساحة إلى 19GB (10%). | 🟡 مهم | Wave 1 | DevOps | ✅ **مغلق** (2026-04-27) — تنظيف فوري نجح (120GB→19GB، -101GB، ~84%). الوقاية: D15 + workflowان جديدان: (1) `.github/workflows/vps-disk-cleanup.yml` للتنظيف اليدوي عند الحاجة (workflow_dispatch + dry-run mode)، (2) `.github/workflows/vps-disk-setup.yml` يثبّت `/etc/docker/daemon.json` (log-opts: max-size=50m, max-file=3, compress=true) + `/etc/cron.weekly/al-ruya-disk-cleanup` (auto-prune كل أحد + log في `/var/log/al-ruya-disk-cleanup.log`). **TODO**: يجب تشغيل `vps-disk-setup.yml` مرة وحدة من GitHub Actions لتفعيل الوقاية الدائمة — بدون هذا، التنظيف الحالي مؤقت وقد يتراكم الـ build cache مرة أخرى. |
| I041 | **Tailwind 4 upgrade blocked — design-system CSS rewrite required (apps/web).** Tailwind 4.2.4 wiring (`@import "tailwindcss"` + `@tailwindcss/postcss` + `@config` directive) installs cleanly, but the build fails on the very first compose-utility chain in `apps/web/src/app/globals.css`: `Cannot apply unknown utility class 'card'`. Tailwind 4 no longer lets you `@apply` a custom class that was itself defined via `@apply` in the same/earlier `@layer components` rule. The web design system has ~15 such chained-apply violations: `.card-padded`/`.card-section` → `card`; `.btn-primary`/`.btn-secondary`/`.btn-ghost`/`.btn-danger`/`.btn-sm`/`.btn-lg` → `btn`; `.badge-success`/`.badge-warning`/`.badge-danger`/`.badge-info`/`.badge-neutral`/`.badge-brand` → `badge`; `.stat-card` → `card-padded`. Each must be flattened (inline the parent's utilities) or rewritten as `@utility` blocks. Additionally `theme('colors.x.y')` calls (~10 occurrences) and the legacy `tailwind.config.ts` should be migrated to CSS-first `@theme` for clean v4 idiom. apps/storefront and apps/pos already declare `tailwindcss@^4.0.0` and use `@import "tailwindcss"` + `@theme` (no chained-apply), but they lack actual wiring — no `postcss.config.js` for storefront's Next pipeline and no `@tailwindcss/vite` plugin in pos's Vite config — so their CSS likely isn't generated at all today (pre-existing latent issue, not new). Reverted apps/web cleanly (package.json, postcss.config.js, globals.css, pnpm-lock.yaml all back to v3 state). Effort estimate: 1 dedicated session — flatten chained `@apply`, migrate `theme()` calls and config tokens to `@theme`, then wire storefront + pos properly. | 🟢 تحسين | Wave 1 | Frontend | مفتوح — يحتاج جلسة مخصصة لإعادة كتابة `globals.css` (chained @apply → flat @apply أو @utility) قبل ترقية Tailwind 4 |
| I040 | **Prisma 7 upgrade blocked — datasource architecture change.** Prisma 7.0+ removes support for `datasource.url` in `schema.prisma` (error P1012 from `prisma generate`). Connection URL must move to a new `prisma.config.ts` file, and `PrismaClient` must be constructed with a driver adapter (e.g. `@prisma/adapter-pg`) instead of receiving the URL via the schema. This affects: (1) `apps/api/prisma/schema.prisma` (remove `url`), (2) new `apps/api/prisma.config.ts`, (3) `PrismaService` rewrite to instantiate a pg `Pool` + adapter and pass it into `new PrismaClient({ adapter })`, (4) all migration tooling/scripts, (5) verification that `multiSchema`, `postgresqlExtensions` (pgcrypto, pgvector), and RLS still function via the adapter. Out of scope for I032 frozen-dep batch — needs its own dedicated session. Reverted to 6.19.3 cleanly (no source changes). Reference: https://pris.ly/d/prisma7-client-config | 🟡 مهم | Wave 1 | Backend | مفتوح — يحتاج جلسة مخصصة لإعادة هيكلة `PrismaService` على driver-adapter pattern قبل الترقية |
| I037 | Q04 expiring-stock quality rule is a no-op — الـ `BatchLedger` model لا يحوي حقل `expiryDate`، فالـ rule لا تجد أي بيانات وتعيد صفراً دائماً. يحتاج إضافة `expiryDate` لـ BatchLedger + migration + تغذية من GRN. | 🟡 مهم | Wave 6 | Backend | ✅ **مغلق جزئياً** (2026-04-29) — `intelligence.service.ts` أُعيدت كتابة `ledgerMeta()` لتستعلم عن `GRNLine.expiryDate` مباشرة بدل `BatchLedger` (الـ model غير موجود). القاعدة الآن تُعيد نتائج حقيقية. الـ BatchLedger tracking الكامل يبقى مؤجلاً لـ Wave 6 batch-tracking مخصص. |
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

## §I032 — 18 Major Dependency PRs — خارطة الترحيل (2026-04-27)

**الخلفية:** Dependabot فتح 18 PR لتحديثات major version دفعة واحدة عقب تفعيل `dependabot.yml` في PR #56. كل هذه الـ PRs كانت تفشل CI. أُغلقت جميعها في 2026-04-27 مع تعليق موضّح في كل PR. أُضيفت `ignore` rules في `.github/dependabot.yml` لمنع إعادة الفتح الأسبوعي.

**لإعادة تفعيل أي ترحيل:** احذف الـ `ignore` rule المقابلة في `.github/dependabot.yml` — Dependabot يفتح PR جديد في الإثنين التالي.

### مسار 1 — TypeScript 5 → 6
PRs المغلقة: #74 (api) · #72 (web) · #68 (pos) · #67 (storefront) + #71 (@types/node web)
**شروط الترحيل:** Next.js 15 + NestJS + Prisma يدعمون TS 6 رسمياً · مراجعة 258 موقع `as any` · تشغيل `pnpm typecheck` صفر errors على كل التطبيقات.

### مسار 2 — Tailwind CSS 3 → 4
PRs المغلقة: #79 (root) · #60 (pos) · #70 (tailwind-merge web) · #66 (lucide-react web) · #62 (lucide-react storefront)
**شروط الترحيل:** إعادة كتابة `tailwind.config.js` → CSS-first `@theme` · مراجعة `tailwind-merge` v3 API · فحص أسماء الأيقونات في `lucide-react` v1 · اختبار بصري كامل.

### مسار 3 — Prisma 6 → 7
PRs المغلقة: #77 (api)
**شروط الترحيل:** مراجعة `$transaction` API changes · اختبار شامل لـ StockLedger + JournalEntries + AuditLogs (F2/F3 critical) · e2e tests كاملة على DB نظيف.

### مسار 4 — NestJS major bumps
PRs المغلقة: #83 (@nestjs/swagger 8→11) · #75 (@nestjs/bull 10→11) · #76 (@nestjs/config 3→4)
**شروط الترحيل:** ترقية منسّقة لكل حزم NestJS معاً · مراجعة `@ApiProperty()` decorators · `BullModule.registerQueue()` API · `ConfigModule.forRoot()` options.

### مسار 5 — Frontend libraries
PRs المغلقة: #80 + #65 (react-router-dom 6→7) · #82 (recharts 2→3) · #69 (zod 3→4 storefront)
**شروط الترحيل:** react-router-dom 7: مراجعة كل Router/useNavigate/Link · recharts 3: chart components في Reports · zod 4: كل `.parse()` و `z.infer<>`.

---

## كيفية إضافة مشكلة

```
1. أضف صفاً بـ ID تسلسلي (I00X)
2. وصف واضح للمشكلة
3. حدد الأولوية والموجة المتأثرة
4. عيّن مسؤولاً
5. عند الحل: انقل لـ "المشاكل المغلقة" مع القرار
```
