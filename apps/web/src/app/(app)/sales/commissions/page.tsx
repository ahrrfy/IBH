'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useLiveResource } from '@/lib/realtime/use-live-resource';
import { formatIqd, formatDate } from '@/lib/format';

interface CommissionEntry {
  id: string;
  employeeId: string | null;
  promoterName: string | null;
  kind: string;
  refType: string;
  refId: string;
  baseAmountIqd: string;
  pctApplied: string;
  amountIqd: string;
  status: string;
  createdAt: string;
  plan?: { code: string; nameAr: string };
}

const STATUSES = [
  { value: '', label: 'كل الحالات' },
  { value: 'accrued', label: 'مستحقة' },
  { value: 'paid', label: 'مدفوعة' },
  { value: 'reversed', label: 'معكوسة' },
];

export default function CommissionsPage() {
  const [status, setStatus] = useState('');

  const params = new URLSearchParams({ limit: '100' });
  if (status) params.set('status', status);

  const { data, isLoading } = useQuery({
    queryKey: ['commission-entries', status],
    queryFn: () =>
      api<{ items: CommissionEntry[]; total: number }>(
        `/sales/commissions/entries?${params}`,
      ),
  });

  useLiveResource(
    ['commission-entries', status],
    ['commission.recorded'],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">العمولات والحوافز</h1>
          <p className="text-sm text-slate-500">{data?.total ?? 0} قيد عمولة</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/sales/commissions/plans"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            خطط العمولة
          </Link>
          <Link
            href="/sales/commissions/new"
            className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800"
          >
            <Plus className="size-4" /> قيد يدوي
          </Link>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatus(s.value)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              status === s.value
                ? 'bg-sky-700 text-white'
                : 'bg-white border border-slate-300 hover:bg-slate-50'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-right p-3">التاريخ</th>
              <th className="text-right p-3">الخطة</th>
              <th className="text-right p-3">المرجع</th>
              <th className="text-right p-3">النوع</th>
              <th className="text-right p-3">الأساس</th>
              <th className="text-right p-3">النسبة</th>
              <th className="text-right p-3">المبلغ</th>
              <th className="text-right p-3">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-500">
                  جاري التحميل...
                </td>
              </tr>
            )}
            {!isLoading && (data?.items?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-500">
                  لا توجد قيود عمولة
                </td>
              </tr>
            )}
            {data?.items?.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-3">{formatDate(e.createdAt)}</td>
                <td className="p-3">{e.plan?.nameAr ?? '—'}</td>
                <td className="p-3 font-mono text-xs">
                  {e.refType}:{e.refId.slice(-6)}
                </td>
                <td className="p-3">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs ${
                      e.kind === 'accrual'
                        ? 'bg-emerald-100 text-emerald-700'
                        : e.kind === 'clawback'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {e.kind}
                  </span>
                </td>
                <td className="p-3">{formatIqd(Number(e.baseAmountIqd))}</td>
                <td className="p-3">{Number(e.pctApplied).toFixed(2)}%</td>
                <td className="p-3 font-medium">{formatIqd(Number(e.amountIqd))}</td>
                <td className="p-3">{e.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
