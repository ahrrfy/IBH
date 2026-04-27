'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatIqd } from '@/lib/format';
import { useLiveResource } from '@/lib/realtime/use-live-resource';
import { KpiCard } from '@/components/finance/kpi/kpi-card';

function firstOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

interface KpisResponse {
  period: { from: string; to: string };
  kpis: {
    revenue: { value: number; drillDown: string };
    grossMarginPct: { value: number; drillDown: string };
    netIncome: { value: number; drillDown: string };
    arAging: {
      buckets: { bucket_0_30: number; bucket_31_90: number; bucket_90_plus: number };
      drillDown: string;
    };
    cashPosition: {
      cashInBanks: number;
      cashInHand: number;
      total: number;
      drillDown: string;
    };
    topExpenses: {
      rows: Array<{ accountId: string; accountCode: string; nameAr: string; nameEn: string | null; amountIqd: number }>;
      drillDown: string;
    };
  };
}

export default function FinanceKpisPage() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());

  const { data, isLoading, error } = useQuery({
    queryKey: ['finance-kpis', from, to],
    queryFn: () => api<KpisResponse>(`/finance/kpis/dashboard?from=${from}&to=${to}`),
  });

  // Auto-refresh on posted journal entries OR period closures (T31 realtime).
  useLiveResource(['finance-kpis', from, to], ['journal.posted', 'period.closed']);

  const k = data?.kpis;

  return (
    <div className="space-y-6" data-testid="finance-kpis-page">
      <header>
        <h1 className="text-3xl font-bold">لوحة المؤشرات المالية</h1>
        <p className="mt-1 text-sm text-slate-500">
          مؤشرات حية تتحدّث تلقائياً عند ترحيل القيود أو إقفال الفترة.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <label>
            من:{' '}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded border px-3 py-1"
            />
          </label>
          <label>
            إلى:{' '}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded border px-3 py-1"
            />
          </label>
        </div>
      </header>

      {isLoading && <div className="text-slate-500">جارٍ التحميل…</div>}
      {error && (
        <div className="rounded bg-rose-50 p-3 text-rose-700" data-testid="kpis-error">
          تعذَّر تحميل المؤشرات
        </div>
      )}

      {k && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="kpis-grid">
          <KpiCard
            title="الإيرادات"
            value={formatIqd(k.revenue.value)}
            drillDown={k.revenue.drillDown}
            tone="positive"
            hint="ضمن الفترة المختارة"
          />
          <KpiCard
            title="هامش الربح الإجمالي"
            value={`${(k.grossMarginPct.value * 100).toFixed(1)}%`}
            drillDown={k.grossMarginPct.drillDown}
            tone={k.grossMarginPct.value >= 0 ? 'positive' : 'negative'}
          />
          <KpiCard
            title="صافي الدخل"
            value={formatIqd(k.netIncome.value)}
            drillDown={k.netIncome.drillDown}
            tone={k.netIncome.value >= 0 ? 'positive' : 'negative'}
          />
          <KpiCard
            title="السيولة النقدية"
            value={formatIqd(k.cashPosition.total)}
            drillDown={k.cashPosition.drillDown}
            hint={`بنوك: ${formatIqd(k.cashPosition.cashInBanks)} · صندوق: ${formatIqd(
              k.cashPosition.cashInHand,
            )}`}
          />
          <KpiCard
            title="أعمار الذمم المدينة"
            value={formatIqd(
              k.arAging.buckets.bucket_0_30 +
                k.arAging.buckets.bucket_31_90 +
                k.arAging.buckets.bucket_90_plus,
            )}
            drillDown={k.arAging.drillDown}
            tone={k.arAging.buckets.bucket_90_plus > 0 ? 'warning' : 'neutral'}
          >
            <ul className="space-y-1 text-xs text-slate-600">
              <li className="flex justify-between">
                <span>0-30 يوم</span>
                <span className="tabular-nums">{formatIqd(k.arAging.buckets.bucket_0_30)}</span>
              </li>
              <li className="flex justify-between">
                <span>31-90 يوم</span>
                <span className="tabular-nums">{formatIqd(k.arAging.buckets.bucket_31_90)}</span>
              </li>
              <li className="flex justify-between text-rose-700">
                <span>أكثر من 90 يوم</span>
                <span className="tabular-nums">{formatIqd(k.arAging.buckets.bucket_90_plus)}</span>
              </li>
            </ul>
          </KpiCard>
          <KpiCard
            title="أعلى المصروفات"
            value={
              k.topExpenses.rows.length > 0
                ? formatIqd(k.topExpenses.rows.reduce((s, r) => s + r.amountIqd, 0))
                : '—'
            }
            drillDown={k.topExpenses.drillDown}
            tone="warning"
          >
            <ul className="space-y-1 text-xs text-slate-600">
              {k.topExpenses.rows.map((r) => (
                <li key={r.accountId} className="flex justify-between">
                  <span>
                    <span className="font-mono ltr:mr-1 rtl:ml-1">{r.accountCode}</span>
                    {r.nameAr}
                  </span>
                  <span className="tabular-nums">{formatIqd(r.amountIqd)}</span>
                </li>
              ))}
              {k.topExpenses.rows.length === 0 && (
                <li className="text-slate-400">لا توجد مصروفات في الفترة</li>
              )}
            </ul>
          </KpiCard>
        </div>
      )}
    </div>
  );
}
