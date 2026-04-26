'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { ReasonModal } from '@/components/reason-modal';
import { formatIqd } from '@/lib/format';
import { CheckCircle2, FileSearch, Send, Banknote, RotateCcw, Download } from 'lucide-react';

interface PayslipLine {
  id: string;
  employeeId: string;
  employee?: { fullNameAr?: string; employeeNumber?: string };
  baseSalaryIqd: number;
  housingIqd: number;
  transportIqd: number;
  otherAllowIqd: number;
  overtimeIqd: number;
  bonusIqd: number;
  commissionIqd: number;
  grossIqd: number;
  absenceDeductIqd: number;
  lateDeductIqd: number;
  advanceDeductIqd: number;
  incomeTaxIqd: number;
  socialSecurityIqd: number;
  otherDeductIqd: number;
  totalDeductIqd: number;
  netIqd: number;
  daysWorked: number;
  hoursOvertime: number;
}

interface PayrollRun {
  id: string;
  number: string;
  periodYear: number;
  periodMonth: number;
  status: string;
  totalGrossIqd: number;
  totalNetIqd: number;
  totalTaxIqd: number;
  totalSsIqd: number;
  totalDeductionsIqd: number;
}

const MONTH_LABELS_AR = [
  'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
  'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول',
];

export default function PayrollPayslipsPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const runQuery = useQuery({
    queryKey: ['payroll-run', id],
    queryFn: () => api<PayrollRun>(`/hr/payroll/runs/${id}`),
    enabled: !!id,
  });

  const linesQuery = useQuery({
    queryKey: ['payroll-run-lines', id],
    queryFn: () => api<PayslipLine[]>(`/hr/payroll/runs/${id}/lines`),
    enabled: !!id,
  });

  const [showReverse, setShowReverse] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const onActionSuccess = () => {
    qc.invalidateQueries({ queryKey: ['payroll-run', id] });
    qc.invalidateQueries({ queryKey: ['payroll-run-lines', id] });
    qc.invalidateQueries({ queryKey: ['payroll-runs'] });
  };
  const onActionError = (e: any) =>
    setActionError(e?.messageAr ?? 'فشل تنفيذ الإجراء');

  const review = useMutation({
    mutationFn: () => api(`/hr/payroll/runs/${id}/review`, { method: 'POST' }),
    onSuccess: onActionSuccess,
    onError: onActionError,
  });
  const approve = useMutation({
    mutationFn: () => api(`/hr/payroll/runs/${id}/approve`, { method: 'POST' }),
    onSuccess: onActionSuccess,
    onError: onActionError,
  });
  const post = useMutation({
    mutationFn: () => api(`/hr/payroll/runs/${id}/post`, { method: 'POST' }),
    onSuccess: onActionSuccess,
    onError: onActionError,
  });
  const markPaid = useMutation({
    mutationFn: () =>
      api(`/hr/payroll/runs/${id}/mark-paid`, {
        method: 'POST',
        body: { paymentDate: new Date().toISOString() },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-run', id] });
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
    },
    onError: (e: any) => setActionError(e?.messageAr ?? 'فشل تأكيد الدفع'),
  });

  const reverse = useMutation({
    mutationFn: (reason: string) =>
      api(`/hr/payroll/runs/${id}/reverse`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-run', id] });
      qc.invalidateQueries({ queryKey: ['payroll-run-lines', id] });
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      setShowReverse(false);
    },
    onError: (e: any) => setActionError(e?.messageAr ?? 'فشل عكس الدورة'),
  });

  async function exportCbs() {
    setActionError(null);
    try {
      const file = await api<{ filename: string; content: string }>(
        `/hr/payroll/runs/${id}/export-cbs`,
      );
      const blob = new Blob([file.content], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setActionError(e?.messageAr ?? 'فشل تصدير ملف CBS');
    }
  }

  if (runQuery.isLoading || linesQuery.isLoading) {
    return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  }
  if (runQuery.error || !runQuery.data) {
    return <div className="p-6 text-rose-600">تعذَّر تحميل دورة الرواتب</div>;
  }

  const run = runQuery.data;
  const lines = linesQuery.data ?? [];
  const status = run.status;

  // Action button gating per backend status flow:
  // calculated → review → approved → posted → paid
  // reverse: any status except 'paid' (backend will validate).
  const canReview   = status === 'calculated';
  const canApprove  = status === 'reviewed';
  const canPost     = status === 'approved';
  const canMarkPaid = status === 'posted';
  const canReverse  = status !== 'paid' && status !== 'draft';
  const canExportCbs = status === 'posted' || status === 'paid';

  const anyPending =
    review.isPending || approve.isPending || post.isPending ||
    markPaid.isPending || reverse.isPending;

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/hr/payroll" className="text-sm text-sky-700 hover:underline">← مسيرات الرواتب</Link>
          <h1 className="mt-2 text-3xl font-bold">
            كشوف رواتب {MONTH_LABELS_AR[run.periodMonth - 1]} {run.periodYear}
          </h1>
          <p className="text-sm text-slate-500">
            <span className="num-latin">{run.number}</span> · {lines.length} موظف
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={status} />
          <div className="text-2xl font-bold">{formatIqd(run.totalNetIqd)}</div>
          <div className="text-xs text-slate-500">صافي الإجمالي</div>
        </div>
      </header>

      {/* Action toolbar */}
      <div className="flex flex-wrap gap-2 rounded-lg bg-white p-3 shadow-sm">
        {canReview && (
          <button
            type="button"
            onClick={() => { setActionError(null); review.mutate(); }}
            disabled={anyPending}
            className="btn-ghost gap-1.5 text-sky-700 hover:bg-sky-50 disabled:opacity-50"
          >
            <FileSearch className="h-4 w-4" />
            مراجعة
          </button>
        )}
        {canApprove && (
          <button
            type="button"
            onClick={() => { setActionError(null); approve.mutate(); }}
            disabled={anyPending}
            className="btn-ghost gap-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            اعتماد
          </button>
        )}
        {canPost && (
          <button
            type="button"
            onClick={() => { setActionError(null); post.mutate(); }}
            disabled={anyPending}
            className="btn-ghost gap-1.5 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            ترحيل لقيد محاسبي
          </button>
        )}
        {canMarkPaid && (
          <button
            type="button"
            onClick={() => { setActionError(null); markPaid.mutate(); }}
            disabled={anyPending}
            className="btn-ghost gap-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            <Banknote className="h-4 w-4" />
            تأكيد الدفع
          </button>
        )}
        {canExportCbs && (
          <button
            type="button"
            onClick={exportCbs}
            disabled={anyPending}
            className="btn-ghost gap-1.5 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            تصدير ملف بنكي (CBS)
          </button>
        )}
        <div className="flex-1" />
        {canReverse && (
          <button
            type="button"
            onClick={() => { setActionError(null); setShowReverse(true); }}
            disabled={anyPending}
            className="btn-ghost gap-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            عكس الدورة
          </button>
        )}
      </div>

      {actionError && <div className="rounded bg-rose-50 p-3 text-sm text-rose-700">{actionError}</div>}

      {/* Totals summary */}
      <section className="grid gap-3 rounded-lg bg-white p-4 shadow-sm md:grid-cols-4">
        <div>
          <div className="text-xs text-slate-500">إجمالي قبل الخصومات</div>
          <div className="mt-1 text-lg font-semibold">{formatIqd(run.totalGrossIqd)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">ضريبة الدخل</div>
          <div className="mt-1 text-lg font-semibold">{formatIqd(run.totalTaxIqd)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">الضمان الاجتماعي</div>
          <div className="mt-1 text-lg font-semibold">{formatIqd(run.totalSsIqd)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">صافي المستحَق</div>
          <div className="mt-1 text-lg font-bold text-sky-700">{formatIqd(run.totalNetIqd)}</div>
        </div>
      </section>

      {/* Payslips table */}
      <section className="rounded-lg bg-white p-4 shadow-sm overflow-x-auto">
        <h2 className="mb-3 text-lg font-semibold">كشوف الرواتب</h2>
        <table className="w-full text-sm min-w-[800px]">
          <thead className="text-slate-500">
            <tr className="border-b">
              <th className="text-start py-2">الموظف</th>
              <th className="text-end">الأساسي</th>
              <th className="text-end">البدلات</th>
              <th className="text-end">الإجمالي</th>
              <th className="text-end">الخصومات</th>
              <th className="text-end">الضريبة</th>
              <th className="text-end">الضمان</th>
              <th className="text-end font-semibold">الصافي</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-slate-400">لا توجد كشوف</td>
              </tr>
            )}
            {lines.map((l) => {
              const allowances =
                Number(l.housingIqd ?? 0) +
                Number(l.transportIqd ?? 0) +
                Number(l.otherAllowIqd ?? 0) +
                Number(l.overtimeIqd ?? 0) +
                Number(l.bonusIqd ?? 0) +
                Number(l.commissionIqd ?? 0);
              const otherDeducts =
                Number(l.absenceDeductIqd ?? 0) +
                Number(l.lateDeductIqd ?? 0) +
                Number(l.advanceDeductIqd ?? 0) +
                Number(l.otherDeductIqd ?? 0);
              return (
                <tr key={l.id} className="border-t">
                  <td className="py-2">
                    <div className="font-medium">{l.employee?.fullNameAr ?? l.employeeId}</div>
                    {l.employee?.employeeNumber && (
                      <div className="text-xs text-slate-400 num-latin">{l.employee.employeeNumber}</div>
                    )}
                  </td>
                  <td className="text-end">{formatIqd(l.baseSalaryIqd)}</td>
                  <td className="text-end">{formatIqd(allowances)}</td>
                  <td className="text-end">{formatIqd(l.grossIqd)}</td>
                  <td className="text-end text-rose-600">{formatIqd(otherDeducts)}</td>
                  <td className="text-end text-rose-600">{formatIqd(l.incomeTaxIqd)}</td>
                  <td className="text-end text-rose-600">{formatIqd(l.socialSecurityIqd)}</td>
                  <td className="text-end font-semibold">{formatIqd(l.netIqd)}</td>
                </tr>
              );
            })}
          </tbody>
          {lines.length > 0 && (
            <tfoot className="border-t-2 font-semibold">
              <tr>
                <td className="py-2">المجموع</td>
                <td colSpan={2}></td>
                <td className="text-end">{formatIqd(run.totalGrossIqd)}</td>
                <td colSpan={1}></td>
                <td className="text-end">{formatIqd(run.totalTaxIqd)}</td>
                <td className="text-end">{formatIqd(run.totalSsIqd)}</td>
                <td className="text-end text-sky-700">{formatIqd(run.totalNetIqd)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      <ReasonModal
        open={showReverse}
        title="عكس دورة الرواتب"
        description="سيُلغى أثر هذه الدورة (والقيد المحاسبي إن وُجد) وتعود لمسودة. السبب يُسجَّل في سجل التدقيق."
        confirmLabel="عكس الدورة"
        minLength={5}
        pending={reverse.isPending}
        error={actionError}
        onConfirm={(reason) => { setActionError(null); reverse.mutate(reason); }}
        onCancel={() => { if (!reverse.isPending) setShowReverse(false); }}
      />
    </div>
  );
}
