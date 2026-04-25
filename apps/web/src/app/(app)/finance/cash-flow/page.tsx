'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatIqd } from '@/lib/format';

function firstOfMonth() { return new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10); }
function today() { return new Date().toISOString().slice(0, 10); }

export default function CashFlowPage() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());

  const { data, isLoading, error } = useQuery({
    queryKey: ['cash-flow', from, to],
    queryFn: () => api<any>(`/finance/reports/cash-flow?from=${from}&to=${to}`),
  });

  const sec = data?.sections;
  const t = data?.totals;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">قائمة التدفقات النقدية</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <label>من: <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border px-3 py-1" /></label>
          <label>إلى: <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border px-3 py-1" /></label>
        </div>
      </header>

      {isLoading && <div className="text-slate-500">جارٍ التحميل…</div>}
      {error && <div className="rounded bg-rose-50 p-3 text-rose-700">تعذَّر التحميل</div>}

      {data && sec && (
        <>
          <Section title="الأنشطة التشغيلية" rows={sec.operating ?? []} total={Number(t?.netOperating ?? 0)} />
          <Section title="الأنشطة الاستثمارية" rows={sec.investing ?? []} total={Number(t?.netInvesting ?? 0)} />
          <Section title="الأنشطة التمويلية" rows={sec.financing ?? []} total={Number(t?.netFinancing ?? 0)} />
          <div className="rounded-lg bg-sky-50 p-4 flex items-center justify-between text-sky-900">
            <span className="text-lg font-bold">صافي التغير في النقد</span>
            <span className="text-xl font-bold">{formatIqd(Number(t?.netChange ?? 0))}</span>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, rows, total }: { title: string; rows: any[]; total: number }) {
  return (
    <section className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <table className="w-full text-sm">
        <thead className="text-slate-500"><tr><th className="text-start">الكود</th><th className="text-start">الحساب</th><th className="text-end">المبلغ</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.accountId ?? r.accountCode} className="border-t">
              <td className="py-2 font-mono">{r.accountCode}</td>
              <td>{r.nameAr}</td>
              <td className="text-end">{formatIqd(Number(r.amountIqd ?? 0))}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-500">—</td></tr>}
        </tbody>
        <tfoot><tr className="border-t-2 font-semibold"><td colSpan={2} className="py-2">صافي {title}</td><td className="text-end">{formatIqd(total)}</td></tr></tfoot>
      </table>
    </section>
  );
}
