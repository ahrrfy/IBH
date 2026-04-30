'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { Shield, Lock } from 'lucide-react';
import { ROLE_LABELS_AR } from '@/lib/permissions';

export default function RolesListPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api<any>('/company/roles'),
  });
  const rows: any[] = Array.isArray(data) ? data : data?.items ?? [];

  return (
    <div className="p-6 space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">الأدوار والصلاحيات</h1>
        <p className="text-sm text-slate-500 mt-1">{rows.length} دور · يحدّد ما يمكن لكل مستخدم رؤيته وفعله</p>
      </header>

      <DataTable
        columns={[
          {
            key: 'name', header: 'اسم الدور',
            accessor: (r: any) => (
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded bg-sky-50 text-sky-700 grid place-items-center">
                  <Shield className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{r.displayNameAr ?? ROLE_LABELS_AR[r.name] ?? r.name}</div>
                  <div className="text-[11px] text-slate-500 font-mono num-latin">{r.name}</div>
                </div>
              </div>
            ),
          },
          {
            key: 'isSystem', header: 'النوع',
            accessor: (r: any) => r.isSystem
              ? <span className="badge-neutral text-[10px]"><Lock className="h-2.5 w-2.5" /> دور نظام</span>
              : <span className="badge-info text-[10px]">دور مخصّص</span>,
          },
          {
            key: 'permCount', header: 'عدد الصلاحيات',
            accessor: (r: any) => {
              const perms = r.permissions ? Object.keys(r.permissions).length : 0;
              return <span className="num-latin font-mono">{perms}</span>;
            },
            align: 'end',
          },
          { key: 'users', header: 'المستخدمون', accessor: (r: any) => <span className="num-latin font-mono">{r.userCount ?? r.userRoles?.length ?? 0}</span>, align: 'end' },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر تحميل الأدوار' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد أدوار"
        exportFilename="roles"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="roles"
        columnToggle
        densityToggle
        printable
        getRowKey={(r: any) => r.id}
      />
    </div>
  );
}
