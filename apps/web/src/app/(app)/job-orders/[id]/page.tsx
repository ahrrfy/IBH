'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

export default function JobOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['job-order', id],
    queryFn: () => api<any>(`/job-orders/${id}`),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  if (error || !data) return <div className="p-6 text-rose-600">تعذَّر تحميل الطلب</div>;

  const bom: any[] = data.bomLines ?? [];
  const stages: any[] = data.stages ?? [];

  return (
    <div className="space-y-6">
      <header>
        <Link href="/job-orders" className="text-sm text-sky-700 hover:underline">← طلبات التصنيع</Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-3xl font-bold">{data.productName}</h1>
          <StatusBadge status={data.status} />
        </div>
        <p className="text-sm text-slate-500">{data.number} · تسليم: {formatDate(data.expectedDate)}</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Stat label="الكمية"            value={String(data.quantity)} />
        <Stat label="السعر للوحدة"      value={formatIqd(data.pricePerUnitIqd ?? 0)} />
        <Stat label="إجمالي السعر"      value={formatIqd(data.totalPriceIqd ?? 0)} />
        <Stat label="التكلفة المقدّرة"  value={formatIqd(data.estimatedCostIqd ?? 0)} />
        <Stat label="التكلفة الفعلية"   value={formatIqd(data.actualCostIqd ?? 0)} />
        <Stat label="العربون"            value={formatIqd(data.depositIqd ?? 0)} />
      </section>

      {data.description && (
        <section className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold">الوصف</h2>
          <p className="whitespace-pre-wrap text-sm">{data.description}</p>
        </section>
      )}

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">قائمة المواد (BOM)</h2>
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="text-start">الوصف</th>
              <th className="text-end">المطلوب</th>
              <th className="text-end">المُستهلك</th>
              <th className="text-end">التكلفة</th>
            </tr>
          </thead>
          <tbody>
            {bom.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="py-2">{b.description}</td>
                <td className="text-end">{b.qtyRequired}</td>
                <td className="text-end">{b.qtyConsumed}</td>
                <td className="text-end">{formatIqd(b.totalCostIqd ?? 0)}</td>
              </tr>
            ))}
            {bom.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-slate-500">لا يوجد BOM</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">المراحل</h2>
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr><th className="text-start">المرحلة</th><th className="text-start">الحالة</th><th className="text-start">تاريخ الاكتمال</th></tr>
          </thead>
          <tbody>
            {stages.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="py-2">{s.name}</td>
                <td><StatusBadge status={s.status} /></td>
                <td>{s.completedAt ? formatDate(s.completedAt) : '—'}</td>
              </tr>
            ))}
            {stages.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-500">لا توجد مراحل</td></tr>}
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
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}
