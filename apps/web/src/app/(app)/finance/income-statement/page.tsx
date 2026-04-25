'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatIqd } from '@/lib/format';

function firstOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function IncomeStatementPage() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());

  const { data, isLoading, error } = useQuery({
    queryKey: ['income-statement', from, to],
    queryFn: () => api<any>(`/finance/reports/income-statement?from=${from}&to=${to}`),
  });

  const t = data?.totals;
  const sec = data?.sections;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">قائمة الدخل</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <label>من: <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border px-3 py-1" /></label>
          <label>إلى: <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border px-3 py-1" /></label>
        </div>
      </header>

      {isLoading && <div className="text-slate-500">جارٍ التحميل…</div>}
      {error && <div className="rounded bg-rose-50 p-3 text-rose-700">تعذَّر تحميل التقرير</div>}

      {data && t && sec && (
        <>
          <Section title="الإيرادات" rows={sec.revenue ?? []} totalLabel="إجمالي الإيرادات" total={Number(t.totalRevenue)} />
          <Section title="تكلفة البضاعة المباعة" rows={sec.cogs ?? []} totalLabel="إجمالي التكاليف" total={Number(t.totalCogs)} />
          <Total label="مجمل الربح" value={Number(t.grossProfit)} />
          <Section title="المصروفات" rows={sec.expenses ?? []} totalLabel="إجمالي المصروفات" total={Number(t.totalExpenses)} />
          <Total label="صافي الدخل" value={Number(t.netIncome)} bold />
        </>
      )}
    </div>
  );
}

function Section({ title, rows, totalLabel, total }: { title: string; rows: any[]; totalLabel: string; total: number }) {
  return (
    <section className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <table className="w-full text-sm">
        <thead className="text-slate-500"><tr><th className="text-start">الكود</th><th className="text-start">الحساب</th><th className="text-end">المبلغ</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.accountId} className="border-t">
              <td className="py-2 font-mono">{r.accountCode}</td>
              <td>{r.nameAr}</td>
              <td className="text-end">{formatIqd(Number(r.amountIqd ?? 0))}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-500">لا توجد بنود</td></tr>}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-semibold"><td colSpan={2} className="py-2">{totalLabel}</td><td className="text-end">{formatIqd(total)}</td></tr>
        </tfoot>
      </table>
    </section>
  );
}

function Total({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-lg p-4 ${bold ? 'bg-sky-50 text-sky-900' : 'bg-slate-100'}`}>
      <span className={bold ? 'text-lg font-bold' : 'font-semibold'}>{label}</span>
      <span className={bold ? 'text-xl font-bold' : 'font-semibold'}>{formatIqd(value)}</span>
    </div>
  );
}
