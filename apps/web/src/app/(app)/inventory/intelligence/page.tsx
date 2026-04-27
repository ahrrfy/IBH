'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useLiveResource } from '@/lib/realtime/use-live-resource';
import { DataTable } from '@/components/data-table';

// ─── T42 — Smart Inventory Engine Dashboard ─────────────────────────────────
// Manager-facing exception dashboard. Shows the live tally per Q-rule, the
// open flags table, and a one-click "scan + auto-reorder" action.
//
// All data is auto-refreshed via useLiveResource on the inventory.intelligence
// realtime channel — no manual refresh needed when the cron fires.

interface SummaryResponse {
  byRule: Record<string, { critical: number; warning: number; info: number }>;
}

interface CatalogueItem {
  code: string;
  titleAr: string;
  titleEn: string;
  category: string;
}

interface InventoryFlag {
  id: string;
  ruleCode: string;
  severity: 'info' | 'warning' | 'critical';
  messageAr: string;
  metric: string | null;
  threshold: string | null;
  variantId: string;
  warehouseId: string;
  detectedAt: string;
  resolvedAt: string | null;
}

interface FlagsResponse {
  items: InventoryFlag[];
  total: number;
  page: number;
  limit: number;
}

interface ScanResult {
  scannedSkus: number;
  flagsCreated: number;
  flagsUpdated: number;
  flagsResolved: number;
  durationMs: number;
}

interface AutoReorderResult {
  runId: string;
  draftPosCreated: number;
  flagsCreated: number;
  flagsResolved: number;
  scannedSkus: number;
}

const SEVERITY_COLOR: Record<InventoryFlag['severity'], string> = {
  critical: 'bg-rose-100 text-rose-900 border-rose-300',
  warning:  'bg-amber-100 text-amber-900 border-amber-300',
  info:     'bg-sky-100 text-sky-900 border-sky-300',
};

export default function InventoryIntelligencePage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<{ ruleCode?: string; severity?: 'info' | 'warning' | 'critical' }>({});

  useLiveResource(
    ['inventory-intel-summary'],
    ['inventory.intelligence.scan', 'inventory.intelligence.autoreorder', 'inventory.changed'],
  );
  useLiveResource(
    ['inventory-intel-flags'],
    ['inventory.intelligence.scan', 'inventory.intelligence.autoreorder'],
  );

  const catalogue = useQuery<{ items: CatalogueItem[] }>({
    queryKey: ['inventory-intel-catalogue'],
    queryFn: () => api<{ items: CatalogueItem[] }>('/inventory/intelligence/catalogue'),
    staleTime: 5 * 60 * 1000,
  });

  const summary = useQuery<SummaryResponse>({
    queryKey: ['inventory-intel-summary'],
    queryFn: () => api<SummaryResponse>('/inventory/intelligence/summary'),
  });

  const flagsQuery = useQuery<FlagsResponse>({
    queryKey: ['inventory-intel-flags', filter],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (filter.ruleCode) qs.set('ruleCode', filter.ruleCode);
      if (filter.severity) qs.set('severity', filter.severity);
      qs.set('limit', '100');
      return api<FlagsResponse>(`/inventory/intelligence/flags?${qs.toString()}`);
    },
  });

  const scan = useMutation<ScanResult>({
    mutationFn: () => api<ScanResult>('/inventory/intelligence/scan', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-intel-summary'] });
      qc.invalidateQueries({ queryKey: ['inventory-intel-flags'] });
    },
  });

  const autoReorder = useMutation<AutoReorderResult>({
    mutationFn: () => api<AutoReorderResult>('/procurement/auto-reorder/run', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-intel-summary'] });
      qc.invalidateQueries({ queryKey: ['inventory-intel-flags'] });
    },
  });

  const resolve = useMutation<unknown, Error, string>({
    mutationFn: (flagId: string) =>
      api(`/inventory/intelligence/flags/${flagId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'manual override' }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-intel-summary'] });
      qc.invalidateQueries({ queryKey: ['inventory-intel-flags'] });
    },
  });

  const totalCritical = Object.values(summary.data?.byRule ?? {}).reduce((s, r) => s + (r?.critical ?? 0), 0);
  const totalWarning = Object.values(summary.data?.byRule ?? {}).reduce((s, r) => s + (r?.warning ?? 0), 0);
  const totalInfo = Object.values(summary.data?.byRule ?? {}).reduce((s, r) => s + (r?.info ?? 0), 0);

  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">المخزون الذكي — لوحة الاستثناءات</h1>
          <p className="text-sm text-slate-600 mt-1">
            النظام يفحص كل الأصناف ضد 12 قاعدة جودة (Q01–Q12). أنت ترى الاستثناءات فقط.
          </p>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <button
            type="button"
            onClick={() => scan.mutate()}
            disabled={scan.isPending}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg disabled:opacity-50"
          >
            {scan.isPending ? 'جارٍ الفحص…' : 'فحص الآن'}
          </button>
          <button
            type="button"
            onClick={() => autoReorder.mutate()}
            disabled={autoReorder.isPending}
            className="px-4 py-2 bg-emerald-700 text-white rounded-lg disabled:opacity-50"
          >
            {autoReorder.isPending ? 'جارٍ الإنشاء…' : 'فحص + إنشاء طلبات شراء تلقائياً'}
          </button>
          {autoReorder.data && (
            <p className="text-xs text-emerald-800">
              تم إنشاء {autoReorder.data.draftPosCreated} طلب شراء (Draft).
            </p>
          )}
        </div>
      </header>

      {/* KPIs ──────────────────────────────────────────────── */}
      <section className="grid grid-cols-3 gap-4">
        <Kpi label="حرج" value={totalCritical} tone="critical" />
        <Kpi label="تحذير" value={totalWarning} tone="warning" />
        <Kpi label="معلوماتي" value={totalInfo} tone="info" />
      </section>

      {/* Rule legend / filter buttons ─────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">قواعد الجودة</h2>
          {(filter.ruleCode || filter.severity) && (
            <button
              type="button"
              onClick={() => setFilter({})}
              className="text-xs text-slate-500 underline"
            >
              مسح الفلاتر
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {(catalogue.data?.items ?? []).map((c) => {
            const counts = summary.data?.byRule?.[c.code] ?? { critical: 0, warning: 0, info: 0 };
            const total = counts.critical + counts.warning + counts.info;
            const isActive = filter.ruleCode === c.code;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() =>
                  setFilter((f) => (f.ruleCode === c.code ? { ...f, ruleCode: undefined } : { ...f, ruleCode: c.code }))
                }
                className={`text-right p-3 rounded-lg border transition ${
                  isActive ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-slate-500">{c.code}</span>
                  <span className={`text-sm font-bold ${total > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                    {total}
                  </span>
                </div>
                <div className="text-sm font-semibold mt-1">{c.titleAr}</div>
                {(counts.critical > 0 || counts.warning > 0) && (
                  <div className="flex gap-1 mt-2 text-[10px]">
                    {counts.critical > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-900">
                        {counts.critical} حرج
                      </span>
                    )}
                    {counts.warning > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                        {counts.warning} تحذير
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Flags table ───────────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="text-lg font-semibold mb-3">
          الاستثناءات المفتوحة {flagsQuery.data ? `(${flagsQuery.data.total})` : ''}
        </h2>
        <DataTable
          columns={[
            {
              key: 'rule',
              header: 'القاعدة',
              accessor: (r: InventoryFlag) => (
                <span className="font-mono text-xs">{r.ruleCode}</span>
              ),
            },
            {
              key: 'severity',
              header: 'الخطورة',
              accessor: (r: InventoryFlag) => (
                <span className={`px-2 py-0.5 text-xs rounded border ${SEVERITY_COLOR[r.severity]}`}>
                  {r.severity === 'critical' ? 'حرج' : r.severity === 'warning' ? 'تحذير' : 'معلوماتي'}
                </span>
              ),
              align: 'center',
            },
            { key: 'msg', header: 'الرسالة', accessor: (r: InventoryFlag) => r.messageAr },
            {
              key: 'metric',
              header: 'القياس',
              accessor: (r: InventoryFlag) =>
                r.metric != null ? Number(r.metric).toLocaleString('ar-IQ', { maximumFractionDigits: 1 }) : '—',
              align: 'end',
            },
            {
              key: 'threshold',
              header: 'الحد',
              accessor: (r: InventoryFlag) =>
                r.threshold != null ? Number(r.threshold).toLocaleString('ar-IQ', { maximumFractionDigits: 1 }) : '—',
              align: 'end',
            },
            {
              key: 'detected',
              header: 'وقت الاكتشاف',
              accessor: (r: InventoryFlag) => new Date(r.detectedAt).toLocaleString('ar-IQ'),
            },
            {
              key: 'actions',
              header: '',
              accessor: (r: InventoryFlag) => (
                <button
                  type="button"
                  onClick={() => resolve.mutate(r.id)}
                  disabled={resolve.isPending}
                  className="text-xs text-slate-700 underline disabled:opacity-50"
                >
                  حلّ يدوياً
                </button>
              ),
              align: 'center',
            },
          ]}
          rows={flagsQuery.data?.items ?? []}
          loading={flagsQuery.isLoading}
          error={flagsQuery.error ? 'تعذّر التحميل' : null}
          onRetry={() => flagsQuery.refetch()}
          getRowKey={(r: InventoryFlag) => r.id}
          exportFilename="inventory-flags"
        />
      </section>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: 'critical' | 'warning' | 'info' }) {
  const palette = {
    critical: 'bg-rose-50 border-rose-200 text-rose-900',
    warning:  'bg-amber-50 border-amber-200 text-amber-900',
    info:     'bg-sky-50 border-sky-200 text-sky-900',
  }[tone];
  return (
    <div className={`rounded-xl border p-4 ${palette}`}>
      <div className="text-sm">{label}</div>
      <div className="text-3xl font-bold mt-1">{value.toLocaleString('ar-IQ')}</div>
    </div>
  );
}
