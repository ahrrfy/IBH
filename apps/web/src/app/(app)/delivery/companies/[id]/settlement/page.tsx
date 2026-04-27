'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

type Settlement = {
  id: string;
  status: 'draft' | 'proposed' | 'posted' | 'paid' | 'cancelled';
  periodStart: string;
  periodEnd: string;
  totalCodCollected: string;
  totalShippingCost: string;
  totalCommission: string;
  netPayable: string;
  lineCount: number;
  proposedAt: string | null;
  postedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  deliveryCompany: { id: string; nameAr: string; code: string };
};

const STATUS_LABELS: Record<string, string> = {
  draft:     'مسودة',
  proposed:  'مقترحة',
  posted:    'مُرحَّلة',
  paid:      'مدفوعة',
  cancelled: 'ملغاة',
};

export default function CompanySettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: companyId } = use(params);
  const qc = useQueryClient();

  const [proposePeriod, setProposePeriod] = useState({ start: '', end: '' });
  const [approveForm, setApproveForm] = useState({
    receivableAccountCode: '1130',
    commissionAccountCode: '6210',
    shippingAccountCode:   '6220',
    bankAccountCode:       '1110',
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: company } = useQuery({
    queryKey: ['delivery-company', companyId],
    queryFn: () => api<{ nameAr: string; code: string }>(`/delivery/companies/${companyId}`),
  });

  const { data: settlementsData, isLoading } = useQuery({
    queryKey: ['delivery-settlements', companyId],
    queryFn: () =>
      api<{ rows: Settlement[]; total: number }>(
        `/delivery/settlements?deliveryCompanyId=${companyId}&limit=50`,
      ),
  });

  const settlements = settlementsData?.rows ?? [];

  const propose = useMutation({
    mutationFn: () =>
      api<Settlement>('/delivery/settlements/propose', {
        method: 'POST',
        body: JSON.stringify({
          deliveryCompanyId: companyId,
          periodStart: proposePeriod.start,
          periodEnd: proposePeriod.end,
        }),
      }),
    onSuccess: (res) => {
      setActionError(null);
      setSelectedId(res.id);
      qc.invalidateQueries({ queryKey: ['delivery-settlements', companyId] });
    },
    onError: (e: unknown) => {
      setActionError(e instanceof ApiError ? e.messageAr : 'فشل إنشاء التسوية');
    },
  });

  const approve = useMutation({
    mutationFn: (settlementId: string) =>
      api(`/delivery/settlements/${settlementId}/approve`, {
        method: 'POST',
        body: JSON.stringify(approveForm),
      }),
    onSuccess: () => {
      setActionError(null);
      qc.invalidateQueries({ queryKey: ['delivery-settlements', companyId] });
    },
    onError: (e: unknown) => {
      setActionError(e instanceof ApiError ? e.messageAr : 'فشل الاعتماد');
    },
  });

  const markPaid = useMutation({
    mutationFn: (settlementId: string) =>
      api(`/delivery/settlements/${settlementId}/mark-paid`, { method: 'POST' }),
    onSuccess: () => {
      setActionError(null);
      qc.invalidateQueries({ queryKey: ['delivery-settlements', companyId] });
    },
    onError: (e: unknown) => {
      setActionError(e instanceof ApiError ? e.messageAr : 'فشل تسجيل الدفع');
    },
  });

  const cancel = useMutation({
    mutationFn: (settlementId: string) =>
      api(`/delivery/settlements/${settlementId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      setActionError(null);
      qc.invalidateQueries({ queryKey: ['delivery-settlements', companyId] });
    },
    onError: (e: unknown) => {
      setActionError(e instanceof ApiError ? e.messageAr : 'فشل الإلغاء');
    },
  });

  const selected = settlements.find((s) => s.id === selectedId) ?? settlements[0] ?? null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link href={`/delivery/companies/${companyId}`} className="text-slate-500 hover:text-slate-800">
          <ArrowRight className="size-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">
            تسويات COD — {company?.nameAr ?? '...'}
          </h1>
          <p className="text-sm text-slate-500">تسوية مستحقات شركة التوصيل</p>
        </div>
      </div>

      {actionError && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-800 text-sm">
          {actionError}
        </div>
      )}

      <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 space-y-4">
        <h2 className="font-semibold text-sky-900">إنشاء تسوية جديدة</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-sky-800 mb-1">من تاريخ</label>
            <input
              type="date"
              value={proposePeriod.start}
              onChange={(e) => setProposePeriod((p) => ({ ...p, start: e.target.value }))}
              className="w-full rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-sky-800 mb-1">إلى تاريخ</label>
            <input
              type="date"
              value={proposePeriod.end}
              onChange={(e) => setProposePeriod((p) => ({ ...p, end: e.target.value }))}
              className="w-full rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </div>
        <button
          onClick={() => { setActionError(null); propose.mutate(); }}
          disabled={propose.isPending || !proposePeriod.start || !proposePeriod.end}
          className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
        >
          {propose.isPending && <Loader2 className="size-4 animate-spin" />}
          اقتراح تسوية
        </button>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-2">
          <h2 className="font-semibold text-slate-700">التسويات السابقة</h2>
          {isLoading && <div className="text-slate-400 text-sm">جاري التحميل...</div>}
          {settlements.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`w-full text-start rounded-xl border p-3 transition-colors ${
                selected?.id === s.id
                  ? 'border-sky-400 bg-sky-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <StatusBadge status={s.status} />
                <span className="text-xs text-slate-400">{formatDate(s.periodStart)}</span>
              </div>
              <div className="text-sm font-semibold">{formatIqd(s.netPayable)}</div>
              <div className="text-xs text-slate-500">{s.lineCount} توصيلة</div>
            </button>
          ))}
          {!isLoading && settlements.length === 0 && (
            <div className="text-sm text-slate-400 py-4 text-center">لا توجد تسويات</div>
          )}
        </div>

        {selected && (
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">
                  تسوية الفترة {formatDate(selected.periodStart)} — {formatDate(selected.periodEnd)}
                </h3>
                <StatusBadge status={selected.status} />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <Stat label="إجمالي COD المحصَّل" value={formatIqd(selected.totalCodCollected)} />
                <Stat label="تكلفة الشحن" value={formatIqd(selected.totalShippingCost)} />
                <Stat label="العمولة" value={formatIqd(selected.totalCommission)} />
                <Stat label="صافي المستحق للشركة" value={formatIqd(selected.netPayable)} bold />
              </div>

              {selected.status === 'proposed' && (
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <h4 className="font-medium text-sm">أكواد الحسابات للترحيل</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {(
                      [
                        { key: 'receivableAccountCode', label: 'حساب الذمم المدينة (COD)' },
                        { key: 'commissionAccountCode',  label: 'حساب مصروف العمولة' },
                        { key: 'shippingAccountCode',    label: 'حساب مصروف الشحن' },
                        { key: 'bankAccountCode',        label: 'حساب البنك / الصندوق' },
                      ] as const
                    ).map(({ key, label }) => (
                      <div key={key}>
                        <label className="block text-xs text-slate-600 mb-1">{label}</label>
                        <input
                          type="text"
                          value={approveForm[key]}
                          onChange={(e) =>
                            setApproveForm((p) => ({ ...p, [key]: e.target.value }))
                          }
                          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                          dir="ltr"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setActionError(null); approve.mutate(selected.id); }}
                      disabled={approve.isPending}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {approve.isPending && <Loader2 className="size-4 animate-spin" />}
                      اعتماد وترحيل القيد
                    </button>
                    <button
                      onClick={() => { setActionError(null); cancel.mutate(selected.id); }}
                      disabled={cancel.isPending}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-300 text-red-700 bg-white px-4 py-2 text-sm hover:bg-red-50 disabled:opacity-50"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              )}

              {selected.status === 'posted' && (
                <div className="border-t border-slate-100 pt-4 flex gap-2">
                  <button
                    onClick={() => { setActionError(null); markPaid.mutate(selected.id); }}
                    disabled={markPaid.isPending}
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
                  >
                    {markPaid.isPending && <Loader2 className="size-4 animate-spin" />}
                    تسجيل الدفع
                  </button>
                  <button
                    onClick={() => { setActionError(null); cancel.mutate(selected.id); }}
                    disabled={cancel.isPending}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-300 text-red-700 bg-white px-4 py-2 text-sm hover:bg-red-50 disabled:opacity-50"
                  >
                    إلغاء
                  </button>
                </div>
              )}

              <div className="border-t border-slate-100 pt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                {selected.proposedAt && <span>اقتُرحت: {formatDate(selected.proposedAt)}</span>}
                {selected.postedAt && <span>رُحِّلت: {formatDate(selected.postedAt)}</span>}
                {selected.paidAt && <span>دُفعت: {formatDate(selected.paidAt)}</span>}
                {selected.cancelledAt && (
                  <span className="col-span-2 text-red-600">
                    أُلغيت: {formatDate(selected.cancelledAt)}
                    {selected.cancelReason ? ` — ${selected.cancelReason}` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 ${bold ? 'text-lg font-bold' : 'text-sm font-semibold'}`}>{value}</div>
    </div>
  );
}
