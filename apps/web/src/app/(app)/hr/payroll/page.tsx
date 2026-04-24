'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd } from '@/lib/format';

export default function PayrollPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: () => api<any>('/hr/payroll'),
  });
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">مسيرات الرواتب</h1>
      <DataTable
        columns={[
          { key: 'number', header: 'الرقم', accessor: (r: any) => r.number },
          { key: 'period', header: 'الفترة', accessor: (r: any) => `${r.periodMonth}/${r.periodYear}` },
          { key: 'gross', header: 'الإجمالي', accessor: (r: any) => formatIqd(r.totalGrossIqd), align: 'end' },
          { key: 'tax', header: 'الضريبة', accessor: (r: any) => formatIqd(r.totalTaxIqd), align: 'end' },
          { key: 'net', header: 'الصافي', accessor: (r: any) => formatIqd(r.totalNetIqd), align: 'end' },
          { key: 'status', header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error ? 'خطأ' : null}
        onRetry={() => refetch()}
        getRowKey={(r: any) => r.id}
        exportFilename="payroll-runs"
      />
    </div>
  );
}
