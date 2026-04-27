'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useLiveResource } from '@/lib/realtime/use-live-resource';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

const STATUSES = [
  { value: '',          label: 'كل الحالات' },
  { value: 'draft',     label: 'مسودة' },
  { value: 'sent',      label: 'مُرسَل' },
  { value: 'accepted',  label: 'مقبول' },
  { value: 'rejected',  label: 'مرفوض' },
  { value: 'expired',   label: 'منتهي' },
  { value: 'converted', label: 'مُحوَّل' },
];

export default function QuotationsPage() {
  const [status, setStatus] = useState('');

  const params = new URLSearchParams({ limit: '100' });
  if (status) params.set('status', status);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['quotations', status],
    queryFn: () => api<{ items: any[]; total: number }>(`/quotations?${params}`),
  });

  useLiveResource(['quotations', status], ['quotation.created', 'quotation.updated', 'quotation.converted']);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">عروض الأسعار</h1>
          <p className="text-sm text-slate-500">{data?.total ?? 0} عرض</p>
        </div>
        <Link
          href="/sales/quotations/new"
          className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800"
        >
          <Plus className="size-4" /> عرض سعر جديد
        </Link>
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatus(s.value)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              status === s.value
                ? 'bg-sky-700 text-white'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={[
          {
            key: 'number',
            header: 'الرقم',
            accessor: (r: any) => (
              <Link href={`/sales/quotations/${r.id}`} className="font-mono text-sky-700 hover:underline">
                {r.number}
              </Link>
            ),
          },
          { key: 'date',     header: 'التاريخ',     accessor: (r: any) => formatDate(r.quotationDate) },
          { key: 'customer', header: 'العميل',       accessor: (r: any) => r.customer?.nameAr ?? '—' },
          { key: 'valid',    header: 'صالح حتى',     accessor: (r: any) => formatDate(r.validUntil) },
          { key: 'total',    header: 'المجموع',       accessor: (r: any) => formatIqd(r.totalIqd), align: 'end' },
          { key: 'status',   header: 'الحالة',        accessor: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error ? 'خطأ في التحميل' : null}
        onRetry={() => refetch()}
        getRowKey={(r: any) => r.id}
        exportFilename="quotations"
      />
    </div>
  );
}
