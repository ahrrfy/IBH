'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatIqd } from '@/lib/format';
import { ArrowRight, PackageCheck, Save, AlertTriangle } from 'lucide-react';

interface LineDraft {
  poLineId: string;
  variantId: string;
  variantLabel: string;
  qtyOrdered: number;
  qtyAlreadyReceived: number;
  qtyRemaining: number;
  unitCostIqd: number;
  qtyAccepted: string;
  qtyRejected: string;
  rejectionReason: string;
  batchNumber: string;
  expiryDate: string;
}

export default function NewGrnPage() {
  const router = useRouter();
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [deliveryNoteRef, setDeliveryNoteRef] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Only POs that can still receive goods
  const { data: poList } = useQuery({
    queryKey: ['purchase-orders', 'receivable'],
    queryFn: () => api<any>('/purchases/orders'),
  });
  const receivablePOs: any[] = (poList?.items ?? []).filter(
    (p: any) => p.status === 'approved' || p.status === 'partially_received',
  );

  // Selected PO with full lines
  const { data: po, isFetching: poLoading } = useQuery({
    queryKey: ['purchase-order', purchaseOrderId],
    queryFn: () => api<any>(`/purchases/orders/${purchaseOrderId}`),
    enabled: !!purchaseOrderId,
  });

  // Hydrate lines when PO loads
  useEffect(() => {
    if (!po) return;
    const drafts: LineDraft[] = (po.lines ?? []).map((l: any) => {
      const ordered = Number(l.qtyOrdered ?? 0);
      const received = Number(l.qtyReceived ?? 0);
      const remaining = Math.max(0, ordered - received);
      return {
        poLineId: l.id,
        variantId: l.variantId,
        variantLabel: l.variant?.nameAr ?? l.variant?.sku ?? l.variantId,
        qtyOrdered: ordered,
        qtyAlreadyReceived: received,
        qtyRemaining: remaining,
        unitCostIqd: Number(l.unitCostIqd ?? 0),
        qtyAccepted: remaining > 0 ? String(remaining) : '0',
        qtyRejected: '0',
        rejectionReason: '',
        batchNumber: '',
        expiryDate: '',
      };
    });
    setLines(drafts);
  }, [po]);

  const totalValue = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + Number(l.qtyAccepted || 0) * Number(l.unitCostIqd || 0),
        0,
      ),
    [lines],
  );

  function setLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  // Defense-in-depth: client-side guard against over-receive
  // (backend re-validates against `allow_over_receive` policy).
  const overReceiveLine = lines.find((l) => {
    const got = Number(l.qtyAccepted || 0) + Number(l.qtyRejected || 0);
    return got > l.qtyRemaining + 0.0001;
  });

  const create = useMutation({
    mutationFn: () => {
      const payload = {
        purchaseOrderId,
        deliveryNoteRef: deliveryNoteRef || undefined,
        notes: notes || undefined,
        lines: lines
          .filter((l) => Number(l.qtyAccepted || 0) > 0 || Number(l.qtyRejected || 0) > 0)
          .map((l) => ({
            poLineId: l.poLineId,
            variantId: l.variantId,
            qtyReceived: Number(l.qtyAccepted || 0) + Number(l.qtyRejected || 0),
            qtyAccepted: Number(l.qtyAccepted || 0),
            qtyRejected: Number(l.qtyRejected || 0),
            rejectionReason: l.rejectionReason || undefined,
            unitCostIqd: Number(l.unitCostIqd || 0),
            batchNumber: l.batchNumber || undefined,
            expiryDate: l.expiryDate || undefined,
          })),
      };
      return api<any>('/purchases/grn', { method: 'POST', body: payload });
    },
    onSuccess: (created: any) => router.push(`/purchases/grn/${created.id}`),
    onError: (e: any) => setError(e?.messageAr ?? e?.message ?? 'تعذَّر إنشاء الإيصال'),
  });

  const canSubmit =
    !!purchaseOrderId &&
    lines.some((l) => Number(l.qtyAccepted || 0) > 0 || Number(l.qtyRejected || 0) > 0) &&
    !overReceiveLine;

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <PackageCheck className="h-6 w-6 text-sky-700" />
            إيصال استلام جديد
          </h1>
          <p className="text-sm text-slate-500 mt-1">اختر أمر شراء معتمداً ثم أدخل الكميات المقبولة والمرفوضة</p>
        </div>
        <Link href="/purchases/grn" className="text-sm text-slate-500 hover:text-sky-700 flex items-center gap-1">
          <ArrowRight className="h-4 w-4" />
          العودة للقائمة
        </Link>
      </header>

      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="أمر الشراء" required>
            <select
              className="input"
              value={purchaseOrderId}
              onChange={(e) => { setPurchaseOrderId(e.target.value); setLines([]); }}
            >
              <option value="">— اختر أمر شراء —</option>
              {receivablePOs.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.number} · {p.supplier?.nameAr ?? '—'} · {formatIqd(p.totalIqd)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="رقم بوليصة التوريد">
            <input className="input num-latin" dir="ltr" value={deliveryNoteRef} onChange={(e) => setDeliveryNoteRef(e.target.value)} />
          </Field>
        </div>
        <Field label="ملاحظات">
          <textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>

      {purchaseOrderId && poLoading && (
        <div className="text-sm text-slate-500">جاري تحميل بنود أمر الشراء…</div>
      )}

      {lines.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">البنود</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500">
                <tr className="text-xs">
                  <th className="text-start py-2">المنتج</th>
                  <th className="text-end">المطلوب</th>
                  <th className="text-end">المستلَم سابقاً</th>
                  <th className="text-end">المتبقّي</th>
                  <th className="text-end">المقبول</th>
                  <th className="text-end">المرفوض</th>
                  <th className="text-start">سبب الرفض</th>
                  <th className="text-end">سعر الوحدة</th>
                  <th className="text-start">رقم الدُفعة</th>
                  <th className="text-start">انتهاء</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const accepted = Number(l.qtyAccepted || 0);
                  const rejected = Number(l.qtyRejected || 0);
                  const lineSum = accepted + rejected;
                  const over = lineSum > l.qtyRemaining + 0.0001;
                  return (
                    <tr key={l.poLineId} className={'border-t ' + (over ? 'bg-rose-50' : '')}>
                      <td className="py-2">{l.variantLabel}</td>
                      <td className="text-end num-latin">{l.qtyOrdered}</td>
                      <td className="text-end num-latin">{l.qtyAlreadyReceived}</td>
                      <td className="text-end num-latin font-medium">{l.qtyRemaining}</td>
                      <td className="text-end">
                        <input
                          type="number" min="0" step="0.001"
                          className="w-24 input text-end num-latin"
                          value={l.qtyAccepted}
                          onChange={(e) => setLine(i, { qtyAccepted: e.target.value })}
                        />
                      </td>
                      <td className="text-end">
                        <input
                          type="number" min="0" step="0.001"
                          className="w-24 input text-end num-latin"
                          value={l.qtyRejected}
                          onChange={(e) => setLine(i, { qtyRejected: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="w-40 input text-xs"
                          value={l.rejectionReason}
                          disabled={rejected <= 0}
                          placeholder={rejected > 0 ? 'مطلوب' : '—'}
                          onChange={(e) => setLine(i, { rejectionReason: e.target.value })}
                        />
                      </td>
                      <td className="text-end">
                        <input
                          type="number" min="0" step="0.001"
                          className="w-28 input text-end num-latin"
                          value={l.unitCostIqd}
                          onChange={(e) => setLine(i, { unitCostIqd: Number(e.target.value) })}
                        />
                      </td>
                      <td>
                        <input
                          className="w-28 input text-xs num-latin"
                          dir="ltr"
                          value={l.batchNumber}
                          onChange={(e) => setLine(i, { batchNumber: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          className="w-36 input text-xs num-latin"
                          value={l.expiryDate}
                          onChange={(e) => setLine(i, { expiryDate: e.target.value })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2">
                  <td colSpan={9} className="py-2 text-end font-semibold">الإجمالي:</td>
                  <td className="text-end font-bold num-latin">{formatIqd(totalValue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {overReceiveLine && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>الكمية المُدخلة تتجاوز المتبقي من أمر الشراء — راجع البنود المُلوَّنة بالأحمر.</span>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t">
        {error && <span className="text-sm text-rose-600">{error}</span>}
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Link href="/purchases/grn" className="btn-ghost">إلغاء</Link>
          <button
            type="button"
            onClick={() => { setError(null); create.mutate(); }}
            disabled={!canSubmit || create.isPending}
            className="btn-primary"
          >
            <Save className="h-4 w-4" />
            {create.isPending ? 'جاري الحفظ…' : 'إنشاء الإيصال'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}
