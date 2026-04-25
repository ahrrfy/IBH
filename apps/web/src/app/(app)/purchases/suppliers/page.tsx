'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { formatIqd } from '@/lib/format';

export default function SuppliersPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api<any>('/purchases/suppliers'),
  });
  const rows = data?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">الموردون</h1>
          <p className="text-sm text-slate-500">{data?.total ?? 0} مورد</p>
        </div>
        <Link href="/purchases/suppliers/new" className="rounded bg-sky-700 px-4 py-2 text-white">+ مورد جديد</Link>
      </header>

      <DataTable
        columns={[
          { key: 'code',   header: 'الكود',  accessor: (r: any) => <Link href={`/purchases/suppliers/${r.id}`} className="font-mono text-sky-700 hover:underline">{r.code}</Link> },
          { key: 'name',   header: 'الاسم',  accessor: (r: any) => r.nameAr },
          { key: 'phone',  header: 'الهاتف', accessor: (r: any) => r.phone ?? '—' },
          { key: 'balance',header: 'الرصيد', accessor: (r: any) => formatIqd(r.balanceIqd ?? 0), align: 'end' },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر تحميل الموردين' : null}
        onRetry={() => refetch()}
        emptyMessage="لا يوجد موردون"
        exportFilename="suppliers"
        getRowKey={(r: any) => r.id}
      />
    </div>
  );
}
