'use client';

/**
 * PaymentModal — split-payment entry for POS receipts.
 *
 * - Methods: cash | card | mobile_money (matches Prisma PaymentMethod enum)
 * - Sum(payments) must >= total; UI blocks confirm otherwise.
 * - Change is allowed only when at least one cash payment is present
 *   (mirrors the server check in ReceiptsService.createReceipt).
 * - On confirm we hand the parent the payment list; the parent calls
 *   POST /pos/receipts (server is the source of truth — does posting,
 *   inventory move, audit, JE).
 */

import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Smartphone, Wallet, X } from 'lucide-react';
import { fmtAmount } from '@/components/money';

export type PaymentMethod = 'cash' | 'card' | 'mobile_money';

export interface PaymentLine {
  method: PaymentMethod;
  amountIqd: number;
  reference?: string;
}

interface Props {
  open: boolean;
  totalIqd: number;
  onClose: () => void;
  onConfirm: (payments: PaymentLine[]) => void;
  submitting?: boolean;
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'نقد',
  card: 'بطاقة',
  mobile_money: 'محفظة جوال',
};

const METHOD_ICON: Record<PaymentMethod, typeof Wallet> = {
  cash: Wallet,
  card: CreditCard,
  mobile_money: Smartphone,
};

export function PaymentModal({ open, totalIqd, onClose, onConfirm, submitting }: Props) {
  const [payments, setPayments] = useState<PaymentLine[]>([
    { method: 'cash', amountIqd: 0 },
  ]);

  // When opening, default cash to the full total (most common case)
  useEffect(() => {
    if (open) {
      setPayments([{ method: 'cash', amountIqd: totalIqd }]);
    }
  }, [open, totalIqd]);

  const paid = useMemo(
    () => payments.reduce((s, p) => s + (Number.isFinite(p.amountIqd) ? p.amountIqd : 0), 0),
    [payments],
  );
  const remaining = totalIqd - paid;
  const change = paid - totalIqd;
  const hasCash = payments.some((p) => p.method === 'cash' && p.amountIqd > 0);
  const canConfirm =
    paid >= totalIqd &&
    payments.every((p) => p.amountIqd > 0) &&
    (change <= 0 || hasCash) &&
    !submitting;

  if (!open) return null;

  function update(idx: number, patch: Partial<PaymentLine>) {
    setPayments((cur) => cur.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  function addRow() {
    setPayments((cur) => [...cur, { method: 'card', amountIqd: Math.max(0, totalIqd - paid) }]);
  }
  function removeRow(idx: number) {
    setPayments((cur) => (cur.length === 1 ? cur : cur.filter((_, i) => i !== idx)));
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold">الدفع</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded text-slate-500 hover:bg-slate-100"
            aria-label="إغلاق"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-3">
          <div className="mb-3 flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-600">الإجمالي</span>
            <span className="text-xl font-bold tabular-nums">{fmtAmount(totalIqd)} د.ع</span>
          </div>

          <div className="space-y-2">
            {payments.map((p, idx) => {
              const Icon = METHOD_ICON[p.method];
              return (
                <div key={idx} className="grid grid-cols-12 items-center gap-2">
                  <div className="col-span-4">
                    <select
                      value={p.method}
                      onChange={(e) => update(idx, { method: e.target.value as PaymentMethod })}
                      className="h-9 w-full rounded border border-slate-300 px-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                      <option value="cash">نقد</option>
                      <option value="card">بطاقة</option>
                      <option value="mobile_money">محفظة جوال</option>
                    </select>
                  </div>
                  <div className="col-span-5">
                    <div className="relative">
                      <Icon size={14} />
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={p.amountIqd || ''}
                        onChange={(e) => update(idx, { amountIqd: Number(e.target.value) || 0 })}
                        placeholder="0"
                        className="h-9 w-full rounded border border-slate-300 px-2 text-end text-sm tabular-nums focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                  </div>
                  <div className="col-span-2">
                    {p.method !== 'cash' && (
                      <input
                        type="text"
                        value={p.reference ?? ''}
                        onChange={(e) => update(idx, { reference: e.target.value })}
                        placeholder="مرجع"
                        className="h-9 w-full rounded border border-slate-300 px-2 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    )}
                  </div>
                  <div className="col-span-1">
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      disabled={payments.length === 1}
                      className="grid h-9 w-9 place-items-center rounded text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                      aria-label="حذف"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addRow}
            className="mt-2 text-xs font-medium text-sky-700 hover:text-sky-900"
          >
            + إضافة طريقة دفع أخرى
          </button>

          {/* Quick cash buttons */}
          <div className="mt-3 flex flex-wrap gap-1">
            {[totalIqd, 5000, 10000, 25000, 50000].map((amt, i) => (
              <button
                key={i}
                type="button"
                onClick={() =>
                  setPayments((cur) =>
                    cur.length === 1 && cur[0].method === 'cash'
                      ? [{ method: 'cash', amountIqd: amt }]
                      : cur,
                  )
                }
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                {fmtAmount(amt)}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-1 rounded-md border border-slate-200 px-3 py-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">المدفوع</span>
              <span className="tabular-nums">{fmtAmount(paid)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">المتبقي</span>
              <span className={`tabular-nums ${remaining > 0 ? 'text-rose-700 font-semibold' : 'text-slate-900'}`}>
                {fmtAmount(Math.max(0, remaining))}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">الباقي</span>
              <span className={`tabular-nums ${change > 0 ? 'text-emerald-700 font-semibold' : 'text-slate-900'}`}>
                {fmtAmount(Math.max(0, change))}
              </span>
            </div>
            {change > 0 && !hasCash && (
              <div className="text-xs text-rose-600">لا يمكن إعطاء باقي بدون دفع نقدي</div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(payments)}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'جارٍ الحفظ…' : 'تأكيد الدفع'}
          </button>
        </div>
      </div>
    </div>
  );
}
