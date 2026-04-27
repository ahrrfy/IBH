'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Save, Plus, Trash2 } from 'lucide-react';

/**
 * T49 — Budget edit (draft only).
 *
 * Server enforces "draft only" — this page just gates the UI accordingly.
 * Submitting replaces all lines (clean editor semantics).
 */

type Account = { id: string; code: string; nameAr: string; isActive: boolean; allowDirectPosting: boolean };
type CostCenter = { id: string; code: string; nameAr: string; isActive: boolean };

interface Line {
  accountCode: string;
  costCenterId: string;
  period: number;
  amount: string;
}

type Budget = {
  id: string;
  name: string;
  fiscalYear: number;
  status: 'draft' | 'active' | 'closed';
  lines: Array<{ accountCode: string; costCenterId: string | null; period: number; amount: string }>;
};

export default function EditBudgetPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [name, setName] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);

  const budgetQ = useQuery({
    queryKey: ['budget', id],
    queryFn: () => api<Budget>(`/finance/budgets/${id}`),
  });
  const accountsQ = useQuery({
    queryKey: ['chart-of-accounts'],
    queryFn: () => api<Account[]>('/finance/gl/accounts'),
  });
  const costCentersQ = useQuery({
    queryKey: ['cost-centers'],
    queryFn: () => api<CostCenter[]>('/finance/gl/cost-centers').catch(() => [] as CostCenter[]),
  });

  useEffect(() => {
    const b = budgetQ.data;
    if (!b) return;
    setName(b.name);
    setLines(
      b.lines.map((l) => ({
        accountCode: l.accountCode,
        costCenterId: l.costCenterId ?? '',
        period: l.period,
        amount: String(l.amount),
      })),
    );
  }, [budgetQ.data]);

  const save = useMutation({
    mutationFn: () =>
      api(`/finance/budgets/${id}`, {
        method: 'PUT',
        body: {
          name,
          lines: lines
            .filter((l) => l.accountCode && l.amount)
            .map((l) => ({
              accountCode: l.accountCode,
              costCenterId: l.costCenterId || null,
              period: l.period,
              amount: l.amount,
            })),
        },
      }),
    onSuccess: () => router.push(`/finance/budgets/${id}`),
    onError: (e: any) => setError(e?.messageAr ?? e?.message ?? 'فشل الحفظ'),
  });

  function setLine(idx: number, patch: Partial<Line>) {
    setLines((p) => p.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((p) => [...p, { accountCode: '', costCenterId: '', period: 1, amount: '' }]);
  }
  function removeLine(idx: number) {
    setLines((p) => p.filter((_, i) => i !== idx));
  }

  const accounts = accountsQ.data ?? [];
  const costCenters = costCentersQ.data ?? [];
  const budget = budgetQ.data;

  if (!budget) return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  if (budget.status !== 'draft') {
    return (
      <div className="p-6 max-w-4xl">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded p-4 text-sm">
          لا يمكن تعديل موازنة بعد التفعيل. الحالة الحالية: <strong>{budget.status}</strong>.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">تعديل الموازنة</h1>
      </header>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded p-3">{error}</div>
      )}

      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <label className="block text-xs text-slate-600 mb-1">الاسم</label>
        <input className="input w-full max-w-md" value={name} onChange={(e) => setName(e.target.value)} />
      </section>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <header className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-700">البنود</h2>
          <button type="button" className="btn-ghost text-xs" onClick={addLine}>
            <Plus className="h-3 w-3" /> إضافة بند
          </button>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-right px-3 py-2 w-32">رمز الحساب</th>
              <th className="text-right px-3 py-2 w-40">مركز تكلفة</th>
              <th className="text-right px-3 py-2 w-24">الشهر</th>
              <th className="text-right px-3 py-2 w-40">المبلغ (د.ع)</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-3 py-1">
                  <input
                    className="input num-latin font-mono w-24"
                    dir="ltr"
                    list="accounts-budget-edit"
                    value={l.accountCode}
                    onChange={(e) => setLine(i, { accountCode: e.target.value })}
                  />
                </td>
                <td className="px-3 py-1">
                  <select
                    className="input w-full"
                    value={l.costCenterId}
                    onChange={(e) => setLine(i, { costCenterId: e.target.value })}
                  >
                    <option value="">— لا يوجد —</option>
                    {costCenters.filter((c) => c.isActive).map((c) => (
                      <option key={c.id} value={c.id}>{c.code} · {c.nameAr}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1">
                  <input
                    type="number"
                    min={1}
                    max={12}
                    className="input num-latin w-16"
                    dir="ltr"
                    value={l.period}
                    onChange={(e) => setLine(i, { period: Number(e.target.value) })}
                  />
                </td>
                <td className="px-3 py-1">
                  <input
                    type="number"
                    step="0.001"
                    className="input num-latin w-36"
                    dir="ltr"
                    value={l.amount}
                    onChange={(e) => setLine(i, { amount: e.target.value })}
                  />
                </td>
                <td className="px-3 py-1">
                  <button
                    type="button"
                    className="text-rose-600 hover:bg-rose-50 rounded p-1"
                    onClick={() => removeLine(i)}
                    aria-label="حذف"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="accounts-budget-edit">
          {accounts.filter((a) => a.isActive && a.allowDirectPosting).map((a) => (
            <option key={a.id} value={a.code}>{a.nameAr}</option>
          ))}
        </datalist>
      </section>

      <div className="flex justify-end">
        <button type="button" className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
          <Save className="h-4 w-4" /> حفظ التعديلات
        </button>
      </div>
    </div>
  );
}
