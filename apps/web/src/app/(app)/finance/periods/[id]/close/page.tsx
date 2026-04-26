'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar, ArrowRight, AlertTriangle, AlertCircle,
  CheckCircle2, Lock, RotateCcw,
} from 'lucide-react';
import { api } from '@/lib/api';

const MONTH_NAMES_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

type StepStatus = 'done' | 'current' | 'pending';

const STEPS: { num: number; titleAr: string; descAr: string }[] = [
  { num: 1, titleAr: 'ترحيل القيود',   descAr: 'تأكيد ترحيل كل القيود اليومية للفترة (لا مسودات)' },
  { num: 2, titleAr: 'مطابقة البنوك',   descAr: 'تأكيد مطابقة الحسابات البنكية النشطة' },
  { num: 3, titleAr: 'تقييم المخزون',   descAr: 'تأكيد تقييم المخزون في نهاية الفترة' },
  { num: 4, titleAr: 'تسويات نهاية الشهر', descAr: 'إهلاكات + استحقاقات + تسويات' },
  { num: 5, titleAr: 'إقفال مبدئي',     descAr: 'يمكن إعادة فتحها خلال 30 يوماً' },
  { num: 6, titleAr: 'لقطة القوائم المالية', descAr: 'حفظ نسخة من قائمة الدخل والمركز المالي' },
  { num: 7, titleAr: 'إقفال نهائي',     descAr: 'لا يمكن التراجع عنه' },
];

type Status = {
  periodId?: string;
  year: number;
  month: number;
  status: 'open' | 'soft_closed' | 'hard_closed';
  step: number;
  blockers: string[];
  warnings: string[];
};

export default function PeriodCloseWizardPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState('');

  const { data: periodList } = useQuery({
    queryKey: ['periods', 'all'],
    queryFn: () => api<any[]>(`/finance/periods`),
  });
  const period = (periodList ?? []).find((p) => p.id === id);
  const year = period?.year ?? new Date().getFullYear();
  const month = period?.month ?? new Date().getMonth() + 1;

  const statusQ = useQuery<Status>({
    queryKey: ['period-status', year, month],
    queryFn: () => api<Status>(`/finance/periods/status?year=${year}&month=${month}`),
    enabled: Boolean(period),
  });
  const status = statusQ.data;

  const advance = useMutation({
    mutationFn: (step: number) =>
      api<any>(`/finance/periods/close/${id}/step/${step}`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['period-status', year, month] });
      qc.invalidateQueries({ queryKey: ['periods'] });
    },
    onError: (e: any) => setError(e?.messageAr ?? e?.message ?? 'فشل تنفيذ الخطوة'),
  });

  const reopen = useMutation({
    mutationFn: () =>
      api<any>(`/finance/periods/${id}/reopen`, {
        method: 'POST',
        body: { reason: reopenReason },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['period-status', year, month] });
      qc.invalidateQueries({ queryKey: ['periods'] });
      setReopenReason('');
    },
    onError: (e: any) => setError(e?.messageAr ?? e?.message ?? 'فشل إعادة الفتح'),
  });

  if (!period) {
    return <div className="p-6 text-sm text-slate-500">جاري التحميل…</div>;
  }
  if (statusQ.isLoading || !status) {
    return <div className="p-6 text-sm text-slate-500">جاري التحميل…</div>;
  }

  const currentStep = status.step;
  const isHardClosed = status.status === 'hard_closed';
  const isSoftClosed = status.status === 'soft_closed';

  function stepStatus(num: number): StepStatus {
    if (num <= currentStep) return 'done';
    if (num === currentStep + 1) return 'current';
    return 'pending';
  }

  return (
    <div className="p-6 max-w-4xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="h-6 w-6 text-sky-700" />
            إقفال {MONTH_NAMES_AR[month - 1]} <span className="font-mono num-latin">{year}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isHardClosed ? 'مغلقة نهائياً' : isSoftClosed ? 'إقفال مبدئي — يمكن إعادة الفتح' : 'مفتوحة'}
          </p>
        </div>
        <Link href="/finance/periods" className="btn-ghost btn-sm">
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Link>
      </header>

      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {status.blockers.length > 0 && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
            <AlertCircle className="h-4 w-4" />
            معوقات الإقفال
          </div>
          <ul className="text-sm text-rose-600 space-y-1 mr-6 list-disc">
            {status.blockers.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      )}

      {status.warnings.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            تحذيرات
          </div>
          <ul className="text-sm text-amber-700 space-y-1 mr-6 list-disc">
            {status.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {STEPS.map((step) => {
          const ss = stepStatus(step.num);
          const canAdvance = ss === 'current' && !isHardClosed && status.blockers.length === 0;
          const isCriticalStep = step.num === 5 || step.num === 7;
          return (
            <div
              key={step.num}
              className={[
                'flex items-start gap-3 p-4 border-b border-slate-100 last:border-b-0',
                ss === 'done' ? 'bg-emerald-50/40' : '',
                ss === 'current' ? 'bg-sky-50/40' : '',
              ].join(' ')}
            >
              <StepBadge num={step.num} status={ss} />
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-900">{step.titleAr}</div>
                <div className="text-xs text-slate-500 mt-0.5">{step.descAr}</div>
              </div>
              {ss === 'current' && !isHardClosed && (
                <button
                  onClick={() => {
                    setError(null);
                    advance.mutate(step.num);
                  }}
                  disabled={!canAdvance || advance.isPending}
                  className={isCriticalStep ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
                >
                  {advance.isPending ? '…' : isCriticalStep ? 'تنفيذ' : 'تأكيد'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {isSoftClosed && !isHardClosed && (
        <div className="rounded-lg bg-white border border-slate-200 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <RotateCcw className="h-4 w-4 text-amber-600" />
            إعادة فتح الفترة
          </div>
          <p className="text-xs text-slate-500">
            متاحة لمدير النظام خلال 30 يوماً من الإقفال المبدئي. يجب توضيح السبب.
          </p>
          <textarea
            className="input min-h-[60px]"
            placeholder="سبب إعادة الفتح…"
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
          />
          <div className="text-end">
            <button
              onClick={() => {
                setError(null);
                reopen.mutate();
              }}
              disabled={!reopenReason.trim() || reopen.isPending}
              className="btn-ghost btn-sm"
            >
              {reopen.isPending ? 'جاري إعادة الفتح…' : 'إعادة فتح'}
            </button>
          </div>
        </div>
      )}

      {isHardClosed && (
        <div className="rounded-lg bg-slate-100 border border-slate-300 p-4 flex items-center gap-2 text-sm text-slate-700">
          <Lock className="h-4 w-4" />
          الفترة مغلقة نهائياً — لا يمكن إعادتها أو تعديلها
        </div>
      )}
    </div>
  );
}

function StepBadge({ num, status }: { num: number; status: StepStatus }) {
  if (status === 'done') {
    return (
      <div className="h-7 w-7 shrink-0 rounded-full bg-emerald-600 text-white grid place-items-center">
        <CheckCircle2 className="h-4 w-4" />
      </div>
    );
  }
  if (status === 'current') {
    return (
      <div className="h-7 w-7 shrink-0 rounded-full bg-sky-700 text-white grid place-items-center text-xs font-bold num-latin">
        {num}
      </div>
    );
  }
  return (
    <div className="h-7 w-7 shrink-0 rounded-full border-2 border-slate-200 text-slate-400 grid place-items-center text-xs font-bold num-latin">
      {num}
    </div>
  );
}
