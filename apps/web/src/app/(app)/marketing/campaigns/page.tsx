'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd } from '@/lib/format';

export default function CampaignsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api<any>('/marketing/campaigns'),
  });
  const rows: any[] = Array.isArray(data) ? data : data?.items ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">الحملات التسويقية</h1>
        <p className="text-sm text-slate-500">{rows.length} حملة</p>
      </header>

      <DataTable
        columns={[
          { key: 'name',     header: 'الاسم',    accessor: (r: any) => r.name },
          { key: 'channel',  header: 'القناة',   accessor: (r: any) => r.channel },
          { key: 'audience', header: 'الجمهور',  accessor: (r: any) => r.audienceSize ?? 0, align: 'end' },
          { key: 'budget',   header: 'الميزانية', accessor: (r: any) => formatIqd(r.budgetIqd ?? 0), align: 'end' },
          { key: 'spent',    header: 'المنفق',    accessor: (r: any) => formatIqd(r.spentIqd ?? 0), align: 'end' },
          { key: 'status',   header: 'الحالة',   accessor: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر التحميل' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد حملات"
        exportFilename="campaigns"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="campaigns"
        columnToggle
        densityToggle
        printable
        getRowKey={(r: any) => r.id}
      />
    </div>
  );
}
