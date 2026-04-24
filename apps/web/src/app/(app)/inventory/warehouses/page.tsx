'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';

export default function WarehousesPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api<any>('/inventory/warehouses'),
  });
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">المستودعات</h1>
      <DataTable
        columns={[
          { key: 'code', header: 'الرمز', accessor: (r: any) => r.code },
          { key: 'name', header: 'الاسم', accessor: (r: any) => r.nameAr },
          { key: 'type', header: 'النوع', accessor: (r: any) => r.type },
          { key: 'branch', header: 'الفرع', accessor: (r: any) => r.branch?.code ?? '—' },
          { key: 'active', header: 'نشط', accessor: (r: any) => r.isActive ? '✓' : '—', align: 'center' },
        ]}
        rows={data?.items ?? data ?? []}
        loading={isLoading}
        error={error ? 'خطأ' : null}
        onRetry={() => refetch()}
        getRowKey={(r: any) => r.id}
        exportFilename="warehouses"
      />
    </div>
  );
}
