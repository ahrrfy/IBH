'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatIqd, formatDate } from '@/lib/format';

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => api<any>(`/hr/employees/${id}`),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  if (error || !data) return <div className="p-6 text-rose-600">تعذَّر تحميل بيانات الموظف</div>;

  return (
    <div className="space-y-6">
      <header>
        <Link href="/hr/employees" className="text-sm text-sky-700 hover:underline">← العودة للقائمة</Link>
        <h1 className="mt-2 text-3xl font-bold">{data.fullNameAr}</h1>
        <p className="text-sm text-slate-500">{data.employeeNumber} · {data.jobTitleAr ?? '—'}</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">معلومات أساسية</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">القسم</dt><dd>{data.department?.nameAr ?? '—'}</dd>
            <dt className="text-slate-500">تاريخ التوظيف</dt><dd>{data.hireDate ? formatDate(data.hireDate) : '—'}</dd>
            <dt className="text-slate-500">الحالة</dt><dd>{data.status ?? '—'}</dd>
            <dt className="text-slate-500">الهاتف</dt><dd>{data.phone ?? '—'}</dd>
          </dl>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">الراتب</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">الراتب الأساسي</dt><dd>{formatIqd(data.baseSalaryIqd ?? 0)}</dd>
            <dt className="text-slate-500">الدرجة</dt><dd>{data.payGrade?.code ?? '—'}</dd>
          </dl>
        </div>
      </section>
    </div>
  );
}
