'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { FilterBar, type FilterConfig } from '@/components/filter-bar';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

const STATUS_OPTIONS = [
  { value: 'draft',     label: 'مسودة' },
  { value: 'confirmed', label: 'مؤكد' },
  { value: 'invoiced',  label: 'مفوتر' },
  { value: 'cancelled', label: 'ملغى' },
];

const FILTERS: FilterConfig[] = [
  { type: 'search', key: 'search', placeholder: 'بحث بالرقم أو العميل…' },
  { type: 'select', key: 'status', label: 'كل الحالات', options: STATUS_OPTIONS },
  { type: 'date-range', keyFrom: 'from', keyTo: 'to', label: 'الفترة' },
];

export default function SalesOrdersPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<Record<string, string>>({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['sales-orders', filters],
    queryFn: () => api<any>(`/sales/orders?${new URLSearchParams(filters).toString()}`),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">أوامر البيع</h1>
        <Link href="/sales/orders/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          أمر بيع جديد
        </Link>
      </header>

      <FilterBar filters={FILTERS} values={filters} onChange={setFilters} />

      <DataTable
        columns={[
          { key: 'number', header: 'الرقم', accessor: (r: any) => r.number, sortable: true, sortValue: (r: any) => r.number ?? '', exportValue: (r: any) => r.number },
          { key: 'date', header: 'التاريخ', accessor: (r: any) => formatDate(r.orderDate), sortable: true, sortValue: (r: any) => r.orderDate ?? '', exportValue: (r: any) => r.orderDate },
          { key: 'customer', header: 'العميل', accessor: (r: any) => r.customer?.nameAr ?? '—', exportValue: (r: any) => r.customer?.nameAr ?? '' },
          { key: 'items', header: 'البنود', accessor: (r: any) => <span className="num-latin">{r.itemCount ?? r.items?.length ?? 0}</span>, align: 'end', sortable: true, sortValue: (r: any) => Number(r.itemCount ?? r.items?.length ?? 0), exportValue: (r: any) => Number(r.itemCount ?? r.items?.length ?? 0) },
          { key: 'total', header: 'المجموع', accessor: (r: any) => formatIqd(r.totalIqd), align: 'end', sortable: true, sortValue: (r: any) => Number(r.totalIqd ?? 0), exportValue: (r: any) => Number(r.totalIqd ?? 0) },
          { key: 'status', header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status} />, exportValue: (r: any) => r.status },
        ]}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error ? 'خطأ بالتحميل' : null}
        onRetry={() => refetch()}
        getRowKey={(r: any) => r.id}
        onRowClick={(r: any) => router.push(`/sales/orders/${r.id}`)}
        exportFilename="sales-orders"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="أوامر البيع"
        columnToggle
        densityToggle
        printable
      />
    </div>
  );
}
