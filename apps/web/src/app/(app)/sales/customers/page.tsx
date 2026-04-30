'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { formatIqd } from '@/lib/format';

export default function CustomersPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api<any>('/sales/customers'),
  });
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">العملاء</h1>
      <DataTable
        columns={[
          { key: 'code', header: 'الرمز', accessor: (r: any) => r.code },
          { key: 'name', header: 'الاسم', accessor: (r: any) => r.nameAr },
          { key: 'phone', header: 'الهاتف', accessor: (r: any) => r.phone ?? '—' },
          { key: 'balance', header: 'الرصيد', accessor: (r: any) => formatIqd(r.creditBalanceIqd), align: 'end' },
          { key: 'tier', header: 'المستوى', accessor: (r: any) => r.loyaltyTier ?? 'عادي' },
          { key: 'points', header: 'النقاط', accessor: (r: any) => r.loyaltyPoints ?? 0, align: 'center' },
        ]}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error ? 'خطأ' : null}
        onRetry={() => refetch()}
        getRowKey={(r: any) => r.id}
        exportFilename="customers"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="customers"
        columnToggle
        densityToggle
        printable
      />
    </div>
  );
}
