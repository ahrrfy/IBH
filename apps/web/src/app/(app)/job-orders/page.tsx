'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

export default function JobOrdersPage() {
  const [status, setStatus] = useState('');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['job-orders', status],
    queryFn: () => api<any>(`/job-orders${status ? `?status=${status}` : ''}`),
  });
  const rows: any[] = Array.isArray(data) ? data : data?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">طلبات التصنيع</h1>
          <p className="text-sm text-slate-500">{rows.length} طلب</p>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border px-3 py-2 text-sm">
          <option value="">الكل</option>
          <option value="quotation">عرض سعر</option>
          <option value="design">تصميم</option>
          <option value="production">إنتاج</option>
          <option value="ready">جاهز</option>
          <option value="delivered">مُسلَّم</option>
          <option value="cancelled">ملغى</option>
        </select>
      </header>

      <DataTable
        columns={[
          { key: 'number',  header: 'الرقم',   accessor: (r: any) => <Link href={`/job-orders/${r.id}`} className="font-mono text-sky-700 hover:underline">{r.number}</Link> },
          { key: 'product', header: 'المنتج', accessor: (r: any) => r.productName },
          { key: 'qty',     header: 'الكمية', accessor: (r: any) => r.quantity, align: 'end' },
          { key: 'expected',header: 'التسليم', accessor: (r: any) => formatDate(r.expectedDate) },
          { key: 'total',   header: 'القيمة', accessor: (r: any) => formatIqd(r.totalPriceIqd ?? 0), align: 'end' },
          { key: 'status',  header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر تحميل الطلبات' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد طلبات تصنيع"
        exportFilename="job-orders"
        getRowKey={(r: any) => r.id}
      />
    </div>
  );
}
