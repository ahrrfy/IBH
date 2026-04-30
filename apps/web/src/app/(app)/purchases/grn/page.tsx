'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';
import { Plus, PackageCheck } from 'lucide-react';

const STATUS_FILTERS = [
  { value: '',              label: 'الكل' },
  { value: 'quality_check', label: 'فحص الجودة' },
  { value: 'accepted',      label: 'مقبول' },
  { value: 'rejected',      label: 'مرفوض' },
];

export default function GrnListPage() {
  const [status, setStatus] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['grn', status],
    queryFn: () => api<any>(`/purchases/grn${status ? `?status=${status}` : ''}`),
  });

  const rows: any[] = data?.items ?? (Array.isArray(data) ? data : []);

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <PackageCheck className="h-6 w-6 text-sky-700" />
            إيصالات الاستلام (GRN)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {rows.length} إيصال{status ? ` · ${STATUS_FILTERS.find((s) => s.value === status)?.label}` : ''}
          </p>
        </div>
        <Link href="/purchases/grn/new" className="btn-primary btn-sm">
          <Plus className="h-3.5 w-3.5" />
          إيصال جديد
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
              <Link href={`/purchases/grn/${r.id}`} className="font-medium text-sky-700 hover:underline num-latin">
                {r.number}
              </Link>
            ),
          },
          { key: 'date',     header: 'تاريخ الاستلام', accessor: (r: any) => <span className="num-latin font-mono text-xs">{formatDate(r.receiptDate)}</span> },
          { key: 'po',       header: 'أمر الشراء', accessor: (r: any) => r.purchaseOrder?.number ?? '—' },
          { key: 'supplier', header: 'المورد', accessor: (r: any) => r.purchaseOrder?.supplier?.nameAr ?? '—' },
          { key: 'total',    header: 'القيمة', accessor: (r: any) => formatIqd(r.totalValueIqd), align: 'end' },
          { key: 'status',   header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر تحميل الإيصالات' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد إيصالات استلام"
        exportFilename="goods-receipts"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="goods-receipts"
        columnToggle
        densityToggle
        printable
        getRowKey={(r: any) => r.id}
      />
    </div>
  );
}
