'use client';

import { formatStatus } from '@/lib/format';

const TONE: Record<string, string> = {
  draft:         'bg-slate-100 text-slate-700 border-slate-200',
  approved:      'bg-emerald-100 text-emerald-800 border-emerald-200',
  posted:        'bg-sky-100 text-sky-800 border-sky-200',
  cancelled:     'bg-red-100 text-red-800 border-red-200',
  paid:          'bg-emerald-100 text-emerald-800 border-emerald-200',
  partial:       'bg-amber-100 text-amber-800 border-amber-200',
  unpaid:        'bg-red-100 text-red-800 border-red-200',
  open:          'bg-sky-100 text-sky-800 border-sky-200',
  closed:        'bg-slate-200 text-slate-700 border-slate-300',
  confirmed:     'bg-sky-100 text-sky-800 border-sky-200',
  pending:       'bg-amber-100 text-amber-800 border-amber-200',
  rejected:      'bg-red-100 text-red-800 border-red-200',
  matched:       'bg-emerald-100 text-emerald-800 border-emerald-200',
  unmatched:     'bg-red-100 text-red-800 border-red-200',
  partial_match: 'bg-amber-100 text-amber-800 border-amber-200',
  active:        'bg-emerald-100 text-emerald-800 border-emerald-200',
  inactive:      'bg-slate-100 text-slate-600 border-slate-200',
  new:           'bg-indigo-100 text-indigo-800 border-indigo-200',
  qualified:     'bg-sky-100 text-sky-800 border-sky-200',
  won:           'bg-emerald-100 text-emerald-800 border-emerald-200',
  lost:          'bg-red-100 text-red-800 border-red-200',
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const key = (status || '').toLowerCase();
  const className = TONE[key] || 'bg-slate-100 text-slate-700 border-slate-200';
  return (
    <span className={['inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', className].join(' ')}>
      {formatStatus(status)}
    </span>
  );
}
