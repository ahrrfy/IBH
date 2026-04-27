/**
 * T70 — Invoice detail page (super-admin).
 *
 * Header: tenant, plan, period, amount, status. Payments table with method,
 * reference, recordedBy. Actions matching the list page.
 */
'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { formatDate, formatIqd } from '@/lib/format';

interface InvoiceDetail {
  id: string;
  companyId: string;
  subscriptionId: string;
  status: 'open' | 'paid' | 'failed' | 'voided';
  periodStart: string;
  periodEnd: string;
  amountIqd: string;
  dueDate: string | null;
  paidAt: string | null;
  paymentMethod: string;
  paymentReference: string | null;
  notes: string | null;
  createdAt: string;
  subscription: {
    id: string;
    plan: { id: string; code: string; name: string } | null;
    billingCycle: string;
  };
  company: {
    id: string;
    code: string;
    nameAr: string | null;
    nameEn: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  payments: Array<{
    id: string;
    amountIqd: string;
    paidAt: string;
    method: string;
    reference: string | null;
    recordedBy: string | null;
    notes: string | null;
    status: string;
  }>;
}

const METHOD_LABELS_AR: Record<string, string> = {
  manual: 'يدوي / نقدي',
  wire: 'حوالة بنكية',
  pending: 'قيد الانتظار',
};

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [showPay, setShowPay] = useState(false);
  const [method, setMethod] = useState<'manual' | 'wire'>('manual');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-billing', 'invoice', id],
    queryFn: () => api<InvoiceDetail>(`/admin/billing/invoices/${id}`),
    enabled: !!id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-billing'] });
    refetch();
  };

  const payMut = useMutation({
    mutationFn: () =>
      api(`/admin/billing/invoices/${id}/mark-paid`, {
        method: 'POST',
        body: { method, reference: reference.trim() || undefined, notes: notes.trim() || undefined },
      }),
    onSuccess: () => {
      setShowPay(false);
      invalidate();
    },
  });
  const failMut = useMutation({
    mutationFn: () =>
      api(`/admin/billing/invoices/${id}/mark-failed`, {
        method: 'POST',
        body: { notes: notes.trim() || undefined },
      }),
    onSuccess: invalidate,
  });
  const retryMut = useMutation({
    mutationFn: () => api(`/admin/billing/invoices/${id}/retry`, { method: 'POST' }),
    onSuccess: invalidate,
  });
  const voidMut = useMutation({
    mutationFn: () =>
      api(`/admin/billing/invoices/${id}/void`, {
        method: 'POST',
        body: { notes: notes.trim() || undefined },
      }),
    onSuccess: invalidate,
  });

  if (isLoading) return <div className="p-6 text-slate-500">جاري التحميل…</div>;
  if (error || !data) {
    return (
      <div className="p-6">
        <p className="text-rose-600 mb-2">تعذّر تحميل الفاتورة</p>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 rounded-md border border-slate-300"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const inv = data;
  const tenantName = inv.company?.nameAr ?? inv.company?.nameEn ?? inv.company?.code ?? inv.companyId;

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <Link href="/super-admin/billing" className="text-xs text-sky-700 hover:underline">
            ← كل الفواتير
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">فاتورة {inv.id}</h1>
          <p className="text-sm text-slate-500 mt-1">{tenantName}</p>
        </div>
        <StatusBadge status={inv.status} />
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="border border-slate-200 rounded-lg p-4 bg-white">
          <p className="text-xs text-slate-500">الباقة</p>
          <p className="text-base font-semibold text-slate-900 mt-1">
            {inv.subscription?.plan?.name ?? '—'}
          </p>
        </div>
        <div className="border border-slate-200 rounded-lg p-4 bg-white">
          <p className="text-xs text-slate-500">الفترة</p>
          <p className="text-sm font-medium text-slate-900 mt-1">
            {formatDate(inv.periodStart)} → {formatDate(inv.periodEnd)}
          </p>
        </div>
        <div className="border border-slate-200 rounded-lg p-4 bg-white">
          <p className="text-xs text-slate-500">المبلغ</p>
          <p className="text-base font-bold text-slate-900 mt-1">{formatIqd(inv.amountIqd)}</p>
        </div>
        <div className="border border-slate-200 rounded-lg p-4 bg-white">
          <p className="text-xs text-slate-500">تاريخ الاستحقاق</p>
          <p className="text-sm font-medium text-slate-900 mt-1">{formatDate(inv.dueDate)}</p>
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-2">
        {inv.status === 'open' && (
          <>
            <button
              onClick={() => setShowPay(true)}
              className="px-4 py-2 text-sm rounded-md bg-emerald-600 text-white"
            >
              تسجيل دفع
            </button>
            <button
              onClick={() => failMut.mutate()}
              disabled={failMut.isPending}
              className="px-4 py-2 text-sm rounded-md bg-amber-500 text-white disabled:opacity-50"
            >
              وضع علامة فشل
            </button>
          </>
        )}
        {inv.status === 'failed' && (
          <button
            onClick={() => retryMut.mutate()}
            disabled={retryMut.isPending}
            className="px-4 py-2 text-sm rounded-md bg-amber-500 text-white disabled:opacity-50"
          >
            إعادة محاولة
          </button>
        )}
        {(inv.status === 'open' || inv.status === 'failed') && (
          <button
            onClick={() => voidMut.mutate()}
            disabled={voidMut.isPending}
            className="px-4 py-2 text-sm rounded-md bg-rose-600 text-white disabled:opacity-50"
          >
            إلغاء الفاتورة
          </button>
        )}
      </section>

      {showPay && (
        <section className="border border-slate-200 rounded-lg p-4 bg-white space-y-3">
          <h2 className="text-base font-bold">تسجيل دفع يدوي</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-sm">
              <span className="text-slate-700">طريقة الدفع</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as any)}
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-1.5"
              >
                <option value="manual">يدوي / نقدي</option>
                <option value="wire">حوالة بنكية</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="text-slate-700">المرجع</span>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-700">ملاحظات</span>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-1.5"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowPay(false)}
              className="px-3 py-1.5 text-sm rounded-md border border-slate-300"
            >
              إلغاء
            </button>
            <button
              onClick={() => payMut.mutate()}
              disabled={payMut.isPending}
              className="px-4 py-1.5 text-sm rounded-md bg-emerald-600 text-white disabled:opacity-50"
            >
              حفظ
            </button>
          </div>
          {payMut.isError && (
            <p className="text-sm text-rose-600">تعذّر تسجيل الدفع</p>
          )}
        </section>
      )}

      <section>
        <h2 className="text-lg font-bold text-slate-900 mb-2">سجل المدفوعات</h2>
        {inv.payments.length === 0 ? (
          <p className="text-sm text-slate-500 border border-dashed border-slate-300 rounded-lg p-4">
            لا توجد مدفوعات مسجّلة بعد
          </p>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="text-start p-2.5">التاريخ</th>
                  <th className="text-start p-2.5">المبلغ</th>
                  <th className="text-start p-2.5">الطريقة</th>
                  <th className="text-start p-2.5">المرجع</th>
                  <th className="text-start p-2.5">سُجّل بواسطة</th>
                  <th className="text-start p-2.5">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {inv.payments.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="p-2.5">{formatDate(p.paidAt, true)}</td>
                    <td className="p-2.5">{formatIqd(p.amountIqd)}</td>
                    <td className="p-2.5">{METHOD_LABELS_AR[p.method] ?? p.method}</td>
                    <td className="p-2.5 font-mono text-xs">{p.reference ?? '—'}</td>
                    <td className="p-2.5 font-mono text-xs">{p.recordedBy ?? '—'}</td>
                    <td className="p-2.5">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
