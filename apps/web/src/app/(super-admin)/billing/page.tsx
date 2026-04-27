/**
 * T70 — Billing dashboard (super-admin).
 *
 * Lists invoices across all tenants with filters (status, company search,
 * date range). Top KPIs show open total, paid this month, failed count.
 * Inline actions: View, Mark Paid (modal), Retry (failed only), Void.
 *
 * No real payment gateway — manual recording layer over T68 prorated
 * charges and subscription period sweeps.
 */
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatDate, formatIqd } from '@/lib/format';

type InvoiceStatus = 'open' | 'paid' | 'failed' | 'voided';

interface InvoiceRow {
  id: string;
  companyId: string;
  companyCode: string | null;
  companyNameAr: string | null;
  companyNameEn: string | null;
  subscriptionId: string;
  planCode: string | null;
  planName: string | null;
  periodStart: string;
  periodEnd: string;
  amountIqd: string;
  status: InvoiceStatus;
  dueDate: string | null;
  paidAt: string | null;
  paymentMethod: string;
  paymentReference: string | null;
  createdAt: string;
}

const STATUS_LABELS_AR: Record<InvoiceStatus, string> = {
  open: 'مفتوحة',
  paid: 'مدفوعة',
  failed: 'فاشلة',
  voided: 'ملغاة',
};

interface MarkPaidModalProps {
  invoice: InvoiceRow;
  onClose: () => void;
  onSuccess: () => void;
}

function MarkPaidModal({ invoice, onClose, onSuccess }: MarkPaidModalProps) {
  const [method, setMethod] = useState<'manual' | 'wire'>('manual');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const mut = useMutation({
    mutationFn: () =>
      api(`/admin/billing/invoices/${invoice.id}/mark-paid`, {
        method: 'POST',
        body: { method, reference: reference.trim() || undefined, notes: notes.trim() || undefined },
      }),
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5 space-y-4">
        <h2 className="text-lg font-bold text-slate-900">تسجيل دفع يدوي</h2>
        <p className="text-sm text-slate-500">
          الفاتورة <span className="font-mono">{invoice.id}</span> ·{' '}
          {formatIqd(invoice.amountIqd)}
        </p>
        <label className="block text-sm">
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
        <label className="block text-sm">
          <span className="text-slate-700">رقم المرجع (اختياري)</span>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded-md px-3 py-1.5"
            placeholder="WIRE-2026-0142"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-700">ملاحظات</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full border border-slate-300 rounded-md px-3 py-1.5"
          />
        </label>
        {mut.isError && (
          <p className="text-sm text-rose-600">تعذّر تسجيل الدفع</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded-md border border-slate-300 text-slate-700"
          >
            إلغاء
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="px-4 py-1.5 text-sm rounded-md bg-emerald-600 text-white disabled:opacity-50"
          >
            تسجيل الدفع
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BillingDashboardPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'' | InvoiceStatus>('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [payTarget, setPayTarget] = useState<InvoiceRow | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-billing', 'invoices', status, from, to],
    queryFn: () =>
      api<{ items: InvoiceRow[]; total: number }>('/admin/billing/invoices', {
        method: 'GET',
        query: {
          status: status || undefined,
          from: from || undefined,
          to: to || undefined,
          limit: 200,
        },
      }),
  });

  const allRows = data?.items ?? [];
  const filtered = useMemo(() => {
    if (!search) return allRows;
    const q = search.trim().toLowerCase();
    return allRows.filter(
      (r) =>
        (r.companyNameAr ?? '').toLowerCase().includes(q) ||
        (r.companyNameEn ?? '').toLowerCase().includes(q) ||
        (r.companyCode ?? '').toLowerCase().includes(q),
    );
  }, [allRows, search]);

  const kpis = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let openTotal = 0;
    let paidThisMonth = 0;
    let failedCount = 0;
    for (const r of allRows) {
      if (r.status === 'open') openTotal += Number(r.amountIqd);
      else if (r.status === 'paid' && r.paidAt && new Date(r.paidAt) >= monthStart)
        paidThisMonth += Number(r.amountIqd);
      else if (r.status === 'failed') failedCount++;
    }
    return { openTotal, paidThisMonth, failedCount };
  }, [allRows]);

  const retryMut = useMutation({
    mutationFn: (id: string) =>
      api(`/admin/billing/invoices/${id}/retry`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-billing'] }),
  });
  const voidMut = useMutation({
    mutationFn: (id: string) =>
      api(`/admin/billing/invoices/${id}/void`, { method: 'POST', body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-billing'] }),
  });
  const generateMut = useMutation({
    mutationFn: () =>
      api('/admin/billing/generate', { method: 'POST', body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-billing'] }),
  });

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">الفوترة (المستأجرون)</h1>
          <p className="text-sm text-slate-500 mt-1">{data?.total ?? 0} فاتورة</p>
        </div>
        <button
          onClick={() => generateMut.mutate()}
          disabled={generateMut.isPending}
          className="px-4 py-2 text-sm rounded-md bg-sky-600 text-white disabled:opacity-50"
        >
          توليد فواتير الفترة
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="border border-slate-200 rounded-lg p-4 bg-white">
          <p className="text-xs text-slate-500">إجمالي المفتوحة</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{formatIqd(kpis.openTotal)}</p>
        </div>
        <div className="border border-slate-200 rounded-lg p-4 bg-white">
          <p className="text-xs text-slate-500">مدفوعة هذا الشهر</p>
          <p className="text-xl font-bold text-emerald-700 mt-1">{formatIqd(kpis.paidThisMonth)}</p>
        </div>
        <div className="border border-slate-200 rounded-lg p-4 bg-white">
          <p className="text-xs text-slate-500">فواتير فاشلة</p>
          <p className="text-xl font-bold text-rose-700 mt-1">{kpis.failedCount}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
          className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white"
        >
          <option value="">كل الحالات</option>
          {(Object.keys(STATUS_LABELS_AR) as InvoiceStatus[]).map((k) => (
            <option key={k} value={k}>
              {STATUS_LABELS_AR[k]}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="ابحث باسم الشركة أو الرمز…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white min-w-[14rem]"
        />
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white"
          aria-label="من تاريخ"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white"
          aria-label="إلى تاريخ"
        />
      </div>

      <DataTable<InvoiceRow>
        columns={[
          {
            key: 'date',
            header: 'تاريخ الإنشاء',
            accessor: (r) => formatDate(r.createdAt),
          },
          {
            key: 'tenant',
            header: 'الشركة',
            accessor: (r) => (
              <Link
                href={`/super-admin/billing/${r.id}`}
                className="text-sky-700 hover:underline"
              >
                {r.companyNameAr ?? r.companyNameEn ?? r.companyCode ?? r.companyId}
              </Link>
            ),
          },
          {
            key: 'plan',
            header: 'الباقة',
            accessor: (r) => r.planName ?? '—',
          },
          {
            key: 'period',
            header: 'الفترة',
            accessor: (r) => `${formatDate(r.periodStart)} → ${formatDate(r.periodEnd)}`,
          },
          {
            key: 'amount',
            header: 'المبلغ (IQD)',
            accessor: (r) => formatIqd(r.amountIqd),
            align: 'end',
          },
          {
            key: 'status',
            header: 'الحالة',
            accessor: (r) => <StatusBadge status={r.status} />,
            align: 'center',
          },
          {
            key: 'actions',
            header: 'إجراءات',
            accessor: (r) => (
              <div className="flex items-center gap-2 text-xs">
                <Link
                  href={`/super-admin/billing/${r.id}`}
                  className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  عرض
                </Link>
                {r.status === 'open' && (
                  <button
                    onClick={() => setPayTarget(r)}
                    className="px-2 py-1 rounded bg-emerald-600 text-white"
                  >
                    تسجيل دفع
                  </button>
                )}
                {r.status === 'failed' && (
                  <button
                    onClick={() => retryMut.mutate(r.id)}
                    className="px-2 py-1 rounded bg-amber-500 text-white"
                  >
                    إعادة محاولة
                  </button>
                )}
                {(r.status === 'open' || r.status === 'failed') && (
                  <button
                    onClick={() => voidMut.mutate(r.id)}
                    className="px-2 py-1 rounded bg-rose-600 text-white"
                  >
                    إلغاء
                  </button>
                )}
              </div>
            ),
            align: 'center',
          },
        ]}
        rows={filtered}
        loading={isLoading}
        error={error ? 'تعذّر تحميل البيانات' : null}
        onRetry={() => refetch()}
        getRowKey={(r) => r.id}
        exportFilename="billing-invoices"
      />

      {payTarget && (
        <MarkPaidModal
          invoice={payTarget}
          onClose={() => setPayTarget(null)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['admin-billing'] })}
        />
      )}
    </div>
  );
}
