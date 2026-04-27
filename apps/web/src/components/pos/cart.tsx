'use client';

/**
 * Cart — interactive cart line list for the POS sale screen.
 *
 * Rules:
 *   - qty > 0 (no negatives in cart; returns are a separate flow)
 *   - discountPct ∈ [0, 100], discountIqd ≥ 0; only one is "active" per line
 *   - lineTotal = (unitPrice * qty) - discountIqd  (server is authoritative)
 *   - Stock guard: if qtyOnHand is known and (qty > qtyOnHand) we mark the row
 *     and let the parent decide whether to block submit (manager override).
 *
 * No business posting here — the parent calls /pos/receipts on confirm.
 */

import { Minus, Plus, Trash2 } from 'lucide-react';
import { fmtAmount } from '@/components/money';

export interface CartLine {
  /** Stable key for React + de-dup when scanning the same SKU twice. */
  key: string;
  variantId: string;
  sku: string;
  nameAr: string;
  qty: number;
  unitPriceIqd: number;
  discountPct: number;
  discountIqd: number;
  /** Live stock at time of add — used for the inline warning only. */
  qtyOnHand?: number;
}

interface Props {
  lines: CartLine[];
  onChange: (next: CartLine[]) => void;
  onRemove: (key: string) => void;
  readOnly?: boolean;
}

export function lineTotal(line: CartLine): number {
  const gross = line.unitPriceIqd * line.qty;
  const pctDiscount = (gross * (line.discountPct || 0)) / 100;
  const flatDiscount = line.discountIqd || 0;
  // Server recomputes; we keep UI consistent: pct wins if > 0
  const discount = (line.discountPct || 0) > 0 ? pctDiscount : flatDiscount;
  return Math.max(0, gross - discount);
}

export function Cart({ lines, onChange, onRemove, readOnly }: Props) {
  function update(key: string, patch: Partial<CartLine>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  if (lines.length === 0) {
    return (
      <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-slate-400">
        <p className="text-sm">السلة فارغة</p>
        <p className="text-xs mt-1">امسح باركود أو ابحث عن منتج لإضافته</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-slate-100">
      {lines.map((l) => {
        const total = lineTotal(l);
        const overStock = l.qtyOnHand !== undefined && l.qty > l.qtyOnHand;
        return (
          <div key={l.key} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-sm">
            {/* Name */}
            <div className="col-span-4 min-w-0">
              <div className="truncate font-medium text-slate-900">{l.nameAr}</div>
              <div className="truncate text-xs text-slate-500 font-mono">{l.sku}</div>
              {overStock && (
                <div className="text-xs text-rose-600 mt-0.5">
                  ⚠ الكمية المطلوبة أكبر من المتاح ({l.qtyOnHand})
                </div>
              )}
            </div>
            {/* Qty stepper */}
            <div className="col-span-3 flex items-center gap-1">
              <button
                type="button"
                disabled={readOnly}
                onClick={() => update(l.key, { qty: Math.max(1, l.qty - 1) })}
                className="grid h-8 w-8 place-items-center rounded border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                aria-label="إنقاص"
              >
                <Minus size={14} />
              </button>
              <input
                type="number"
                min={1}
                step="any"
                value={l.qty}
                disabled={readOnly}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v) || v <= 0) return;
                  update(l.key, { qty: v });
                }}
                className="h-8 w-16 rounded border border-slate-300 px-2 text-center text-sm tabular-nums focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <button
                type="button"
                disabled={readOnly}
                onClick={() => update(l.key, { qty: l.qty + 1 })}
                className="grid h-8 w-8 place-items-center rounded border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                aria-label="زيادة"
              >
                <Plus size={14} />
              </button>
            </div>
            {/* Unit price (read-only display; price overrides go through a future "price override" perm) */}
            <div className="col-span-2 text-end tabular-nums text-slate-700">
              {fmtAmount(l.unitPriceIqd)}
            </div>
            {/* Discount % */}
            <div className="col-span-1">
              <input
                type="number"
                min={0}
                max={100}
                step="any"
                value={l.discountPct || ''}
                disabled={readOnly}
                placeholder="%"
                onChange={(e) => {
                  const v = e.target.value === '' ? 0 : Number(e.target.value);
                  if (!Number.isFinite(v) || v < 0 || v > 100) return;
                  update(l.key, { discountPct: v, discountIqd: 0 });
                }}
                className="h-8 w-full rounded border border-slate-300 px-2 text-center text-xs tabular-nums focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            {/* Total + remove */}
            <div className="col-span-2 flex items-center justify-end gap-2">
              <span className="font-semibold text-slate-900 tabular-nums">{fmtAmount(total)}</span>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => onRemove(l.key)}
                className="grid h-8 w-8 place-items-center rounded text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                aria-label="حذف"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
