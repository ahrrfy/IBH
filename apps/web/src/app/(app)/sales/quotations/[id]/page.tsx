'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit, ArrowRight, Loader2, Send, CheckCircle, XCircle, ShoppingCart } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useLiveResource } from '@/lib/realtime/use-live-resource';
import { StatusBadge } from '@/components/status-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { formatIqd, formatDate } from '@/lib/format';

type QLine = { id: string; variantId: string; qty: string; unitPriceIqd: string; discountPct: string; discountIqd: string; lineTotalIqd: string };
type Quotation = {
  id: string; number: string; status: string; quotationDate: string; validUntil: string;
  subtotalIqd: string; discountIqd: string; taxIqd: string; totalIqd: string;
  notes: string | null; convertedToOrderId: string | null; createdAt: string;
  customer: { id: string; nameAr: string; code: string; phone: string | null };
  lines: QLine[];
};

type ActionType = 'send' | 'accept' | 'reject' | 'convert';

export default function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, setConfirm]         = useState<ActionType | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [warehouseId, setWarehouseId]   = useState('');

  const { data: quotation, isLoading, error } = useQuery({
    queryKey: ['quotation', id],
    queryFn: () => api<Quotation>(`/quotations/${id}`),
  });

  useLiveResource(['quotation', id], ['quotation.updated', 'quotation.converted']);

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses-list'],
    queryFn: () => api<{ rows: { id: string; code: string; nameAr: string }[] }>('/warehouses?limit=100'),
    select: (d) => d.rows,
    enabled: !!quotation && ['sent', 'accepted'].includes(quotation.status),
  });

  const doAction = useMutation({
    mutationFn: (type: ActionType) => {
      if (type === 'send')    return api(`/quotations/${id}/send`, { method: 'POST' });
      if (type === 'accept')  return api(`/quotations/${id}/accept`, { method: 'POST' });
      if (type === 'reject')  return api(`/quotations/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason: rejectReason }) });
      return api<{ id: string }>(`/quotations/${id}/convert`, { method: 'POST', body: JSON.stringify({ warehouseId }) });
    },
    onSuccess: (res, type) => {
      setConfirm(null); setActionError(null);
      qc.invalidateQueries({ queryKey: ['quotation', id] });
      qc.invalidateQueries({ queryKey: ['quotations'] });
      if (type === 'convert' && res && (res as any).id) {
        window.location.href = `/sales/orders/${(res as any).id}`;
      }
    },
    onError: (e: unknown) => { setConfirm(null); setActionError(e instanceof ApiError ? e.messageAr : 'فشل الإجراء'); },
  });

  if (isLoading) return <div className="p-6 text-slate-500">جاري التحميل...</div>;
  if (error || !quotation) return <div className="p-6 text-red-600">خطأ في التحميل</div>;

  const canSend    = quotation.status === 'draft';
  const canAccept  = ['sent', 'draft'].includes(quotation.status);
  const canReject  = ['sent', 'draft'].includes(quotation.status);
  const canConvert = ['sent', 'accepted'].includes(quotation.status);
  const canEdit    = quotation.status === 'draft';

  return (
    <div className="space-y-6 p-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/sales/quotations" className="text-slate-500 hover:text-slate-800"><ArrowRight className="size-5" /></Link>
          <div>
            <h1 className="text-2xl font-bold font-mono">{quotation.number}</h1>
            <div className="mt-1"><StatusBadge status={quotation.status} /></div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && <Link href={`/sales/quotations/${id}/edit`} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50"><Edit className="size-4" /> تعديل</Link>}
          {canSend && <button onClick={() => setConfirm('send')} className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800"><Send className="size-4" /> إرسال</button>}
          {canAccept && <button onClick={() => setConfirm('accept')} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"><CheckCircle className="size-4" /> قبول</button>}
          {canReject && <button onClick={() => setConfirm('reject')} className="inline-flex items-center gap-2 rounded-xl border border-red-300 text-red-700 bg-white px-4 py-2 text-sm hover:bg-red-50"><XCircle className="size-4" /> رفض</button>}
          {canConvert && <button onClick={() => setConfirm('convert')} className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800"><ShoppingCart className="size-4" /> تحويل لأمر بيع</button>}
        </div>
      </div>

      {actionError && <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-800 text-sm">{actionError}</div>}

      {quotation.convertedToOrderId && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-center justify-between">
          <span className="text-emerald-800 text-sm font-medium">تم التحويل لأمر بيع</span>
          <Link href={`/sales/orders/${quotation.convertedToOrderId}`} className="text-sm text-emerald-700 underline">عرض الأمر →</Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-lg mb-3">بيانات العرض</h2>
          <dl className="space-y-2 text-sm">
            <Row label="العميل" value={`${quotation.customer.nameAr} (${quotation.customer.code})`} />
            <Row label="الهاتف" value={quotation.customer.phone} dir="ltr" />
            <Row label="تاريخ العرض" value={formatDate(quotation.quotationDate)} />
            <Row label="صالح حتى" value={formatDate(quotation.validUntil)} />
          </dl>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-lg mb-3">الإجماليات</h2>
          <dl className="space-y-2 text-sm">
            <Row label="المجموع الفرعي" value={formatIqd(quotation.subtotalIqd)} />
            {Number(quotation.discountIqd) > 0 && <Row label="الخصم" value={`- ${formatIqd(quotation.discountIqd)}`} />}
            {Number(quotation.taxIqd) > 0 && <Row label="الضريبة" value={formatIqd(quotation.taxIqd)} />}
            <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-lg">
              <dt>الإجمالي</dt><dd>{formatIqd(quotation.totalIqd)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-lg mb-3">البنود ({quotation.lines.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-500 border-b border-slate-200">
              <tr>
                <th className="text-start py-2">#</th>
                <th className="text-start py-2">المنتج</th>
                <th className="text-end py-2">الكمية</th>
                <th className="text-end py-2">السعر</th>
                <th className="text-end py-2">خصم%</th>
                <th className="text-end py-2">المجموع</th>
              </tr>
            </thead>
            <tbody>
              {quotation.lines.map((l, i) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="py-2 text-slate-400">{i + 1}</td>
                  <td className="py-2 font-mono text-xs">{l.variantId}</td>
                  <td className="py-2 text-end">{Number(l.qty).toLocaleString('ar-IQ')}</td>
                  <td className="py-2 text-end">{formatIqd(l.unitPriceIqd)}</td>
                  <td className="py-2 text-end">{Number(l.discountPct) > 0 ? `${l.discountPct}%` : '—'}</td>
                  <td className="py-2 text-end font-semibold">{formatIqd(l.lineTotalIqd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {quotation.notes && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-lg mb-2">ملاحظات</h2>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{quotation.notes}</p>
        </section>
      )}

      <ConfirmDialog open={confirm === 'send'} title="إرسال عرض السعر للعميل" message="سيتغير الحالة إلى مُرسَل. متابعة؟" confirmLabel="إرسال" tone="primary" loading={doAction.isPending} onCancel={() => setConfirm(null)} onConfirm={() => doAction.mutate('send')} />
      <ConfirmDialog open={confirm === 'accept'} title="قبول عرض السعر" message="سيُسجَّل العرض كمقبول. يمكن تحويله لاحقاً." confirmLabel="قبول" tone="primary" loading={doAction.isPending} onCancel={() => setConfirm(null)} onConfirm={() => doAction.mutate('accept')} />

      {confirm === 'reject' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h2 className="font-semibold text-lg">رفض عرض السعر</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">سبب الرفض</label>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">إلغاء</button>
              <button onClick={() => doAction.mutate('reject')} disabled={doAction.isPending} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {doAction.isPending && <Loader2 className="size-4 animate-spin" />} رفض
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm === 'convert' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h2 className="font-semibold text-lg">تحويل لأمر بيع</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">المستودع</label>
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">اختر مستودع...</option>
                {warehouses?.map((w) => <option key={w.id} value={w.id}>{w.nameAr} ({w.code})</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">إلغاء</button>
              <button onClick={() => doAction.mutate('convert')} disabled={doAction.isPending || !warehouseId} className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {doAction.isPending && <Loader2 className="size-4 animate-spin" />} تحويل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, dir }: { label: string; value: string | null | undefined; dir?: 'ltr' }) {
  return <div className="flex justify-between gap-4"><dt className="text-slate-500 shrink-0">{label}</dt><dd className="text-slate-800 font-medium text-end" dir={dir}>{value ?? '—'}</dd></div>;
}
