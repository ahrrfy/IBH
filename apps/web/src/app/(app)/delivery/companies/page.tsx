'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';

type DeliveryCompany = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  type: 'internal' | 'external';
  isActive: boolean;
  autoSuspendedAt: string | null;
  commissionPct: string;
  successRatePct: string;
  totalDispatched: number;
  totalDelivered: number;
  supportsCod: boolean;
};

export default function DeliveryCompaniesPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['delivery-companies'],
    queryFn: () => api<{ rows: DeliveryCompany[]; total: number }>('/delivery/companies?limit=200'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Building2 className="size-7" /> شركات التوصيل
        </h1>
        <Link
          href="/delivery/companies/new"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-white hover:bg-primary/90"
        >
          <Plus className="size-4" /> شركة جديدة
        </Link>
      </div>

      <DataTable
        columns={[
          { key: 'code', header: 'الكود', accessor: (r: DeliveryCompany) => r.code },
          { key: 'nameAr', header: 'الاسم', accessor: (r: DeliveryCompany) => r.nameAr },
          {
            key: 'type',
            header: 'النوع',
            accessor: (r: DeliveryCompany) => (r.type === 'internal' ? 'داخلي' : 'خارجي'),
          },
          {
            key: 'commission',
            header: 'العمولة %',
            accessor: (r: DeliveryCompany) => `${r.commissionPct}%`,
            align: 'end',
          },
          {
            key: 'success',
            header: 'نجاح %',
            accessor: (r: DeliveryCompany) =>
              r.totalDispatched > 0 ? `${r.successRatePct}% (${r.totalDelivered}/${r.totalDispatched})` : '—',
            align: 'end',
          },
          {
            key: 'cod',
            header: 'COD',
            accessor: (r: DeliveryCompany) => (r.supportsCod ? '✓' : '—'),
            align: 'center',
          },
          {
            key: 'status',
            header: 'الحالة',
            accessor: (r: DeliveryCompany) =>
              r.autoSuspendedAt ? (
                <StatusBadge status="suspended" />
              ) : r.isActive ? (
                <StatusBadge status="active" />
              ) : (
                <StatusBadge status="inactive" />
              ),
          },
          {
            key: 'actions',
            header: '',
            accessor: (r: DeliveryCompany) => (
              <Link href={`/delivery/companies/${r.id}`} className="text-primary hover:underline">
                عرض
              </Link>
            ),
          },
        ]}
        rows={data?.rows ?? []}
        loading={isLoading}
        error={error ? 'خطأ بالتحميل' : null}
        onRetry={() => refetch()}
        getRowKey={(r: DeliveryCompany) => r.id}
        exportFilename="delivery-companies"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="delivery-companies"
        columnToggle
        densityToggle
        printable
      />
    </div>
  );
}
