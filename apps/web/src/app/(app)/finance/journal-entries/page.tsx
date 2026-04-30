'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { FilterBar, type FilterConfig } from '@/components/filter-bar';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

const STATUS_OPTIONS = [
  { value: 'draft',  label: 'مسودة' },
  { value: 'posted', label: 'مُرحَّل' },
];

const FILTERS: FilterConfig[] = [
  { type: 'search', key: 'search', placeholder: 'بحث بالرقم أو الوصف…' },
  { type: 'select', key: 'status', label: 'كل الحالات', options: STATUS_OPTIONS },
];

export default function JournalEntriesPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['journal-entries'],
    queryFn: () => api<any>('/finance/gl/entries?limit=200'),
  });

  const filtered = useMemo(() => {
    let rows: any[] = data?.items ?? [];
    if (filters.status) rows = rows.filter((r: any) => r.status === filters.status);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter((r: any) =>
        (r.entryNumber ?? '').toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q),
      );
    }
    return rows;
  }, [data, filters]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">القيود المحاسبية</h1>

      <FilterBar filters={FILTERS} values={filters} onChange={setFilters} />

      <DataTable
        columns={[
          { key: 'number', header: 'الرقم', accessor: (r: any) => r.entryNumber, sortable: true, sortValue: (r: any) => r.entryNumber ?? '', exportValue: (r: any) => r.entryNumber },
          { key: 'date', header: 'التاريخ', accessor: (r: any) => formatDate(r.entryDate), sortable: true, sortValue: (r: any) => r.entryDate ?? '', exportValue: (r: any) => r.entryDate },
          { key: 'desc', header: 'الوصف', accessor: (r: any) => r.description, exportValue: (r: any) => r.description },
          { key: 'ref', header: 'المرجع', accessor: (r: any) => `${r.refType}:${r.refId?.slice(-6)}`, exportValue: (r: any) => `${r.refType}:${r.refId}` },
          { key: 'debit', header: 'مدين', accessor: (r: any) => formatIqd(r.totalDebitIqd), align: 'end', sortable: true, sortValue: (r: any) => Number(r.totalDebitIqd ?? 0), exportValue: (r: any) => Number(r.totalDebitIqd ?? 0) },
          { key: 'credit', header: 'دائن', accessor: (r: any) => formatIqd(r.totalCreditIqd), align: 'end', sortable: true, sortValue: (r: any) => Number(r.totalCreditIqd ?? 0), exportValue: (r: any) => Number(r.totalCreditIqd ?? 0) },
          { key: 'status', header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status} />, exportValue: (r: any) => r.status },
        ]}
        rows={filtered}
        loading={isLoading}
        error={error ? 'خطأ' : null}
        onRetry={() => refetch()}
        getRowKey={(r: any) => r.id}
        exportFilename="journal-entries"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="القيود المحاسبية"
        columnToggle
        densityToggle
        printable
      />
    </div>
  );
}
