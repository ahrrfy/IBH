'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatIqd, formatDate } from '@/lib/format';
import {
  DenominationCounter,
  toDenominationPayload,
  type DenominationCounts,
} from '@/components/pos/cash-count/denomination-counter';

/**
 * POS Blind Cash Count close screen — T37.
 *
 * Flow:
 *   1. Cashier sees opening cash + sales summary, but NOT the expected drawer total.
 *   2. Cashier enters denomination counts (DenominationCounter).
 *   3. Cashier clicks "احسب الفرق" → server returns expected/counted/variance.
 *   4. If variance ≤ tolerance: cashier can confirm close directly.
 *      If variance > tolerance: a manager-approval block becomes required.
 *   5. On final confirm, backend posts a balanced JE via cash_short_over template.
 */

interface PreviewResponse {
  shiftId: string;
  shiftNumber: string;
  toleranceIqd: number;
  expectedCashIqd: string;
  countedCashIqd: string;
  varianceIqd: string;
  isShort: boolean;
  isOver: boolean;
  isExact: boolean;
  exceedsTolerance: boolean;
  requiresManagerApproval: boolean;
}

export default function ShiftCloseBlindPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useParams<{ id: string }>();

  const [counts, setCounts] = useState<DenominationCounts>({});
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [managerUserId, setManagerUserId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: shift, isLoading } = useQuery({
    queryKey: ['shift', id],
    queryFn: () => api<any>(`/pos/shifts/${id}`),
    enabled: !!id,
  });

  const previewMut = useMutation({
    mutationFn: (payload: { denominationCounts: { denom: number; count: number }[] }) =>
      api<PreviewResponse>(`/pos/shifts/${id}/close/preview`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (res) => {
      setPreview(res);
      setError(null);
    },
    onError: (e: any) => setError(e?.messageAr ?? 'تعذَّر حساب الفرق'),
  });

  const closeMut = useMutation({
    mutationFn: (body: any) =>
      api<any>(`/pos/shifts/${id}/close`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift', id] });
      qc.invalidateQueries({ queryKey: ['shifts'] });
      router.push(`/pos/shifts/${id}`);
    },
    onError: (e: any) => setError(e?.messageAr ?? 'تعذَّر إغلاق الوردية'),
  });

  if (isLoading) return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  if (!shift) return <div className="p-6 text-rose-600">الوردية غير موجودة</div>;
  if (shift.status !== 'open') {
    return (
      <div className="p-6">
        <p className="text-amber-700">هذه الوردية ليست مفتوحة — لا يمكن إغلاقها.</p>
        <Link href={`/pos/shifts/${id}`} className="text-sky-700 hover:underline">
          العودة لتفاصيل الوردية
        </Link>
      </div>
    );
  }

  const denomPayload = toDenominationPayload(counts);
  const hasAnyCount = denomPayload.length > 0;

  function submitPreview() {
    setPreview(null);
    setError(null);
    previewMut.mutate({ denominationCounts: denomPayload });
  }

  function confirmClose() {
    if (!preview) return;
    if (preview.requiresManagerApproval && !managerUserId.trim()) {
      setError('الفرق يتجاوز الحد المسموح — يلزم معرّف موافقة المدير');
      return;
    }
    closeMut.mutate({
      actualCashIqd: preview.countedCashIqd,
      denominationCounts: denomPayload,
      notes: notes || undefined,
      managerUserId: preview.requiresManagerApproval ? managerUserId.trim() : undefined,
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <Link href={`/pos/shifts/${id}`} className="text-sm text-sky-700 hover:underline">
          ← تفاصيل الوردية
        </Link>
        <h1 className="mt-2 text-3xl font-bold">إغلاق الوردية {shift.shiftNumber}</h1>
        <p className="text-sm text-slate-500">
          فُتحت {formatDate(shift.openedAt)} · افتتاحي {formatIqd(shift.openingCashIqd)}
        </p>
      </header>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold">العَدّ الأعمى للنقد</h2>
        <p className="mb-4 text-sm text-slate-600">
          أدخل عدد الأوراق لكل فئة كما في الدُّرج. <strong>لن يظهر المتوقع
          قبل أن ترسل العَدّ</strong> — هذا يضمن أن الجرد يعكس الواقع وليس
          الرقم المستهدف.
        </p>
        <DenominationCounter
          counts={counts}
          onChange={setCounts}
          disabled={previewMut.isPending || closeMut.isPending}
        />
        <div className="mt-4 flex justify-end">
          <button
            onClick={submitPreview}
            disabled={!hasAnyCount || previewMut.isPending || closeMut.isPending}
            className="rounded bg-sky-700 px-4 py-2 text-white disabled:bg-slate-300"
          >
            {previewMut.isPending ? 'جارٍ الحساب…' : 'احسب الفرق'}
          </button>
        </div>
      </section>

      {preview && (
        <section className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">نتيجة المطابقة</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Cell label="المتوقع" value={formatIqd(preview.expectedCashIqd)} />
            <Cell label="المعدود" value={formatIqd(preview.countedCashIqd)} />
            <Cell
              label="الفرق"
              value={`${preview.isOver ? '+' : ''}${formatIqd(preview.varianceIqd)}`}
              tone={
                preview.isExact
                  ? 'ok'
                  : preview.exceedsTolerance
                    ? 'bad'
                    : 'warn'
              }
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            حد التسامح المسموح: {formatIqd(preview.toleranceIqd)}
          </p>

          {preview.requiresManagerApproval && (
            <div className="mt-4 rounded border border-rose-300 bg-rose-50 p-3">
              <p className="mb-2 font-semibold text-rose-800">
                الفرق يتجاوز الحد المسموح — يلزم اعتماد مدير
              </p>
              <label className="block text-sm text-slate-700">
                معرّف المدير المعتمد
                <input
                  type="text"
                  value={managerUserId}
                  onChange={(e) => setManagerUserId(e.target.value)}
                  placeholder="ULID الخاص بمستخدم المدير"
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono"
                />
              </label>
            </div>
          )}

          <label className="mt-4 block text-sm text-slate-700">
            ملاحظات (سبب الفرق إن وُجد)
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
            />
          </label>

          {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => {
                setPreview(null);
                setError(null);
              }}
              disabled={closeMut.isPending}
              className="rounded border border-slate-300 px-4 py-2 text-slate-700"
            >
              إعادة العَدّ
            </button>
            <button
              onClick={confirmClose}
              disabled={closeMut.isPending}
              className="rounded bg-emerald-700 px-4 py-2 text-white disabled:bg-slate-300"
            >
              {closeMut.isPending ? 'جارٍ الإغلاق…' : 'تأكيد الإغلاق وترحيل القيد'}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            عند التأكيد سيتم ترحيل قيد محاسبي تلقائي للفرق (إن وُجد) عبر
            قالب <code>cash_short_over</code>.
          </p>
        </section>
      )}

      {error && !preview && (
        <p className="text-sm text-rose-700">{error}</p>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'bad';
}) {
  const color =
    tone === 'ok'
      ? 'text-emerald-700'
      : tone === 'warn'
        ? 'text-amber-700'
        : tone === 'bad'
          ? 'text-rose-700'
          : 'text-slate-900';
  return (
    <div className="rounded border border-slate-200 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
