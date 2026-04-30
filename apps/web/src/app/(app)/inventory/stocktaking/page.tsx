'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { FilterBar, type FilterConfig } from '@/components/filter-bar';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';
import { Plus, ClipboardList } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'draft',     label: 'مسودة' },
  { value: 'counting',  label: 'قيد العد' },
  { value: 'completed', label: 'مكتمل' },
  { value: 'approved',  label: 'معتمد' },
];

const FILTERS: FilterConfig[] = [
  { type: 'search', key: 'search', placeholder: 'بحث برقم الجلسة…' },
  { type: 'select', key: 'status', label: 'كل الحالات', options: STATUS_OPTIONS },
];

export default function StocktakingListPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['stocktaking', filters],
    queryFn: () => api<any>(`/inventory/stocktaking?${new URLSearchParams(filters).toString()}`),
  });
  const rows: any[] = Array.isArray(data) ? data : data?.items ?? [];

  return (
    <div className="space-y-6">
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

      <FilterBar filters={FILTERS} values={filters} onChange={setFilters} />

      <DataTable
        columns={[
          { key: 'number', header: 'الرقم', accessor: (r: any) => (
              <Link href={`/inventory/stocktaking/${r.id}`} className="font-mono num-latin text-sky-700 hover:underline">{r.sessionNumber}</Link>
            ), sortable: true, sortValue: (r: any) => r.sessionNumber ?? '', exportValue: (r: any) => r.sessionNumber },
          { key: 'warehouse', header: 'المستودع', accessor: (r: any) => r.warehouseId?.slice(0, 8), exportValue: (r: any) => r.warehouseId },
          { key: 'lines', header: 'البنود', align: 'end', accessor: (r: any) => <span className="num-latin font-mono">{r.lines?.length ?? 0}</span>, sortable: true, sortValue: (r: any) => Number(r.lines?.length ?? 0), exportValue: (r: any) => Number(r.lines?.length ?? 0) },
          {
            key: 'variance', header: 'فروق (د.ع)', align: 'end',
            accessor: (r: any) => {
              const total = (r.lines ?? []).reduce(
                (a: number, l: any) => a + Number(l.varianceValueIqd ?? 0), 0,
              );
              if (total === 0) return <span className="text-slate-400 text-xs">—</span>;
              return (
                <span className={['num-latin font-mono', total >= 0 ? 'text-emerald-700' : 'text-rose-700'].join(' ')}>
                  {total > 0 ? '+' : ''}{total.toLocaleString()}
                </span>
              );
            },
            exportValue: (r: any) => (r.lines ?? []).reduce((a: number, l: any) => a + Number(l.varianceValueIqd ?? 0), 0),
          },
          { key: 'status', header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status ?? 'draft'} />, exportValue: (r: any) => r.status ?? 'draft' },
          { key: 'date', header: 'التاريخ', accessor: (r: any) => <span className="num-latin font-mono text-xs">{formatDate(r.countDate ?? r.createdAt)}</span>, sortable: true, sortValue: (r: any) => r.countDate ?? r.createdAt ?? '', exportValue: (r: any) => r.countDate ?? r.createdAt },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر تحميل جلسات الجرد' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد جلسات جرد"
        getRowKey={(r: any) => r.id}
        exportFilename="stocktaking"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="جلسات الجرد"
        columnToggle
        densityToggle
        printable
      />
    </div>
  );
}
