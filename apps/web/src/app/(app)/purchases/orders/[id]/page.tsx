'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => api<any>(`/purchases/orders/${id}`),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  if (error || !data) return <div className="p-6 text-rose-600">تعذَّر تحميل أمر الشراء</div>;

  const lines: any[] = data.lines ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/purchases/orders" className="text-sm text-sky-700 hover:underline">← العودة للقائمة</Link>
          <h1 className="mt-2 text-3xl font-bold">أمر شراء {data.number}</h1>
          <p className="text-sm text-slate-500">{formatDate(data.orderDate)} · {data.supplier?.nameAr ?? '—'}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={data.status} />
          <div className="text-2xl font-bold">{formatIqd(data.totalIqd)}</div>
        </div>
      </header>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">البنود</h2>
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr><th className="text-start">المنتج</th><th className="text-end">الكمية</th><th className="text-end">المستلم</th><th className="text-end">السعر</th><th className="text-end">المجموع</th></tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="py-2">{l.variant?.nameAr ?? l.variantId}</td>
                <td className="text-end">{l.qty}</td>
                <td className="text-end">{l.qtyReceived ?? 0}</td>
                <td className="text-end">{formatIqd(l.unitPriceIqd)}</td>
                <td className="text-end">{formatIqd(l.lineTotalIqd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
