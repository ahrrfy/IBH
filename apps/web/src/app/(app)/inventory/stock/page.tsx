'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { formatIqd } from '@/lib/format';

export default function StockPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['inventory-stock'],
    queryFn: () => api<any>('/inventory/stock'),
  });
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">ملخص المخزون</h1>
      <DataTable
        columns={[
          { key: 'sku', header: 'SKU', accessor: (r: any) => r.variant?.sku },
          { key: 'name', header: 'المنتج', accessor: (r: any) => r.variant?.nameAr ?? r.variant?.template?.nameAr },
          { key: 'wh', header: 'المستودع', accessor: (r: any) => r.warehouse?.code ?? '—' },
          {
            key: 'qty',
            header: 'الكمية',
            accessor: (r: any) => {
              const qty = Number(r.qtyOnHand);
              const reorderAt = Number(r.reorderPoint ?? 0);
              return <span className={qty <= reorderAt ? 'text-rose-700 font-bold' : ''}>{qty.toLocaleString()}</span>;
            },
            align: 'center',
          },
          { key: 'reserved', header: 'محجوز', accessor: (r: any) => Number(r.qtyReserved).toLocaleString(), align: 'center' },
          { key: 'avg', header: 'متوسط التكلفة', accessor: (r: any) => formatIqd(r.avgCost), align: 'end' },
        ]}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error ? 'خطأ' : null}
        onRetry={() => refetch()}
        getRowKey={(r: any) => r.id}
        exportFilename="stock-summary"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="stock-summary"
        columnToggle
        densityToggle
        printable
      />
    </div>
  );
}
