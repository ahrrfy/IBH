'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatIqd } from '@/lib/format';

const TITLES: Record<string, string> = {
  'sales-summary':     'ملخص المبيعات',
  'sales-by-product':  'المبيعات حسب المنتج',
  'sales-by-customer': 'المبيعات حسب العميل',
  'sales-by-cashier':  'المبيعات حسب الكاشير',
  'sales-by-payment':  'المبيعات حسب طريقة الدفع',
  'top-products':      'أفضل المنتجات',
  'slow-moving':       'المنتجات الراكدة',
  'low-stock':         'نقص المخزون',
  'stock-valuation':   'تقييم المخزون',
  'ar-aging':          'تقادم الذمم المدينة',
  'ap-aging':          'تقادم الذمم الدائنة',
  'gift-profit':       'هامش ربح الهدايا',
  'cash-movement':     'حركة الصندوق',
  'shift-variance':    'فروقات الورديات',
  'discount-impact':   'أثر الخصومات',
  'returns-analysis':  'تحليل المرتجعات',
};

const RANGE_REPORTS = new Set([
  'sales-summary', 'sales-by-product', 'sales-by-customer', 'sales-by-cashier',
  'sales-by-payment', 'top-products', 'gift-profit', 'cash-movement',
  'shift-variance', 'discount-impact', 'returns-analysis',
]);
const ASOF_REPORTS = new Set(['stock-valuation', 'ar-aging', 'ap-aging']);

function thirtyDaysAgo() { return new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10); }
function today() { return new Date().toISOString().slice(0, 10); }

export default function GenericReportPage() {
  const { slug } = useParams<{ slug: string }>();
  const title = TITLES[slug] ?? slug;
  const useRange = RANGE_REPORTS.has(slug);
  const useAsOf = ASOF_REPORTS.has(slug);

  const [from, setFrom] = useState(thirtyDaysAgo());
  const [to, setTo] = useState(today());
  const [asOf, setAsOf] = useState(today());

  const qs = useRange ? `?from=${from}&to=${to}` : useAsOf ? `?asOf=${asOf}` : '';

  const { data, isLoading, error } = useQuery({
    queryKey: ['report', slug, qs],
    queryFn: () => api<any>(`/reports/${slug}${qs}`),
    enabled: !!slug,
  });

  const rows: any[] =
    Array.isArray(data) ? data :
    Array.isArray(data?.rows) ? data.rows :
    Array.isArray(data?.items) ? data.items :
    Array.isArray(data?.lines) ? data.lines :
    Array.isArray(data?.products) ? data.products :
    Array.isArray(data?.customers) ? data.customers :
    [];

  const columns = rows.length > 0 ? Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object') : [];

  return (
    <div className="space-y-6">
      <header>
        <Link href="/reports" className="text-sm text-sky-700 hover:underline">← التقارير</Link>
        <h1 className="mt-2 text-3xl font-bold">{title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          {useRange && (
            <>
              <label>من: <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border px-3 py-1" /></label>
              <label>إلى: <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border px-3 py-1" /></label>
            </>
          )}
          {useAsOf && (
            <label>كما في: <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="rounded border px-3 py-1" /></label>
          )}
        </div>
      </header>

      {isLoading && <div className="text-slate-500">جارٍ التحميل…</div>}
      {error && <div className="rounded bg-rose-50 p-3 text-rose-700">تعذَّر تحميل التقرير</div>}

      {data && rows.length > 0 && (
        <section className="rounded-lg bg-white p-4 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500">
                <tr>{columns.map((c) => <th key={c} className="text-start py-2">{c}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    {columns.map((c) => {
                      const v = r[c];
                      const isMoney = /Iqd$|Usd$|amount|total|cost|price|balance|salary|net|gross/i.test(c);
                      return (
                        <td key={c} className="py-2">
                          {typeof v === 'number' && isMoney ? formatIqd(v) :
                           v === null || v === undefined ? '—' :
                           v instanceof Date ? new Date(v).toLocaleDateString('ar-IQ') :
                           String(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data && rows.length === 0 && !isLoading && (
        <div className="rounded-lg bg-white p-8 text-center text-slate-500 shadow-sm">لا توجد بيانات</div>
      )}

      {data && typeof data === 'object' && !Array.isArray(data) && (
        <details className="rounded-lg bg-slate-50 p-4 text-xs">
          <summary className="cursor-pointer font-semibold text-slate-700">JSON الكامل</summary>
          <pre className="mt-2 overflow-x-auto">{JSON.stringify(data, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
