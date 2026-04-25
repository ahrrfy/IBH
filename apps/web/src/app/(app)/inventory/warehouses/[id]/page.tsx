'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatIqd } from '@/lib/format';

export default function WarehouseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['warehouse', id],
    queryFn: () => api<any>(`/inventory/warehouses/${id}`),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  if (error || !data) return <div className="p-6 text-rose-600">تعذَّر تحميل المستودع</div>;

  const balances: any[] = data.balances ?? [];

  return (
    <div className="space-y-6">
      <header>
        <Link href="/inventory/warehouses" className="text-sm text-sky-700 hover:underline">← العودة للقائمة</Link>
        <h1 className="mt-2 text-3xl font-bold">{data.nameAr}</h1>
        <p className="text-sm text-slate-500">{data.code} · {data.type ?? '—'}</p>
      </header>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">أرصدة المخزون</h2>
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr><th className="text-start">المنتج</th><th className="text-end">الكمية</th><th className="text-end">متوسط التكلفة</th></tr>
          </thead>
          <tbody>
            {balances.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="py-2">{b.variant?.nameAr ?? b.variantId}</td>
                <td className="text-end">{b.qtyOnHand}</td>
                <td className="text-end">{formatIqd(b.movingAverageIqd ?? 0)}</td>
              </tr>
            ))}
            {balances.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-500">لا توجد أرصدة</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
