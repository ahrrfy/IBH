'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

export default function VendorInvoicesPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['vendor-invoices'],
    queryFn: () => api<any>('/purchases/invoices'),
  });
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">فواتير الموردين</h1>
      <DataTable
        columns={[
          { key: 'number', header: 'رقمنا', accessor: (r: any) => r.number },
          { key: 'vendor', header: 'رقم المورد', accessor: (r: any) => r.vendorRef },
          { key: 'supplier', header: 'المورد', accessor: (r: any) => r.supplier?.nameAr ?? '—' },
          { key: 'date', header: 'التاريخ', accessor: (r: any) => formatDate(r.invoiceDate) },
          { key: 'total', header: 'المجموع', accessor: (r: any) => formatIqd(r.totalIqd), align: 'end' },
          { key: 'balance', header: 'المتبقي', accessor: (r: any) => formatIqd(r.balanceIqd), align: 'end' },
          {
            key: 'match',
            header: 'المطابقة الثلاثية',
            accessor: (r: any) =>
              r.matchStatus === 'ok' ? <span className="text-emerald-700">✓ مطابق</span> :
              r.matchStatus ? <span className="text-amber-700">⚠ {r.matchStatus}</span> :
              <span className="text-slate-400">—</span>,
          },
          { key: 'status', header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error ? 'خطأ' : null}
        onRetry={() => refetch()}
        getRowKey={(r: any) => r.id}
        exportFilename="vendor-invoices"
      />
    </div>
  );
}
