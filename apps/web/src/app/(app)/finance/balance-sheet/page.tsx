'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatIqd } from '@/lib/format';

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));

  const { data, isLoading, error } = useQuery({
    queryKey: ['balance-sheet', asOf],
    queryFn: () => api<any>(`/finance/reports/balance-sheet?asOf=${asOf}`),
  });

  const t = data?.totals;
  const sec = data?.sections;
  const balanced = !!t?.balanced;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">قائمة المركز المالي</h1>
        <div className="mt-3 flex items-center gap-3">
          <label className="text-sm">كما في:</label>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="rounded border px-3 py-1 text-sm" />
          {data && (
            <span className={balanced ? 'rounded bg-emerald-100 px-3 py-1 text-emerald-700' : 'rounded bg-rose-100 px-3 py-1 text-rose-700 font-bold'}>
              {balanced ? '✓ متوازن' : '⚠ غير متوازن'}
            </span>
          )}
        </div>
      </header>

      {isLoading && <div className="text-slate-500">جارٍ التحميل…</div>}
      {error && <div className="rounded bg-rose-50 p-3 text-rose-700">تعذَّر تحميل التقرير</div>}

      {data && sec && t && (
        <div className="grid gap-4 md:grid-cols-2">
          <Section title="الأصول" rows={sec.assets ?? []} totalLabel="إجمالي الأصول" total={Number(t.totalAssets)} />
          <div className="space-y-4">
            <Section title="الخصوم" rows={sec.liabilities ?? []} totalLabel="إجمالي الخصوم" total={Number(t.totalLiabilities)} />
            <Section title="حقوق الملكية" rows={sec.equity ?? []} totalLabel="إجمالي حقوق الملكية" total={Number(t.totalEquity)} />
            <div className="flex items-center justify-between rounded-lg bg-slate-100 p-4">
              <span className="font-semibold">الأرباح المحتجزة (YTD)</span>
              <span>{formatIqd(Number(t.retainedEarningsYTD ?? 0))}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-sky-50 p-4 text-sky-900">
              <span className="font-bold">إجمالي الخصوم وحقوق الملكية</span>
              <span className="font-bold">{formatIqd(Number(t.liabilitiesAndEquity ?? 0))}</span>
            </div>
          </div>
        </div>
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
          {rows.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-500">—</td></tr>}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-semibold"><td colSpan={2} className="py-2">{totalLabel}</td><td className="text-end">{formatIqd(total)}</td></tr>
        </tfoot>
      </table>
    </section>
  );
}
