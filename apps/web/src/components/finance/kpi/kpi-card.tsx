'use client';

import Link from 'next/link';
import { ReactNode } from 'react';

/**
 * Generic KPI card used by the Financial KPIs Dashboard (T50).
 * - `value` is the display string (already formatted by the caller).
 * - `drillDown` is an optional internal href; when present, the whole card
 *   becomes a link to the underlying source report.
 * - `tone` lets caller hint at sentiment without committing to thresholds.
 */
export function KpiCard({
  title,
  value,
  hint,
  drillDown,
  tone = 'neutral',
  children,
}: {
  title: string;
  value: string;
  hint?: string;
  drillDown?: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'warning';
  children?: ReactNode;
}) {
  const toneClass = {
    neutral: 'bg-white',
    positive: 'bg-emerald-50',
    negative: 'bg-rose-50',
    warning: 'bg-amber-50',
  }[tone];

  const body = (
    <div className={`rounded-lg p-4 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md ${toneClass}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-600">{title}</h3>
        {drillDown && <span className="text-xs text-sky-600">عرض التفاصيل ←</span>}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );

  return drillDown ? (
    <Link href={drillDown} className="block focus:outline-none focus:ring-2 focus:ring-sky-500 rounded-lg" data-testid="kpi-card-link">
      {body}
    </Link>
  ) : (
    body
  );
}
