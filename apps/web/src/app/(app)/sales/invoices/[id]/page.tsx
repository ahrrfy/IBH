'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

export default function SalesInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['sales-invoice', id],
    queryFn: () => api<any>(`/sales/invoices/${id}`),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  if (error || !data) return <div className="p-6 text-rose-600">تعذَّر تحميل الفاتورة</div>;

  const inv = data;
  const lines: any[] = inv.lines ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/sales/invoices" className="text-sm text-sky-700 hover:underline">← العودة للقائمة</Link>
          <h1 className="mt-2 text-3xl font-bold">فاتورة {inv.number}</h1>
          <p className="text-sm text-slate-500">{formatDate(inv.invoiceDate)} · {inv.customer?.nameAr ?? '—'}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={inv.status} />
          <div className="text-2xl font-bold">{formatIqd(inv.totalIqd)}</div>
          {inv.balanceIqd ? <div className="text-sm text-slate-500">المتبقي: {formatIqd(inv.balanceIqd)}</div> : null}
        </div>
      </header>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">البنود</h2>
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr><th className="text-start">المنتج</th><th className="text-end">الكمية</th><th className="text-end">السعر</th><th className="text-end">المجموع</th></tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="py-2">{l.variant?.nameAr ?? l.variantId}</td>
                <td className="text-end">{l.qty}</td>
                <td className="text-end">{formatIqd(l.unitPriceIqd)}</td>
                <td className="text-end">{formatIqd(l.lineTotalIqd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">المجاميع</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-slate-500">المجموع الفرعي</dt><dd className="text-end">{formatIqd(inv.subtotalIqd)}</dd>
          <dt className="text-slate-500">الخصم</dt><dd className="text-end">{formatIqd(inv.discountIqd ?? 0)}</dd>
          <dt className="text-slate-500">الضريبة</dt><dd className="text-end">{formatIqd(inv.taxIqd ?? 0)}</dd>
          <dt className="font-semibold">الإجمالي</dt><dd className="text-end font-semibold">{formatIqd(inv.totalIqd)}</dd>
        </dl>
      </section>
    </div>
  );
}
