'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';
import { Plus, Undo2 } from 'lucide-react';

const STATUS_FILTERS = [
  { value: '',           label: 'الكل' },
  { value: 'draft',      label: 'مسودة' },
  { value: 'submitted',  label: 'قيد المراجعة' },
  { value: 'approved',   label: 'معتمد' },
  { value: 'posted',     label: 'مُرحَّل' },
  { value: 'cancelled',  label: 'ملغي' },
];

export default function SalesReturnsListPage() {
  const [status, setStatus] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['sales-returns', status],
    queryFn: () => api<any>(`/sales-returns${status ? `?status=${status}` : ''}`),
  });

  const rows: any[] = data?.items ?? (Array.isArray(data) ? data : []);

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Undo2 className="h-6 w-6 text-sky-700" />
            مرتجعات المبيعات
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {rows.length} مرتجع{status ? ` · حالة: ${STATUS_FILTERS.find((s) => s.value === status)?.label}` : ''}
          </p>
        </div>
        <Link href="/sales/returns/new" className="btn-primary btn-sm">
          <Plus className="h-3.5 w-3.5" />
          مرتجع جديد
        </Link>
      </header>

      <div className="flex items-center gap-2">
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
              <Link href={`/sales/returns/${r.id}`} className="font-medium text-sky-700 hover:underline num-latin">
                {r.number}
              </Link>
            ),
          },
          { key: 'date',     header: 'التاريخ', accessor: (r: any) => <span className="num-latin font-mono text-xs">{formatDate(r.returnDate)}</span> },
          { key: 'invoice',  header: 'الفاتورة الأصلية', accessor: (r: any) => r.originalInvoice?.number ?? '—' },
          { key: 'reason',   header: 'السبب', accessor: (r: any) => REASON_LABELS_AR[r.reason] ?? r.reason },
          { key: 'total',    header: 'المبلغ', accessor: (r: any) => formatIqd(r.totalIqd), align: 'end' },
          { key: 'status',   header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر تحميل المرتجعات' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد مرتجعات"
        exportFilename="sales-returns"
        getRowKey={(r: any) => r.id}
      />
    </div>
  );
}

const REASON_LABELS_AR: Record<string, string> = {
  defect:            'عيب في المنتج',
  wrong_item:        'منتج خاطئ',
  customer_request:  'طلب العميل',
  quality_issue:     'مشكلة جودة',
  damage_in_transit: 'ضرر أثناء النقل',
  other:             'أخرى',
};
