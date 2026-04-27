'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Pencil, CheckCircle2, Lock } from 'lucide-react';

/**
 * T49 — Budget detail + variance heatmap.
 *
 * Shows the budget header + a per-line variance table colored by status.
 * Active/closed budgets can no longer be edited — use the activate/close
 * actions to advance the lifecycle.
 */

type Budget = {
  id: string;
  name: string;
  fiscalYear: number;
  status: 'draft' | 'active' | 'closed';
  lines: BudgetLine[];
};

type BudgetLine = {
  id: string;
  accountCode: string;
  costCenterId: string | null;
  period: number;
  amount: string;
};

type VarianceRow = {
  accountCode: string;
  costCenterId: string | null;
  period: number;
  budget: string;
  actual: string;
  variance: string;
  variancePct: number;
  status: 'under' | 'on-track' | 'warning' | 'over';
};

const STATUS_CLASS: Record<VarianceRow['status'], string> = {
  under: 'bg-slate-100 text-slate-700',
  'on-track': 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  over: 'bg-rose-100 text-rose-800',
};

const STATUS_AR: Record<VarianceRow['status'], string> = {
  under: 'أقل من المتوقع',
  'on-track': 'ضمن الخطة',
  warning: 'تحذير',
  over: 'تجاوز',
};

const BUDGET_STATUS_AR = { draft: 'مسودة', active: 'نشطة', closed: 'مغلقة' };

export default function BudgetDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const id = params.id;

  const budgetQ = useQuery({
    queryKey: ['budget', id],
    queryFn: () => api<Budget>(`/finance/budgets/${id}`),
  });
  const varianceQ = useQuery({
    queryKey: ['budget-variance', id],
    queryFn: () => api<VarianceRow[]>(`/finance/budgets/${id}/variance`),
    enabled: !!id,
  });

  const activate = useMutation({
    mutationFn: () => api(`/finance/budgets/${id}/activate`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget', id] }),
  });
  const close = useMutation({
    mutationFn: () => api(`/finance/budgets/${id}/close`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget', id] }),
  });

  const budget = budgetQ.data;
  const rows = varianceQ.data ?? [];

  if (!budget) {
    return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  }

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{budget.name}</h1>
          <p className="text-sm text-slate-500 mt-1 num-latin" dir="ltr">
            {budget.fiscalYear} · {BUDGET_STATUS_AR[budget.status]}
          </p>
        </div>
        <div className="flex gap-2">
          {budget.status === 'draft' && (
            <>
              <Link href={`/finance/budgets/${id}/edit`} className="btn-ghost">
                <Pencil className="h-4 w-4" /> تعديل
              </Link>
              <button
                type="button"
                className="btn-primary"
                disabled={activate.isPending}
                onClick={() => activate.mutate()}
              >
                <CheckCircle2 className="h-4 w-4" /> تفعيل
              </button>
            </>
          )}
          {budget.status !== 'closed' && (
            <button
              type="button"
              className="btn-ghost"
              disabled={close.isPending}
              onClick={() => close.mutate()}
            >
              <Lock className="h-4 w-4" /> إغلاق
            </button>
          )}
        </div>
      </header>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <header className="bg-slate-50 px-4 py-2 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700">الانحراف الفعلي مقابل الموازنة</h2>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-right px-3 py-2 w-28">الحساب</th>
              <th className="text-right px-3 py-2 w-32">مركز تكلفة</th>
              <th className="text-right px-3 py-2 w-16">الشهر</th>
              <th className="text-right px-3 py-2">الموازنة</th>
              <th className="text-right px-3 py-2">الفعلي</th>
              <th className="text-right px-3 py-2">الفرق</th>
              <th className="text-right px-3 py-2 w-20">%</th>
              <th className="text-right px-3 py-2 w-32">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {varianceQ.isLoading && (
              <tr><td colSpan={8} className="text-center text-slate-400 py-8">جارٍ التحميل…</td></tr>
            )}
            {!varianceQ.isLoading && rows.length === 0 && (
              <tr><td colSpan={8} className="text-center text-slate-400 py-8">لا توجد بنود</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono num-latin" dir="ltr">{r.accountCode}</td>
                <td className="px-3 py-2 text-xs text-slate-500 font-mono num-latin" dir="ltr">{r.costCenterId ?? '—'}</td>
                <td className="px-3 py-2 num-latin" dir="ltr">{r.period}</td>
                <td className="px-3 py-2 num-latin" dir="ltr">{r.budget}</td>
                <td className="px-3 py-2 num-latin" dir="ltr">{r.actual}</td>
                <td className="px-3 py-2 num-latin" dir="ltr">{r.variance}</td>
                <td className="px-3 py-2 num-latin" dir="ltr">{r.variancePct}%</td>
                <td className="px-3 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs ${STATUS_CLASS[r.status]}`}>
                    {STATUS_AR[r.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
