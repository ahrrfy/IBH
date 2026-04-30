'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd } from '@/lib/format';

export default function LeadsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['leads'],
    queryFn: () => api<any>('/crm/leads'),
  });
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">العملاء المحتملون</h1>
        <Link href="/crm/leads/new" className="rounded bg-sky-700 px-4 py-2 text-white">+ عميل محتمل</Link>
      </header>
      <DataTable
        columns={[
          { key: 'name', header: 'الاسم', accessor: (r: any) => <Link href={`/crm/leads/${r.id}`} className="text-sky-700 hover:underline">{r.nameAr}</Link> },
          { key: 'phone', header: 'الهاتف', accessor: (r: any) => r.phone ?? '—' },
          { key: 'source', header: 'المصدر', accessor: (r: any) => r.source ?? '—' },
          { key: 'value', header: 'القيمة المتوقعة', accessor: (r: any) => r.estimatedValueIqd ? formatIqd(r.estimatedValueIqd) : '—', align: 'end' },
          {
            key: 'score',
            header: 'التقييم',
            accessor: (r: any) => (
              <div className="flex items-center gap-2">
                <div className="h-2 w-16 rounded bg-slate-200">
                  <div className="h-full rounded bg-sky-600" style={{ width: `${r.score}%` }} />
                </div>
                <span className="text-xs">{r.score}</span>
              </div>
            ),
          },
          { key: 'status', header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error ? 'خطأ' : null}
        onRetry={() => refetch()}
        getRowKey={(r: any) => r.id}
        exportFilename="leads"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="leads"
        columnToggle
        densityToggle
        printable
      />
    </div>
  );
}
