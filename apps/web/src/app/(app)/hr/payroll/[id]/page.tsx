'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

export default function PayrollRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['payroll-run', id],
    queryFn: () => api<any>(`/hr/payroll/${id}`),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  if (error || !data) return <div className="p-6 text-rose-600">تعذَّر تحميل دورة الرواتب</div>;

  const lines: any[] = data.lines ?? [];
  const totalGross = lines.reduce((a, l) => a + Number(l.grossIqd ?? 0), 0);
  const totalNet   = lines.reduce((a, l) => a + Number(l.netIqd   ?? 0), 0);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/hr/payroll" className="text-sm text-sky-700 hover:underline">← العودة</Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-3xl font-bold">دورة رواتب {data.periodMonth}/{data.periodYear}</h1>
          <StatusBadge status={data.status} />
        </div>
        <p className="text-sm text-slate-500">{formatDate(data.payDate)} · {lines.length} موظف</p>
      </header>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr><th className="text-start">الموظف</th><th className="text-end">الإجمالي</th><th className="text-end">الضريبة</th><th className="text-end">الضمان</th><th className="text-end">الصافي</th></tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="py-2">{l.employee?.fullNameAr ?? l.employeeId}</td>
                <td className="text-end">{formatIqd(l.grossIqd)}</td>
                <td className="text-end">{formatIqd(l.incomeTaxIqd ?? 0)}</td>
                <td className="text-end">{formatIqd(l.socialSecurityIqd ?? 0)}</td>
                <td className="text-end font-semibold">{formatIqd(l.netIqd)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 font-semibold">
            <tr><td>المجموع</td><td className="text-end">{formatIqd(totalGross)}</td><td colSpan={2}></td><td className="text-end">{formatIqd(totalNet)}</td></tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}
