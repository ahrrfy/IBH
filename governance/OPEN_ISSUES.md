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
