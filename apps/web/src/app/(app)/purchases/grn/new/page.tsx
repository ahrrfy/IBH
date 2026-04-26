'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatIqd } from '@/lib/format';
import { ArrowRight, Save, Search, PackageCheck } from 'lucide-react';

interface LineDraft {
  poLineId: string;
  variantId: string;
  variantName: string;
  poQty: number;
  alreadyReceived: number;
  unitCostIqd: number;
  qtyReceived: number;
  qtyAccepted: number;
  qtyRejected: number;
  rejectionReason: string;
  batchNumber: string;
  expiryDate: string;
}

export default function NewGRNPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const [poQuery, setPoQuery] = useState('');
  const [poId, setPoId] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState('');
  const [deliveryNoteRef, setDeliveryNoteRef] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: () => api<any>('/inventory/warehouses') });
  const wList: any[] = Array.isArray(warehouses) ? warehouses : warehouses?.items ?? [];

  // Search confirmed/partially_received POs by number
  const { data: poSearch } = useQuery({
    queryKey: ['po-search', poQuery],
    queryFn: () => api<any>(`/purchases/orders?search=${encodeURIComponent(poQuery)}&limit=10`),
    enabled: poQuery.trim().length >= 2 && !poId,
  });
  const poCandidates: any[] = poSearch?.items ?? (Array.isArray(poSearch) ? poSearch : []);

  const { data: po } = useQuery({
    queryKey: ['po-for-grn', poId],
    queryFn: () => api<any>(`/purchases/orders/${poId}`),
    enabled: !!poId,
  });

  function pickPo(p: any) {
    setPoId(p.id);
    setPoQuery(p.number);
    setLines(
      (p.lines ?? []).map((l: any) => ({
        poLineId:        l.id,
        variantId:       l.variantId,
        variantName:     l.variant?.nameAr ?? l.variantId,
        poQty:           Number(l.qty),
        alreadyReceived: Number(l.qtyReceived ?? 0),
        unitCostIqd:     Number(l.unitCostIqd ?? l.unitPriceIqd ?? 0),
        qtyReceived:     Math.max(0, Number(l.qty) - Number(l.qtyReceived ?? 0)),
        qtyAccepted:     Math.max(0, Number(l.qty) - Number(l.qtyReceived ?? 0)),
        qtyRejected:     0,
        rejectionReason: '',
        batchNumber:     '',
        expiryDate:      '',
      })),
    );
  }

  function clearPo() {
    setPoId(null); setPoQuery(''); setLines([]);
  }

  function patchLine(idx: number, patch: Partial<LineDraft>) {
    setLines((arr) => arr.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, ...patch };
      // Auto-balance: if qtyReceived changed, default accepted = received - rejected
      if ('qtyReceived' in patch) {
        next.qtyAccepted = Math.max(0, next.qtyReceived - next.qtyRejected);
      }
      if ('qtyRejected' in patch) {
        next.qtyAccepted = Math.max(0, next.qtyReceived - next.qtyRejected);
      }
      return next;
    }));
  }

  const create = useMutation({
    mutationFn: (payload: any) => api<any>('/purchases/grn', { method: 'POST', body: payload }),
    onSuccess: (created: any) => {
      qc.invalidateQueries({ queryKey: ['grn-list'] });
      router.push(`/purchases/grn/${created.id}`);
    },
    onError: (e: any) => setError(e?.message ?? 'فشل إنشاء مستند الاستلام'),
  });

  const activeLines = lines.filter((l) => l.qtyReceived > 0);
  const subtotal = activeLines.reduce((s, l) => s + l.qtyAccepted * l.unitCostIqd, 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!poId) { setError('اختر أمر شراء'); return; }
    if (!warehouseId) { setError('اختر المخزن المستلِم'); return; }
    if (activeLines.length === 0) { setError('أدخل كمية لبند واحد على الأقل'); return; }

    // Defense-in-depth — backend validates same invariants
    for (const l of activeLines) {
      const remaining = l.poQty - l.alreadyReceived;
      if (l.qtyReceived > remaining) {
        setError(`الكمية المستلَمة لـ "${l.variantName}" أكبر من المتبقي (${remaining})`);
        return;
      }
      if (l.qtyAccepted + l.qtyRejected !== l.qtyReceived) {
        setError(`المقبول + المرفوض لـ "${l.variantName}" يجب أن يساوي المستلَم`);
        return;
      }
      if (l.qtyRejected > 0 && !l.rejectionReason.trim()) {
        setError(`أدخل سبب الرفض لـ "${l.variantName}"`);
        return;
      }
    }

    create.mutate({
      purchaseOrderId: poId,
      warehouseId,
      deliveryNoteRef: deliveryNoteRef || undefined,
      notes: notes || undefined,
      lines: activeLines.map((l) => ({
        poLineId:        l.poLineId,
        variantId:       l.variantId,
        qtyReceived:     l.qtyReceived,
        qtyAccepted:     l.qtyAccepted,
        qtyRejected:     l.qtyRejected,
        rejectionReason: l.rejectionReason || undefined,
        unitCostIqd:     l.unitCostIqd,
        batchNumber:     l.batchNumber || undefined,
        expiryDate:      l.expiryDate || undefined,
      })),
    });
  }

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <PackageCheck className="h-6 w-6 text-sky-700" />
            مستند استلام جديد
          </h1>
          <p className="text-sm text-slate-500 mt-1">اختر أمر الشراء، ثم أدخل الكميات المستلَمة لكل بند</p>
        </div>
        <Link href="/purchases/grn" className="text-sm text-slate-500 hover:text-sky-700 flex items-center gap-1">
          <ArrowRight className="h-4 w-4" />
          العودة للقائمة
        </Link>
      </header>

      <form onSubmit={submit} className="space-y-5">
        <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">أمر الشراء</h2>
          {!poId ? (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute start-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  className="input pl-9 num-latin"
                  placeholder="ابحث برقم أمر الشراء"
                  value={poQuery}
                  onChange={(e) => setPoQuery(e.target.value)}
                  dir="ltr"
                />
              </div>
              {poCandidates.length > 0 && (
                <div className="border border-slate-200 rounded-md divide-y max-h-60 overflow-auto">
                  {poCandidates.map((p: any) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickPo(p)}
                      className="w-full text-start px-3 py-2 hover:bg-slate-50 flex items-center justify-between"
                    >
                      <span className="font-medium num-latin">{p.number}</span>
                      <span className="text-xs text-slate-500">
                        {p.supplier?.nameAr ?? '—'} · {formatIqd(p.totalIqd)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between bg-slate-50 rounded-md px-3 py-2">
              <div className="text-sm">
                <span className="font-medium num-latin">{po?.number ?? poQuery}</span>
                {po && (
                  <span className="text-slate-500 ms-2">
                    {po.supplier?.nameAr ?? '—'} · {formatIqd(po.totalIqd)}
                  </span>
                )}
              </div>
              <button type="button" onClick={clearPo} className="text-xs text-rose-600 hover:underline">
                تغيير
              </button>
            </div>
          )}
        </section>

        {poId && lines.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-3 overflow-x-auto">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">البنود المستلَمة</h2>
            <table className="w-full text-sm min-w-[900px]">
              <thead className="text-slate-500 border-b">
                <tr>
                  <th className="text-start py-2">المنتج</th>
                  <th className="text-end">الـ PO</th>
                  <th className="text-end">سبق استلام</th>
                  <th className="text-end">مستلَم</th>
                  <th className="text-end">مقبول</th>
                  <th className="text-end">مرفوض</th>
                  <th className="text-start">سبب الرفض</th>
                  <th className="text-start">دفعة / صلاحية</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.poLineId} className="border-t align-top">
                    <td className="py-2">{l.variantName}</td>
                    <td className="text-end num-latin">{l.poQty}</td>
                    <td className="text-end num-latin text-slate-500">{l.alreadyReceived}</td>
                    <td className="text-end">
                      <input
                        type="number" className="input w-20 text-end num-latin"
                        min={0} max={l.poQty - l.alreadyReceived} step="0.001"
                        value={l.qtyReceived}
                        onChange={(e) => patchLine(i, { qtyReceived: Math.max(0, Number(e.target.value)) })}
                      />
                    </td>
                    <td className="text-end">
                      <input
                        type="number" className="input w-20 text-end num-latin"
                        min={0} max={l.qtyReceived} step="0.001"
                        value={l.qtyAccepted}
                        onChange={(e) => patchLine(i, { qtyAccepted: Math.max(0, Number(e.target.value)) })}
                      />
                    </td>
                    <td className="text-end">
                      <input
                        type="number" className="input w-20 text-end num-latin"
                        min={0} max={l.qtyReceived} step="0.001"
                        value={l.qtyRejected}
                        onChange={(e) => patchLine(i, { qtyRejected: Math.max(0, Number(e.target.value)) })}
                      />
                    </td>
                    <td>
                      <input
                        className="input w-40"
                        placeholder={l.qtyRejected > 0 ? 'مطلوب' : '—'}
                        value={l.rejectionReason}
                        onChange={(e) => patchLine(i, { rejectionReason: e.target.value })}
                        disabled={l.qtyRejected === 0}
                      />
                    </td>
                    <td className="space-y-1">
                      <input
                        className="input w-32 num-latin"
                        placeholder="رقم الدفعة"
                        value={l.batchNumber}
                        onChange={(e) => patchLine(i, { batchNumber: e.target.value })}
                        dir="ltr"
                      />
                      <input
                        type="date"
                        className="input w-32 num-latin"
                        value={l.expiryDate}
                        onChange={(e) => patchLine(i, { expiryDate: e.target.value })}
                        dir="ltr"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td colSpan={4} className="py-2 text-end">إجمالي قيمة المقبول</td>
                  <td colSpan={4} className="text-end num-latin">{formatIqd(subtotal)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        <section className="bg-white border border-slate-200 rounded-lg p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="المخزن المستلِم" required>
            <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
              <option value="">— اختر مخزن —</option>
              {wList.map((w: any) => <option key={w.id} value={w.id}>{w.nameAr} ({w.code})</option>)}
            </select>
          </Field>
          <Field label="رقم بوليصة التسليم">
            <input className="input num-latin" value={deliveryNoteRef} onChange={(e) => setDeliveryNoteRef(e.target.value)} dir="ltr" />
          </Field>
          <Field label="ملاحظات">
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </section>

        <div className="flex items-center justify-between pt-3 border-t">
          {error && <span className="text-sm text-rose-600">{error}</span>}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Link href="/purchases/grn" className="btn-ghost">إلغاء</Link>
            <button type="submit" disabled={create.isPending} className="btn-primary">
              <Save className="h-4 w-4" />
              {create.isPending ? 'جاري…' : 'إنشاء مستند الاستلام'}
            </button>
          </div>
        </div>
      </form>
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
