'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { ReasonModal } from '@/components/reason-modal';
import { formatIqd, formatDate } from '@/lib/format';
import { ArrowRight, PackageCheck, CheckCircle2, XCircle } from 'lucide-react';

export default function GrnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: grn, isLoading, error } = useQuery({
    queryKey: ['grn', id],
    queryFn: () => api<any>(`/purchases/grn/${id}`),
    enabled: !!id,
  });

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const approve = useMutation({
    mutationFn: (qualityNotes: string) =>
      api(`/purchases/grn/${id}/approve-quality`, {
        method: 'POST',
        body: { qualityNotes },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grn', id] });
      qc.invalidateQueries({ queryKey: ['grn'] });
      setApproveOpen(false);
    },
    onError: (e: any) => setActionError(e?.messageAr ?? e?.message ?? 'تعذَّر الاعتماد'),
  });

  const reject = useMutation({
    mutationFn: (rejectionReason: string) =>
      api(`/purchases/grn/${id}/reject`, {
        method: 'POST',
        body: { rejectionReason },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grn', id] });
      qc.invalidateQueries({ queryKey: ['grn'] });
      setRejectOpen(false);
      router.push('/purchases/grn');
    },
    onError: (e: any) => setActionError(e?.messageAr ?? e?.message ?? 'تعذَّر الرفض'),
  });

  if (isLoading) return <div className="p-6 text-sm text-slate-500">جاري التحميل…</div>;
  if (error || !grn) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          تعذَّر تحميل الإيصال.
        </div>
      </div>
    );
  }

  const lines: any[] = grn.lines ?? [];
  const status: string = grn.status;
  // Quality decisions only available while in QC and before any final state.
  const canDecide = status === 'quality_check';
  // Rejection allowed for anything that hasn't been finalised either way.
  const canReject = !['rejected', 'accepted'].includes(status);

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/purchases/grn" className="text-sm text-slate-500 hover:text-sky-700 flex items-center gap-1">
            <ArrowRight className="h-4 w-4" />
            العودة للقائمة
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900 flex items-center gap-2">
            <PackageCheck className="h-6 w-6 text-sky-700" />
            إيصال {grn.number}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            <span className="num-latin font-mono text-xs">{formatDate(grn.receiptDate)}</span>
            {grn.purchaseOrder?.number && (
              <>
                {' · '}
                <Link href={`/purchases/orders/${grn.purchaseOrder.id}`} className="text-sky-700 hover:underline">
                  PO {grn.purchaseOrder.number}
                </Link>
              </>
            )}
            {grn.purchaseOrder?.supplier?.nameAr && ` · ${grn.purchaseOrder.supplier.nameAr}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={status} />
          <div className="text-2xl font-bold num-latin">{formatIqd(grn.totalValueIqd)}</div>
        </div>
      </header>

      {(canDecide || canReject) && (
        <div className="flex items-center gap-2">
          {canDecide && (
            <button
              type="button"
              onClick={() => { setActionError(null); setApproveOpen(true); }}
              className="btn-primary btn-sm"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              اعتماد الجودة
            </button>
          )}
          {canReject && (
            <button
              type="button"
              onClick={() => { setActionError(null); setRejectOpen(true); }}
              className="btn-ghost text-rose-600 hover:bg-rose-50 btn-sm"
            >
              <XCircle className="h-3.5 w-3.5" />
              رفض الإيصال
            </button>
          )}
          {actionError && <span className="text-sm text-rose-600">{actionError}</span>}
        </div>
      )}

      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">البنود</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-500">
              <tr className="text-xs">
                <th className="text-start py-2">المنتج</th>
                <th className="text-end">المستلَم</th>
                <th className="text-end">المقبول</th>
                <th className="text-end">المرفوض</th>
                <th className="text-end">سعر الوحدة</th>
                <th className="text-end">القيمة</th>
                <th className="text-start">دُفعة / انتهاء</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="py-2">{l.variant?.nameAr ?? l.variantId}</td>
                  <td className="text-end num-latin">{l.qtyReceived}</td>
                  <td className="text-end num-latin">{l.qtyAccepted}</td>
                  <td className="text-end num-latin">
                    {Number(l.qtyRejected) > 0 ? (
                      <span className="text-rose-600">{l.qtyRejected}</span>
                    ) : (
                      l.qtyRejected
                    )}
                  </td>
                  <td className="text-end num-latin">{formatIqd(l.unitCostIqd)}</td>
                  <td className="text-end num-latin font-medium">{formatIqd(l.lineValueIqd)}</td>
                  <td className="text-xs num-latin text-slate-500">
                    {l.batchNumber || '—'}
                    {l.expiryDate && <> · {formatDate(l.expiryDate)}</>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {(grn.deliveryNoteRef || grn.notes || grn.qualityNotes) && (
        <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-2 text-sm">
          {grn.deliveryNoteRef && (
            <Row label="بوليصة التوريد" value={<span className="num-latin font-mono text-xs">{grn.deliveryNoteRef}</span>} />
          )}
          {grn.notes && <Row label="ملاحظات" value={grn.notes} />}
          {grn.qualityNotes && <Row label="ملاحظات الجودة" value={grn.qualityNotes} />}
        </section>
      )}

      <ReasonModal
        open={approveOpen}
        title="اعتماد جودة الإيصال"
        description="أدخل ملاحظات فحص الجودة. سيُحوَّل الإيصال إلى حالة «مقبول»."
        confirmLabel="اعتماد"
        minLength={3}
        pending={approve.isPending}
        error={approve.error ? actionError : null}
        onConfirm={(reason) => approve.mutate(reason)}
        onCancel={() => setApproveOpen(false)}
      />
      <ReasonModal
        open={rejectOpen}
        title="رفض الإيصال"
        description="سبب الرفض إلزامي. سيُعكَس أي إدخال للمخزون وتُحدَّث كمية الاستلام في أمر الشراء."
        confirmLabel="رفض الإيصال"
        minLength={5}
        pending={reject.isPending}
        error={reject.error ? actionError : null}
        onConfirm={(reason) => reject.mutate(reason)}
        onCancel={() => setRejectOpen(false)}
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
