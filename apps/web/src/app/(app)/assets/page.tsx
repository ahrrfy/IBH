'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd } from '@/lib/format';

export default function FixedAssetsPage() {
  const [status, setStatus] = useState('');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['fixed-assets', status],
    queryFn: () => api<any>(`/assets${status ? `?status=${status}` : ''}`),
  });
  const rows: any[] = Array.isArray(data) ? data : data?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">الأصول الثابتة</h1>
          <p className="text-sm text-slate-500">{rows.length} أصل</p>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border px-3 py-2 text-sm">
          <option value="">الكل</option>
          <option value="active">نشط</option>
          <option value="disposed">مستبعد</option>
        </select>
      </header>

      <DataTable
        columns={[
          { key: 'number', header: 'الرقم', accessor: (r: any) => <Link href={`/assets/${r.id}`} className="font-mono text-sky-700 hover:underline">{r.number}</Link> },
          { key: 'name',   header: 'الاسم',   accessor: (r: any) => r.nameAr },
          { key: 'cost',   header: 'التكلفة', accessor: (r: any) => formatIqd(r.purchaseCostIqd ?? 0), align: 'end' },
          { key: 'book',   header: 'القيمة الدفترية', accessor: (r: any) => formatIqd(r.bookValueIqd ?? 0), align: 'end' },
          { key: 'status', header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر تحميل الأصول' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد أصول"
        exportFilename="fixed-assets"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="fixed-assets"
        columnToggle
        densityToggle
        printable
        getRowKey={(r: any) => r.id}
      />
    </div>
  );
}
