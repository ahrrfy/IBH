'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

export default function SalesOrdersPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['sales-orders'],
    queryFn: () => api<any>('/sales/orders'),
  });
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">أوامر البيع</h1>
      <DataTable
        columns={[
          { key: 'number', header: 'الرقم', accessor: (r: any) => r.number },
          { key: 'date', header: 'التاريخ', accessor: (r: any) => formatDate(r.orderDate) },
          { key: 'customer', header: 'العميل', accessor: (r: any) => r.customer?.nameAr ?? '—' },
          { key: 'total', header: 'المجموع', accessor: (r: any) => formatIqd(r.totalIqd), align: 'end' },
          { key: 'status', header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error ? 'خطأ بالتحميل' : null}
        onRetry={() => refetch()}
        getRowKey={(r: any) => r.id}
        exportFilename="sales-orders"
      />
    </div>
  );
}
