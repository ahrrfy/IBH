'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { ReasonModal } from '@/components/reason-modal';
import { formatIqd, formatDate } from '@/lib/format';
import { ArrowRight, CheckCircle2, XCircle, PackageCheck } from 'lucide-react';

export default function GRNDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: grn, isLoading, error } = useQuery({
    queryKey: ['grn', id],
    queryFn: () => api<any>(`/purchases/grn/${id}`),
    enabled: !!id,
  });

  const [showReject, setShowReject] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const approveQuality = useMutation({
    mutationFn: (notes: string) =>
      api(`/purchases/grn/${id}/approve-quality`, { method: 'POST', body: { qualityNotes: notes } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grn', id] });
      qc.invalidateQueries({ queryKey: ['grn-list'] });
      setShowApprove(false);
      router.refresh();
    },
    onError: (e: any) => setActionError(e?.message ?? 'فشل اعتماد الجودة'),
  });

  const reject = useMutation({
    mutationFn: (reason: string) =>
      api(`/purchases/grn/${id}/reject`, { method: 'POST', body: { rejectionReason: reason } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grn', id] });
      qc.invalidateQueries({ queryKey: ['grn-list'] });
      setShowReject(false);
      router.refresh();
    },
    onError: (e: any) => setActionError(e?.message ?? 'فشل رفض المستند'),
  });

  if (isLoading) return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  if (error || !grn) return <div className="p-6 text-rose-600">تعذَّر تحميل المستند</div>;

  const lines: any[] = grn.lines ?? [];
  const canActOn = grn.status === 'draft' || grn.status === 'quality_check';

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/purchases/grn" className="text-sm text-slate-500 hover:text-sky-700 flex items-center gap-1">
            <ArrowRight className="h-4 w-4" />
            القائمة
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900 flex items-center gap-2">
            <PackageCheck className="h-6 w-6 text-sky-700" />
            استلام <span className="num-latin">{grn.number}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1 num-latin">
            {formatDate(grn.receiptDate)} · أمر شراء {grn.purchaseOrder?.number ?? '—'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={grn.status} />
          <div className="text-2xl font-bold num-latin">{formatIqd(grn.totalCostIqd ?? grn.totalIqd)}</div>
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
          <Row label="المورّد" value={grn.purchaseOrder?.supplier?.nameAr ?? '—'} />
          <Row label="المخزن" value={grn.warehouse?.nameAr ?? '—'} />
          <Row label="رقم بوليصة التسليم" value={grn.deliveryNoteRef ?? '—'} />
          <Row label="أنشأه" value={grn.creator?.nameAr ?? grn.createdBy} />
          {grn.qualityApprovedAt && <Row label="اعتمد الجودة" value={grn.qualityApprovedBy ?? '—'} />}
          {grn.qualityApprovedAt && (
            <Row label="تاريخ الاعتماد" value={<span className="num-latin font-mono text-xs">{formatDate(grn.qualityApprovedAt)}</span>} />
          )}
        </div>
        {grn.qualityNotes && (
          <div className="pt-2 border-t">
            <span className="text-xs text-slate-500">ملاحظات الجودة:</span>
            <p className="mt-1 text-sm text-slate-700">{grn.qualityNotes}</p>
          </div>
        )}
        {grn.rejectionReason && (
          <div className="pt-2 border-t">
            <span className="text-xs text-rose-500">سبب الرفض:</span>
            <p className="mt-1 text-sm text-rose-700">{grn.rejectionReason}</p>
          </div>
        )}
        {grn.notes && (
          <div className="pt-2 border-t">
            <span className="text-xs text-slate-500">ملاحظات:</span>
            <p className="mt-1 text-sm text-slate-700">{grn.notes}</p>
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-3 overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">البنود</h2>
        <table className="w-full text-sm min-w-[700px]">
          <thead className="text-slate-500 border-b">
            <tr>
              <th className="text-start py-2">المنتج</th>
              <th className="text-end">مستلَم</th>
              <th className="text-end">مقبول</th>
              <th className="text-end">مرفوض</th>
              <th className="text-end">التكلفة/وحدة</th>
              <th className="text-end">قيمة المقبول</th>
              <th className="text-start">دفعة</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l: any) => (
              <tr key={l.id} className="border-t">
                <td className="py-2">{l.variant?.nameAr ?? l.variantId}</td>
                <td className="text-end num-latin">{l.qtyReceived}</td>
                <td className="text-end num-latin">{l.qtyAccepted}</td>
                <td className="text-end num-latin">{l.qtyRejected || '—'}</td>
                <td className="text-end num-latin">{formatIqd(l.unitCostIqd)}</td>
                <td className="text-end num-latin">{formatIqd(Number(l.qtyAccepted) * Number(l.unitCostIqd))}</td>
                <td className="num-latin font-mono text-xs">{l.batchNumber ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {canActOn && (
        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          <button
            type="button"
            onClick={() => { setActionError(null); setShowReject(true); }}
            className="btn-ghost gap-1.5 text-rose-600 hover:bg-rose-50"
            disabled={approveQuality.isPending}
          >
            <XCircle className="h-4 w-4" />
            رفض
          </button>
          <button
            type="button"
            onClick={() => { setActionError(null); setShowApprove(true); }}
            disabled={approveQuality.isPending || reject.isPending}
            className="btn-primary gap-1.5"
          >
            <CheckCircle2 className="h-4 w-4" />
            اعتماد الجودة
          </button>
        </div>
      )}

      <ReasonModal
        open={showApprove}
        title="اعتماد الجودة"
        description="سيتم تسجيل البضاعة في المخزن بتكلفتها (تأثير على المتوسط المرجَّح). أدخل ملاحظات الفحص."
        confirmLabel="اعتماد"
        minLength={3}
        pending={approveQuality.isPending}
        error={actionError}
        onConfirm={(notes) => { setActionError(null); approveQuality.mutate(notes); }}
        onCancel={() => { if (!approveQuality.isPending) setShowApprove(false); }}
      />

      <ReasonModal
        open={showReject}
        title="رفض المستند"
        description="لن تُسجَّل أي بضاعة في المخزن. أدخل سبب الرفض لسجل التدقيق."
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
