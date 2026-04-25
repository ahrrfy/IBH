'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Plus, Building2, Phone } from 'lucide-react';

export default function BranchesListPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api<any>('/admin/branches'),
  });
  const rows: any[] = Array.isArray(data) ? data : data?.items ?? [];

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">الفروع</h1>
          <p className="text-sm text-slate-500 mt-1">{rows.length} فرع</p>
        </div>
        <Link href="/settings/branches/new" className="btn-primary btn-sm">
          <Plus className="h-3.5 w-3.5" />
          فرع جديد
        </Link>
      </header>

      <DataTable
        columns={[
          { key: 'code', header: 'الكود', accessor: (r: any) => <span className="font-mono text-xs num-latin">{r.code}</span> },
          {
            key: 'name', header: 'الاسم',
            accessor: (r: any) => (
              <div className="flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                <Link href={`/settings/branches/${r.id}`} className="font-medium text-sky-700 hover:underline">
                  {r.nameAr}
                </Link>
                {r.isMainBranch && <span className="badge-brand text-[10px]">رئيسي</span>}
              </div>
            ),
          },
          { key: 'city',  header: 'المدينة', accessor: (r: any) => r.city ?? '—' },
          {
            key: 'phone', header: 'الهاتف',
            accessor: (r: any) => r.phone ? (
              <span className="num-latin text-xs flex items-center gap-1">
                <Phone className="h-3 w-3 text-slate-400" />
                {r.phone}
              </span>
            ) : '—',
          },
          { key: 'hours', header: 'ساعات العمل', accessor: (r: any) => r.workingHoursStart ? `${r.workingHoursStart} - ${r.workingHoursEnd}` : '—' },
          { key: 'active',header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.isActive ? 'active' : 'inactive'} /> },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر تحميل الفروع' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد فروع"
        exportFilename="branches"
        getRowKey={(r: any) => r.id}
      />
    </div>
  );
}
