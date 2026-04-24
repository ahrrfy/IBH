'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { formatIqd } from '@/lib/format';

export default function TrialBalancePage() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['trial-balance', asOf],
    queryFn: () => api<any>(`/finance/gl/trial-balance?asOf=${asOf}`),
  });

  const lines = data?.lines ?? [];
  const totalDebit = data?.totalDebit ?? 0;
  const totalCredit = data?.totalCredit ?? 0;
  const balanced = totalDebit === totalCredit;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">ميزان المراجعة</h1>
        <div className="mt-3 flex items-center gap-3">
          <label className="text-sm text-slate-600">كما في تاريخ:</label>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="rounded border px-3 py-2"
          />
          <span className={balanced ? 'rounded bg-emerald-100 px-3 py-1 text-emerald-700' : 'rounded bg-rose-100 px-3 py-1 text-rose-700 font-bold'}>
            {balanced ? '✓ متوازن' : '⚠ غير متوازن'}
          </span>
        </div>
      </header>

      <DataTable
        columns={[
          { key: 'code', header: 'رمز الحساب', accessor: (r: any) => r.accountCode },
          { key: 'name', header: 'الاسم', accessor: (r: any) => r.nameAr },
          { key: 'debit', header: 'مدين', accessor: (r: any) => formatIqd(r.debit ?? 0), align: 'end' },
          { key: 'credit', header: 'دائن', accessor: (r: any) => formatIqd(r.credit ?? 0), align: 'end' },
          { key: 'balance', header: 'الرصيد', accessor: (r: any) => formatIqd(r.balance ?? 0), align: 'end' },
        ]}
        rows={lines}
        loading={isLoading}
        error={error ? 'خطأ' : null}
        onRetry={() => refetch()}
        getRowKey={(r: any, i: number) => r.accountCode ?? String(i)}
        exportFilename={`trial-balance-${asOf}`}
      />

      <div className="rounded-lg bg-slate-100 p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-sm text-slate-600">إجمالي المدين</div>
            <div className="text-xl font-bold">{formatIqd(totalDebit)}</div>
          </div>
          <div>
            <div className="text-sm text-slate-600">إجمالي الدائن</div>
            <div className="text-xl font-bold">{formatIqd(totalCredit)}</div>
          </div>
          <div>
            <div className="text-sm text-slate-600">الفرق</div>
            <div className={`text-xl font-bold ${balanced ? 'text-emerald-700' : 'text-rose-700'}`}>
              {formatIqd(Math.abs(totalDebit - totalCredit))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
