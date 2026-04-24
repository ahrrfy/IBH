تحقق من صحة النظام — فحص شامل لكل القيود والضمانات.

نفّذ الفحوصات التالية وأبلغ بالنتائج:

## 1. فحص قواعد البيانات (Database Guards)

تحقق إن الملفات التالية موجودة وصحيحة:

### Double-Entry (F2)
- [ ] Prisma schema: `journal_entries` فيه CHECK constraint لـ `total_debit = total_credit`
- [ ] `journal_entry_lines` ما فيه CASCADE delete
- [ ] ما يوجد أي raw SQL يعمل INSERT في journal_entries بدون transaction

### Append-Only (F2 + F3)
- [ ] `stock_ledger` ما يوجد عليه update/delete في أي repository
- [ ] `audit_logs` ما يوجد عليه update/delete في أي repository
- [ ] `journal_entry_lines` ما يوجد عليه update/delete

### RLS (F1)
- [ ] كل جدول فيه `company_id` عليه `ENABLE ROW LEVEL SECURITY`
- [ ] كل جدول فيه `branch_id` عليه policy يتحقق من branch

### No Negative Stock (F3)
- [ ] `inventory_balances` عليه CHECK constraint لـ `qty_on_hand >= 0`

## 2. فحص البنية (Architecture Guards)

- [ ] لا يوجد circular dependency بين modules
- [ ] كل module يتبع النمط القياسي (controller → service → repository)
- [ ] لا يوجد any type في أي ملف
- [ ] كل DTO يستخدم Zod validation
- [ ] كل endpoint فيه Auth guard
- [ ] كل Service method فيه Audit log

## 3. فحص الاختبارات (Test Guards)

- [ ] كل module فيه tests/ directory
- [ ] كل test file يشتغل بدون أخطاء
- [ ] يوجد test للـ Double-Entry constraint
- [ ] يوجد test للـ State Machine transitions
- [ ] يوجد test للـ RLS policy (integration)

## 4. فحص الحوكمة (Governance Guards)

- [ ] `SESSION_HANDOFF.md` محدّث (تاريخ اليوم أو أمس)
- [ ] `MODULE_STATUS_BOARD.md` يعكس الواقع الفعلي
- [ ] `DECISIONS_LOG.md` فيه آخر القرارات
- [ ] `OPEN_ISSUES.md` ما فيه issues قديمة منسية

## النتيجة:

اطبع:

```
╔══════════════════════════════════════════════╗
║  🔍 نتيجة الفحص الشامل                      ║
╠══════════════════════════════════════════════╣
║  قواعد البيانات:  ✅ X/X  أو  ❌ X/X       ║
║  البنية التقنية:  ✅ X/X  أو  ❌ X/X       ║
║  الاختبارات:     ✅ X/X  أو  ❌ X/X       ║
║  الحوكمة:        ✅ X/X  أو  ❌ X/X       ║
╠══════════════════════════════════════════════╣
║  🟢 مجتاز  أو  🟡 يحتاج إصلاح  أو  🔴 حرج  ║
╚══════════════════════════════════════════════╝
```

لو فيه ❌ — اكتب المشكلة + الملف + اقتراح الإصلاح.
