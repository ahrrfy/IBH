import { useState } from 'react';
import { useShiftStore } from '../stores/shift-store';

const DENOMINATIONS = [50000, 25000, 10000, 5000, 1000, 500, 250];

export function ShiftClose({ onClosed }: { onClosed: () => void }) {
  const { shift } = useShiftStore();
  const [counts, setCounts] = useState<Record<number, number>>({});

  const actualCash = DENOMINATIONS.reduce(
    (sum, d) => sum + d * (counts[d] ?? 0),
    0,
  );
  // TODO: fetch expected cash from API (opening + cash payments - refunds + movements)
  const expectedCash = shift?.openingCashIqd ?? 0;
  const difference = actualCash - expectedCash;
  const needsApproval = Math.abs(difference) > 5000;

  const onClose = async () => {
    if (needsApproval && !confirm('الفرق يتجاوز 5,000 د.ع — يحتاج موافقة مدير. متابعة؟')) return;
    // TODO: call API /pos/shifts/:id/close
    alert('تم إغلاق الوردية. سيتم طباعة Z-Report.');
    onClosed();
  };

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-3xl font-bold text-slate-800">إغلاق الوردية</h1>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Counting */}
        <div className="rounded-xl bg-white p-6 shadow">
          <h2 className="mb-4 font-semibold">عدّ النقد الفعلي</h2>
          <div className="space-y-2">
            {DENOMINATIONS.map((d) => (
              <div key={d} className="flex items-center justify-between gap-3">
                <span className="w-28 text-slate-600">{d.toLocaleString()} د.ع</span>
                <input
                  type="number"
                  min={0}
                  className="flex-1 rounded border px-3 py-2 text-center"
                  value={counts[d] ?? ''}
                  onChange={(e) =>
                    setCounts((c) => ({ ...c, [d]: parseInt(e.target.value || '0') }))
                  }
                />
                <span className="w-32 text-left text-sm text-slate-500">
                  = {(d * (counts[d] ?? 0)).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-xl bg-white p-6 shadow">
          <h2 className="mb-4 font-semibold">الملخص</h2>
          <dl className="space-y-3">
            <Row label="النقد الافتتاحي" value={shift?.openingCashIqd ?? 0} />
            <Row label="النقد المتوقع" value={expectedCash} hint="(محسوب من الفواتير + الحركات)" />
            <Row label="النقد الفعلي (المعدود)" value={actualCash} />
            <hr />
            <div
              className={`flex justify-between rounded-lg p-3 text-lg font-bold ${
                difference === 0
                  ? 'bg-emerald-50 text-emerald-800'
                  : needsApproval
                    ? 'bg-rose-50 text-rose-800'
                    : 'bg-amber-50 text-amber-800'
              }`}
            >
              <span>الفرق</span>
              <span>
                {difference >= 0 ? '+' : ''}
                {difference.toLocaleString()} د.ع
              </span>
            </div>
            {needsApproval && (
              <div className="rounded bg-rose-100 p-2 text-sm text-rose-700">
                ⚠️ الفرق يتجاوز الحد المسموح (5,000 د.ع) — يحتاج موافقة مدير
              </div>
            )}
          </dl>

          <button
            onClick={onClose}
            className="mt-6 w-full rounded-lg bg-rose-600 py-3 font-bold text-white hover:bg-rose-700"
          >
            أغلق الوردية + اطبع Z-Report
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="flex justify-between">
      <div>
        <div className="text-slate-600">{label}</div>
        {hint && <div className="text-xs text-slate-400">{hint}</div>}
      </div>
      <div className="font-semibold">{value.toLocaleString()} د.ع</div>
    </div>
  );
}
