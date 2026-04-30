'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { FilterBar, type FilterConfig } from '@/components/filter-bar';

const FILTERS: FilterConfig[] = [
  { type: 'search', key: 'search', placeholder: 'بحث بالاسم أو الرمز…' },
];

export default function WarehousesPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api<any>('/inventory/warehouses'),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">المستودعات</h1>

      <FilterBar filters={FILTERS} values={filters} onChange={setFilters} />

      <DataTable
        columns={[
          { key: 'code', header: 'الرمز', accessor: (r: any) => r.code, sortable: true, sortValue: (r: any) => r.code ?? '', exportValue: (r: any) => r.code },
          { key: 'name', header: 'الاسم', accessor: (r: any) => r.nameAr, exportValue: (r: any) => r.nameAr },
          { key: 'type', header: 'النوع', accessor: (r: any) => r.type, exportValue: (r: any) => r.type },
          { key: 'branch', header: 'الفرع', accessor: (r: any) => r.branch?.code ?? '—', exportValue: (r: any) => r.branch?.code ?? '' },
          { key: 'active', header: 'نشط', accessor: (r: any) => r.isActive ? '✓' : '—', align: 'center', exportValue: (r: any) => r.isActive ? 'نعم' : 'لا' },
        ]}
        rows={data?.items ?? data ?? []}
        loading={isLoading}
        error={error ? 'خطأ' : null}
        onRetry={() => refetch()}
        getRowKey={(r: any) => r.id}
        exportFilename="warehouses"
        exportFormats={['csv', 'excel']}
        exportTitle="المستودعات"
        columnToggle
        densityToggle
        printable
      />
    </div>
  );
}
