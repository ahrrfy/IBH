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
| I001 | تحديد schema كامل لـ PostgreSQL (Prisma) قبل M01 | 🔴 حرج | Wave 1 | Tech Lead | مفتوح |
| I002 | اختيار مكتبة ULID للـ NestJS (ulid vs @paralleldrive/cuid2) | 🟡 مهم | Wave 1 | Tech Lead | مفتوح |
| I003 | تحديد strategy لـ POS conflict resolution عند الـ sync | 🟡 مهم | Wave 2 | Tech Lead | مفتوح |
| I004 | VPS: تثبيت Docker + Nginx + SSL (يحتاج SSH access) | 🔴 حرج | Wave 1 | DevOps | مفتوح |
| I005 | اختيار TOTP library للـ 2FA (otplib vs speakeasy) | 🟢 تحسين | Wave 1 | Tech Lead | مفتوح |
| I006 | تحديد Gitea URL و Woodpecker CI configuration | 🟡 مهم | Wave 1 | DevOps | مفتوح |
| I007 | زر "تسجيل الدخول" — الجذر الفعلي: token في localStorage فقط، middleware يبحث في cookie | 🔴 حرج | Wave 1 | Frontend | ✅ **مغلق** (2026-04-25, commit `d2073a5`) — يحتاج VPS rebuild |
| I008 | full seed.ts لم يُختبَر — Iraqi CoA + roles + policies لم تُسلَّم | 🟡 مهم | Wave 1 | Backend | مفتوح |
| I009 | 2FA UI مكتمل لكن لم يُختبَر — يتطلب دخول ناجح من المتصفح أولاً | 🟡 مهم | Wave 1 | QA | مفتوح |
| I010 | Build فشل (14 errors) — Prisma Client stale (schema حديث، Client قديم) | 🔴 حرج | Wave 1 | Backend | ✅ **مغلق** (2026-04-25, commit `a239255`) |
| I011 | Login error not displayed in UI (Console only) — UX bug | 🟢 تحسين | Wave 1 | Frontend | مفتوح — منخفض الأولوية بعد إغلاق I007 |
| I012 | api + web containers `unhealthy` — healthcheck path/protocol خاطئ في 4 مواضع | 🟡 مهم | Wave 1 | DevOps | ✅ **مغلق نهائياً** (2026-04-26) — راجع §I012 (4 جذور متراكبة) |
| I016 | NL Query في `nl-query.service.ts` يستخدم `$queryRawUnsafe(generatedSql)` بدون validation للجداول ولا READ ONLY tx → SQL injection ممكن من AI Brain | 🔴 حرج | Wave 6 | Security | ✅ **مغلق** (2026-04-26) — table parser + READ ONLY tx + multi-statement guard + 5K row cap (commit `4586252` + JSDoc fix `39f3751`) |
| I017 | `ci.yml` مفقود (تم حذفه في `d1b39b3`) → لا حماية من بناء فاشل قبل deploy | 🔴 حرج | Wave 1 | DevOps | ✅ **مغلق** (2026-04-26) — `ci.yml` مُعاد بناؤه: 3 jobs (typecheck-build ✅ · standalone ✅ · e2e ⚠️ يكشف bugs قائمة) |
| I018 | البنية التحتية لـ e2e tests في CI لم تكن قابلة للتشغيل — 12 ملف يفشل بأخطاء infra | 🟡 مهم | Wave 1 | QA | ✅ **مغلق** (2026-04-26) — راجع §I018 (6 طبقات infra) |
| I019 | 8 e2e tests فردية فيها bugs (FK setup, type errors, calc mismatch) — مكشوفة بعد إصلاح I018 | 🟡 مهم | Wave 1 | Backend/QA | جديد (2026-04-26) — راجع §I019 |
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

## كيفية إضافة مشكلة

```
1. أضف صفاً بـ ID تسلسلي (I00X)
2. وصف واضح للمشكلة
3. حدد الأولوية والموجة المتأثرة
4. عيّن مسؤولاً
5. عند الحل: انقل لـ "المشاكل المغلقة" مع القرار
```
