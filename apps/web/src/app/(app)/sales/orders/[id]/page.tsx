'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

const CONVERTIBLE_STATUSES = ['confirmed', 'partially_delivered'];

export default function SalesOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['sales-order', id],
    queryFn: () => api<any>(`/sales/orders/${id}`),
    enabled: !!id,
  });

  const convert = useMutation({
    mutationFn: async () => {
      const lines = (data?.lines ?? []).map((l: any) => ({
        variantId: l.variantId,
        qty: l.qty,
        unitPriceIqd: l.unitPriceIqd,
        salesOrderLineId: l.id,
      }));
      return api<any>(`/sales/invoices/from-order/${id}`, {
        method: 'POST',
        body: { lines },
      });
    },
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: ['sales-order', id] });
      if (invoice?.id) router.push(`/sales/invoices/${invoice.id}`);
    },
    onError: (e: unknown) => {
      setErrorMsg(e instanceof ApiError ? e.messageAr : 'تعذّر تحويل الطلب لفاتورة');
    },
  });

  if (isLoading) return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  if (error || !data) return <div className="p-6 text-rose-600">تعذَّر تحميل أمر البيع</div>;

  const lines: any[] = data.lines ?? [];
  const canConvert = CONVERTIBLE_STATUSES.includes(data.status);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/sales/orders" className="text-sm text-sky-700 hover:underline">← العودة للقائمة</Link>
          <h1 className="mt-2 text-3xl font-bold">أمر بيع {data.number}</h1>
          <p className="text-sm text-slate-500">{formatDate(data.orderDate)} · {data.customer?.nameAr ?? '—'}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={data.status} />
          <div className="text-2xl font-bold">{formatIqd(data.totalIqd)}</div>
          {canConvert && (
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                if (window.confirm('تأكيد تحويل هذا الطلب إلى فاتورة بيع؟')) {
                  convert.mutate();
                }
              }}
              disabled={convert.isPending || lines.length === 0}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {convert.isPending ? 'جارٍ الإصدار…' : 'تحويل إلى فاتورة'}
            </button>
          )}
        </div>
      </header>

      {errorMsg && (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {errorMsg}
        </div>
      )}

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
    </div>
  );
}
