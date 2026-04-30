'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { FilterBar, type FilterConfig } from '@/components/filter-bar';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

const STATUS_OPTIONS = [
  { value: 'draft',  label: 'مسودة' },
  { value: 'posted', label: 'مرحَّل' },
  { value: 'paid',   label: 'مدفوع' },
  { value: 'cancelled', label: 'ملغى' },
];

const FILTERS: FilterConfig[] = [
  { type: 'search', key: 'search', placeholder: 'بحث بالرقم أو المورد…' },
  { type: 'select', key: 'status', label: 'كل الحالات', options: STATUS_OPTIONS },
  { type: 'date-range', keyFrom: 'from', keyTo: 'to', label: 'الفترة' },
];

export default function VendorInvoicesPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<Record<string, string>>({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['vendor-invoices', filters],
    queryFn: () => api<any>(`/purchases/invoices?${new URLSearchParams(filters).toString()}`),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">فواتير الموردين</h1>

      <FilterBar filters={FILTERS} values={filters} onChange={setFilters} />

      <DataTable
        columns={[
          { key: 'number', header: 'رقمنا', accessor: (r: any) => r.number, sortable: true, sortValue: (r: any) => r.number ?? '', exportValue: (r: any) => r.number },
          { key: 'vendor', header: 'رقم المورد', accessor: (r: any) => r.vendorRef, exportValue: (r: any) => r.vendorRef },
          { key: 'supplier', header: 'المورد', accessor: (r: any) => r.supplier?.nameAr ?? '—', exportValue: (r: any) => r.supplier?.nameAr ?? '' },
          { key: 'date', header: 'التاريخ', accessor: (r: any) => formatDate(r.invoiceDate), sortable: true, sortValue: (r: any) => r.invoiceDate ?? '', exportValue: (r: any) => r.invoiceDate },
          { key: 'total', header: 'المجموع', accessor: (r: any) => formatIqd(r.totalIqd), align: 'end', sortable: true, sortValue: (r: any) => Number(r.totalIqd ?? 0), exportValue: (r: any) => Number(r.totalIqd ?? 0) },
          { key: 'balance', header: 'المتبقي', accessor: (r: any) => formatIqd(r.balanceIqd), align: 'end', sortable: true, sortValue: (r: any) => Number(r.balanceIqd ?? 0), exportValue: (r: any) => Number(r.balanceIqd ?? 0) },
          {
            key: 'match', header: 'المطابقة الثلاثية',
            accessor: (r: any) =>
              r.matchStatus === 'ok' ? <span className="text-emerald-700">✓ مطابق</span> :
              r.matchStatus ? <span className="text-amber-700">⚠ {r.matchStatus}</span> :
              <span className="text-slate-400">—</span>,
            exportValue: (r: any) => r.matchStatus ?? '',
          },
          { key: 'status', header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status} />, exportValue: (r: any) => r.status },
        ]}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error ? 'خطأ' : null}
        onRetry={() => refetch()}
        getRowKey={(r: any) => r.id}
        onRowClick={(r: any) => router.push(`/purchases/invoices/${r.id}`)}
        exportFilename="vendor-invoices"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="فواتير الموردين"
        columnToggle
        densityToggle
        printable
      />
    </div>
  );
}
