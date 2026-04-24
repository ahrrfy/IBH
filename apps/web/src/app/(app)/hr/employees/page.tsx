'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd } from '@/lib/format';

export default function EmployeesPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any>('/hr/employees'),
  });
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">الموظفون</h1>
      <DataTable
        columns={[
          { key: 'number', header: 'الرقم', accessor: (r: any) => r.employeeNumber },
          { key: 'name', header: 'الاسم', accessor: (r: any) => r.nameAr },
          { key: 'dept', header: 'القسم', accessor: (r: any) => r.department?.nameAr ?? '—' },
          { key: 'title', header: 'المسمى', accessor: (r: any) => r.positionTitle ?? '—' },
          { key: 'base', header: 'الراتب الأساسي', accessor: (r: any) => formatIqd(r.baseSalaryIqd), align: 'end' },
          { key: 'status', header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error ? 'خطأ' : null}
        onRetry={() => refetch()}
        getRowKey={(r: any) => r.id}
        exportFilename="employees"
      />
    </div>
  );
}
