'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';

export default function LeavesPage() {
  const [status, setStatus] = useState('');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['leaves', status],
    queryFn: () => api<any>(`/hr/leaves${status ? `?status=${status}` : ''}`),
  });
  const rows: any[] = Array.isArray(data) ? data : data?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">طلبات الإجازات</h1>
          <p className="text-sm text-slate-500">{rows.length} طلب</p>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border px-3 py-2 text-sm">
          <option value="">الكل</option>
          <option value="pending">قيد الموافقة</option>
          <option value="approved">معتمد</option>
          <option value="rejected">مرفوض</option>
          <option value="cancelled">ملغى</option>
        </select>
      </header>

      <DataTable
        columns={[
          { key: 'employee', header: 'الموظف', accessor: (r: any) => r.employee?.fullNameAr ?? r.employeeId },
          { key: 'type',     header: 'النوع',  accessor: (r: any) => r.type },
          { key: 'from',     header: 'من',     accessor: (r: any) => formatDate(r.startDate) },
          { key: 'to',       header: 'إلى',    accessor: (r: any) => formatDate(r.endDate) },
          { key: 'days',     header: 'الأيام', accessor: (r: any) => r.days, align: 'end' },
          { key: 'status',   header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر التحميل' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد طلبات"
        exportFilename="leaves"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="leaves"
        columnToggle
        densityToggle
        printable
        getRowKey={(r: any) => r.id}
      />
    </div>
  );
}
