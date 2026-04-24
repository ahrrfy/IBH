# ACCEPTANCE_TESTS.md
## اختبارات القبول — لا ميزة مكتملة بدون اجتيازها
### تُكتَب قبل التطوير (TDD approach)

---

> **القاعدة:** كل ميزة لها اختبارات قبول مكتوبة ومجتازة قبل أن تُعتبر منجزة.
> "اكتمل بدون اختبارات" = علامة خطر حمراء 🔴

---

## Wave 1 — اختبارات القبول

---

### M01.AT01 — تسجيل دخول المستخدم

**المتطلب:** مستخدم يسجل دخوله ويحصل على JWT

```gherkin
Scenario: تسجيل دخول ناجح
  Given مستخدم موجود بالبريد "admin@ruya.iq" وكلمة مرور صحيحة
  When يُرسل POST /auth/login
  Then يستقبل accessToken (JWT صالح 15 دقيقة)
  And يستقبل refreshToken (JWT صالح 30 يوم)
  And يحتوي الـ payload على: userId, companyId, roles
  And يُسجَّل الحدث في audit_logs

Scenario: بيانات خاطئة
  Given مستخدم يُدخل كلمة مرور خاطئة
  When يُرسل POST /auth/login ثلاث مرات
  Then يُقفل الحساب 15 دقيقة
  And يُرسل تنبيه للـ Admin
  And يُسجَّل في audit_logs كـ "failed_login_lockout"

Scenario: مستخدم من شركة مختلفة
  Given مستخدم شركة A يحاول الدخول بـ companyCode شركة B
  Then يُرفض بـ FORBIDDEN
  And لا يرى أي بيانات شركة B
```

---

### M01.AT02 — فرض الصلاحيات (RBAC)

```gherkin
Scenario: كاشير يحاول الوصول لتقرير مالي
  Given مستخدم بدور "Cashier"
  When يُرسل GET /finance/reports/income-statement
  Then يُرفض بـ FORBIDDEN (403)
  And لا تُرجع أي بيانات مالية

Scenario: كاشير يحاول خصم أكثر من 10%
  Given مستخدم بدور "Cashier"
  And السياسة: max_discount_cashier = 10%
  When يُرسل فاتورة بخصم 15%
  Then يُرفض بـ DISCOUNT_EXCEEDS_LIMIT
  And لا تُحفظ الفاتورة

Scenario: Branch Manager يرى فرعه فقط
  Given مستخدم بدور "Branch Manager" مرتبط بفرع بغداد
  When يُرسل GET /sales/invoices
  Then يرى فقط الفواتير التي branch_id = بغداد
  And لا يرى فواتير أربيل أو البصرة
```

---

### M01.AT03 — محرك الترقيم (Sequence Engine)

```gherkin
Scenario: ترقيم فاتورة فريد
  Given فرع "BGD" في شركة "RUA" سنة 2026
  When تُنشأ 3 فواتير متتالية
  Then تكون أرقامها: INV-RUA-BGD-2026-000001, 000002, 000003
  And لا تكرار حتى لو أُنشئت offline

Scenario: ترقيم مستقل لكل فرع
  Given فرع BGD ينشئ فاتورة وفرع ARB ينشئ فاتورة في نفس الوقت
  Then كلاهما يحصل على رقم 000001 (مستقل لكل فرع)
  And لا تعارض
```

---

### M01.AT04 — محرك التدقيق (Audit Engine)

```gherkin
Scenario: كل تعديل يُسجَّل
  Given مستخدم يعدّل سعر صنف من 1000 إلى 1200 IQD
  When يُحفظ التعديل
  Then يُنشأ سجل في audit_logs يحتوي:
    - userId
    - action: "update"
    - entity: "ProductVariant"
    - entityId
    - field: "price"
    - oldValue: 1000
    - newValue: 1200
    - timestamp
    - ipAddress

Scenario: Super Admin لا يستطيع حذف Audit records
  Given أي محاولة DELETE على جدول audit_logs
  Then ترفضها قاعدة البيانات بـ DB Rule
  And يُرسل تنبيه أمني
```

---

### M02.AT01 — إضافة صنف بمتغيراته

```gherkin
Scenario: صنف بمتغيرين
  Given قالب "قلم جاف" مع خاصية "اللون"
  When تُضاف قيمتا "أزرق" و"أحمر"
  Then يُنشأ متغيران مستقلان بـ SKUs مختلفة
  And لكل متغير باركود خاص
  And مخزون كل متغير مستقل تماماً

Scenario: باركود مكرر
  When يُحاوَل إضافة باركود موجود مسبقاً
  Then يُرفض بـ DUPLICATE_ENTRY
  And لا تُحفظ البيانات
```

---

### M03.AT01 — حركة المخزون

```gherkin
Scenario: شراء يزيد المخزون
  Given مخزون صنف = 100 وحدة بتكلفة 1000 IQD
  When يُستلم 100 وحدة إضافية بتكلفة 1300 IQD
  Then:
    - qty_on_hand = 200
    - avg_cost = (100×1000 + 100×1300) / 200 = 1150 IQD
    - سجل StockLedger يُنشأ (Append-Only)
    - قيد محاسبي: Dr مخزون / Cr موردون

Scenario: بيع لا يسمح بالرصيد السالب
  Given السياسة: prevent_negative_stock = true
  And مخزون صنف = 5 وحدات
  When يُحاوَل بيع 10 وحدات
  Then يُرفض بـ INSUFFICIENT_STOCK
  And لا تُنشأ أي سجلات
```

---

### M03.AT02 — تحويل بين مستودعات

```gherkin
Scenario: تحويل ناجح
  Given 100 وحدة في مستودع A
  When ينشئ المدير تحويل 20 وحدة إلى مستودع B ويعتمده
  Then:
    - مستودع A: qty = 80
    - مستودع B: qty = 20
    - حالة التحويل: received
    - سجلان في StockLedger: (-20) لـ A و (+20) لـ B

Scenario: لا تحويل بدون موافقة
  Given طلب تحويل بحالة Draft
  When يُحاوَل تنفيذه بدون اعتماد
  Then يُرفض بـ APPROVAL_REQUIRED
```

---

## نموذج اختبار قبول لكل ميزة جديدة

```
Feature: [اسم الميزة]
  الهدف: [ما تحله]
  الأثر المحاسبي: [إن وجد]
  
  Scenario: [السيناريو الإيجابي الرئيسي]
    Given [الحالة المبدئية]
    When [الفعل]
    Then [النتيجة المتوقعة]
    And [التأكيدات الإضافية]
  
  Scenario: [سيناريو الفشل الرئيسي]
    Given [حالة مؤهلة للفشل]
    When [الفعل]
    Then [رسالة الخطأ المتوقعة]
    And [التأكيد: لا بيانات محفوظة]
  
  Scenario: [سيناريو الحدود Edge Case]
    ...
```
