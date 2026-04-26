# UAT_PLAYBOOK.md — دليل اختبار قبول المستخدم
## Al-Ruya ERP · الإصدار 1.0 · 2026-04-26

> **هذا المستند هو العقد بين فريق التطوير والعميل قبل الإطلاق التجريبي.**
> كل سيناريو ينتهي بـ ✅ Pass / ❌ Fail / ⚠️ Blocker. لا إطلاق إنتاجي قبل ≥95% Pass.

---

## 1. الفلسفة

UAT = User Acceptance Testing. هدفه:
- ✅ تأكيد إن النظام يلبي **متطلبات الأعمال** (مو فقط يعمل تقنياً)
- ✅ كشف فجوات في **التدفقات الحقيقية** (workflows تُكتشف بالعمل، مو بقراءة spec)
- ✅ تدريب فعلي للمستخدمين الأوائل (Train the trainer)
- ❌ **ليس** بديل عن `pnpm test` ولا e2e ولا QA — هو طبقة **إنسانية** فوقها

**القاعدة:** المستخدم النهائي ينفّذ السيناريو من بدايته لنهايته بدون مساعدة من المطور. لو احتاج "ساعدني هنا" — فجوة UX، تُسجّل.

---

## 2. الأدوار

| الدور | المسؤولية |
|---|---|
| **UAT Lead** (صاحب المشروع) | يعتمد كل سيناريو، يقرر pass/fail النهائي |
| **End User** (موظف فعلي من فرع/مكتب) | ينفّذ السيناريو، يكتب الملاحظات بلغته |
| **Developer Liaison** | متاح للمساعدة عند blocker تقني، يفتح Issue، **لا يُصلح أمام المستخدم** |
| **Observer** (اختياري) | يسجّل وقت التنفيذ، عدد النقرات، مواضع التردد |

---

## 3. ما يجب يكون جاهزاً قبل بدء UAT

### 3.1 البنية التحتية
- [ ] VPS Hostinger KVM4 شغّال (`https://ibherp.cloud/health` → 200)
- [ ] كل الـ 8 خدمات في `docker compose ps` بحالة `(healthy)`:
      postgres, redis, minio, api, web, nginx, license-server, ai-brain
- [ ] SSL ساري ولا ينتهي خلال 30 يوم: `certbot certificates`
- [ ] Backup يمر ليلياً: `tail /var/log/al-ruya-backup.log` يُظهر آخر run successful
- [ ] DR drill اخر تنفيذ ≤ 90 يوم: `governance/DR_RUNBOOK.md`

### 3.2 البيانات
- [ ] دليل الحسابات العراقي (98 حساب) محمَّل: `seed.ts` نُفِّذ
- [ ] 6 مستودعات + الفرع الرئيسي
- [ ] 12 فترة محاسبية للسنة الحالية
- [ ] 7 posting profiles
- [ ] 14 وحدة قياس
- [ ] عميل افتراضي (Walk-in)
- [ ] 10 أدوار + 11 سياسة ABAC

### 3.3 الحسابات
- [ ] **مالك النظام**: أُنشئ بـ env vars `OWNER_USERNAME` + `OWNER_PASSWORD` (في `infra/.env`، chmod 600)
- [ ] **3 مستخدمي اختبار**: مدير فرع، أمين صندوق، محاسب — صلاحيات مختلفة
- [ ] **10 موظفين** في HR (لاختبار payroll)
- [ ] **20 منتج** بأسعار وخصومات

### 3.4 المعدات
- [ ] جهاز POS (Tauri app على Windows)
- [ ] طابعة فواتير ESC/POS
- [ ] قارئ باركود (USB HID)
- [ ] درج نقدي
- [ ] هاتف موظف (لاختبار attendance)

### 3.5 الوثائق المُسلَّمة للمختبر
- [ ] `governance/DOMAIN_DICTIONARY.md` (المصطلحات)
- [ ] `governance/UAT_PLAYBOOK.md` (هذا الملف)
- [ ] قائمة بيانات الاختبار (CSV لمنتجات، عملاء، موردين)
- [ ] رابط لتسجيل المشاكل (Issue tracker أو نموذج Google Form)

---

## 4. السيناريوهات

### Wave 1 — البنية الأساسية (10 سيناريوهات)

#### S1-01 · تسجيل دخول مالك النظام
**Pre:** المستعرض على `https://ibherp.cloud/login`، 2FA غير مفعَّل بعد.
**خطوات:**
1. أدخل `OWNER_USERNAME` + `OWNER_PASSWORD`
2. اضغط "تسجيل الدخول"
**المتوقَّع:** Redirect لـ `/dashboard` خلال ≤ 3 ثواني، الاسم في الـ topbar = "مالك النظام"
**Pass criteria:** ✅ تم الوصول للـ dashboard | ❌ أي خطأ، redirect خاطئ، أو > 5 ثواني

#### S1-02 · تفعيل 2FA للمالك
**Pre:** S1-01 ناجح، تطبيق Authenticator على الهاتف.
**خطوات:**
1. اذهب لـ `/settings/profile` → "تفعيل 2FA"
2. امسح QR بالتطبيق
3. أدخل أول كود 6-أرقام
4. احفظ backup codes (10 أكواد)
5. سجِّل خروج، أعد دخول → يطلب OTP بعد كلمة المرور
**Pass criteria:** ✅ 2FA يعمل + backup codes تُحفظ | ❌ OTP يُرفض، أو backup codes ناقصة

#### S1-03 · إنشاء مستخدم بدور محدود
**Pre:** S1-01.
**خطوات:**
1. `/settings/users/new` → أنشئ "محاسب فرع المنصور" بدور "Branch Accountant"
2. `/settings/roles/new` → دور بصلاحيات: SalesInvoice (R + P)، JournalEntry (R)
3. سجِّل دخول بالمستخدم الجديد
4. حاول إنشاء فاتورة → يجب 403
5. اعرض فاتورة موجودة → يجب نجاح
**Pass criteria:** ✅ المنع 403 يحدث، العرض ينجح | ❌ المستخدم استطاع إنشاء فاتورة

#### S1-04 · فرع جديد + RLS isolation
**Pre:** S1-01.
**خطوات:**
1. `/settings/branches/new` → فرع "المنصور" (code: MNS)
2. أنشئ مستخدم مرتبط بـ MNS فقط
3. أنشئ مستخدم آخر مرتبط بفرع "بغداد" فقط
4. سجِّل فاتورة بفرع MNS كأول مستخدم
5. سجِّل دخول بالثاني → الفاتورة لا تظهر له
**Pass criteria:** ✅ كل مستخدم يرى فاتورته فقط (RLS) | ❌ تسرّب بيانات بين فروع

#### S1-05 · Audit Log
**Pre:** S1-01.
**خطوات:**
1. سجِّل دخول، أنشئ منتج، عدِّله، احذفه
2. `/settings/audit` → افلتر بـ `entityType=Product`
3. تحقق من 3 entries: create + update + delete
4. كل entry يُظهر hash chain (badge أخضر = chain valid)
**Pass criteria:** ✅ كل العمليات مُسجَّلة + chain valid | ❌ entry مفقود أو chain broken

#### S1-06 · Backup ↔ Restore
**Pre:** S1-01، Backup ليلي شغّال.
**خطوات:**
1. أنشئ منتجاً بسعر مميز (999,999)
2. انتظر backup التالي (أو شغّله يدوياً: `infra/scripts/backup-cron.sh`)
3. احذف المنتج
4. استعد آخر backup إلى DB اختبارية: `restic restore latest --target /tmp/restore`
5. ابحث عن المنتج بسعر 999,999 → موجود
**Pass criteria:** ✅ المنتج رجع بنفس بياناته | ❌ بيانات ناقصة أو فاسدة

#### S1-07 · Period Lock
**Pre:** S1-01، فترة محاسبية مغلقة (مثلاً يناير).
**خطوات:**
1. حاول إنشاء قيد محاسبي بتاريخ 2026-01-15
**Pass criteria:** ✅ DB يرفض (PeriodLock error) | ❌ القيد يُنشأ

#### S1-08 · Double-Entry Constraint
**Pre:** S1-01.
**خطوات:**
1. شغّل في psql:
   ```sql
   INSERT INTO journal_entries (id, total_debit, total_credit, ...) VALUES (..., 1000, 500, ...);
   ```
**Pass criteria:** ✅ DB CHECK constraint يرفض | ❌ القيد غير المتوازن مر

#### S1-09 · Append-Only Audit
**Pre:** S1-01.
**خطوات:**
1. شغّل: `UPDATE audit_logs SET action='X' WHERE id='...';`
2. شغّل: `DELETE FROM stock_ledger WHERE id='...';`
**Pass criteria:** ✅ DB triggers ترفض | ❌ التعديل/الحذف نجح (F2 violation)

#### S1-10 · Health monitoring
**خطوات:**
1. `curl https://ibherp.cloud/health` → 200 OK + JSON يحتوي `{ status: 'ok' }`
2. `docker compose ps --format json | jq` → كل services healthy
3. Grafana board (لو موجود) أو `docker stats` → CPU/RAM ضمن الحدود
**Pass criteria:** ✅ كل المؤشرات خضراء

---

### Wave 2 — POS + Sales + Delivery (8 سيناريوهات)

#### S2-01 · فتح وردية + بيع نقدي + إغلاق
**Pre:** POS app على Windows، طابعة موصولة، رصيد افتتاحي 100,000 IQD.
**خطوات:**
1. افتح POS، اختر الفرع، أدخل رصيد افتتاحي
2. امسح باركود منتج → يُضاف للسلة
3. اختر طريقة دفع: نقدي
4. اطبع الفاتورة
5. أغلق الوردية → تقرير X (ملخص داخلي) ثم Z (إغلاق)
6. تحقق من تطابق Z مع cash drawer
**Pass criteria:** ✅ الوردية تُغلق بـ delta = 0، فاتورة مُسجَّلة في DB، StockLedger متحدّث | ❌ delta > 0 أو فاتورة مفقودة

#### S2-02 · POS offline (انقطاع نت)
**Pre:** POS Tauri قاعدة SQLite مشفّرة.
**خطوات:**
1. افصل الإنترنت (router off أو firewall block)
2. افتح وردية، بِع 5 فواتير
3. أعد الاتصال
4. POS يُزامن تلقائياً → الفواتير تظهر في `/sales/invoices` على web
**Pass criteria:** ✅ صفر فاتورة مفقودة، صفر duplicate (clientUlid idempotency) | ❌ فاتورة مكررة أو مفقودة

#### S2-03 · فاتورة بائنة (Sales Invoice)
**خطوات:**
1. `/sales/invoices/new` → اختر عميل + بنود
2. احفظ كمسودة
3. اعتمد → status = `submitted`
4. ارحِّل → status = `posted`، يُنشَأ JE تلقائياً
5. افتح JE → ميزان مقفل (debit = credit)
**Pass criteria:** ✅ JE صحيح بالحسابات العراقية (511/512 + 221 + 611 + 212) | ❌ ميزان مكسور أو حساب خاطئ

#### S2-04 · عكس فاتورة (T10)
**Pre:** فاتورة في حالة `posted`.
**خطوات:**
1. اضغط "عكس الفاتورة"، أدخل سبب
2. JE عكسي يُنشأ، الأصلية تصبح `reversed`
3. StockLedger entry جديد بكميات سالبة
**Pass criteria:** ✅ التأثير المحاسبي + المخزون ملغى | ❌ JE الأصلي عُدِّل (F2 violation)

#### S2-05 · مرتجع مبيعات (T15)
**Pre:** فاتورة مدفوعة.
**خطوات:**
1. `/sales/returns/new` → ابحث عن الفاتورة
2. حدد بنداً + كمية ≤ original، اختر `isRestockable=true`
3. احفظ كمسودة → اعتمد
4. JE عكسي + المخزون يعود لـ "warehouse عام" (أو "تالف" لو isRestockable=false)
**Pass criteria:** ✅ المخزون يعود + JE صحيح | ❌ كمية تتجاوز الأصلية أو لم يُحدَّث المخزون

#### S2-06 · Sales Order → Invoice (T11)
**خطوات:**
1. `/sales/orders/new` → أنشئ طلب
2. اعتمد → اضغط "تحويل لفاتورة"
3. الفاتورة تُنشأ ببنود الطلب، الطلب يصبح `invoiced`
**Pass criteria:** ✅ الفاتورة بنفس البنود، لا فقدان data | ❌ بند مفقود

#### S2-07 · Quotation → Order
**خطوات:** عرض سعر → أنشئ طلب منه → الطلب مرتبط بالعرض.

#### S2-08 · Delivery
**Pre:** فاتورة `posted`.
**خطوات:**
1. `/delivery/dispatch` → عيِّن سائق
2. السائق يُحدِّث الحالة (delivered)
3. POD يُسجَّل
**Pass criteria:** ✅ تتبع كامل، POD مُخزَّن.

---

### Wave 3 — Purchases (5 سيناريوهات)

#### S3-01 · PO → GRN → Vendor Invoice (3-Way Match)
1. `/purchases/orders/new` → PO 100 وحدة بسعر 1000
2. `/purchases/grn/new` → GRN بـ 95 وحدة (5 ناقصة)
3. `/purchases/vendor-invoices/new` → فاتورة المورد 100 وحدة × 1000
4. النظام يكشف عدم تطابق 5 وحدات → 3-way match exception
**Pass criteria:** ✅ النظام يرفع تنبيه + يطلب موافقة لتجاوز | ❌ فاتورة تمر بصمت

#### S3-02 · GRN → Inventory increment
**خطوات:** GRN → افحص StockLedger → الكمية أُضيفت + تكلفة MWA محسوبة.

#### S3-03 · Vendor Invoice → JE (321 + 611)
1. اعتمد فاتورة مورد
2. JE: مدين 611 (COGS placeholder) + 142 (VAT input) | دائن 321 (المورد)

#### S3-04 · Supplier Return
1. أعد بضاعة لمورد
2. JE معاكس + StockLedger خصم

#### S3-05 · Supplier statement
1. `/purchases/suppliers/[id]` → كشف حساب المورد
2. الرصيد = sum(invoices) - sum(payments)

---

### Wave 4 — Finance (8 سيناريوهات)

#### S4-01 · ميزان المراجعة (Trial Balance)
1. `/reports/trial-balance?date=...`
2. مجموع debit = مجموع credit (لكل صف)

#### S4-02 · قائمة الدخل (Income Statement)
1. `/finance/income-statement?from=...&to=...`
2. الإيرادات (5xx) - المصروفات (6xx) = صافي الربح

#### S4-03 · الميزانية العمومية (Balance Sheet)
1. `/finance/balance-sheet?date=...`
2. الأصول = الخصوم + حقوق الملكية

#### S4-04 · إقفال فترة (Period Close — T17)
1. `/finance/periods/[id]/close` → wizard 7 خطوات
2. كل خطوة تتحقق من invariant (لا حركات مفتوحة، depreciation تم، إلخ)
3. الإقفال يحفظ هاش للحالة

#### S4-05 · إهلاك شهري (Depreciation)
1. شغّل depreciation run لشهر
2. تحقق من JE: مدين 624 (مصروف إهلاك) | دائن 113 (مجمع إهلاك)
3. لا يمكن إعادة التشغيل لنفس الفترة (idempotency)

#### S4-06 · Bank Reconciliation (T16)
1. `/finance/banks/[id]/reconcile`
2. ارفع كشف بنك CSV
3. طابق العمليات → الفروقات تظهر
4. أكمل reconciliation

#### S4-07 · Payment Receipt (AR)
1. عميل يدفع 100,000 من فاتورة 150,000
2. JE: مدين 2411 (صندوق) | دائن 221 (الذمم)
3. الفاتورة → `partially_paid`

#### S4-08 · Payment to Supplier (AP)
1. ادفع لمورد
2. JE: مدين 321 | دائن 2411

---

### Wave 5 — HR (5 سيناريوهات)

#### S5-01 · Attendance check-in/out (T18)
1. موظف يسجّل دخول من ZkTeco (أو يدوياً)
2. يسجّل خروج
3. محسوب: ساعات عمل، تأخير، غياب

#### S5-02 · Payroll Run (T19)
1. `/hr/payroll/new` → فترة (شهر/سنة)
2. النظام يحسب فوراً (status = `calculated`)
3. مراجعة → اعتماد → ترحيل
4. JE: مدين 621 (رواتب) + 622 (ضمان موظف) | دائن 331 (ضمان مستحق) + 341 (ضريبة) + 332 (رواتب مستحقة)
5. تصدير CBS file → CSV للبنك

#### S5-03 · ضرائب الدخل العراقية (4 شرائح)
1. موظف براتب 800,000 → ضريبة = 0 (شريحة معفاة)
2. موظف براتب 1,500,000 → 3% على 500,000 = 15,000
3. موظف براتب 2,500,000 → الشرائح المتدرجة
**Pass criteria:** ✅ الحساب يطابق spec العراقي | ❌ خطأ في bracket

#### S5-04 · Leave Management
1. موظف يطلب إجازة 5 أيام
2. مدير يعتمد
3. payroll يخصم/لا يخصم حسب نوع الإجازة

#### S5-05 · Job Order (Custom Production)
1. أنشئ أمر تصنيع
2. اربط BOM
3. رحِّل المراحل → التكلفة تُحسب

---

### Wave 6 — CRM + AI + Licensing (4 سيناريوهات)

#### S6-01 · Lead → Customer
1. `/crm/leads/new` → عميل محتمل
2. مكالمات + activity log
3. حوّل لعميل → ينتقل لـ `/sales/customers/[id]`

#### S6-02 · WhatsApp Bridge (T26)
1. أرسل رسالة من حساب اختباري لرقم Meta
2. تظهر في `/crm/whatsapp/inbox`
3. ردّ من النظام عبر `POST /whatsapp/send`

#### S6-03 · License Heartbeat
1. License Server يستقبل heartbeat كل 24h
2. لو فاتت 30 يوم بدون heartbeat → grace period notice
3. بعد 60 يوم → soft block

#### S6-04 · AI Anomaly Detection
1. أدخل فاتورة بقيمة شاذة (1,000,000,000 IQD)
2. AI Brain يرفع flag بعد 5 دقائق
3. Dashboard يُظهر anomaly

---

## 5. سجل النتائج

| Sprint | Module | Scenarios | Pass | Fail | Blocker | Sign-off |
|---|---|---:|---:|---:|---:|---|
| Sprint 1 | Wave 1 | 10 | / | / | / | لم يتم |
| Sprint 1 | Wave 2 | 8 | / | / | / | لم يتم |
| Sprint 2 | Wave 3 | 5 | / | / | / | لم يتم |
| Sprint 2 | Wave 4 | 8 | / | / | / | لم يتم |
| Sprint 3 | Wave 5 | 5 | / | / | / | لم يتم |
| Sprint 3 | Wave 6 | 4 | / | / | / | لم يتم |
| **Total** | | **40** | / | / | / | |

> **شرط الإطلاق:** ≥ 38 Pass، صفر Blocker، كل Fail له Issue مفتوح + ETA.

---

## 6. كيف تُسجَّل المشكلة

```markdown
## I-UAT-### · <عنوان مختصر>
- **السيناريو:** S2-04
- **الـ Wave:** Wave 2
- **الأولوية:** 🔴 Blocker / 🟡 مهم / 🟢 تحسين
- **الخطوات لإعادة الإنتاج:**
  1. ...
- **المتوقَّع vs الفعلي:**
  - متوقَّع: ...
  - فعلي: ...
- **Screenshot/فيديو:** (link)
- **Owner:** (developer)
- **ETA:** (تاريخ متوقَّع للحل)
```

تُضاف لـ `governance/OPEN_ISSUES.md` أو في GitHub Issues مع label `uat-finding`.

---

## 7. معايير الإغلاق النهائية (Definition of Done لـ UAT)

- [ ] كل السيناريوهات الـ 40 نُفِّذت
- [ ] Pass rate ≥ 95% (≥ 38 Pass من 40)
- [ ] صفر Blocker مفتوح
- [ ] كل Fail له fix مدموج في `main` + retest pass
- [ ] UAT Lead وقّع على هذا الملف
- [ ] فريق العميل (≥ 3 مستخدمين فعليين) جرّبوا System لـ ≥ 2 ساعات لكل واحد
- [ ] تقرير Performance: متوسط زمن الاستجابة ≤ 1 ثانية للطلبات العادية
- [ ] تقرير Stability: 0 crashes خلال أسبوع كامل قبل الإطلاق
- [ ] خطة التدريب جاهزة (راجع `governance/CUSTOMER_ONBOARDING.md` بعد T30)

---

## 8. التوقيعات

| الدور | الاسم | التاريخ | التوقيع |
|---|---|---|---|
| UAT Lead | | | |
| End User #1 | | | |
| End User #2 | | | |
| End User #3 | | | |
| Developer Liaison | | | |

---

## ملحق A — قائمة بيانات الاختبار

تُسلَّم منفصلة كـ CSV:
- `test-data/products.csv` (20 منتج)
- `test-data/customers.csv` (15 عميل)
- `test-data/suppliers.csv` (5 موردين)
- `test-data/employees.csv` (10 موظفين بأجور مختلفة لاختبار شرائح ضريبة الدخل)

## ملحق B — مرجع سريع للحسابات العراقية

| الكود | الاسم | الاستخدام في UAT |
|---|---|---|
| 211 | بضاعة جاهزة | الجرد، GRN |
| 221 | الذمم المدينة | فواتير المبيعات |
| 321 | الموردون | فواتير الشراء |
| 331 | مصروفات مستحقة | GR/IR |
| 341 | ضرائب الدخل المستقطعة | Payroll |
| 511/512 | مبيعات نقدية/آجلة | فاتورة بيع |
| 611 | تكلفة البضاعة المباعة | عند ترحيل فاتورة |
| 621 | رواتب موظفين | Payroll |
| 624 | مصروف إهلاك | Depreciation |
| 643 | نقل ومواصلات | بدلات موظفين |
| 2411 | صندوق الفرع الرئيسي | استلام/دفع نقدي |

(القائمة الكاملة في `prisma/seed.ts` — 98 حساب.)
