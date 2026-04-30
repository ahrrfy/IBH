'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';
import { Landmark, ScanLine } from 'lucide-react';

export default function BankAccountsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => api<any>('/finance/banks'),
  });
  const rows: any[] = Array.isArray(data) ? data : data?.items ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Landmark className="h-6 w-6 text-sky-700" />
          الحسابات البنكية
        </h1>
        <p className="text-sm text-slate-500 mt-1">{rows.length} حساب</p>
      </header>

      <DataTable
        columns={[
          {
            key: 'name', header: 'الاسم',
            accessor: (r: any) => (
              <div>
                <div className="text-sm font-semibold text-slate-900">{r.nameAr ?? r.name}</div>
                <div className="text-[11px] text-slate-500 num-latin font-mono">
                  {r.bankName} · {r.accountNumber}
                </div>
              </div>
            ),
            exportValue: (r: any) => r.nameAr ?? r.name,
          },
          { key: 'currency', header: 'العملة', accessor: (r: any) => r.currency ?? 'IQD', exportValue: (r: any) => r.currency ?? 'IQD' },
          {
            key: 'balance', header: 'الرصيد', align: 'end',
            accessor: (r: any) => (
              <span className="num-latin font-mono">
                {Number(r.currentBalance ?? 0).toLocaleString()}
              </span>
            ),
            sortable: true, sortValue: (r: any) => Number(r.currentBalance ?? 0), exportValue: (r: any) => Number(r.currentBalance ?? 0),
          },
          {
            key: 'lastReconciled', header: 'آخر مطابقة',
            accessor: (r: any) =>
              r.lastReconciledAt ? (
                <span className="num-latin font-mono text-xs">{formatDate(r.lastReconciledAt)}</span>
              ) : (
                <span className="text-rose-500 text-xs">لم تتم</span>
              ),
            exportValue: (r: any) => r.lastReconciledAt ?? '',
          },
          { key: 'status', header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.isActive ? 'active' : 'inactive'} />, exportValue: (r: any) => r.isActive ? 'نشط' : 'غير نشط' },
          {
            key: 'actions', header: '', hideable: false,
            accessor: (r: any) => (
              <Link href={`/finance/banks/${r.id}/reconcile`} className="btn-ghost btn-sm">
                <ScanLine className="h-3.5 w-3.5" />
                مطابقة
              </Link>
            ),
          },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر تحميل الحسابات' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد حسابات بنكية"
        getRowKey={(r: any) => r.id}
        exportFilename="bank-accounts"
        exportFormats={['csv', 'excel']}
        exportTitle="الحسابات البنكية"
        columnToggle
        densityToggle
        printable
      />
    </div>
  );
}
