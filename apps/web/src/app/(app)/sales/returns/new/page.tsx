'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatIqd } from '@/lib/format';
import { ArrowRight, Save, Search, Undo2 } from 'lucide-react';

const REASON_OPTIONS = [
  { value: 'defect',            labelAr: 'عيب في المنتج' },
  { value: 'wrong_item',        labelAr: 'منتج خاطئ' },
  { value: 'customer_request',  labelAr: 'طلب العميل' },
  { value: 'quality_issue',     labelAr: 'مشكلة جودة' },
  { value: 'damage_in_transit', labelAr: 'ضرر أثناء النقل' },
  { value: 'other',             labelAr: 'أخرى' },
];

const REFUND_OPTIONS = [
  { value: 'cash',          labelAr: 'نقداً' },
  { value: 'store_credit',  labelAr: 'رصيد في المتجر' },
  { value: 'bank_transfer', labelAr: 'تحويل بنكي' },
  { value: 'card',          labelAr: 'بطاقة' },
];

interface LineDraft {
  invoiceLineId: string;
  variantId: string;
  variantName: string;
  invoiceQty: number;
  unitPriceIqd: number;
  qty: number;            // qty being returned
  isRestockable: boolean;
  notes: string;
}

export default function NewSalesReturnPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [reason, setReason] = useState('customer_request');
  const [refundMethod, setRefundMethod] = useState('cash');
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: () => api<any>('/inventory/warehouses') });
  const wList: any[] = Array.isArray(warehouses) ? warehouses : warehouses?.items ?? [];

  // Search posted invoices by number — only call when user typed at least 3 chars
  const { data: invoiceSearch } = useQuery({
    queryKey: ['invoice-search', invoiceQuery],
    queryFn: () =>
      api<any>(`/sales/invoices?search=${encodeURIComponent(invoiceQuery)}&status=posted&limit=10`),
    enabled: invoiceQuery.trim().length >= 3 && !invoiceId,
  });
  const invoiceCandidates: any[] = invoiceSearch?.items ?? (Array.isArray(invoiceSearch) ? invoiceSearch : []);

  const { data: invoice } = useQuery({
    queryKey: ['invoice-for-return', invoiceId],
    queryFn: () => api<any>(`/sales/invoices/${invoiceId}`),
    enabled: !!invoiceId,
  });

  function pickInvoice(inv: any) {
    setInvoiceId(inv.id);
    setInvoiceQuery(inv.number);
    setLines(
      (inv.lines ?? []).map((l: any) => ({
        invoiceLineId: l.id,
        variantId:     l.variantId,
        variantName:   l.variant?.nameAr ?? l.variantId,
        invoiceQty:    Number(l.qty),
        unitPriceIqd:  Number(l.unitPriceIqd),
        qty:           0,
        isRestockable: true,
        notes:         '',
      })),
    );
  }

  function patchLine(idx: number, patch: Partial<LineDraft>) {
    setLines((arr) => arr.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function clearInvoice() {
    setInvoiceId(null);
    setInvoiceQuery('');
    setLines([]);
  }

  const create = useMutation({
    mutationFn: (payload: any) => api<any>('/sales-returns', { method: 'POST', body: payload }),
    onSuccess: (created: any) => {
      qc.invalidateQueries({ queryKey: ['sales-returns'] });
      router.push(`/sales/returns/${created.id}`);
    },
    onError: (e: any) => setError(e?.message ?? 'فشل إنشاء المرتجع'),
  });

  const activeLines = lines.filter((l) => l.qty > 0);
  const subtotal = activeLines.reduce((sum, l) => sum + l.qty * l.unitPriceIqd, 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!invoiceId) { setError('اختر فاتورة أصلية'); return; }
    if (!warehouseId) { setError('اختر المخزن'); return; }
    if (activeLines.length === 0) { setError('أدخل كمية لبند واحد على الأقل'); return; }

    // Validate qty <= invoiceQty (defense-in-depth — backend checks too)
    const overReturn = activeLines.find((l) => l.qty > l.invoiceQty);
    if (overReturn) {
      setError(`الكمية المرتجعة لـ "${overReturn.variantName}" أكبر من المباع (${overReturn.invoiceQty})`);
      return;
    }

    create.mutate({
      originalInvoiceId: invoiceId,
      reason,
      refundMethod,
      warehouseId,
      notes: notes || undefined,
      lines: activeLines.map((l) => ({
        invoiceLineId: l.invoiceLineId,
        variantId:     l.variantId,
        qty:           l.qty,
        unitPriceIqd:  l.unitPriceIqd,
        isRestockable: l.isRestockable,
        reason:        l.notes || undefined,
      })),
    });
  }

  return (
    <div className="p-6 max-w-4xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Undo2 className="h-6 w-6 text-sky-700" />
            مرتجع مبيعات جديد
          </h1>
          <p className="text-sm text-slate-500 mt-1">اختر الفاتورة الأصلية ثم البنود المُرتَجعة</p>
        </div>
        <Link href="/sales/returns" className="text-sm text-slate-500 hover:text-sky-700 flex items-center gap-1">
          <ArrowRight className="h-4 w-4" />
          العودة للقائمة
        </Link>
      </header>

      <form onSubmit={submit} className="space-y-5">
        <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">الفاتورة الأصلية</h2>
          {!invoiceId ? (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute start-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  className="input pl-9 num-latin"
                  placeholder="ابحث برقم الفاتورة (3 أحرف على الأقل)"
                  value={invoiceQuery}
                  onChange={(e) => setInvoiceQuery(e.target.value)}
                  dir="ltr"
                />
              </div>
              {invoiceCandidates.length > 0 && (
                <div className="border border-slate-200 rounded-md divide-y max-h-60 overflow-auto">
                  {invoiceCandidates.map((inv: any) => (
                    <button
                      key={inv.id}
                      type="button"
                      onClick={() => pickInvoice(inv)}
                      className="w-full text-start px-3 py-2 hover:bg-slate-50 flex items-center justify-between"
                    >
                      <span className="font-medium num-latin">{inv.number}</span>
                      <span className="text-xs text-slate-500">
                        {inv.customer?.nameAr ?? '—'} · {formatIqd(inv.totalIqd)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between bg-slate-50 rounded-md px-3 py-2">
              <div className="text-sm">
                <span className="font-medium num-latin">{invoice?.number ?? invoiceQuery}</span>
                {invoice && (
                  <span className="text-slate-500 ms-2">
                    {invoice.customer?.nameAr ?? '—'} · {formatIqd(invoice.totalIqd)}
                  </span>
                )}
              </div>
              <button type="button" onClick={clearInvoice} className="text-xs text-rose-600 hover:underline">
                تغيير
              </button>
            </div>
          )}
        </section>

        {invoiceId && lines.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">البنود المُرتَجعة</h2>
            <table className="w-full text-sm">
              <thead className="text-slate-500 border-b">
                <tr>
                  <th className="text-start py-2">المنتج</th>
                  <th className="text-end">المباع</th>
                  <th className="text-end">السعر</th>
                  <th className="text-end">الكمية المرتجعة</th>
                  <th className="text-center">صالح للإرجاع للمخزن</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.invoiceLineId} className="border-t">
                    <td className="py-2">{l.variantName}</td>
                    <td className="text-end num-latin">{l.invoiceQty}</td>
                    <td className="text-end num-latin">{formatIqd(l.unitPriceIqd)}</td>
                    <td className="text-end">
                      <input
                        type="number"
                        className="input w-24 text-end num-latin"
                        min={0}
                        max={l.invoiceQty}
                        step="0.001"
                        value={l.qty}
                        onChange={(e) => patchLine(i, { qty: Math.max(0, Number(e.target.value)) })}
                      />
                    </td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={l.isRestockable}
                        onChange={(e) => patchLine(i, { isRestockable: e.target.checked })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td colSpan={3} className="py-2 text-end">الإجمالي</td>
                  <td colSpan={2} className="text-end num-latin">{formatIqd(subtotal)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="text-[11px] text-slate-500">
              «صالح للإرجاع» يُعيد البضاعة للمخزن المختار. عند إلغاء التحديد، تذهب لمخزن التالف.
            </p>
          </section>
        )}

        <section className="bg-white border border-slate-200 rounded-lg p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="السبب" required>
            <select className="input" value={reason} onChange={(e) => setReason(e.target.value)} required>
              {REASON_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.labelAr}</option>)}
            </select>
          </Field>
          <Field label="طريقة الاسترداد" required>
            <select className="input" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)} required>
              {REFUND_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.labelAr}</option>)}
            </select>
          </Field>
          <Field label="المخزن المُستلِم" required>
            <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
              <option value="">— اختر مخزن —</option>
              {wList.map((w: any) => <option key={w.id} value={w.id}>{w.nameAr} ({w.code})</option>)}
            </select>
          </Field>
          <Field label="ملاحظات">
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </section>

        <div className="flex items-center justify-between pt-3 border-t">
          {error && <span className="text-sm text-rose-600">{error}</span>}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Link href="/sales/returns" className="btn-ghost">إلغاء</Link>
            <button type="submit" disabled={create.isPending} className="btn-primary">
              <Save className="h-4 w-4" />
              {create.isPending ? 'جاري الإنشاء…' : 'إنشاء المرتجع'}
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
