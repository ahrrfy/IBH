'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { ReasonModal } from '@/components/reason-modal';
import { formatIqd, formatDate } from '@/lib/format';
import { ArrowRight, CheckCircle2, XCircle, Undo2 } from 'lucide-react';

const REASON_LABELS_AR: Record<string, string> = {
  defect:            'عيب في المنتج',
  wrong_item:        'منتج خاطئ',
  customer_request:  'طلب العميل',
  quality_issue:     'مشكلة جودة',
  damage_in_transit: 'ضرر أثناء النقل',
  other:             'أخرى',
};

export default function SalesReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: ret, isLoading, error } = useQuery({
    queryKey: ['sales-return', id],
    queryFn: () => api<any>(`/sales-returns/${id}`),
    enabled: !!id,
  });

  const [showReject, setShowReject] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const approve = useMutation({
    mutationFn: () => api(`/sales-returns/${id}/approve`, { method: 'POST', body: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-return', id] });
      qc.invalidateQueries({ queryKey: ['sales-returns'] });
      router.refresh();
    },
    onError: (e: any) => setActionError(e?.message ?? 'فشل اعتماد المرتجع'),
  });

  const reject = useMutation({
    mutationFn: (reason: string) => api(`/sales-returns/${id}/reject`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-return', id] });
      qc.invalidateQueries({ queryKey: ['sales-returns'] });
      setShowReject(false);
      router.refresh();
    },
    onError: (e: any) => setActionError(e?.message ?? 'فشل رفض المرتجع'),
  });

  if (isLoading) return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  if (error || !ret) return <div className="p-6 text-rose-600">تعذَّر تحميل المرتجع</div>;

  const lines: any[] = ret.lines ?? [];
  const canActOn = ret.status === 'draft' || ret.status === 'submitted';

  return (
    <div className="p-6 max-w-4xl space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/sales/returns" className="text-sm text-slate-500 hover:text-sky-700 flex items-center gap-1">
            <ArrowRight className="h-4 w-4" />
            القائمة
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Undo2 className="h-6 w-6 text-sky-700" />
            مرتجع <span className="num-latin">{ret.number}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1 num-latin">
            {formatDate(ret.returnDate)} · فاتورة {ret.originalInvoice?.number ?? '—'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={ret.status} />
          <div className="text-2xl font-bold num-latin">{formatIqd(ret.totalIqd)}</div>
        </div>
      </header>

      {actionError && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {actionError}
        </div>
      )}

      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">المعلومات</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Row label="السبب" value={REASON_LABELS_AR[ret.reason] ?? ret.reason} />
          <Row label="طريقة الاسترداد" value={ret.refundMethod} />
          <Row label="المخزن المُستلِم" value={ret.warehouse?.nameAr ?? ret.warehouseId} />
          <Row label="أنشأه" value={ret.creator?.nameAr ?? ret.createdBy} />
          {ret.approvedAt && <Row label="اعتُمد بواسطة" value={ret.approver?.nameAr ?? ret.approvedBy} />}
          {ret.approvedAt && <Row label="تاريخ الاعتماد" value={<span className="num-latin font-mono text-xs">{formatDate(ret.approvedAt)}</span>} />}
        </div>
        {ret.notes && (
          <div className="pt-2 border-t">
            <span className="text-xs text-slate-500">ملاحظات:</span>
            <p className="mt-1 text-sm text-slate-700">{ret.notes}</p>
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">البنود</h2>
        <table className="w-full text-sm">
          <thead className="text-slate-500 border-b">
            <tr>
              <th className="text-start py-2">المنتج</th>
              <th className="text-end">الكمية</th>
              <th className="text-end">السعر</th>
              <th className="text-end">المجموع</th>
              <th className="text-center">صالح للإرجاع</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l: any) => (
              <tr key={l.id} className="border-t">
                <td className="py-2">{l.variant?.nameAr ?? l.variantId}</td>
                <td className="text-end num-latin">{l.qty}</td>
                <td className="text-end num-latin">{formatIqd(l.unitPriceIqd)}</td>
                <td className="text-end num-latin">{formatIqd(l.lineTotalIqd)}</td>
                <td className="text-center">{l.isRestockable ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold">
              <td colSpan={3} className="py-2 text-end">الإجمالي الفرعي</td>
              <td className="text-end num-latin">{formatIqd(ret.subtotalIqd)}</td>
              <td />
            </tr>
            <tr className="font-semibold">
              <td colSpan={3} className="py-2 text-end">الإجمالي</td>
              <td className="text-end num-latin">{formatIqd(ret.totalIqd)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </section>

      {canActOn && (
        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          <button
            type="button"
            onClick={() => { setActionError(null); setShowReject(true); }}
            className="btn-ghost gap-1.5 text-rose-600 hover:bg-rose-50"
            disabled={approve.isPending}
          >
            <XCircle className="h-4 w-4" />
            رفض
          </button>
          <button
            type="button"
            onClick={() => { setActionError(null); approve.mutate(); }}
            disabled={approve.isPending}
            className="btn-primary gap-1.5"
          >
            <CheckCircle2 className="h-4 w-4" />
            {approve.isPending ? 'جاري الاعتماد…' : 'اعتماد المرتجع'}
          </button>
        </div>
      )}

      <ReasonModal
        open={showReject}
        title="رفض المرتجع"
        description="سيتم تحويل المرتجع لحالة ملغي. يجب توضيح السبب لسجل التدقيق."
        confirmLabel="رفض"
        minLength={3}
        pending={reject.isPending}
        error={actionError}
        onConfirm={(reason) => { setActionError(null); reject.mutate(reason); }}
        onCancel={() => { if (!reject.isPending) setShowReject(false); }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-32 shrink-0 text-slate-500">{label}</span>
      <span className="text-slate-900 font-medium">{value}</span>
    </div>
  );
}
