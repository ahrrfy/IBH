'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatIqd } from '@/lib/format';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api<any>(`/sales/customers/${id}`),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  if (error || !data) return <div className="p-6 text-rose-600">تعذَّر تحميل بيانات العميل</div>;

  return (
    <div className="space-y-6">
      <header>
        <Link href="/sales/customers" className="text-sm text-sky-700 hover:underline">← العودة للقائمة</Link>
        <h1 className="mt-2 text-3xl font-bold">{data.nameAr}</h1>
        <p className="text-sm text-slate-500">{data.code} · {data.type ?? '—'}</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">معلومات الاتصال</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">الهاتف</dt><dd>{data.phone ?? '—'}</dd>
            <dt className="text-slate-500">البريد</dt><dd>{data.email ?? '—'}</dd>
            <dt className="text-slate-500">العنوان</dt><dd>{data.address ?? '—'}</dd>
          </dl>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">الرصيد</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">حد الائتمان</dt><dd>{formatIqd(data.creditLimitIqd ?? 0)}</dd>
            <dt className="text-slate-500">الرصيد الحالي</dt><dd>{formatIqd(data.creditBalanceIqd ?? 0)}</dd>
            <dt className="text-slate-500">نقاط الولاء</dt><dd>{data.loyaltyPoints ?? 0}</dd>
          </dl>
        </div>
      </section>
    </div>
  );
}
