'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { FilterBar, type FilterConfig } from '@/components/filter-bar';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

const STATUS_OPTIONS = [
  { value: 'open',   label: 'مفتوحة' },
  { value: 'closed', label: 'مغلقة' },
];

const FILTERS: FilterConfig[] = [
  { type: 'search', key: 'search', placeholder: 'بحث برقم الوردية…' },
  { type: 'select', key: 'status', label: 'كل الحالات', options: STATUS_OPTIONS },
  { type: 'date-range', keyFrom: 'from', keyTo: 'to', label: 'الفترة' },
];

export default function ShiftsPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['shifts', filters],
    queryFn: () => api<any>(`/pos/shifts?${new URLSearchParams(filters).toString()}`),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">الورديات</h1>

      <FilterBar filters={FILTERS} values={filters} onChange={setFilters} />

      <DataTable
        columns={[
          { key: 'number', header: 'رقم الوردية', accessor: (r: any) => r.shiftNumber, sortable: true, sortValue: (r: any) => r.shiftNumber ?? '', exportValue: (r: any) => r.shiftNumber },
          { key: 'opened', header: 'فُتحت', accessor: (r: any) => formatDate(r.openedAt), sortable: true, sortValue: (r: any) => r.openedAt ?? '', exportValue: (r: any) => r.openedAt },
          { key: 'closed', header: 'أُغلقت', accessor: (r: any) => r.closedAt ? formatDate(r.closedAt) : '—', exportValue: (r: any) => r.closedAt ?? '' },
          { key: 'opening', header: 'افتتاحي', accessor: (r: any) => formatIqd(r.openingCashIqd), align: 'end', sortable: true, sortValue: (r: any) => Number(r.openingCashIqd ?? 0), exportValue: (r: any) => Number(r.openingCashIqd ?? 0) },
          { key: 'closing', header: 'ختامي', accessor: (r: any) => r.closingCashIqd ? formatIqd(r.closingCashIqd) : '—', align: 'end', exportValue: (r: any) => Number(r.closingCashIqd ?? 0) },
          {
            key: 'diff', header: 'الفرق',
            accessor: (r: any) => {
              if (r.cashDifferenceIqd == null) return '—';
              const diff = Number(r.cashDifferenceIqd);
              return (
                <span className={diff === 0 ? 'text-emerald-700' : Math.abs(diff) > 5000 ? 'text-rose-700 font-bold' : 'text-amber-700'}>
                  {diff >= 0 ? '+' : ''}{formatIqd(diff)}
                </span>
              );
            },
            align: 'end', sortable: true, sortValue: (r: any) => Number(r.cashDifferenceIqd ?? 0), exportValue: (r: any) => Number(r.cashDifferenceIqd ?? 0),
          },
          { key: 'status', header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status} />, exportValue: (r: any) => r.status },
        ]}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error ? 'خطأ' : null}
        onRetry={() => refetch()}
        getRowKey={(r: any) => r.id}
        exportFilename="shifts"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="الورديات"
        columnToggle
        densityToggle
        printable
      />
    </div>
  );
}
