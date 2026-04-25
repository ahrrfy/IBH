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
| I007 | زر "تسجيل الدخول" في /login لا يستجيب — تشخيص: فشل hydration على client (راجع §I007 أدناه) | 🔴 حرج | Wave 1 | Frontend | مفتوح — قيد التشخيص (2026-04-25) |
| I008 | full seed.ts لم يُختبَر — Iraqi CoA + roles + policies لم تُسلَّم | 🟡 مهم | Wave 1 | Backend | مفتوح |
| I009 | 2FA UI مكتمل لكن لم يُختبَر — يتطلب دخول ناجح من المتصفح أولاً | 🟡 مهم | Wave 1 | QA | مفتوح |
| I010 | Build فشل (14 errors) — schema لا يطابق auth/totp service بعد commit cdd169c (راجع §I010) | 🔴 حرج | Wave 1 | Backend | مفتوح (2026-04-25) |

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

## §I010 — Build regression بعد 2FA foundation (2026-04-25)

**Detected by:** `pnpm --filter api build` خلال session-end · 14 errors · Exit 1

**الجذر:** commit `cdd169c feat(auth): real authentication foundation + Google Authenticator 2FA` أضاف كود لـ:
- `auth.service.ts` يستخدم `username`, `user.company`, `user.isSystemOwner`, `user.userRoles` — لا تزال غير موجودة في `User` model في `schema.prisma`
- `totp.service.ts` يستخدم `username`, `totpEnabledAt`, `backupCodes`, `requires2FA` على `User` — غير موجودة في schema
- `totp.service.ts` يستورد `otplib` و `qrcode` — غير مُثبَّتَين في `apps/api/package.json`

**الأخطاء بالعدد (14):**
- `auth.service.ts`: 4 errors (username, company, isSystemOwner, userRoles)
- `totp.service.ts`: 10 errors (username × 3, totpEnabledAt × 2, backupCodes × 3, otplib import, qrcode import)

**الإصلاح المطلوب (سيكل قادم — slice واحد):**
1. تحديث `User` model في `schema.prisma`: إضافة `username`, `isSystemOwner`, `totpSecret`, `totpEnabledAt`, `backupCodes`, `requires2FA`
2. إضافة علاقة `company` و `userRoles` (UserRole join model) إذا غير موجودة
3. `pnpm --filter api add otplib qrcode @types/qrcode`
4. `pnpm --filter api exec prisma migrate dev --name auth_foundation_fields`
5. إعادة `pnpm --filter api build` للتحقق

**⚠️ تأثير:** حتى يُحَل I010 لا يمكن:
- إنشاء dist (deployment معطل)
- تشغيل أي e2e test (AppModule لن يُهيَّأ)
- تشغيل runtime محلي

---

## §I007 — تفاصيل تشخيص login button (2026-04-25)

**Static analysis report (Claude agent, confidence: medium):**

### السبب الأرجح: H1 — فشل hydration على العميل
- `apps/web/src/lib/auth.ts:26-45` ينشئ Zustand store بـ `persist` middleware عند تحميل الموديول
- `apps/web/src/app/login/page.tsx:18` يستدعي `useAuth()` بدون شرط
- لو فشل تهيئة الـ store (أو اختلف server vs client state)، React 19 يتخلى عن hydration بصمت
- النتيجة: HTML يُرسم من server لكن **لا event handlers تُربط** — لا الزر ولا الحقول تستجيب

### لماذا فشلت الإصلاحات الـ 5 السابقة
كلها عالجت الزر نفسه (form/onClick/Suspense). لم يلمس أي منها `useAuth` أو `auth.ts`. **العمى نفسه في كل مرة.**

### الفرضيات المرفوضة
- ❌ **H2 (CSP):** الـ CSP في `apps/api/src/main.ts:39-54` لا يطبَّق على web (nginx لا يحقن CSP لمسارات web)
- ❌ **H4 (Next.js client component):** `page.tsx:1` معلَّم `"use client"` صحيحاً
- ⚠️ **H5 (stale bundle):** يحتاج تحقق runtime — قارن hash البندل المنشور مع build محلي

### الاختبار التشخيصي الحاسم (1 دقيقة، بدون deploy)
> **افتح `/login` وحاول الكتابة في حقل البريد. إذا لم يظهر النص → hydration معطل (H1 مؤكد).**
> إذا ظهر النص لكن الزر لا يستجيب → السبب في مكان آخر.

### التغيير المقترح للجلسة القادمة (إذا H1 تأكد)
استبدل `useAuth()` بـ direct API calls في `page.tsx`:
```tsx
// أزل: import { useAuth } from '@/lib/auth';
// أضف: import { login as apiLogin, setToken } from '@/lib/api';
// في doCredentialsLogin: const res = await apiLogin(...);
//   if ('requires2FA' in res) {...} else { setToken(res.accessToken); router.replace(...); }
```
يعزل ما إذا كان Zustand persist هو السبب.

### ملفات مذكورة بالأرقام
- `apps/web/src/app/login/page.tsx:1, 18, 175`
- `apps/web/src/lib/auth.ts:26-45, 50-70`
- `apps/web/src/lib/api.ts:39-62`
- `apps/web/next.config.js:3` (reactStrictMode)

---

## كيفية إضافة مشكلة

```
1. أضف صفاً بـ ID تسلسلي (I00X)
2. وصف واضح للمشكلة
3. حدد الأولوية والموجة المتأثرة
4. عيّن مسؤولاً
5. عند الحل: انقل لـ "المشاكل المغلقة" مع القرار
```
