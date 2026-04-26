# دليل تأهيل العميل — Al-Ruya ERP

> **الجمهور:** الفرق المسؤولة عن تشغيل عميل جديد على نظام الرؤية العربية.
> **يكمل:** `governance/UAT_PLAYBOOK.md` (T29) — الـ UAT يثبت قبول النظام، هذا الملف يثبت دخوله في الاستخدام الفعلي.
> **مالك العملية:** مدير المشروع · **مدة التأهيل المعتادة:** 5–10 أيام عمل.

---

## 1. نظرة عامة على رحلة التأهيل

| المرحلة | المدة | المُخرَج |
|---|---|---|
| 1. كَيك‑أوف وتجميع المتطلبات | يوم 1 | استمارة هوية الشركة + قائمة الفروع + المستودعات |
| 2. تهيئة Tenant + Seeding | يوم 1 | شركة + مستخدم مالك + دليل حسابات + 6 أدوار افتراضية |
| 3. استيراد البيانات الأساسية | أيام 2‑3 | المنتجات + العملاء + الموردون + الأرصدة الافتتاحية |
| 4. تدريب الأدوار الرئيسية | أيام 4‑6 | 4 جلسات تدريبية موثّقة |
| 5. اختبار قبول مع المستخدم (UAT) | أيام 7‑8 | تنفيذ سيناريوهات `UAT_PLAYBOOK.md` |
| 6. القطع (Cut‑Over) للإنتاج | يوم 9 | DNS + رخصة + Backup أول |
| 7. متابعة Hyper‑Care | يوم 10+ | حضور يومي للأسبوع الأول، أسبوعي بعدها |

---

## 2. قائمة فحص ما قبل التأهيل (Pre‑Onboarding Checklist)

قبل اليوم 1 يجب التأكد من:

- [ ] توقيع العقد + تحديد عدد المستخدمين والفروع.
- [ ] تأكيد البنية المعمارية للعميل (تشغيل سحابي على VPS مشترك أو خاص — راجع `governance/ARCHITECTURE.md`).
- [ ] جمع بيانات الهوية: اسم الشركة (عربي/إنجليزي)، الشعار، رقم ضريبي، عنوان رئيسي.
- [ ] تحديد العُملة الأساسية (افتراضياً IQD) والثانوية (USD).
- [ ] الحصول على بيانات حسابات بنكية (للحقن في Chart of Accounts).
- [ ] تأكيد أن العميل قد قرأ ووقّع `governance/SECURITY.md` (إن وُجِدت نسخة عميل) أو ميثاق الأمان المختصر.

---

## 3. تجهيز Tenant جديد

> **يُنفَّذها فريق العمليات بصلاحية SuperAdmin على VPS الإنتاج.**

```bash
# 1. أنشئ Tenant (شركة) جديد عبر سكريبت السي‑آل‑آي:
ssh root@ibherp.cloud
docker compose -f /opt/al-ruya-erp/infra/docker-compose.bootstrap.yml \
  exec api node dist/scripts/create-tenant.js \
    --nameAr "شركة العميل" \
    --nameEn "Client Co" \
    --ownerEmail owner@client.iq \
    --ownerPassword "$(openssl rand -base64 18)"
# (السكريبت يطبع كلمة مرور المالك مرة واحدة — احفظها في 1Password
#  ثم احذفها من الـ shell history)

# 2. حقن دليل الحسابات الافتراضي العراقي:
docker compose ... exec api node dist/scripts/seed-iraqi-coa.js \
  --companyId <ULID-from-step-1>

# 3. إنشاء الفروع والمستودعات الأولية:
docker compose ... exec api node dist/scripts/seed-default-branches.js \
  --companyId <ULID> --mainBranchCode HQ
```

**التحقق بعد التهيئة:**
- `curl https://ibherp.cloud/api/health` → 200
- تسجيل دخول من المتصفح بحساب المالك → الوصول لـ `/dashboard` بدون 403
- `audit_logs` تحتوي حدث `tenant.created` لهذه الشركة

---

## 4. استيراد البيانات الأساسية

### 4.1 ترتيب الاستيراد (إلزامي)

```
1. Branches              → 2. Warehouses           → 3. Roles (custom)
4. Users                 → 5. Customers            → 6. Suppliers
7. Products + Variants   → 8. Price Lists          → 9. Opening Balances
10. Bank Accounts        → 11. Initial Inventory    → 12. Pending POs
```

> ⚠️ **لا تستورد قيوداً محاسبية يدوية** — الأرصدة الافتتاحية تُولِّد قيداً واحداً أحادي الجهة (Suspense Account 999)، يُسوَّى لاحقاً بقيد إغلاق رصيد افتتاحي.

### 4.2 قوالب الاستيراد المعتمدة

| النوع | القالب | عدد الحقول | تنسيق |
|---|---|---|---|
| المنتجات | `docs/training/templates/products.csv` | 14 | UTF‑8 BOM, مفصول بفاصلة |
| العملاء | `docs/training/templates/customers.csv` | 11 | UTF‑8 BOM |
| الموردون | `docs/training/templates/suppliers.csv` | 11 | UTF‑8 BOM |
| الأرصدة الافتتاحية | `docs/training/templates/opening-balances.csv` | 6 | UTF‑8 BOM |

استخدم صفحة `/settings/imports` (موقعها ضمن إعدادات النظام) لرفع كل ملف. السجل يبقى في `audit_logs` لمدة لا تنتهي.

### 4.3 تحقّق من نجاح الاستيراد

- عدد الصفوف المُستوردة = عدد الصفوف في CSV ناقص الـ duplicates (تظهر في تقرير الاستيراد).
- لا أخطاء حمراء في `/settings/imports/<jobId>`.
- ميزان المراجعة بعد الأرصدة الافتتاحية: `/finance/trial-balance` يجب أن يكون متوازناً (Suspense ≠ 0 طبيعي حتى تسوية الإقفال).

---

## 5. التدريب — 4 جلسات بحسب الدور

كل جلسة 90 دقيقة (تدريب 60 + تطبيق 30) + تسجيل فيديو.

| الجلسة | الجمهور | المخرج | الرابط |
|---|---|---|---|
| 1. أساسيات النظام والتنقل | كل المستخدمين | فهم Activity Bar + Sub‑Sidebar + الصلاحيات | [docs/training/01-orientation.md](../docs/training/01-orientation.md) |
| 2. المبيعات وPOS | الكاشير + مدير المبيعات | إصدار فاتورة + إغلاق وردية + استرجاع | [docs/training/02-sales-pos.md](../docs/training/02-sales-pos.md) |
| 3. المخزون والمشتريات | أمين المستودع + مسؤول مشتريات | استلام بضاعة + تحويلات + جرد | [docs/training/03-inventory-purchasing.md](../docs/training/03-inventory-purchasing.md) |
| 4. المالية والإغلاق الشهري | المحاسب + مدير مالي | قيود + مطابقة بنكية + إغلاق فترة | [docs/training/04-finance-close.md](../docs/training/04-finance-close.md) |

> **التسجيل:** كل جلسة تُسجَّل عبر مكالمة Google Meet ويُرفَع التسجيل لمجلد العميل في MinIO تحت `clients/<companyId>/training/`.

---

## 6. القطع للإنتاج (Cut‑Over)

اليوم 9 — يُجرى مساءً بعد ساعات العمل لتقليل التأثير.

### 6.1 قائمة فحص قبل القطع

- [ ] UAT مكتمل ومُعتمَد بتوقيع العميل (`UAT_PLAYBOOK.md` §التوقيع النهائي).
- [ ] backup أول كامل عبر `infra/scripts/backup.sh` ثم تأكيد `restic snapshots` يُظهر السنابشوت.
- [ ] DNS A record للنطاق الفرعي للعميل (إن وُجد) يشير لـ VPS.
- [ ] رخصة العميل (License Server) مولّدة وموقّعة بـ RSA‑2048، صالحة 12 شهراً.
- [ ] hardware fingerprint محفوظ في License Server للجهاز الأساسي.
- [ ] عدد المستخدمين المفعّلين في DB ≤ حدّ الترخيص.

### 6.2 بعد القطع مباشرة

- اختبار "duck": سيناريو بيع كامل (POS → فاتورة → دفع → إيصال) ينتهي بنجاح من شاشة العميل الفعلية.
- إرسال بريد ترحيب للمستخدمين المُنشَأين بحسابات NAGAR/إعادة تعيين كلمة المرور.

---

## 7. Hyper‑Care (الأسبوع الأول)

| اليوم | الإجراء | المسؤول |
|---|---|---|
| 1‑3 | حضور صباحي مباشر مع العميل (15 دقيقة) لكشف العوائق | محلل الأعمال |
| 1‑5 | فحص يومي لـ `governance/OPEN_ISSUES.md` المُفتوحة من العميل | مدير المشروع |
| 1‑7 | مراقبة `audit_logs` للأخطاء + alerts من PagerDuty/Sentry | DevOps |
| 5 | استبيان رضا العميل + مراجعة الأداء | مدير المشروع |

بعد الأسبوع الأول، تنتقل المتابعة إلى نموذج SLA الموقّع (راجع عقد العميل).

---

## 8. مراجع وأدوات

- **UAT Scenarios:** [governance/UAT_PLAYBOOK.md](./UAT_PLAYBOOK.md)
- **Architecture:** [governance/ARCHITECTURE.md](./ARCHITECTURE.md)
- **DR Runbook:** [governance/DR_RUNBOOK.md](./DR_RUNBOOK.md)
- **Backup Procedures:** `infra/scripts/backup.sh` + `infra/scripts/install-cron.sh`
- **Tenant Creation Scripts:** `apps/api/dist/scripts/` (تتضمن create‑tenant + seed‑*)
- **License Issuance:** `apps/license-server/cli/issue-license.ts`

---

## 9. سجل التأهيلات

> يُحدَّث يدوياً بعد كل تأهيل. يُحفظ آخر 12 شهراً ثم يُرحَّل لمستودع العميل.

| التاريخ | العميل | المسؤول | الحالة | ملاحظات |
|---|---|---|---|---|
| — | — | — | — | (لا تأهيلات حتى الآن) |

---

*آخر تحديث: 2026-04-26 — مسودة أولى T30. تخضع للمراجعة بعد إكمال T29 (UAT_PLAYBOOK).*
