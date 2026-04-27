/**
 * T63 — Tenant detail (super-admin).
 *
 * Subscription summary + actions:
 *   - Activate / Suspend
 *   - Plan upgrade / downgrade (select from active plans)
 *   - Manually extend trial (days)
 * Plus a recent License events log (last 50).
 */
'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';

interface PlanLite {
  id: string;
  code: string;
  name: string;
  monthlyPriceIqd: string;
  annualPriceIqd: string;
}

interface SubscriptionDetail {
  id: string;
  companyId: string;
  status: string;
  billingCycle: string;
  startedAt: string | null;
  currentPeriodEndAt: string | null;
  trialEndsAt: string | null;
  gracePeriodEndsAt: string | null;
  priceIqd: string;
  planId: string;
  plan: PlanLite;
  company: {
    id: string;
    code: string;
    nameAr: string;
    nameEn: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  licenseKeys: Array<{
    id: string;
    key: string;
    issuedAt: string;
    expiresAt: string;
    revokedAt: string | null;
    maxDevices: number;
    _count: { fingerprints: number };
  }>;
  featureOverrides: Array<{
    id: string;
    featureCode: string;
    isEnabled: boolean;
    expiresAt: string | null;
    reason: string | null;
  }>;
}

interface LicenseEvent {
  id: string;
  subscriptionId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  createdBy: string | null;
}

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-licensing', 'tenant', id],
    queryFn: () => api<SubscriptionDetail>(`/admin/licensing/tenants/${id}`),
    enabled: !!id,
  });

  const plansQuery = useQuery({
    queryKey: ['admin-licensing', 'plans'],
    queryFn: () => api<PlanLite[]>(`/admin/licensing/plans`),
  });

  const eventsQuery = useQuery({
    queryKey: ['admin-licensing', 'events', id],
    queryFn: () =>
      api<{ items: LicenseEvent[]; total: number }>(`/admin/licensing/audit`, {
        method: 'GET',
        query: { subscriptionId: id, take: 50 },
      }),
    enabled: !!id,
  });

  const setStatusMut = useMutation({
    mutationFn: (vars: { status: 'active' | 'suspended'; reason?: string }) =>
      api(`/admin/licensing/tenants/${id}/status`, { method: 'PATCH', body: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-licensing'] });
    },
  });

  const changePlanMut = useMutation({
    mutationFn: (planId: string) =>
      api(`/admin/licensing/tenants/${id}/plan`, { method: 'PATCH', body: { planId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-licensing'] }),
  });

  const extendTrialMut = useMutation({
    mutationFn: (extraDays: number) =>
      api(`/admin/licensing/tenants/${id}/extend-trial`, {
        method: 'POST',
        body: { extraDays },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-licensing'] }),
  });

  const [extraDays, setExtraDays] = useState(14);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [suspendReason, setSuspendReason] = useState('');

  const sub = data;
  const planOptions = useMemo(
    () => (plansQuery.data ?? []).filter((p) => p.id !== sub?.planId),
    [plansQuery.data, sub?.planId],
  );

  if (isLoading) {
    return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  }
  if (error || !sub) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-red-600">تعذّر تحميل تفاصيل الاشتراك.</p>
        <button onClick={() => refetch()} className="btn-secondary btn-sm">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const isSuspended = sub.status === 'suspended';

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {sub.company?.nameAr ?? sub.company?.code ?? sub.companyId}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            الباقة: <span className="font-semibold">{sub.plan.name}</span> · الدورة:{' '}
            {sub.billingCycle === 'annual' ? 'سنوي' : sub.billingCycle === 'monthly' ? 'شهري' : sub.billingCycle}
          </p>
        </div>
        <StatusBadge status={sub.status} />
      </header>

      {/* Summary cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card label="بدأ في" value={sub.startedAt ? formatDate(sub.startedAt) : '—'} />
        <Card label="ينتهي في" value={formatDate(sub.currentPeriodEndAt ?? sub.trialEndsAt)} />
        <Card label="السعر (IQD)" value={Number(sub.priceIqd).toLocaleString('en-US')} />
        <Card label="نهاية التجربة" value={sub.trialEndsAt ? formatDate(sub.trialEndsAt) : '—'} />
        <Card label="نهاية فترة السماح" value={sub.gracePeriodEndsAt ? formatDate(sub.gracePeriodEndsAt) : '—'} />
        <Card label="عدد المفاتيح" value={String(sub.licenseKeys.length)} />
      </section>

      {/* Actions */}
      <section className="border border-slate-200 rounded-lg bg-white p-4 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">إجراءات الإدارة</h2>

        {/* Activate / Suspend */}
        <div className="flex flex-wrap items-end gap-2">
          {isSuspended ? (
            <button
              className="btn-primary btn-sm"
              disabled={setStatusMut.isPending}
              onClick={() => setStatusMut.mutate({ status: 'active' })}
            >
              تفعيل الاشتراك
            </button>
          ) : (
            <>
              <input
                type="text"
                placeholder="سبب الإيقاف (اختياري)"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white min-w-[14rem]"
              />
              <button
                className="btn-danger btn-sm"
                disabled={setStatusMut.isPending}
                onClick={() =>
                  setStatusMut.mutate({ status: 'suspended', reason: suspendReason || undefined })
                }
              >
                إيقاف الاشتراك
              </button>
            </>
          )}
          {setStatusMut.error ? (
            <span className="text-xs text-red-600">{(setStatusMut.error as Error).message}</span>
          ) : null}
        </div>

        {/* Plan change */}
        <div className="flex flex-wrap items-end gap-2 pt-3 border-t border-slate-100">
          <label className="text-sm text-slate-700">تغيير الباقة:</label>
          <select
            value={selectedPlanId}
            onChange={(e) => setSelectedPlanId(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white"
          >
            <option value="">— اختر باقة —</option>
            {planOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({Number(p.monthlyPriceIqd).toLocaleString('en-US')} IQD/شهر)
              </option>
            ))}
          </select>
          <button
            className="btn-primary btn-sm"
            disabled={!selectedPlanId || changePlanMut.isPending}
            onClick={() => selectedPlanId && changePlanMut.mutate(selectedPlanId)}
          >
            تطبيق
          </button>
          {changePlanMut.error ? (
            <span className="text-xs text-red-600">{(changePlanMut.error as Error).message}</span>
          ) : null}
        </div>

        {/* Extend trial */}
        <div className="flex flex-wrap items-end gap-2 pt-3 border-t border-slate-100">
          <label className="text-sm text-slate-700">تمديد التجربة (أيام):</label>
          <input
            type="number"
            min={1}
            max={365}
            value={extraDays}
            onChange={(e) => setExtraDays(Number(e.target.value))}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white w-24"
          />
          <button
            className="btn-secondary btn-sm"
            disabled={extendTrialMut.isPending}
            onClick={() => extendTrialMut.mutate(extraDays)}
          >
            تمديد
          </button>
          {extendTrialMut.error ? (
            <span className="text-xs text-red-600">{(extendTrialMut.error as Error).message}</span>
          ) : null}
        </div>
      </section>

      {/* Recent events */}
      <section className="border border-slate-200 rounded-lg bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">سجل أحداث الترخيص</h2>
        {eventsQuery.isLoading ? (
          <p className="text-sm text-slate-500">جارٍ التحميل…</p>
        ) : eventsQuery.data?.items.length === 0 ? (
          <p className="text-sm text-slate-500">لا توجد أحداث حتى الآن.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(eventsQuery.data?.items ?? []).map((ev) => (
              <li key={ev.id} className="py-2 text-sm flex items-center justify-between gap-4">
                <span className="font-medium text-slate-700">{ev.eventType}</span>
                <span className="text-slate-500 text-xs">{formatDate(ev.createdAt, true)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 rounded-lg bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900 mt-1">{value}</div>
    </div>
  );
}
