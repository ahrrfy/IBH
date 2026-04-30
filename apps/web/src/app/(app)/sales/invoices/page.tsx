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
  { value: 'draft',          label: 'مسودة' },
  { value: 'posted',         label: 'مرحَّل' },
  { value: 'paid',           label: 'مدفوع' },
  { value: 'partially_paid', label: 'مدفوع جزئياً' },
  { value: 'overdue',        label: 'متأخر' },
  { value: 'cancelled',      label: 'ملغى' },
  { value: 'reversed',       label: 'معكوس' },
];

const FILTERS: FilterConfig[] = [
  { type: 'search', key: 'search', placeholder: 'بحث برقم الفاتورة أو اسم العميل…' },
  { type: 'select', key: 'status', label: 'كل الحالات', options: STATUS_OPTIONS },
  { type: 'date-range', keyFrom: 'from', keyTo: 'to', label: 'الفترة' },
];

export default function SalesInvoicesPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<Record<string, string>>({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['sales-invoices', filters],
    queryFn: () => api<any>(`/sales/invoices?${new URLSearchParams(filters).toString()}`),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">فواتير المبيعات</h1>
          <p className="text-sm text-slate-500">{data?.total ?? 0} فاتورة إجمالاً</p>
        </div>
        <Link href="/sales/invoices/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          فاتورة جديدة
        </Link>
      </header>

      <FilterBar filters={FILTERS} values={filters} onChange={setFilters} />

      <DataTable
        columns={[
          { key: 'number', header: 'الرقم', accessor: (r: any) => <Link href={`/sales/invoices/${r.id}`} className="font-mono text-sky-700 hover:underline">{r.number}</Link>, sortable: true, sortValue: (r: any) => r.number ?? '', exportValue: (r: any) => r.number },
          { key: 'invoiceDate', header: 'التاريخ', accessor: (r: any) => formatDate(r.invoiceDate), sortable: true, sortValue: (r: any) => r.invoiceDate ?? '', exportValue: (r: any) => r.invoiceDate },
          { key: 'customer', header: 'العميل', accessor: (r: any) => r.customer?.nameAr ?? '—', exportValue: (r: any) => r.customer?.nameAr ?? '' },
          { key: 'totalIqd', header: 'المجموع', accessor: (r: any) => formatIqd(r.totalIqd), align: 'end', sortable: true, sortValue: (r: any) => Number(r.totalIqd ?? 0), exportValue: (r: any) => Number(r.totalIqd ?? 0) },
          { key: 'balanceIqd', header: 'المتبقي', accessor: (r: any) => formatIqd(r.balanceIqd), align: 'end', sortable: true, sortValue: (r: any) => Number(r.balanceIqd ?? 0), exportValue: (r: any) => Number(r.balanceIqd ?? 0) },
          { key: 'status', header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status} />, exportValue: (r: any) => r.status },
          { key: 'dueDate', header: 'الاستحقاق', accessor: (r: any) => r.dueDate ? formatDate(r.dueDate) : '—', sortable: true, sortValue: (r: any) => r.dueDate ?? '', exportValue: (r: any) => r.dueDate ?? '' },
        ]}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error ? 'تعذَّر تحميل الفواتير' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد فواتير مطابقة"
        getRowKey={(r: any) => r.id}
        onRowClick={(r: any) => router.push(`/sales/invoices/${r.id}`)}
        exportFilename="sales-invoices"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="فواتير المبيعات"
        columnToggle
        densityToggle
        printable
      />
    </div>
  );
}
