'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useLiveResource } from '@/lib/realtime/use-live-resource';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

const STATUSES = [
  { value: '', label: 'كل الحالات' },
  { value: 'pending_dispatch', label: 'في الانتظار' },
  { value: 'assigned',        label: 'مُعيَّن' },
  { value: 'in_transit',      label: 'في الطريق' },
  { value: 'delivered',       label: 'مُسلَّم' },
  { value: 'failed',          label: 'فشل' },
  { value: 'returned',        label: 'مُعاد' },
  { value: 'cancelled',       label: 'ملغى' },
];

export default function DeliveryDispatchesPage() {
  const [status, setStatus] = useState('');

  const params = new URLSearchParams({ limit: '200' });
  if (status) params.set('status', status);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['delivery-dispatches', status],
    queryFn: () => api<{ rows: any[]; total: number }>(`/delivery?${params.toString()}`),
  });

  useLiveResource(
    ['delivery-dispatches', status],
    ['delivery.created', 'delivery.status.changed'],
  );

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">طلبات التوصيل</h1>
          <p className="text-sm text-slate-500">{data?.total ?? 0} طلب</p>
        </div>
        <Link
          href="/delivery/dispatches/new"
          className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800"
        >
          + طلب توصيل جديد
        </Link>
      </header>

      <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <DataTable
        columns={[
          {
            key: 'number',
            header: 'الرقم',
            accessor: (r: any) => (
              <Link
                href={`/delivery/dispatches/${r.id}`}
                className="font-mono text-sky-700 hover:underline"
              >
                {r.number}
              </Link>
            ),
          },
          { key: 'date',    header: 'التاريخ',     accessor: (r: any) => formatDate(r.createdAt) },
          { key: 'city',    header: 'المدينة',     accessor: (r: any) => r.deliveryCity ?? '—' },
          { key: 'company', header: 'شركة التوصيل', accessor: (r: any) => r.deliveryCompany?.nameAr ?? 'داخلي' },
          { key: 'cod',     header: 'COD',          accessor: (r: any) => r.codAmountIqd > 0 ? formatIqd(r.codAmountIqd) : '—', align: 'end' as const },
          { key: 'status',  header: 'الحالة',       accessor: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر تحميل الطلبات' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد طلبات توصيل"
        exportFilename="delivery-dispatches"
        getRowKey={(r: any) => r.id}
      />
    </div>
  );
}
