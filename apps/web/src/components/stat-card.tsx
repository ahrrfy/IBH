'use client';

import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  trend?: 'up' | 'down' | 'flat';
  delta?: string;
  loading?: boolean;
  tone?: 'primary' | 'accent' | 'success' | 'danger' | 'neutral';
}

const TONE: Record<NonNullable<StatCardProps['tone']>, string> = {
  primary: 'bg-sky-50 text-sky-700',
  accent:  'bg-amber-50 text-amber-700',
  success: 'bg-emerald-50 text-emerald-700',
  danger:  'bg-red-50 text-red-700',
  neutral: 'bg-slate-100 text-slate-700',
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  delta,
  loading,
  tone = 'primary',
}: StatCardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 h-4 w-24 animate-pulse rounded bg-slate-100" />
        <div className="h-8 w-32 animate-pulse rounded bg-slate-100" />
        <div className="mt-3 h-3 w-20 animate-pulse rounded bg-slate-100" />
      </div>
    );
  }

  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;
  const trendClass =
    trend === 'up' ? 'text-emerald-600 bg-emerald-50' : trend === 'down' ? 'text-red-600 bg-red-50' : 'text-slate-500 bg-slate-100';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
        </div>
        {Icon && (
          <div className={['flex h-10 w-10 items-center justify-center rounded-lg', TONE[tone]].join(' ')}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      {(delta || hint) && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          {delta && (
            <span className={['inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium', trendClass].join(' ')}>
              <TrendIcon className="h-3 w-3" />
              {delta}
            </span>
          )}
          {hint && <span className="text-slate-500">{hint}</span>}
        </div>
      )}
    </div>
  );
}
