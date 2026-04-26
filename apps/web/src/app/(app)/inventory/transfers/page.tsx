'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';
import { Plus, ArrowLeftRight } from 'lucide-react';

export default function TransfersListPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['transfers'],
    queryFn: () => api<any>('/inventory/transfers'),
  });
  const rows: any[] = Array.isArray(data) ? data : data?.items ?? [];

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 text-sky-700" />
            تحويلات المخزون
          </h1>
          <p className="text-sm text-slate-500 mt-1">{rows.length} تحويل</p>
        </div>
        <Link href="/inventory/transfers/new" className="btn-primary btn-sm">
          <Plus className="h-3.5 w-3.5" />
          تحويل جديد
        </Link>
      </header>

      <DataTable
        columns={[
          {
            key: 'number', header: 'الرقم',
            accessor: (r: any) => (
              <Link
                href={`/inventory/transfers/${r.id}`}
                className="font-mono num-latin text-sky-700 hover:underline"
              >
                {r.transferNumber}
              </Link>
            ),
          },
          {
            key: 'from', header: 'من',
            accessor: (r: any) => r.fromWarehouse?.nameAr ?? r.fromWarehouseId.slice(0, 8),
          },
          {
            key: 'to', header: 'إلى',
            accessor: (r: any) => r.toWarehouse?.nameAr ?? r.toWarehouseId.slice(0, 8),
          },
          {
            key: 'lines', header: 'البنود', align: 'end',
            accessor: (r: any) => <span className="num-latin font-mono">{r.lines?.length ?? 0}</span>,
          },
          {
            key: 'status', header: 'الحالة',
            accessor: (r: any) => <StatusBadge status={r.status ?? 'draft'} />,
          },
          {
            key: 'date', header: 'التاريخ',
            accessor: (r: any) => (
              <span className="num-latin font-mono text-xs">{formatDate(r.transferDate ?? r.createdAt)}</span>
            ),
          },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر تحميل التحويلات' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد تحويلات"
        exportFilename="transfers"
        getRowKey={(r: any) => r.id}
      />
    </div>
  );
}
