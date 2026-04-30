'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { FilterBar, type FilterConfig } from '@/components/filter-bar';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';
import { Plus, ArrowLeftRight } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'draft',     label: 'مسودة' },
  { value: 'in_transit', label: 'قيد النقل' },
  { value: 'received',  label: 'مستلم' },
  { value: 'cancelled', label: 'ملغى' },
];

const FILTERS: FilterConfig[] = [
  { type: 'search', key: 'search', placeholder: 'بحث برقم التحويل…' },
  { type: 'select', key: 'status', label: 'كل الحالات', options: STATUS_OPTIONS },
];

export default function TransfersListPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['transfers', filters],
    queryFn: () => api<any>(`/inventory/transfers?${new URLSearchParams(filters).toString()}`),
  });
  const rows: any[] = Array.isArray(data) ? data : data?.items ?? [];

  return (
    <div className="space-y-6">
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

      <FilterBar filters={FILTERS} values={filters} onChange={setFilters} />

      <DataTable
        columns={[
          { key: 'number', header: 'الرقم', accessor: (r: any) => (
              <Link href={`/inventory/transfers/${r.id}`} className="font-mono num-latin text-sky-700 hover:underline">{r.transferNumber}</Link>
            ), sortable: true, sortValue: (r: any) => r.transferNumber ?? '', exportValue: (r: any) => r.transferNumber },
          { key: 'from', header: 'من', accessor: (r: any) => r.fromWarehouse?.nameAr ?? r.fromWarehouseId?.slice(0, 8), exportValue: (r: any) => r.fromWarehouse?.nameAr ?? '' },
          { key: 'to', header: 'إلى', accessor: (r: any) => r.toWarehouse?.nameAr ?? r.toWarehouseId?.slice(0, 8), exportValue: (r: any) => r.toWarehouse?.nameAr ?? '' },
          { key: 'lines', header: 'البنود', align: 'end', accessor: (r: any) => <span className="num-latin font-mono">{r.lines?.length ?? 0}</span>, sortable: true, sortValue: (r: any) => Number(r.lines?.length ?? 0), exportValue: (r: any) => Number(r.lines?.length ?? 0) },
          { key: 'status', header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status ?? 'draft'} />, exportValue: (r: any) => r.status ?? 'draft' },
          { key: 'date', header: 'التاريخ', accessor: (r: any) => <span className="num-latin font-mono text-xs">{formatDate(r.transferDate ?? r.createdAt)}</span>, sortable: true, sortValue: (r: any) => r.transferDate ?? r.createdAt ?? '', exportValue: (r: any) => r.transferDate ?? r.createdAt },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر تحميل التحويلات' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد تحويلات"
        getRowKey={(r: any) => r.id}
        exportFilename="transfers"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="تحويلات المخزون"
        columnToggle
        densityToggle
        printable
      />
    </div>
  );
}
