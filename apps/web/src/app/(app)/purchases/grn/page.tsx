'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';
import { Plus, PackageCheck } from 'lucide-react';

const STATUS_FILTERS = [
  { value: '',                  label: 'الكل' },
  { value: 'draft',             label: 'مسودة' },
  { value: 'quality_check',     label: 'فحص جودة' },
  { value: 'accepted',          label: 'مقبول' },
  { value: 'partially_accepted',label: 'مقبول جزئياً' },
  { value: 'rejected',          label: 'مرفوض' },
];

export default function GRNListPage() {
  const [status, setStatus] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['grn-list', status],
    queryFn: () => api<any>(`/purchases/grn${status ? `?status=${status}` : ''}`),
  });

  const rows: any[] = data?.items ?? (Array.isArray(data) ? data : []);

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <PackageCheck className="h-6 w-6 text-sky-700" />
            استلام البضاعة (GRN)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {rows.length} مستند{status ? ` · ${STATUS_FILTERS.find((s) => s.value === status)?.label}` : ''}
          </p>
        </div>
        <Link href="/purchases/grn/new" className="btn-primary btn-sm">
          <Plus className="h-3.5 w-3.5" />
          استلام جديد
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">الحالة:</span>
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setStatus(s.value)}
            className={
              'px-3 py-1 rounded-md text-xs border ' +
              (status === s.value
                ? 'bg-sky-700 text-white border-sky-700'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50')
            }
          >
            {s.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={[
          {
            key: 'number', header: 'الرقم',
            accessor: (r: any) => (
              <Link href={`/purchases/grn/${r.id}`} className="font-medium text-sky-700 hover:underline num-latin">
                {r.number}
              </Link>
            ),
          },
          { key: 'date',     header: 'التاريخ',  accessor: (r: any) => <span className="num-latin font-mono text-xs">{formatDate(r.receiptDate)}</span> },
          { key: 'po',       header: 'أمر الشراء', accessor: (r: any) => r.purchaseOrder?.number ?? '—' },
          { key: 'supplier', header: 'المورّد',  accessor: (r: any) => r.purchaseOrder?.supplier?.nameAr ?? '—' },
          { key: 'wh',       header: 'المخزن',  accessor: (r: any) => r.warehouse?.nameAr ?? '—' },
          { key: 'total',    header: 'المبلغ',  accessor: (r: any) => formatIqd(r.totalCostIqd ?? r.totalIqd), align: 'end' },
          { key: 'status',   header: 'الحالة',  accessor: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر تحميل المستندات' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد مستندات استلام"
        exportFilename="grn-list"
        getRowKey={(r: any) => r.id}
      />
    </div>
  );
}
