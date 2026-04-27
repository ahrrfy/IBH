'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Wallet, Ban, BanknoteIcon } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

type SettlementDetail = {
  id: string;
  number: string;
  status: 'draft' | 'proposed' | 'posted' | 'paid' | 'cancelled';
  periodStart: string;
  periodEnd: string;
  totalCodCollectedIqd: string;
  totalCommissionIqd: string;
  totalShippingCostIqd: string;
  netDueIqd: string;
  deliveriesCount: number;
  postedJeId: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  paymentRef: string | null;
  deliveryCompany: { id: string; code: string; nameAr: string; type: string };
  deliveries: Array<{
    id: string;
    number: string;
    deliveredAt: string;
    codCollectedIqd: string;
    commissionIqd: string;
    shippingCostIqd: string;
  }>;
};

export default function SettlementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [showApprove, setShowApprove] = useState(false);
  const [showPaid, setShowPaid] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  const { data: s, isLoading, error } = useQuery({
    queryKey: ['delivery-settlement', id],
    queryFn: () => api<SettlementDetail>(`/delivery/settlements/${id}`),
  });

  if (isLoading) return <div className="text-slate-500">جاري التحميل...</div>;
  if (error || !s) return <div className="text-red-600">خطأ في التحميل</div>;

  function refresh() {
    qc.invalidateQueries({ queryKey: ['delivery-settlement', id] });
    qc.invalidateQueries({ queryKey: ['delivery-settlements'] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">تسوية {s.number}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm">
            <StatusBadge status={s.status} />
            <span className="text-slate-500">
              {s.deliveryCompany.nameAr} ({s.deliveryCompany.code})
            </span>
            <span className="text-slate-500">
              {formatDate(s.periodStart)} → {formatDate(s.periodEnd)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {s.status === 'proposed' && (
            <>
              <button
                onClick={() => setShowApprove(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
              >
                <CheckCircle2 className="size-4" /> اعتماد + قيد محاسبي
              </button>
              <button
                onClick={() => setShowCancel(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-red-300 text-red-700 bg-white px-4 py-2 hover:bg-red-50"
              >
                <Ban className="size-4" /> إلغاء
              </button>
            </>
          )}
          {s.status === 'posted' && (
            <button
              onClick={() => setShowPaid(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
            >
              <BanknoteIcon className="size-4" /> تأكيد الاستلام
            </button>
          )}
          <Link href="/delivery/settlements" className="text-slate-600 hover:text-slate-900 inline-flex items-center gap-1">
            <ArrowRight className="size-4" /> القائمة
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="إجمالي محصَّل" value={formatIqd(s.totalCodCollectedIqd)} />
        <Stat label="عمولة الشركة" value={formatIqd(s.totalCommissionIqd)} tone="warn" />
        <Stat label="تكلفة الشحن" value={formatIqd(s.totalShippingCostIqd)} tone="warn" />
        <Stat label="الصافي المستحق" value={formatIqd(s.netDueIqd)} tone="emerald" big />
      </div>

      {(s.postedJeId || s.paidAt) && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          {s.postedJeId && (
            <div>
              ✅ تم ترحيل القيد المحاسبي · معرّف: <code className="font-mono text-xs">{s.postedJeId}</code>{' '}
              {s.approvedAt && <span className="text-slate-600">في {formatDate(s.approvedAt)}</span>}
            </div>
          )}
          {s.paidAt && (
            <div className="mt-1">
              💰 تم تأكيد الاستلام في {formatDate(s.paidAt)}
              {s.paymentRef && <span className="text-slate-600"> · مرجع: {s.paymentRef}</span>}
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Wallet className="size-5" /> التوصيلات المُسوَّاة ({s.deliveries.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-600 border-b border-slate-200">
              <tr>
                <th className="text-start py-2">رقم التوصيل</th>
                <th className="text-start py-2">تاريخ التسليم</th>
                <th className="text-end py-2">المحصَّل</th>
                <th className="text-end py-2">العمولة</th>
                <th className="text-end py-2">تكلفة الشحن</th>
                <th className="text-end py-2">الصافي</th>
              </tr>
            </thead>
            <tbody>
              {s.deliveries.map((d) => {
                const net = Number(d.codCollectedIqd) - Number(d.commissionIqd) - Number(d.shippingCostIqd);
                return (
                  <tr key={d.id} className="border-b border-slate-100">
                    <td className="py-2 font-medium">{d.number}</td>
                    <td className="py-2 text-slate-600">{formatDate(d.deliveredAt)}</td>
                    <td className="py-2 text-end">{formatIqd(d.codCollectedIqd)}</td>
                    <td className="py-2 text-end text-amber-700">{formatIqd(d.commissionIqd)}</td>
                    <td className="py-2 text-end text-amber-700">{formatIqd(d.shippingCostIqd)}</td>
                    <td className="py-2 text-end font-semibold">{formatIqd(net)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {showApprove && <ApproveModal id={id} onClose={() => setShowApprove(false)} onDone={() => { setShowApprove(false); refresh(); }} />}
      {showPaid && <MarkPaidModal id={id} onClose={() => setShowPaid(false)} onDone={() => { setShowPaid(false); refresh(); }} />}
      {showCancel && <CancelModal id={id} onClose={() => setShowCancel(false)} onDone={() => { setShowCancel(false); refresh(); }} />}
    </div>
  );
}

function Stat({ label, value, tone, big }: { label: string; value: string; tone?: 'warn' | 'emerald'; big?: boolean }) {
  const cls = tone === 'warn' ? 'text-amber-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-slate-900';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 ${big ? 'text-3xl' : 'text-2xl'} font-bold ${cls}`}>{value}</div>
    </div>
  );
}

function ApproveModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    bankAccountCode: '',
    receivableAccountCode: '',
    commissionAccountCode: '',
    shippingAccountCode: '',
  });

  const approve = useMutation({
    mutationFn: (body: typeof form) => api(`/delivery/settlements/${id}/approve`, { method: 'POST', body }),
    onSuccess: onDone,
    onError: (e: unknown) => setError(e instanceof ApiError ? e.messageAr : 'فشل الاعتماد'),
  });

  return (
    <Modal title="اعتماد التسوية + ترحيل القيد" onClose={onClose}>
      {error && (
        <div role="alert" className="rounded bg-red-50 border border-red-200 p-2 text-red-800 text-sm mb-3">
          {error}
        </div>
      )}
      <p className="text-sm text-slate-600 mb-3">
        سيتم إنشاء قيد محاسبي متوازن بالحسابات أدناه. أدخل أكواد الحسابات (مثلاً 102 للبنك، 130 للذمم، 661 للعمولة).
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          approve.mutate(form);
        }}
        className="space-y-3"
      >
        <Field label="حساب البنك (مدين بالصافي) *">
          <input
            value={form.bankAccountCode}
            onChange={(e) => setForm({ ...form, bankAccountCode: e.target.value })}
            className="w-full rounded-lg border-slate-300"
            placeholder="102"
            required
            dir="ltr"
          />
        </Field>
        <Field label="حساب ذمم شركة التوصيل (دائن بالمحصَّل) *">
          <input
            value={form.receivableAccountCode}
            onChange={(e) => setForm({ ...form, receivableAccountCode: e.target.value })}
            className="w-full rounded-lg border-slate-300"
            placeholder="130"
            required
            dir="ltr"
          />
        </Field>
        <Field label="حساب مصروف العمولة (مدين)">
          <input
            value={form.commissionAccountCode}
            onChange={(e) => setForm({ ...form, commissionAccountCode: e.target.value })}
            className="w-full rounded-lg border-slate-300"
            placeholder="661"
            dir="ltr"
          />
        </Field>
        <Field label="حساب مصروف الشحن (مدين)">
          <input
            value={form.shippingAccountCode}
            onChange={(e) => setForm({ ...form, shippingAccountCode: e.target.value })}
            className="w-full rounded-lg border-slate-300"
            placeholder="662"
            dir="ltr"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={approve.isPending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {approve.isPending ? 'جاري الترحيل...' : 'اعتماد + ترحيل'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function MarkPaidModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [paymentRef, setPaymentRef] = useState('');

  const markPaid = useMutation({
    mutationFn: () => api(`/delivery/settlements/${id}/mark-paid`, { method: 'POST', body: { paymentRef } }),
    onSuccess: onDone,
    onError: (e: unknown) => setError(e instanceof ApiError ? e.messageAr : 'فشل التأكيد'),
  });

  return (
    <Modal title="تأكيد استلام التسوية" onClose={onClose}>
      {error && (
        <div role="alert" className="rounded bg-red-50 border border-red-200 p-2 text-red-800 text-sm mb-3">
          {error}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          markPaid.mutate();
        }}
        className="space-y-3"
      >
        <Field label="مرجع الدفع (اختياري)">
          <input
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
            className="w-full rounded-lg border-slate-300"
            placeholder="رقم الحوالة، مرجع التحويل..."
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={markPaid.isPending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {markPaid.isPending ? '...' : 'تأكيد'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CancelModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const cancel = useMutation({
    mutationFn: () => api(`/delivery/settlements/${id}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: onDone,
    onError: (e: unknown) => setError(e instanceof ApiError ? e.messageAr : 'فشل الإلغاء'),
  });

  return (
    <Modal title="إلغاء التسوية" onClose={onClose}>
      <p className="text-sm text-slate-600 mb-3">
        سيتم فك ربط التوصيلات حتى يمكن إعادة تسويتها. لا يمكن إلغاء تسوية مرحَّلة محاسبياً.
      </p>
      {error && (
        <div role="alert" className="rounded bg-red-50 border border-red-200 p-2 text-red-800 text-sm mb-3">
          {error}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (!reason.trim()) {
            setError('السبب مطلوب');
            return;
          }
          cancel.mutate();
        }}
        className="space-y-3"
      >
        <Field label="السبب *">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border-slate-300"
            rows={3}
            required
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50">
            عودة
          </button>
          <button
            type="submit"
            disabled={cancel.isPending}
            className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-60"
          >
            {cancel.isPending ? '...' : 'تأكيد الإلغاء'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-slate-700 mb-1">{label}</div>
      {children}
    </label>
  );
}
