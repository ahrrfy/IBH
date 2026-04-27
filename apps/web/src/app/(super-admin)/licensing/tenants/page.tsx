/**
 * T63 — Tenants list (super-admin).
 *
 * Shows all subscriptions across companies with current plan, status,
 * trial / period end, # active devices, and monthly MRR contribution.
 * Status filter and company-name search supported.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';

type StatusFilter =
  | ''
  | 'active'
  | 'trial'
  | 'grace'
  | 'suspended'
  | 'expired'
  | 'pending'
  | 'cancelled';

const STATUS_LABELS_AR: Record<string, string> = {
  active: 'نشط',
  trial: 'تجريبي',
  grace: 'سماح',
  suspended: 'موقوف',
  expired: 'منتهٍ',
  pending: 'معلّق',
  cancelled: 'ملغى',
};

interface TenantRow {
  id: string;
  companyId: string;
  companyCode: string | null;
  companyNameAr: string | null;
  companyNameEn: string | null;
  plan: { code: string; name: string } | null;
  status: string;
  billingCycle: string;
  startedAt: string | null;
  currentPeriodEndAt: string | null;
  trialEndsAt: string | null;
  monthlyMrrIqd: string;
  deviceCount: number;
}

export default function TenantsListPage() {
  const [status, setStatus] = useState<StatusFilter>('');
  const [search, setSearch] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-licensing', 'tenants', status, search],
    queryFn: () =>
      api<{ items: TenantRow[]; total: number }>('/admin/licensing/tenants', {
        method: 'GET',
        query: {
          status: status || undefined,
          search: search || undefined,
        },
      }),
  });

  const rows = data?.items ?? [];

  return (
    <div className="p-6 space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">العملاء (المستأجرون)</h1>
        <p className="text-sm text-slate-500 mt-1">{data?.total ?? 0} اشتراك</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white"
        >
          <option value="">كل الحالات</option>
          {Object.entries(STATUS_LABELS_AR).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="ابحث باسم الشركة أو الرمز…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white min-w-[16rem]"
        />
      </div>

      <DataTable<TenantRow>
        columns={[
          {
            key: 'company',
            header: 'الشركة',
            accessor: (r) => (
              <Link
                href={`/super-admin/licensing/tenants/${r.id}`}
                className="text-sky-700 hover:underline"
              >
                {r.companyNameAr ?? r.companyNameEn ?? r.companyCode ?? r.companyId}
              </Link>
            ),
          },
          { key: 'code', header: 'الرمز', accessor: (r) => r.companyCode ?? '—' },
          { key: 'plan', header: 'الباقة', accessor: (r) => r.plan?.name ?? '—' },
          {
            key: 'status',
            header: 'الحالة',
            accessor: (r) => <StatusBadge status={r.status} />,
            align: 'center',
          },
          {
            key: 'cycle',
            header: 'الدورة',
            accessor: (r) => (r.billingCycle === 'annual' ? 'سنوي' : r.billingCycle === 'monthly' ? 'شهري' : r.billingCycle),
            align: 'center',
          },
          {
            key: 'mrr',
            header: 'MRR (IQD)',
            accessor: (r) => Number(r.monthlyMrrIqd).toLocaleString('en-US'),
            align: 'end',
          },
          {
            key: 'devices',
            header: 'الأجهزة',
            accessor: (r) => r.deviceCount,
            align: 'center',
          },
          {
            key: 'until',
            header: 'صالح حتى',
            accessor: (r) => {
              const d = r.currentPeriodEndAt ?? r.trialEndsAt;
              return d ? formatDate(d) : '—';
            },
            align: 'center',
          },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذّر تحميل البيانات' : null}
        onRetry={() => refetch()}
        getRowKey={(r) => r.id}
        exportFilename="tenants"
      />
    </div>
  );
}
