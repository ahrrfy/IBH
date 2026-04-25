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
| I007 | زر "تسجيل الدخول" في /login لا يستجيب رغم API يعمل — جذر غير معروف | 🔴 حرج | Wave 1 | Frontend | مفتوح (2026-04-25) |
| I008 | full seed.ts لم يُختبَر — Iraqi CoA + roles + policies لم تُسلَّم | 🟡 مهم | Wave 1 | Backend | مفتوح |
| I009 | 2FA UI مكتمل لكن لم يُختبَر — يتطلب دخول ناجح من المتصفح أولاً | 🟡 مهم | Wave 1 | QA | مفتوح |

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

## كيفية إضافة مشكلة

```
1. أضف صفاً بـ ID تسلسلي (I00X)
2. وصف واضح للمشكلة
3. حدد الأولوية والموجة المتأثرة
4. عيّن مسؤولاً
5. عند الحل: انقل لـ "المشاكل المغلقة" مع القرار
```
