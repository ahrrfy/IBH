'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

const MONTH_LABELS_AR = [
  'كانون الثاني (يناير)',
  'شباط (فبراير)',
  'آذار (مارس)',
  'نيسان (أبريل)',
  'أيار (مايو)',
  'حزيران (يونيو)',
  'تموز (يوليو)',
  'آب (أغسطس)',
  'أيلول (سبتمبر)',
  'تشرين الأول (أكتوبر)',
  'تشرين الثاني (نوفمبر)',
  'كانون الأول (ديسمبر)',
];

export default function NewPayrollRunPage() {
  const router = useRouter();
  const today = new Date();
  // Default to previous month — common payroll cadence (run after period closes).
  const defaultMonth = today.getMonth() === 0 ? 12 : today.getMonth();
  const defaultYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();

  const [periodYear, setPeriodYear] = useState<number>(defaultYear);
  const [periodMonth, setPeriodMonth] = useState<number>(defaultMonth);
  const [branchId, setBranchId] = useState('');
  const [employeeIdsRaw, setEmployeeIdsRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const yearOptions: number[] = [];
  for (let y = today.getFullYear() + 1; y >= today.getFullYear() - 5; y--) yearOptions.push(y);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const employeeIds = employeeIdsRaw
        .split(/[,\s\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const created = await api<{ id: string }>('/hr/payroll/runs', {
        method: 'POST',
        body: {
          periodYear,
          periodMonth,
          branchId: branchId.trim() || undefined,
          employeeIds: employeeIds.length > 0 ? employeeIds : undefined,
        },
      });
      // Backend returns status='calculated' immediately — go straight to payslips
      // so the user can review computed amounts before review/approve/post.
      router.push(`/hr/payroll/${created.id}/payslips`);
    } catch (e: any) {
      setErr(e?.messageAr ?? 'تعذَّر إنشاء دورة الرواتب');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <Link href="/hr/payroll" className="text-sm text-sky-700 hover:underline">← مسيرات الرواتب</Link>
        <h1 className="mt-2 text-3xl font-bold">دورة رواتب جديدة</h1>
        <p className="text-sm text-slate-500 mt-1">
          اختر الفترة لحساب رواتب الموظفين. يمكنك تحديد فرع أو موظفين معيّنين، أو ترك الحقول فارغة لتشمل الكل.
        </p>
      </header>

      <section className="grid gap-4 rounded-lg bg-white p-5 shadow-sm md:grid-cols-2">
        <label className="block">
          <span className="text-sm text-slate-500">السنة</span>
          <select
            className="mt-1 w-full rounded border px-3 py-2"
            value={periodYear}
            onChange={(e) => setPeriodYear(Number(e.target.value))}
            disabled={busy}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-slate-500">الشهر</span>
          <select
            className="mt-1 w-full rounded border px-3 py-2"
            value={periodMonth}
            onChange={(e) => setPeriodMonth(Number(e.target.value))}
            disabled={busy}
          >
            {MONTH_LABELS_AR.map((label, i) => (
              <option key={i + 1} value={i + 1}>{label}</option>
            ))}
          </select>
        </label>

        <label className="block md:col-span-2">
          <span className="text-sm text-slate-500">الفرع (اختياري — اتركه فارغاً للكل)</span>
          <input
            className="mt-1 w-full rounded border px-3 py-2 font-mono"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            placeholder="branch ULID"
            disabled={busy}
          />
        </label>

        <label className="block md:col-span-2">
          <span className="text-sm text-slate-500">
            موظفون محددون (اختياري — IDs مفصولة بفاصلة أو سطر جديد)
          </span>
          <textarea
            className="mt-1 w-full rounded border px-3 py-2 font-mono text-xs min-h-[80px]"
            value={employeeIdsRaw}
            onChange={(e) => setEmployeeIdsRaw(e.target.value)}
            placeholder="01H..., 01H..."
            disabled={busy}
          />
        </label>
      </section>

      <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
        <strong>ملاحظة:</strong> سيتم حساب الرواتب فوراً عند الحفظ (الحالة تصبح <span className="font-mono">calculated</span>).
        يمكنك مراجعة كشوف الرواتب قبل الاعتماد. لا يُنشأ قيد محاسبي إلا عند الترحيل (<span className="font-mono">post</span>).
      </div>

      {err && <div className="rounded bg-rose-50 p-3 text-sm text-rose-700">{err}</div>}

      <div className="flex justify-end gap-2">
        <Link href="/hr/payroll" className="rounded border px-4 py-2">إلغاء</Link>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {busy ? 'جارٍ الحساب…' : 'إنشاء وحساب'}
        </button>
      </div>
    </div>
  );
}
