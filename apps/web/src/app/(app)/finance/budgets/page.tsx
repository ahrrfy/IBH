'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Wallet, Plus } from 'lucide-react';

/**
 * T49 — Budget List
 *
 * Lists all budgets for the company. Filter by fiscal year and status.
 * Each row links to the budget detail page where variance is shown.
 */

type BudgetRow = {
  id: string;
  name: string;
  fiscalYear: number;
  status: 'draft' | 'active' | 'closed';
  createdAt: string;
  _count?: { lines: number };
};

const STATUS_AR: Record<BudgetRow['status'], string> = {
  draft: 'مسودة',
  active: 'نشطة',
  closed: 'مغلقة',
};

const STATUS_BADGE: Record<BudgetRow['status'], string> = {
  draft: 'bg-slate-100 text-slate-700',
  active: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-zinc-200 text-zinc-700',
};

export default function BudgetsPage() {
  const now = new Date();
  const [year, setYear] = useState<number | ''>(now.getFullYear());
  const [status, setStatus] = useState<string>('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['budgets', year, status],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (year) qs.set('fiscalYear', String(year));
      if (status) qs.set('status', status);
      return api<BudgetRow[]>(`/finance/budgets?${qs.toString()}`);
    },
  });

  const rows = data ?? [];

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="h-6 w-6 text-sky-700" />
            الموازنات
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            تخطيط مالي سنوي لكل حساب ومركز تكلفة، مع متابعة الانحراف.
          </p>
        </div>
        <Link href="/finance/budgets/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          موازنة جديدة
        </Link>
      </header>

      <div className="flex gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-600 mb-1">السنة</label>
          <input
            type="number"
            className="input num-latin w-28"
            value={year}
            onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">الحالة</label>
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">الكل</option>
            <option value="draft">مسودة</option>
            <option value="active">نشطة</option>
            <option value="closed">مغلقة</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded p-3">
          {(error as Error).message}
        </div>
      )}

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-right px-4 py-2">الاسم</th>
              <th className="text-right px-4 py-2 w-24">السنة</th>
              <th className="text-right px-4 py-2 w-28">الحالة</th>
              <th className="text-right px-4 py-2 w-24">عدد البنود</th>
              <th className="text-right px-4 py-2 w-32">تاريخ الإنشاء</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="text-center text-slate-400 py-8">
                  جارٍ التحميل…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-slate-400 py-8">
                  لا توجد موازنات
                </td>
              </tr>
            )}
            {rows.map((b) => (
              <tr key={b.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/finance/budgets/${b.id}`} className="text-sky-700 hover:underline font-medium">
                    {b.name}
                  </Link>
                </td>
                <td className="px-4 py-2 num-latin" dir="ltr">{b.fiscalYear}</td>
                <td className="px-4 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs ${STATUS_BADGE[b.status]}`}>
                    {STATUS_AR[b.status]}
                  </span>
                </td>
                <td className="px-4 py-2 num-latin" dir="ltr">{b._count?.lines ?? 0}</td>
                <td className="px-4 py-2 text-slate-600 num-latin" dir="ltr">
                  {b.createdAt.slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
