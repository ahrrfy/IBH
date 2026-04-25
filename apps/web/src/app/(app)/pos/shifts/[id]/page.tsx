'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

export default function ShiftDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['shift', id],
    queryFn: () => api<any>(`/pos/shifts/${id}`),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  if (error || !data) return <div className="p-6 text-rose-600">تعذَّر تحميل الوردية</div>;

  const receipts: any[] = data.receipts ?? [];
  const total = receipts.reduce((a, r) => a + Number(r.totalIqd ?? 0), 0);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/pos/shifts" className="text-sm text-sky-700 hover:underline">← الورديات</Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-3xl font-bold">وردية {data.number}</h1>
          <StatusBadge status={data.status} />
        </div>
        <p className="text-sm text-slate-500">{data.cashier?.fullNameAr ?? '—'} · {formatDate(data.openedAt)}</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Stat label="نقد افتتاحي"   value={formatIqd(data.openingCashIqd ?? 0)} />
        <Stat label="إجمالي المبيعات" value={formatIqd(total)} />
        <Stat label="عدد الإيصالات"   value={String(receipts.length)} />
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">الإيصالات</h2>
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr><th className="text-start">الرقم</th><th className="text-start">الوقت</th><th className="text-end">المجموع</th></tr>
          </thead>
          <tbody>
            {receipts.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-2 font-mono">{r.number}</td>
                <td>{formatDate(r.receiptDate)}</td>
                <td className="text-end">{formatIqd(r.totalIqd)}</td>
              </tr>
            ))}
            {receipts.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-500">لا توجد إيصالات</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
