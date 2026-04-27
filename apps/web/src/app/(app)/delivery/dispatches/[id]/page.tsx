'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useLiveResource } from '@/lib/realtime/use-live-resource';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

type StatusEvent = {
  status: string;
  occurredAt: string;
  notes: string | null;
  actorName: string | null;
};

type Dispatch = {
  id: string;
  orderNumber: string;
  status: string;
  deliveryAddress: string;
  city: string | null;
  phone: string | null;
  codAmountIqd: string;
  codCollectedAt: string | null;
  shippingCostIqd: string;
  commissionIqd: string;
  externalWaybillNo: string | null;
  assignmentReason: string | null;
  plannedDate: string | null;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
  deliveryCompany: { id: string; nameAr: string; code: string } | null;
  deliveryZone: { id: string; nameAr: string; city: string | null } | null;
  statusHistory: StatusEvent[];
};

const STATUS_LABELS: Record<string, string> = {
  pending_dispatch: 'في الانتظار',
  assigned:         'مُعيَّن',
  in_transit:       'في الطريق',
  delivered:        'مُسلَّم',
  failed:           'فشل',
  returned:         'مُعاد',
  cancelled:        'ملغى',
};

const NEXT_STATUSES: Record<string, { value: string; label: string; tone: 'primary' | 'success' | 'danger' }[]> = {
  pending_dispatch: [{ value: 'assigned',   label: 'تعيين',         tone: 'primary' }],
  assigned:         [{ value: 'in_transit', label: 'بدء التوصيل',   tone: 'primary' }],
  in_transit: [
    { value: 'delivered', label: 'تسليم ناجح', tone: 'success' },
    { value: 'failed',    label: 'فشل التسليم', tone: 'danger' },
  ],
  failed:   [{ value: 'returned',  label: 'إعادة للمستودع', tone: 'danger' }],
};

export default function DispatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [statusNotes, setStatusNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: dispatch, isLoading, error } = useQuery({
    queryKey: ['delivery-dispatch', id],
    queryFn: () => api<Dispatch>(`/delivery/${id}`),
  });

  useLiveResource(['delivery-dispatch', id], ['delivery.status.changed', 'delivery.cod.collected']);

  const changeStatus = useMutation({
    mutationFn: (newStatus: string) =>
      api(`/delivery/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: newStatus, notes: statusNotes || undefined }),
      }),
    onSuccess: () => {
      setStatusNotes('');
      setActionError(null);
      qc.invalidateQueries({ queryKey: ['delivery-dispatch', id] });
      qc.invalidateQueries({ queryKey: ['delivery-dispatches'] });
    },
    onError: (e: unknown) => {
      setActionError(e instanceof ApiError ? e.messageAr : 'فشل تغيير الحالة');
    },
  });

  const cancel = useMutation({
    mutationFn: () =>
      api(`/delivery/${id}/cancel`, { method: 'POST', body: JSON.stringify({ notes: statusNotes || undefined }) }),
    onSuccess: () => {
      setStatusNotes('');
      setActionError(null);
      qc.invalidateQueries({ queryKey: ['delivery-dispatch', id] });
    },
    onError: (e: unknown) => {
      setActionError(e instanceof ApiError ? e.messageAr : 'فشل الإلغاء');
    },
  });

  if (isLoading) return <div className="p-6 text-slate-500">جاري التحميل...</div>;
  if (error || !dispatch) return <div className="p-6 text-red-600">خطأ في التحميل</div>;

  const nextActions = NEXT_STATUSES[dispatch.status] ?? [];
  const canCancel = ['pending_dispatch', 'assigned'].includes(dispatch.status);

  return (
    <div className="space-y-6 p-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/delivery/dispatches" className="text-slate-500 hover:text-slate-800">
            <ArrowRight className="size-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">
              طلب التوصيل{' '}
              <span className="font-mono text-slate-600">{dispatch.orderNumber}</span>
            </h1>
            <div className="mt-1">
              <StatusBadge status={dispatch.status} />
            </div>
          </div>
        </div>
      </div>

      {actionError && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-800 text-sm">
          {actionError}
        </div>
      )}

      {(nextActions.length > 0 || canCancel) && (
        <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 space-y-3">
          <h2 className="font-semibold text-sky-900">الإجراء التالي</h2>
          <div>
            <label className="block text-sm text-sky-800 mb-1">ملاحظات (اختياري)</label>
            <input
              type="text"
              value={statusNotes}
              onChange={(e) => setStatusNotes(e.target.value)}
              className="w-full rounded-lg border border-sky-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="أي ملاحظة إضافية..."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {nextActions.map((a) => (
              <button
                key={a.value}
                onClick={() => changeStatus.mutate(a.value)}
                disabled={changeStatus.isPending || cancel.isPending}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                  a.tone === 'success'
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : a.tone === 'danger'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-sky-700 text-white hover:bg-sky-800'
                }`}
              >
                {(changeStatus.isPending || cancel.isPending) && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {a.label}
              </button>
            ))}
            {canCancel && (
              <button
                onClick={() => cancel.mutate()}
                disabled={changeStatus.isPending || cancel.isPending}
                className="inline-flex items-center gap-2 rounded-lg border border-red-300 text-red-700 bg-white px-4 py-2 text-sm hover:bg-red-50 disabled:opacity-50"
              >
                إلغاء الطلب
              </button>
            )}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="font-semibold text-lg">بيانات التوصيل</h2>
          <dl className="space-y-2 text-sm">
            <Row label="المدينة" value={dispatch.city} />
            <Row label="العنوان" value={dispatch.deliveryAddress} />
            <Row label="الهاتف" value={dispatch.phone} dir="ltr" />
            <Row label="تاريخ التسليم المخطط" value={dispatch.plannedDate ? formatDate(dispatch.plannedDate) : undefined} />
            <Row label="تاريخ الإنشاء" value={formatDate(dispatch.createdAt)} />
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="font-semibold text-lg">شركة التوصيل والتكاليف</h2>
          <dl className="space-y-2 text-sm">
            <Row
              label="الشركة"
              value={dispatch.deliveryCompany ? `${dispatch.deliveryCompany.nameAr} (${dispatch.deliveryCompany.code})` : undefined}
            />
            <Row label="المنطقة" value={dispatch.deliveryZone?.nameAr} />
            <Row label="بوليصة الشحن الخارجية" value={dispatch.externalWaybillNo} dir="ltr" />
            <Row label="سبب التعيين" value={dispatch.assignmentReason} />
            <Row label="تكلفة الشحن" value={dispatch.shippingCostIqd ? formatIqd(dispatch.shippingCostIqd) : undefined} />
            <Row label="العمولة" value={dispatch.commissionIqd ? formatIqd(dispatch.commissionIqd) : undefined} />
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="font-semibold text-lg">COD</h2>
          <dl className="space-y-2 text-sm">
            <Row label="مبلغ COD" value={Number(dispatch.codAmountIqd) > 0 ? formatIqd(dispatch.codAmountIqd) : 'لا يوجد'} />
            <Row
              label="تاريخ التحصيل"
              value={dispatch.codCollectedAt ? formatDate(dispatch.codCollectedAt) : 'لم يُحصَّل بعد'}
            />
          </dl>
        </section>

        {dispatch.notes && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-lg mb-2">ملاحظات</h2>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{dispatch.notes}</p>
          </section>
        )}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-lg mb-4">سجل الحالات</h2>
        {dispatch.statusHistory.length === 0 ? (
          <div className="text-sm text-slate-400">لا يوجد تاريخ بعد</div>
        ) : (
          <ol className="relative border-s border-slate-200 space-y-4 ms-3">
            {dispatch.statusHistory.map((ev, i) => (
              <li key={i} className="ms-6">
                <span className="absolute -start-2 mt-1 flex size-4 items-center justify-center rounded-full border border-white bg-sky-500 ring-4 ring-white" />
                <div className="flex items-center gap-3 flex-wrap">
                  <StatusBadge status={ev.status} />
                  <time className="text-xs text-slate-500">{formatDate(ev.occurredAt)}</time>
                  {ev.actorName && (
                    <span className="text-xs text-slate-400">بواسطة: {ev.actorName}</span>
                  )}
                </div>
                {ev.notes && (
                  <p className="mt-1 text-sm text-slate-600">{ev.notes}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Row({ label, value, dir }: { label: string; value: string | null | undefined; dir?: 'ltr' | 'rtl' }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500 shrink-0">{label}</dt>
      <dd className="text-slate-800 font-medium text-end" dir={dir}>{value ?? '—'}</dd>
    </div>
  );
}
