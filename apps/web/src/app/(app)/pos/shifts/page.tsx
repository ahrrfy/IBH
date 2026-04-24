'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

export default function ShiftsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => api<any>('/pos/shifts'),
  });
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">الورديات</h1>
      <DataTable
        columns={[
          { key: 'number', header: 'رقم الوردية', accessor: (r: any) => r.shiftNumber },
          { key: 'opened', header: 'فُتحت', accessor: (r: any) => formatDate(r.openedAt) },
          { key: 'closed', header: 'أُغلقت', accessor: (r: any) => r.closedAt ? formatDate(r.closedAt) : '—' },
          { key: 'opening', header: 'افتتاحي', accessor: (r: any) => formatIqd(r.openingCashIqd), align: 'end' },
          { key: 'closing', header: 'ختامي', accessor: (r: any) => r.closingCashIqd ? formatIqd(r.closingCashIqd) : '—', align: 'end' },
          {
            key: 'diff',
            header: 'الفرق',
            accessor: (r: any) => {
              if (r.cashDifferenceIqd == null) return '—';
              const diff = Number(r.cashDifferenceIqd);
              return (
                <span className={diff === 0 ? 'text-emerald-700' : Math.abs(diff) > 5000 ? 'text-rose-700 font-bold' : 'text-amber-700'}>
                  {diff >= 0 ? '+' : ''}{formatIqd(diff)}
                </span>
              );
            },
            align: 'end',
          },
          { key: 'status', header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error ? 'خطأ' : null}
        onRetry={() => refetch()}
        getRowKey={(r: any) => r.id}
        exportFilename="shifts"
      />
    </div>
  );
}
