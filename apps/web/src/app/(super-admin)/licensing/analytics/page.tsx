/**
 * T67 — License Analytics (super-admin).
 *
 * Read-only KPI dashboard covering:
 *   - MRR, ARR, active subs, churn rate (top KPI cards)
 *   - LTV, conversion rate (trial → paid), expansion MRR
 *   - 12-month MRR area chart
 *   - 12-month new vs churned vs expansion stacked bars
 *   - MRR-by-plan donut
 *
 * All data is sourced from /admin/licensing/analytics/{summary,timeseries,breakdown}.
 * Charts use recharts (already in deps).
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '@/lib/api';
import { formatIqd, formatNumber } from '@/lib/format';

interface SummaryDto {
  asOf: string;
  mrrIqd: number;
  arrIqd: number;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  churnRate30d: number;
  ltvIqd: number;
  conversionRate30d: number;
  expansionMrr30dIqd: number;
}

interface TimeseriesPoint {
  month: string;
  mrrIqd: number;
  newMrrIqd: number;
  churnedMrrIqd: number;
  expansionMrrIqd: number;
  churnRate: number;
  activeCount: number;
}

interface BreakdownEntry {
  planId: string;
  planCode: string;
  planName: string;
  count: number;
  mrrIqd: number;
}

const PIE_COLORS = ['#0284c7', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777'];

function KpiCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'positive' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-700'
      : tone === 'warning'
        ? 'text-amber-700'
        : tone === 'danger'
          ? 'text-rose-700'
          : 'text-slate-900';
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
      {hint ? <div className="text-xs text-slate-400 mt-1">{hint}</div> : null}
    </div>
  );
}

export default function LicenseAnalyticsPage() {
  const summaryQ = useQuery({
    queryKey: ['admin-licensing', 'analytics', 'summary'],
    queryFn: () => api<SummaryDto>('/admin/licensing/analytics/summary'),
  });
  const seriesQ = useQuery({
    queryKey: ['admin-licensing', 'analytics', 'timeseries', 12],
    queryFn: () =>
      api<{ months: TimeseriesPoint[] }>(
        '/admin/licensing/analytics/timeseries',
        { method: 'GET', query: { months: 12 } },
      ),
  });
  const breakdownQ = useQuery({
    queryKey: ['admin-licensing', 'analytics', 'breakdown'],
    queryFn: () =>
      api<{ byPlan: BreakdownEntry[] }>(
        '/admin/licensing/analytics/breakdown',
      ),
  });

  const summary = summaryQ.data;
  const series = seriesQ.data?.months ?? [];
  const breakdown = (breakdownQ.data?.byPlan ?? []).filter((p) => p.mrrIqd > 0 || p.count > 0);

  const isLoading = summaryQ.isLoading || seriesQ.isLoading || breakdownQ.isLoading;
  const error = summaryQ.error || seriesQ.error || breakdownQ.error;

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">
          تحليلات التراخيص (License Analytics)
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          MRR / ARR / Churn / LTV — مؤشرات الإيرادات المتكررة عبر كل المستأجرين
        </p>
      </header>

      {error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-md p-4 text-sm text-rose-700">
          تعذّر تحميل البيانات. حاول مجدداً.
        </div>
      ) : null}

      {/* Primary KPIs */}
      <section
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        aria-label="primary-kpis"
      >
        <KpiCard
          label="MRR (الإيراد الشهري المتكرر)"
          value={isLoading ? '…' : formatIqd(summary?.mrrIqd ?? 0)}
          hint={`As of ${summary?.asOf?.slice(0, 10) ?? '—'}`}
          tone="positive"
        />
        <KpiCard
          label="ARR (الإيراد السنوي)"
          value={isLoading ? '…' : formatIqd(summary?.arrIqd ?? 0)}
        />
        <KpiCard
          label="الاشتراكات النشطة (Active)"
          value={isLoading ? '…' : formatNumber(summary?.activeSubscriptions ?? 0)}
          hint={`Trials: ${formatNumber(summary?.trialingSubscriptions ?? 0)}`}
        />
        <KpiCard
          label="معدل الاضمحلال (Churn 30d)"
          value={isLoading ? '…' : `${(summary?.churnRate30d ?? 0).toFixed(2)}%`}
          tone={(summary?.churnRate30d ?? 0) > 5 ? 'danger' : 'default'}
        />
      </section>

      {/* Secondary KPIs */}
      <section
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        aria-label="secondary-kpis"
      >
        <KpiCard
          label="LTV (القيمة الدائمة للعميل)"
          value={isLoading ? '…' : formatIqd(summary?.ltvIqd ?? 0)}
          hint="ARPU ÷ Monthly churn"
        />
        <KpiCard
          label="معدل التحويل (Trial → Paid 30d)"
          value={isLoading ? '…' : `${(summary?.conversionRate30d ?? 0).toFixed(2)}%`}
        />
        <KpiCard
          label="إيرادات التوسّع (Expansion MRR 30d)"
          value={isLoading ? '…' : formatIqd(summary?.expansionMrr30dIqd ?? 0)}
          hint="Upgrades by existing customers"
          tone="positive"
        />
      </section>

      {/* MRR over time */}
      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          MRR على مدى 12 شهر (MRR over last 12 months)
        </h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <defs>
                <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0284c7" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#0284c7" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => formatNumber(v)} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(v: number) => formatIqd(v)}
                labelFormatter={(l) => `شهر ${l}`}
              />
              <Area
                type="monotone"
                dataKey="mrrIqd"
                name="MRR"
                stroke="#0284c7"
                strokeWidth={2}
                fill="url(#mrrFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* New / Churned / Expansion MRR */}
      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          نمو الإيرادات (New / Churned / Expansion MRR)
        </h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => formatNumber(v)} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => formatIqd(v)} />
              <Legend />
              <Bar dataKey="newMrrIqd" name="جديد (New)" stackId="a" fill="#16a34a" />
              <Bar dataKey="expansionMrrIqd" name="توسّع (Expansion)" stackId="a" fill="#0284c7" />
              <Bar dataKey="churnedMrrIqd" name="مفقود (Churned)" stackId="b" fill="#dc2626" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* By plan */}
      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          MRR حسب الباقة (MRR by Plan)
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64">
            {breakdown.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                لا توجد بيانات
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={breakdown}
                    dataKey="mrrIqd"
                    nameKey="planName"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    label={(entry) => entry.name}
                  >
                    {breakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatIqd(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div>
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-xs">
                <tr>
                  <th className="text-start py-2">الباقة (Plan)</th>
                  <th className="text-end py-2">عدد الاشتراكات</th>
                  <th className="text-end py-2">MRR</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((row) => (
                  <tr key={row.planId} className="border-t border-slate-100">
                    <td className="py-2">{row.planName}</td>
                    <td className="py-2 text-end">{formatNumber(row.count)}</td>
                    <td className="py-2 text-end">{formatIqd(row.mrrIqd)}</td>
                  </tr>
                ))}
                {breakdown.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-slate-400">
                      —
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
