'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ─── T71 — Autopilot Manager Dashboard ──────────────────────────────────────
// Manager-facing control panel for the Autonomous Operations Engine.
// Renders only what needs human attention:
//   - 4 KPI cards (jobs ran today, items handled, exceptions pending,
//     resolved-ratio).
//   - Tabbed list: pending exceptions (default) | recent runs | jobs catalogue.
//   - Per-exception card with resolve / dismiss actions.
// All other autopilot activity stays silent — the goal is 90% auto.

type TabKey = 'exceptions' | 'runs' | 'catalogue';

interface DashboardResponse {
  runsToday: number;
  itemsHandledToday: number;
  exceptionsPending: number;
  exceptionsResolvedRatio: number;
  jobsRegistered: number;
}

interface AutopilotException {
  id: string;
  jobId: string;
  domain: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  suggestedAction: string | null;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: string;
  payload: Record<string, unknown>;
}

interface ExceptionsResponse {
  items: AutopilotException[];
  total: number;
  page: number;
  limit: number;
}

interface RunRow {
  id: string;
  jobId: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'completed' | 'exception_raised' | 'no_op' | 'failed';
  itemsProcessed: number;
  exceptionsRaised: number;
  errorMessage: string | null;
}

interface CatalogueItem {
  id: string;
  domain: string;
  schedule: string;
  titleAr: string;
  titleEn: string;
  description?: string;
}

const SEVERITY_BADGE: Record<AutopilotException['severity'], string> = {
  critical: 'bg-rose-100 text-rose-900 border-rose-300',
  high:     'bg-orange-100 text-orange-900 border-orange-300',
  medium:   'bg-amber-100 text-amber-900 border-amber-300',
  low:      'bg-sky-100 text-sky-900 border-sky-300',
};

const STATUS_BADGE: Record<RunRow['status'], string> = {
  completed:        'bg-emerald-100 text-emerald-900',
  exception_raised: 'bg-amber-100 text-amber-900',
  no_op:            'bg-slate-100 text-slate-700',
  failed:           'bg-rose-100 text-rose-900',
};

export default function AutopilotPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>('exceptions');

  const dashboard = useQuery<DashboardResponse>({
    queryKey: ['autopilot-dashboard'],
    queryFn: () => api<DashboardResponse>('/autopilot/dashboard'),
    staleTime: 30 * 1000,
  });

  const exceptions = useQuery<ExceptionsResponse>({
    queryKey: ['autopilot-exceptions', 'pending'],
    queryFn: () =>
      api<ExceptionsResponse>('/autopilot/exceptions?status=pending&limit=100'),
    enabled: tab === 'exceptions',
  });

  const runs = useQuery<{ items: RunRow[] }>({
    queryKey: ['autopilot-runs'],
    queryFn: () => api<{ items: RunRow[] }>('/autopilot/runs?limit=100'),
    enabled: tab === 'runs',
  });

  const catalogue = useQuery<{ items: CatalogueItem[]; total: number }>({
    queryKey: ['autopilot-catalogue'],
    queryFn: () =>
      api<{ items: CatalogueItem[]; total: number }>('/autopilot/catalogue'),
    enabled: tab === 'catalogue',
    staleTime: 5 * 60 * 1000,
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) =>
      api<{ id: string }>(`/autopilot/exceptions/${id}/resolve`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['autopilot-exceptions'] });
      qc.invalidateQueries({ queryKey: ['autopilot-dashboard'] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api<{ id: string }>(`/autopilot/exceptions/${id}/dismiss`, {
        method: 'POST',
        body: { reason: reason ?? 'manager dismissed' },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['autopilot-exceptions'] });
      qc.invalidateQueries({ queryKey: ['autopilot-dashboard'] });
    },
  });

  const k = dashboard.data;

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">الذكاء الخلفي</h1>
          <p className="text-sm text-slate-600">
            النظام يعمل بصمت — يظهر هنا فقط ما يحتاج تدخل بشري
          </p>
        </div>
      </div>

      {/* ── KPI cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KpiCard
          label="مهام نُفذت اليوم"
          value={k?.runsToday ?? 0}
          loading={dashboard.isLoading}
        />
        <KpiCard
          label="عناصر تمت معالجتها"
          value={k?.itemsHandledToday ?? 0}
          loading={dashboard.isLoading}
        />
        <KpiCard
          label="استثناءات معلقة"
          value={k?.exceptionsPending ?? 0}
          loading={dashboard.isLoading}
          tone={
            (k?.exceptionsPending ?? 0) > 0 ? 'warning' : 'good'
          }
        />
        <KpiCard
          label="نسبة الاستثناءات المعالجة"
          value={`${Math.round((k?.exceptionsResolvedRatio ?? 0) * 100)}%`}
          loading={dashboard.isLoading}
          tone="good"
        />
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="border-b">
        <nav className="-mb-px flex gap-4">
          <TabButton active={tab === 'exceptions'} onClick={() => setTab('exceptions')}>
            استثناءات معلقة {(k?.exceptionsPending ?? 0) > 0 ? `(${k?.exceptionsPending})` : ''}
          </TabButton>
          <TabButton active={tab === 'runs'} onClick={() => setTab('runs')}>
            تنفيذات حديثة
          </TabButton>
          <TabButton active={tab === 'catalogue'} onClick={() => setTab('catalogue')}>
            خارطة المهام ({k?.jobsRegistered ?? 0})
          </TabButton>
        </nav>
      </div>

      {/* ── Tab body ────────────────────────────────────────────────────── */}
      {tab === 'exceptions' && (
        <div className="space-y-3">
          {exceptions.isLoading && <p className="text-sm text-slate-500">جاري التحميل…</p>}
          {exceptions.data?.items.length === 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
              <p className="text-emerald-900">لا توجد استثناءات معلقة — كل شيء يعمل تلقائياً ✅</p>
            </div>
          )}
          {exceptions.data?.items.map((ex) => (
            <article
              key={ex.id}
              className="rounded-lg border bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded border px-2 py-0.5 text-xs ${SEVERITY_BADGE[ex.severity]}`}
                    >
                      {ex.severity}
                    </span>
                    <span className="text-xs text-slate-500">
                      {ex.domain} · {ex.jobId}
                    </span>
                  </div>
                  <h3 className="font-bold">{ex.title}</h3>
                  <p className="text-sm text-slate-700">{ex.description}</p>
                  {ex.suggestedAction && (
                    <p className="text-sm text-sky-700">
                      الإجراء المقترح: {ex.suggestedAction}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    className="rounded bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                    disabled={resolveMutation.isPending}
                    onClick={() => resolveMutation.mutate(ex.id)}
                  >
                    حلّ
                  </button>
                  <button
                    type="button"
                    className="rounded border px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-50"
                    disabled={dismissMutation.isPending}
                    onClick={() => dismissMutation.mutate({ id: ex.id })}
                  >
                    تجاهل
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === 'runs' && (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-right">
              <tr>
                <th className="p-3">المهمة</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">عناصر</th>
                <th className="p-3">استثناءات</th>
                <th className="p-3">بدأت</th>
              </tr>
            </thead>
            <tbody>
              {runs.data?.items.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3 font-mono text-xs">{r.jobId}</td>
                  <td className="p-3">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="p-3">{r.itemsProcessed}</td>
                  <td className="p-3">{r.exceptionsRaised}</td>
                  <td className="p-3 text-xs text-slate-500">
                    {new Date(r.startedAt).toLocaleString('ar-IQ')}
                  </td>
                </tr>
              ))}
              {runs.data?.items.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-slate-500" colSpan={5}>
                    لا توجد تنفيذات حديثة بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'catalogue' && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {catalogue.data?.items.map((it) => (
            <div key={it.id} className="rounded border bg-white p-3">
              <div className="flex items-center justify-between">
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  {it.domain}
                </span>
                <span className="font-mono text-xs text-slate-500">{it.schedule}</span>
              </div>
              <h4 className="mt-2 font-bold">{it.titleAr}</h4>
              <p className="text-xs text-slate-500">{it.id}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  loading,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  loading?: boolean;
  tone?: 'neutral' | 'good' | 'warning';
}) {
  const toneClass =
    tone === 'good'
      ? 'border-emerald-200 bg-emerald-50'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50'
        : 'border-slate-200 bg-white';
  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <p className="text-xs text-slate-600">{label}</p>
      <p className="mt-1 text-3xl font-bold">{loading ? '—' : value}</p>
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-3 py-2 text-sm ${
        active
          ? 'border-sky-600 font-bold text-sky-700'
          : 'border-transparent text-slate-600 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  );
}
