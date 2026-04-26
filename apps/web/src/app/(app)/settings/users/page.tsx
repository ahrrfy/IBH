'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';
import { Plus, Mail, Shield } from 'lucide-react';
import { ROLE_LABELS_AR } from '@/lib/permissions';

export default function UsersListPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: () => api<any>('/users'),
  });
  const rows: any[] = Array.isArray(data) ? data : data?.items ?? [];

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">المستخدمون</h1>
          <p className="text-sm text-slate-500 mt-1">{rows.length} مستخدم</p>
        </div>
        <Link href="/settings/users/new" className="btn-primary btn-sm">
          <Plus className="h-3.5 w-3.5" />
          مستخدم جديد
        </Link>
      </header>

      <DataTable
        columns={[
          {
            key: 'name', header: 'الاسم',
            accessor: (r: any) => (
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-sky-700 text-white grid place-items-center text-xs font-bold">
                  {(r.nameAr || r.email || 'م').slice(0, 1)}
                </div>
                <Link href={`/settings/users/${r.id}`} className="font-medium text-sky-700 hover:underline">
                  {r.nameAr ?? r.email}
                </Link>
              </div>
            ),
          },
          {
            key: 'email', header: 'البريد',
            accessor: (r: any) => (
              <span className="text-slate-600 text-xs flex items-center gap-1.5 num-latin">
                <Mail className="h-3 w-3" />
                {r.email ?? '—'}
              </span>
            ),
          },
          {
            key: 'roles', header: 'الأدوار',
            accessor: (r: any) => {
              const roles: string[] = r.roles ?? r.userRoles?.map((ur: any) => ur.role?.name) ?? [];
              return roles.length === 0 ? '—' : (
                <div className="flex flex-wrap gap-1">
                  {roles.map((rn: string) => (
                    <span key={rn} className="badge-brand text-[10px]">
                      <Shield className="h-2.5 w-2.5" />
                      {ROLE_LABELS_AR[rn] ?? rn}
                    </span>
                  ))}
                </div>
              );
            },
          },
          { key: 'branch',  header: 'الفرع',  accessor: (r: any) => r.branch?.nameAr ?? r.branchName ?? '—' },
          { key: 'status',  header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status ?? 'active'} /> },
          { key: 'created', header: 'تاريخ الإنشاء', accessor: (r: any) => <span className="num-latin font-mono text-xs">{formatDate(r.createdAt)}</span> },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر تحميل المستخدمين' : null}
        onRetry={() => refetch()}
        emptyMessage="لا يوجد مستخدمون"
        exportFilename="users"
        getRowKey={(r: any) => r.id}
      />
    </div>
  );
}
