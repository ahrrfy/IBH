'use client';

import { formatIqd } from '@/lib/format';

/**
 * IQD denominations used in Iraq, smallest to largest. Order is locked
 * to match the backend whitelist in shifts.service.ts (IQD_DENOMINATIONS).
 */
export const IQD_DENOMINATIONS = [250, 500, 1000, 5000, 10000, 25000, 50000] as const;
export type IqdDenomination = (typeof IQD_DENOMINATIONS)[number];

export interface DenominationCounts {
  /** Maps denomination value (e.g. 50000) → number of notes counted. */
  [denom: number]: number;
}

/**
 * Blind cash counter UI. The cashier types the number of notes per
 * denomination. This component intentionally does NOT show the system's
 * expected drawer total — that is the whole point of "blind count".
 * It only shows the running tally of what the cashier has counted so far,
 * so they can verify their own arithmetic.
 */
export function DenominationCounter({
  counts,
  onChange,
  disabled,
}: {
  counts: DenominationCounts;
  onChange: (next: DenominationCounts) => void;
  disabled?: boolean;
}) {
  const total = IQD_DENOMINATIONS.reduce(
    (acc, d) => acc + d * (counts[d] ?? 0),
    0,
  );

  function setCount(denom: IqdDenomination, raw: string) {
    const n = raw === '' ? 0 : Math.max(0, Math.floor(Number(raw)));
    if (Number.isNaN(n)) return;
    onChange({ ...counts, [denom]: n });
  }

  return (
    <div className="space-y-3">
      <table className="w-full text-sm">
        <thead className="text-slate-500">
          <tr>
            <th className="text-start py-2">الفئة</th>
            <th className="text-center">عدد الأوراق</th>
            <th className="text-end">المجموع الجزئي</th>
          </tr>
        </thead>
        <tbody>
          {IQD_DENOMINATIONS.map((denom) => {
            const count = counts[denom] ?? 0;
            const subtotal = denom * count;
            return (
              <tr key={denom} className="border-t">
                <td className="py-2 font-mono">{formatIqd(denom)}</td>
                <td className="text-center">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={count === 0 ? '' : count}
                    placeholder="0"
                    onChange={(e) => setCount(denom, e.target.value)}
                    disabled={disabled}
                    className="w-24 rounded border border-slate-300 px-2 py-1 text-center disabled:bg-slate-100"
                    aria-label={`عدد أوراق فئة ${denom}`}
                  />
                </td>
                <td className="text-end font-mono">{formatIqd(subtotal)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300">
            <td className="py-2 font-semibold">إجمالي العَدّ</td>
            <td />
            <td className="text-end text-lg font-bold">{formatIqd(total)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="text-xs text-slate-500">
        أدخل عدد كل فئة بدون النظر إلى المتوقع — النظام يحسب الفرق تلقائياً.
      </p>
    </div>
  );
}

/** Convert the {denom: count} record into the API payload shape. */
export function toDenominationPayload(counts: DenominationCounts) {
  return IQD_DENOMINATIONS
    .filter((d) => (counts[d] ?? 0) > 0)
    .map((denom) => ({ denom, count: counts[denom]! }));
}

/** Sum a counts record into the IQD total (helper for tests / UI). */
export function sumCounts(counts: DenominationCounts): number {
  return IQD_DENOMINATIONS.reduce((acc, d) => acc + d * (counts[d] ?? 0), 0);
}
