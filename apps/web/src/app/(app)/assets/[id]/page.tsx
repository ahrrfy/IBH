'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

export default function FixedAssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['fixed-asset', id],
    queryFn: () => api<any>(`/assets/${id}`),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  if (error || !data) return <div className="p-6 text-rose-600">تعذَّر تحميل الأصل</div>;

  const dep: any[] = data.depreciationEntries ?? [];
  const maint: any[] = data.maintenanceRecords ?? [];

  return (
    <div className="space-y-6">
      <header>
        <Link href="/assets" className="text-sm text-sky-700 hover:underline">← الأصول</Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-3xl font-bold">{data.nameAr}</h1>
          <StatusBadge status={data.status} />
        </div>
        <p className="text-sm text-slate-500">{data.number} · {formatDate(data.acquisitionDate)}</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Stat label="التكلفة"          value={formatIqd(data.purchaseCostIqd ?? 0)} />
        <Stat label="مجمع الإهلاك"      value={formatIqd(data.accumulatedDepIqd ?? 0)} />
        <Stat label="القيمة الدفترية"   value={formatIqd(data.bookValueIqd ?? 0)} />
        <Stat label="الإهلاك الشهري"    value={formatIqd(data.monthlyDepIqd ?? 0)} />
        <Stat label="العمر الإنتاجي"    value={`${data.usefulLifeMonths} شهر`} />
        <Stat label="طريقة الإهلاك"     value={data.depreciationMethod ?? '—'} />
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">سجل الإهلاك</h2>
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr><th className="text-start">الفترة</th><th className="text-end">المبلغ</th><th className="text-end">المجمَّع</th></tr>
          </thead>
          <tbody>
            {dep.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="py-2 font-mono">{d.periodYear}-{String(d.periodMonth).padStart(2, '0')}</td>
                <td className="text-end">{formatIqd(d.amountIqd ?? 0)}</td>
                <td className="text-end">{formatIqd(d.accumulatedAfterIqd ?? 0)}</td>
              </tr>
            ))}
            {dep.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-500">لا توجد قيود إهلاك</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">الصيانة</h2>
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr><th className="text-start">التاريخ</th><th className="text-start">الوصف</th><th className="text-end">التكلفة</th></tr>
          </thead>
          <tbody>
            {maint.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="py-2">{formatDate(m.date)}</td>
                <td>{m.description ?? '—'}</td>
                <td className="text-end">{formatIqd(m.costIqd ?? 0)}</td>
              </tr>
            ))}
            {maint.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-500">لا توجد سجلات صيانة</td></tr>}
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
