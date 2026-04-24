'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

export default function SalesInvoicesPage() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['sales-invoices', status, search],
    queryFn: () => api<any>(`/sales/invoices?${new URLSearchParams({ status, search }).toString()}`),
  });

  const rows = data?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">فواتير المبيعات</h1>
          <p className="text-sm text-slate-500">{data?.total ?? 0} فاتورة إجمالاً</p>
        </div>
        <Link href="/sales/invoices/new" className="rounded bg-sky-700 px-4 py-2 text-white">+ فاتورة جديدة</Link>
      </header>

      <div className="flex gap-3 rounded-lg bg-white p-3 shadow-sm">
        <input
          placeholder="ابحث برقم الفاتورة أو اسم العميل..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded border px-3 py-2"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border px-3 py-2">
          <option value="">كل الحالات</option>
          <option value="draft">مسودة</option>
          <option value="posted">مرحَّل</option>
          <option value="paid">مدفوع</option>
          <option value="partially_paid">مدفوع جزئياً</option>
          <option value="overdue">متأخر</option>
          <option value="cancelled">ملغى</option>
          <option value="reversed">معكوس</option>
        </select>
      </div>

      <DataTable
        columns={[
          { key: 'number',        header: 'الرقم',      accessor: (r: any) => <Link href={`/sales/invoices/${r.id}`} className="font-mono text-sky-700 hover:underline">{r.number}</Link> },
          { key: 'invoiceDate',   header: 'التاريخ',    accessor: (r: any) => formatDate(r.invoiceDate) },
          { key: 'customer',      header: 'العميل',     accessor: (r: any) => r.customer?.nameAr ?? '—' },
          { key: 'totalIqd',      header: 'المجموع',    accessor: (r: any) => formatIqd(r.totalIqd), align: 'end' },
          { key: 'balanceIqd',    header: 'المتبقي',    accessor: (r: any) => formatIqd(r.balanceIqd), align: 'end' },
          { key: 'status',        header: 'الحالة',     accessor: (r: any) => <StatusBadge status={r.status} /> },
          { key: 'dueDate',       header: 'الاستحقاق',  accessor: (r: any) => r.dueDate ? formatDate(r.dueDate) : '—' },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر تحميل الفواتير' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد فواتير مطابقة"
        exportFilename="sales-invoices"
        getRowKey={(r: any) => r.id}
      />
    </div>
  );
}
