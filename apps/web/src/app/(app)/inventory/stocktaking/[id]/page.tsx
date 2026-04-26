'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';
import { ClipboardList, ArrowRight, Plus, CheckCircle2, Save, Trash2 } from 'lucide-react';

interface CountLine {
  variantId: string;
  qtyActual: number | '';
  notes: string;
}

export default function StocktakingDetailPage() {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();
  const id = params?.id;
  const [error, setError] = useState<string | null>(null);
  const [draftLines, setDraftLines] = useState<CountLine[]>([
    { variantId: '', qtyActual: '', notes: '' },
  ]);

  const sessionQ = useQuery({
    queryKey: ['stocktaking', id],
    queryFn: () => api<any>(`/inventory/stocktaking/${id}`),
    enabled: Boolean(id),
  });

  const submitCount = useMutation({
    mutationFn: () => {
      const validLines = draftLines
        .filter((l) => l.variantId.trim() !== '' && l.qtyActual !== '' && Number(l.qtyActual) >= 0)
        .map((l) => ({
          variantId: l.variantId.trim(),
          qtyActual: Number(l.qtyActual),
          notes: l.notes || undefined,
        }));
      return api<any>(`/inventory/stocktaking/${id}/count`, {
        method: 'POST',
        body: { lines: validLines },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stocktaking', id] });
      qc.invalidateQueries({ queryKey: ['stocktaking'] });
      setDraftLines([{ variantId: '', qtyActual: '', notes: '' }]);
    },
    onError: (e: any) => setError(e?.messageAr ?? e?.message ?? 'تعذَّر حفظ العد'),
  });

  const approve = useMutation({
    mutationFn: () => api<any>(`/inventory/stocktaking/${id}/approve`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stocktaking', id] });
      qc.invalidateQueries({ queryKey: ['stocktaking'] });
    },
    onError: (e: any) => setError(e?.messageAr ?? e?.message ?? 'تعذَّر اعتماد الجرد'),
  });

  if (sessionQ.isLoading) {
    return <div className="p-6 text-sm text-slate-500">جاري التحميل…</div>;
  }
  if (sessionQ.error || !sessionQ.data) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-sm text-rose-600">تعذَّر تحميل الجلسة</p>
        <Link href="/inventory/stocktaking" className="btn-ghost btn-sm inline-flex">
          <ArrowRight className="h-4 w-4" />
          العودة للقائمة
        </Link>
      </div>
    );
  }

  const s = sessionQ.data;
  const canCount = ['draft', 'in_progress'].includes(s.status);
  const canApprove = s.status === 'counted' || s.status === 'in_progress';
  const isApproved = s.status === 'approved';

  const setLine = (i: number, patch: Partial<CountLine>) =>
    setDraftLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const totalVariance = (s.lines ?? []).reduce(
    (a: number, l: any) => a + Number(l.varianceValueIqd ?? 0),
    0,
  );

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-sky-700" />
            <span className="font-mono num-latin">{s.sessionNumber}</span>
            <StatusBadge status={s.status ?? 'draft'} />
          </h1>
          <p className="text-sm text-slate-500 mt-1 num-latin">
            {formatDate(s.countDate ?? s.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/inventory/stocktaking" className="btn-ghost btn-sm">
            <ArrowRight className="h-4 w-4" />
            رجوع
          </Link>
          {canApprove && !isApproved && (
            <button
              onClick={() => {
                setError(null);
                approve.mutate();
              }}
              disabled={approve.isPending}
              className="btn-primary btn-sm"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {approve.isPending ? 'جاري الاعتماد…' : 'اعتماد + ترحيل'}
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="عدد البنود" value={<span className="num-latin">{s.lines?.length ?? 0}</span>} />
        <Stat
          label="إجمالي الفروقات"
          value={
            totalVariance === 0 ? (
              <span className="text-slate-400">—</span>
            ) : (
              <span className={['num-latin', totalVariance >= 0 ? 'text-emerald-700' : 'text-rose-700'].join(' ')}>
                {totalVariance > 0 ? '+' : ''}{totalVariance.toLocaleString()} د.ع
              </span>
            )
          }
        />
        {s.notes && <Stat label="ملاحظات" value={<span className="text-xs">{s.notes}</span>} />}
      </div>

      {canCount && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900">إدخال الكميات المعدودة</h2>
            <button
              type="button"
              onClick={() => setDraftLines((p) => [...p, { variantId: '', qtyActual: '', notes: '' }])}
              className="btn-ghost btn-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              بند
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-right pb-2 font-medium">معرّف الصنف</th>
                <th className="text-end pb-2 font-medium w-32">الكمية الفعلية</th>
                <th className="text-right pb-2 font-medium">ملاحظات</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {draftLines.map((l, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-2 pr-1">
                    <input
                      className="input num-latin font-mono text-xs"
                      dir="ltr"
                      value={l.variantId}
                      onChange={(e) => setLine(i, { variantId: e.target.value })}
                    />
                  </td>
                  <td className="py-2 px-1">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      className="input num-latin text-end"
                      value={l.qtyActual}
                      onChange={(e) =>
                        setLine(i, { qtyActual: e.target.value === '' ? '' : Number(e.target.value) })
                      }
                    />
                  </td>
                  <td className="py-2 px-1">
                    <input
                      className="input"
                      value={l.notes}
                      onChange={(e) => setLine(i, { notes: e.target.value })}
                    />
                  </td>
                  <td className="py-2 pl-1 text-center">
                    {draftLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setDraftLines((p) => p.filter((_, idx) => idx !== i))}
                        className="text-rose-500 hover:text-rose-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 text-end">
            <button
              onClick={() => {
                setError(null);
                submitCount.mutate();
              }}
              disabled={submitCount.isPending}
              className="btn-primary btn-sm"
            >
              <Save className="h-4 w-4" />
              {submitCount.isPending ? 'جاري الحفظ…' : 'حفظ العد'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
          البنود المُسجَّلة ({s.lines?.length ?? 0})
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="text-right px-4 py-2 font-medium">معرّف الصنف</th>
              <th className="text-end px-4 py-2 font-medium">النظام</th>
              <th className="text-end px-4 py-2 font-medium">الفعلي</th>
              <th className="text-end px-4 py-2 font-medium">الفارق</th>
              <th className="text-end px-4 py-2 font-medium">قيمة الفارق</th>
            </tr>
          </thead>
          <tbody>
            {(s.lines ?? []).map((l: any) => {
              const variance = Number(l.variance ?? 0);
              const varValue = Number(l.varianceValueIqd ?? 0);
              return (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono num-latin text-xs">{l.variantId}</td>
                  <td className="px-4 py-2 text-end num-latin font-mono">{l.systemQty}</td>
                  <td className="px-4 py-2 text-end num-latin font-mono">
                    {l.countedQty ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className={['px-4 py-2 text-end num-latin font-mono', variance > 0 ? 'text-emerald-700' : variance < 0 ? 'text-rose-700' : 'text-slate-400'].join(' ')}>
                    {l.countedQty != null ? (variance > 0 ? `+${variance}` : variance) : '—'}
                  </td>
                  <td className={['px-4 py-2 text-end num-latin font-mono text-xs', varValue > 0 ? 'text-emerald-700' : varValue < 0 ? 'text-rose-700' : 'text-slate-400'].join(' ')}>
                    {l.countedQty != null ? (varValue > 0 ? `+${varValue.toLocaleString()}` : varValue.toLocaleString()) : '—'}
                  </td>
                </tr>
              );
            })}
            {(!s.lines || s.lines.length === 0) && (
              <tr>
                <td colSpan={5} className="text-center px-4 py-6 text-sm text-slate-400">
                  لا توجد بنود — أدخل الكميات المعدودة أعلاه
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-slate-500 mb-1">{label}</div>
      <div className="text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}
