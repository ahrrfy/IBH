'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

export default function PurchaseOrdersPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => api<any>('/purchases/orders'),
  });
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">أوامر الشراء</h1>
      <DataTable
        columns={[
          { key: 'number', header: 'الرقم', accessor: (r: any) => r.number },
          { key: 'date', header: 'التاريخ', accessor: (r: any) => formatDate(r.orderDate) },
          { key: 'supplier', header: 'المورد', accessor: (r: any) => r.supplier?.nameAr ?? '—' },
          { key: 'total', header: 'المجموع', accessor: (r: any) => formatIqd(r.totalIqd), align: 'end' },
          { key: 'expected', header: 'الاستلام المتوقع', accessor: (r: any) => r.expectedDate ? formatDate(r.expectedDate) : '—' },
          { key: 'status', header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error ? 'خطأ' : null}
        onRetry={() => refetch()}
        getRowKey={(r: any) => r.id}
        exportFilename="purchase-orders"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="purchase-orders"
        columnToggle
        densityToggle
        printable
      />
    </div>
  );
}
