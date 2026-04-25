'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => api<any>(`/crm/leads/${id}`),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  if (error || !data) return <div className="p-6 text-rose-600">تعذَّر تحميل العميل المحتمل</div>;

  const activities: any[] = data.activities ?? [];

  return (
    <div className="space-y-6">
      <header>
        <Link href="/crm/leads" className="text-sm text-sky-700 hover:underline">← العودة للقائمة</Link>
        <h1 className="mt-2 text-3xl font-bold">{data.nameAr}</h1>
        <p className="text-sm text-slate-500">{data.source ?? '—'} · {data.stage ?? '—'}</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">تفاصيل</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">الهاتف</dt><dd>{data.phone ?? '—'}</dd>
            <dt className="text-slate-500">البريد</dt><dd>{data.email ?? '—'}</dd>
            <dt className="text-slate-500">الشركة</dt><dd>{data.companyName ?? '—'}</dd>
            <dt className="text-slate-500">المسؤول</dt><dd>{data.assignedTo?.fullNameAr ?? '—'}</dd>
          </dl>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">آخر الأنشطة</h2>
          {activities.length === 0 ? (
            <p className="text-sm text-slate-500">لا توجد أنشطة بعد</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {activities.slice(0, 5).map((a) => (
                <li key={a.id} className="flex justify-between border-b pb-2">
                  <span>{a.type}: {a.notes}</span>
                  <span className="text-slate-500">{formatDate(a.activityDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
