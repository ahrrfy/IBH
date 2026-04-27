# Security Policy — Al-Ruya ERP (IBH)

> 🇸🇦 **عربي** أدناه · **English** below

---

## 🇸🇦 سياسة الأمان

نظام الرؤية العربية للموارد المؤسسية (Al-Ruya ERP) يدير عمليات مالية ومخزنية حقيقية لشركات تعمل في السوق العراقي. أي ثغرة تمسّ الفلسفات التالية تُعتبر **حرجة**:

- **F1 — الصلاحيات (RBAC + ABAC + RLS)**: تجاوز صلاحية، الوصول لبيانات فرع آخر، رؤية حقول محظورة.
- **F2 — المحاسبة (Double-Entry + Append-Only)**: إنشاء قيد غير متوازن، تعديل قيد مرحَّل، الكتابة في فترة مقفلة.
- **F3 — المخزون (Moving Weighted Average)**: حركة مخزون بدون مستند، تعديل StockLedger تاريخياً.

### كيف تبلّغ عن ثغرة (لا تفتح Issue عام)

1. **الطريقة المفضّلة** — استخدم [GitHub Private Vulnerability Reporting](https://github.com/ahrrfy/IBH/security/advisories/new) (مفعّل عبر تبويب Security).
2. **بديل** — راسل: `alarabiya2017@gmail.com` بعنوان `[SECURITY] <ملخص>`.

أرفق:
- وصف الثغرة + المسار/السطر المتأثر
- خطوات إعادة الإنتاج
- الأثر المحتمل (أي فلسفة تنتهك؟)
- مقترح إصلاح إن أمكن

### وعدنا (SLA)

| الخطوة | الحرج | المرتفع | المتوسط |
|---|---|---|---|
| الرد الأول | ≤ 24 ساعة | ≤ 48 ساعة | ≤ 5 أيام |
| تأكيد/رفض | ≤ 48 ساعة | ≤ 7 أيام | ≤ 14 يوم |
| إصلاح وتوزيع | ≤ 7 أيام | ≤ 30 يوم | ≤ 90 يوم |
| إعلان عام (advisory) | بعد التوزيع + 7 أيام | بعد التوزيع + 14 يوم | بعد التوزيع + 30 يوم |

### النطاق

| داخل النطاق | خارج النطاق |
|---|---|
| كود `apps/`, `packages/`, `infra/`, `scripts/` | هجمات DoS على VPS |
| Workflows (`.github/workflows/`) | Social engineering لمالكي الحسابات |
| Dependencies المباشرة | ثغرات في تبعيات Dev-only لا تصل production |
| Docker images المنشورة | اختبارات ضد بيئات عملاء بدون إذن مكتوب |

### Bug Bounty
لا يوجد برنامج مكافآت رسمي حالياً. سنذكرك في `governance/SECURITY_HALL_OF_FAME.md` عند نشر الإصلاح (إن رغبت).

---

## 🇬🇧 Security Policy (English)

Al-Ruya ERP runs real financial and inventory operations for businesses in Iraq. Any vulnerability that violates these foundations is considered **critical**:

- **F1 — Authorization (RBAC + ABAC + RLS)**: privilege escalation, cross-branch data access, exposure of restricted fields.
- **F2 — Accounting (Double-Entry + Append-Only)**: unbalanced journal entries, mutation of posted entries, writes into a closed period.
- **F3 — Inventory (Moving Weighted Average)**: stock movement without a source document, historical StockLedger mutation.

### How to report (do NOT open a public Issue)

1. **Preferred** — use [GitHub Private Vulnerability Reporting](https://github.com/ahrrfy/IBH/security/advisories/new).
2. **Alternative** — email `alarabiya2017@gmail.com` with subject `[SECURITY] <short summary>`.

Include: description, affected path/line, reproduction steps, impact (which philosophy is violated?), proposed fix if any.

### SLA — see table above.

### Scope — see table above.

### Recognition
No bounty program yet. With your permission we'll credit you in `governance/SECURITY_HALL_OF_FAME.md` once the fix ships.

---

_Last updated: 2026-04-26 · Maintained alongside the self-healing security loop in `.github/workflows/security-bridge.yml`._
