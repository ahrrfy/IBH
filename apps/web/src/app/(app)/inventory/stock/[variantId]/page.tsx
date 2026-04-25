'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatIqd, formatDate } from '@/lib/format';

export default function StockLedgerPage() {
  const { variantId } = useParams<{ variantId: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['stock-ledger', variantId],
    queryFn: () => api<any>(`/inventory/stock/${variantId}/ledger`),
    enabled: !!variantId,
  });

  if (isLoading) return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  if (error || !data) return <div className="p-6 text-rose-600">تعذَّر تحميل سجل المخزون</div>;

  const entries: any[] = data.entries ?? [];

  return (
    <div className="space-y-6">
      <header>
        <Link href="/inventory/stock" className="text-sm text-sky-700 hover:underline">← المخزون</Link>
        <h1 className="mt-2 text-3xl font-bold">سجل حركة: {data.variant?.nameAr ?? variantId}</h1>
        <p className="text-sm text-slate-500">{data.variant?.sku} · متوسط التكلفة: {formatIqd(data.movingAverageIqd ?? 0)}</p>
      </header>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="text-start">التاريخ</th>
              <th className="text-start">المرجع</th>
              <th className="text-start">الاتجاه</th>
              <th className="text-end">الكمية</th>
              <th className="text-end">التكلفة</th>
              <th className="text-end">الرصيد بعد</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="py-2">{formatDate(e.createdAt)}</td>
                <td className="font-mono text-xs">{e.referenceType} · {e.referenceId.slice(-6)}</td>
                <td className={e.direction === 'in' ? 'text-emerald-700' : 'text-rose-700'}>
                  {e.direction === 'in' ? 'دخول' : 'خروج'}
                </td>
                <td className="text-end">{e.qty}</td>
                <td className="text-end">{formatIqd(e.unitCostIqd ?? 0)}</td>
                <td className="text-end">{e.balanceAfterQty ?? '—'}</td>
              </tr>
            ))}
            {entries.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-slate-500">لا توجد حركات</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
