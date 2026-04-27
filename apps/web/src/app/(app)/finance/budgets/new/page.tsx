'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Save, Plus, Trash2 } from 'lucide-react';

/**
 * T49 — Budget create page.
 *
 * Header (name + fiscal year) plus a flat line editor: each row is
 * (account, optional cost-center, period 1..12, amount). The grid stays
 * intentionally simple — admins can paste rows from a spreadsheet (one
 * line per cell separated by tabs) by enabling the CSV-paste textarea.
 */

type Account = { id: string; code: string; nameAr: string; isActive: boolean; allowDirectPosting: boolean };
type CostCenter = { id: string; code: string; nameAr: string; isActive: boolean };

interface LineDraft {
  accountCode: string;
  costCenterId: string;
  period: number;
  amount: string;
}

function emptyLine(): LineDraft {
  return { accountCode: '', costCenterId: '', period: 1, amount: '' };
}

export default function NewBudgetPage() {
  const router = useRouter();
  const now = new Date();
  const [name, setName] = useState('');
  const [fiscalYear, setFiscalYear] = useState<number>(now.getFullYear());
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [paste, setPaste] = useState('');
  const [error, setError] = useState<string | null>(null);

  const accountsQ = useQuery({
    queryKey: ['chart-of-accounts'],
    queryFn: () => api<Account[]>('/finance/gl/accounts'),
  });
  const costCentersQ = useQuery({
    queryKey: ['cost-centers'],
    queryFn: () => api<CostCenter[]>('/finance/gl/cost-centers').catch(() => [] as CostCenter[]),
  });
  const accounts = accountsQ.data ?? [];
  const costCenters = costCentersQ.data ?? [];

  const create = useMutation({
    mutationFn: (payload: { name: string; fiscalYear: number; lines: LineDraft[] }) =>
      api<{ id: string }>('/finance/budgets', {
        method: 'POST',
        body: {
          name: payload.name,
          fiscalYear: payload.fiscalYear,
          lines: payload.lines
            .filter((l) => l.accountCode && l.amount)
            .map((l) => ({
              accountCode: l.accountCode,
              costCenterId: l.costCenterId || null,
              period: l.period,
              amount: l.amount,
            })),
        },
      }),
    onSuccess: (b) => router.push(`/finance/budgets/${b.id}`),
    onError: (e: any) => setError(e?.messageAr ?? e?.message ?? 'فشل الإنشاء'),
  });

  function setLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines((prev) => [...prev, emptyLine()]); }
  function removeLine(idx: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  /**
   * Parse pasted CSV/TSV: one line per row, columns:
   *   accountCode, costCenterId|empty, period(1-12), amount
   */
  function importPaste() {
    const out: LineDraft[] = [];
    for (const raw of paste.split(/\r?\n/)) {
      const row = raw.trim();
      if (!row) continue;
      const parts = row.split(/[,\t]/).map((s) => s.trim());
      if (parts.length < 3) continue;
      const [code, cc, periodStr, amount] = parts.length === 3
        ? [parts[0], '', parts[1], parts[2]]
        : [parts[0], parts[1], parts[2], parts[3]];
      const periodN = Number(periodStr);
      if (!code || !Number.isInteger(periodN) || periodN < 1 || periodN > 12) continue;
      out.push({ accountCode: code, costCenterId: cc, period: periodN, amount: amount ?? '' });
    }
    if (out.length) {
      setLines(out);
      setPaste('');
    }
  }

  function submit() {
    setError(null);
    if (!name.trim()) return setError('الاسم مطلوب');
    if (!Number.isInteger(fiscalYear)) return setError('السنة المالية غير صالحة');
    if (lines.every((l) => !l.accountCode)) return setError('أضف بنداً واحداً على الأقل');
    create.mutate({ name, fiscalYear, lines });
  }

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">موازنة جديدة</h1>
        <p className="text-sm text-slate-500 mt-1">
          أنشئ مسودة موازنة سنوية. يمكنك تعديلها لاحقاً قبل التفعيل.
        </p>
      </header>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded p-3">{error}</div>
      )}

      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-600 mb-1">الاسم</label>
            <input
              className="input w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="موازنة 2026"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">السنة المالية</label>
            <input
              type="number"
              className="input num-latin w-32"
              value={fiscalYear}
              onChange={(e) => setFiscalYear(Number(e.target.value))}
            />
          </div>
        </div>
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
              <th className="text-right px-3 py-2">الحساب</th>
              <th className="text-right px-3 py-2 w-40">مركز تكلفة</th>
              <th className="text-right px-3 py-2 w-24">الشهر</th>
              <th className="text-right px-3 py-2 w-40">المبلغ (د.ع)</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const acc = accounts.find((a) => a.code === l.accountCode);
              return (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-1">
                    <input
                      className="input num-latin font-mono w-24"
                      dir="ltr"
                      list="accounts-budget"
                      value={l.accountCode}
                      onChange={(e) => setLine(i, { accountCode: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-1 text-slate-600 text-xs">
                    {acc?.nameAr ?? <span className="text-slate-400">—</span>}
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
              );
            })}
          </tbody>
        </table>
        <datalist id="accounts-budget">
          {accounts.filter((a) => a.isActive && a.allowDirectPosting).map((a) => (
            <option key={a.id} value={a.code}>{a.nameAr}</option>
          ))}
        </datalist>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">لصق دفعة (CSV/TSV)</h3>
        <p className="text-xs text-slate-500 mb-2">
          الأعمدة: <code dir="ltr">accountCode, costCenterId, period, amount</code>
        </p>
        <textarea
          className="input w-full font-mono text-xs"
          dir="ltr"
          rows={4}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="5101,,1,150000"
        />
        <button type="button" className="btn-ghost mt-2 text-xs" onClick={importPaste}>
          استيراد
        </button>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          className="btn-primary"
          disabled={create.isPending}
          onClick={submit}
        >
          <Save className="h-4 w-4" />
          حفظ كمسودة
        </button>
      </div>
    </div>
  );
}
