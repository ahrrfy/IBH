'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd } from '@/lib/format';
import { Plus } from 'lucide-react';

export default function PayrollPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: () => api<any>('/hr/payroll/runs'),
  });
  const rows: any[] = data?.items ?? (Array.isArray(data) ? data : []);
  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">مسيرات الرواتب</h1>
        <Link href="/hr/payroll/new" className="btn-primary btn-sm">
          <Plus className="h-3.5 w-3.5" />
          دورة جديدة
        </Link>
      </header>
      <DataTable
        columns={[
          {
            key: 'number', header: 'الرقم',
            accessor: (r: any) => (
              <Link href={`/hr/payroll/${r.id}/payslips`} className="font-medium text-sky-700 hover:underline num-latin">
                {r.number}
              </Link>
            ),
          },
          { key: 'period', header: 'الفترة', accessor: (r: any) => <span className="num-latin">{r.periodMonth}/{r.periodYear}</span> },
          { key: 'gross', header: 'الإجمالي', accessor: (r: any) => formatIqd(r.totalGrossIqd), align: 'end' },
          { key: 'tax', header: 'الضريبة', accessor: (r: any) => formatIqd(r.totalTaxIqd), align: 'end' },
          { key: 'net', header: 'الصافي', accessor: (r: any) => formatIqd(r.totalNetIqd), align: 'end' },
          { key: 'status', header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر تحميل مسيرات الرواتب' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد مسيرات رواتب"
        getRowKey={(r: any) => r.id}
        exportFilename="payroll-runs"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="payroll-runs"
        columnToggle
        densityToggle
        printable
      />
    </div>
  );
}
