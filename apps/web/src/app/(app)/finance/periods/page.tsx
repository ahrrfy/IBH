'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Calendar, Lock, Unlock, ArrowRight } from 'lucide-react';

const MONTH_NAMES_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

type Period = {
  id: string;
  year: number;
  month: number;
  status: 'open' | 'soft_closed' | 'hard_closed';
  closedAt?: string | null;
};

export default function PeriodsListPage() {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());

  const { data, isLoading, error } = useQuery({
    queryKey: ['periods', year],
    queryFn: () => api<Period[]>(`/finance/periods?year=${year}`),
  });

  const periodsByMonth = new Map<number, Period>();
  (data ?? []).forEach((p) => periodsByMonth.set(p.month, p));

  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="h-6 w-6 text-sky-700" />
            الفترات المحاسبية
          </h1>
          <p className="text-sm text-slate-500 mt-1">إدارة الإقفال الشهري والسنوي</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="btn-ghost btn-sm num-latin"
          >
            ← {year - 1}
          </button>
          <span className="font-mono num-latin text-lg font-bold text-slate-900 px-3">
            {year}
          </span>
          <button
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= now.getFullYear() + 1}
            className="btn-ghost btn-sm num-latin disabled:opacity-40"
          >
            {year + 1} →
          </button>
        </div>
      </header>

      {isLoading && <div className="text-sm text-slate-500">جاري التحميل…</div>}
      {error && <div className="text-sm text-rose-600">تعذَّر تحميل الفترات</div>}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {months.map((month) => {
          const period = periodsByMonth.get(month);
          const status = period?.status ?? 'open';
          return (
            <PeriodCard
              key={month}
              year={year}
              month={month}
              period={period}
              status={status}
            />
          );
        })}
      </div>
    </div>
  );
}

function PeriodCard({
  year,
  month,
  period,
  status,
}: {
  year: number;
  month: number;
  period?: Period;
  status: 'open' | 'soft_closed' | 'hard_closed';
}) {
  const styles = {
    open:        { bg: 'bg-white',    border: 'border-slate-200', label: 'مفتوحة',    icon: Unlock, badge: 'text-emerald-700 bg-emerald-50' },
    soft_closed: { bg: 'bg-amber-50', border: 'border-amber-200', label: 'إقفال مبدئي', icon: Lock,   badge: 'text-amber-700 bg-amber-100' },
    hard_closed: { bg: 'bg-slate-100',border: 'border-slate-300', label: 'مغلقة نهائياً', icon: Lock, badge: 'text-slate-700 bg-slate-200' },
  } as const;
  const s = styles[status];
  const Icon = s.icon;

  const href = period
    ? `/finance/periods/${period.id}/close`
    : `/finance/periods/new?year=${year}&month=${month}`;

  return (
    <Link
      href={href}
      className={[
        'block rounded-lg border p-4 transition hover:shadow-sm hover:border-sky-300',
        s.bg,
        s.border,
      ].join(' ')}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-sm font-medium text-slate-900">{MONTH_NAMES_AR[month - 1]}</div>
          <div className="font-mono num-latin text-xs text-slate-400">
            {String(month).padStart(2, '0')}/{year}
          </div>
        </div>
        <span className={['inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium', s.badge].join(' ')}>
          <Icon className="h-2.5 w-2.5" />
          {s.label}
        </span>
      </div>
      <div className="text-xs text-sky-700 flex items-center gap-1 mt-3">
        {period ? 'فتح المعالج' : 'بدء الإقفال'}
        <ArrowRight className="h-3 w-3" />
      </div>
    </Link>
  );
}
