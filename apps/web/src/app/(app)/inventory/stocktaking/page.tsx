'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';
import { Plus, ClipboardList } from 'lucide-react';

export default function StocktakingListPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['stocktaking'],
    queryFn: () => api<any>('/inventory/stocktaking'),
  });
  const rows: any[] = Array.isArray(data) ? data : data?.items ?? [];

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-sky-700" />
            جلسات الجرد
          </h1>
          <p className="text-sm text-slate-500 mt-1">{rows.length} جلسة</p>
        </div>
        <Link href="/inventory/stocktaking/new" className="btn-primary btn-sm">
          <Plus className="h-3.5 w-3.5" />
          جلسة جديدة
        </Link>
      </header>

      <DataTable
        columns={[
          {
            key: 'number', header: 'الرقم',
            accessor: (r: any) => (
              <Link
                href={`/inventory/stocktaking/${r.id}`}
                className="font-mono num-latin text-sky-700 hover:underline"
              >
                {r.sessionNumber}
              </Link>
            ),
          },
          { key: 'warehouse', header: 'المستودع',  accessor: (r: any) => r.warehouseId.slice(0, 8) },
          {
            key: 'lines', header: 'البنود', align: 'end',
            accessor: (r: any) => <span className="num-latin font-mono">{r.lines?.length ?? 0}</span>,
          },
          {
            key: 'variance', header: 'فروق (د.ع)', align: 'end',
            accessor: (r: any) => {
              const total = (r.lines ?? []).reduce(
                (a: number, l: any) => a + Number(l.varianceValueIqd ?? 0),
                0,
              );
              if (total === 0) return <span className="text-slate-400 text-xs">—</span>;
              return (
                <span className={['num-latin font-mono', total >= 0 ? 'text-emerald-700' : 'text-rose-700'].join(' ')}>
                  {total > 0 ? '+' : ''}{total.toLocaleString()}
                </span>
              );
            },
          },
          { key: 'status',  header: 'الحالة',     accessor: (r: any) => <StatusBadge status={r.status ?? 'draft'} /> },
          {
            key: 'date', header: 'التاريخ',
            accessor: (r: any) => (
              <span className="num-latin font-mono text-xs">{formatDate(r.countDate ?? r.createdAt)}</span>
            ),
          },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر تحميل جلسات الجرد' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد جلسات جرد"
        exportFilename="stocktaking"
        getRowKey={(r: any) => r.id}
      />
    </div>
  );
}
