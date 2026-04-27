'use client';

/**
 * CustomerDisplay — secondary-screen friendly summary of the current cart.
 *
 * Renders an at-a-glance, large-font total intended for a customer-facing
 * monitor. The full secondary-window detach (window.open + BroadcastChannel)
 * is a Tauri-shell concern; this component is the renderable that the host
 * page uses inline today and that a future Tauri secondary window can mount.
 */

import { fmtAmount } from '@/components/money';
import type { CartLine } from './cart';
import { lineTotal } from './cart';

interface Props {
  lines: CartLine[];
  total: number;
  customerName?: string | null;
}

export function CustomerDisplay({ lines, total, customerName }: Props) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-900 p-4 text-white shadow-inner">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
        <span>شاشة الزبون</span>
        {customerName && <span className="text-emerald-300">{customerName}</span>}
      </div>
      <div className="mt-3 max-h-40 space-y-1 overflow-auto text-sm">
        {lines.length === 0 ? (
          <div className="py-6 text-center text-slate-500">لا أصناف بعد</div>
        ) : (
          lines.map((l) => (
            <div key={l.key} className="flex items-center justify-between gap-2">
              <span className="truncate">{l.nameAr}</span>
              <span className="text-slate-400 tabular-nums">
                {l.qty} × {fmtAmount(l.unitPriceIqd)}
              </span>
              <span className="tabular-nums font-semibold">{fmtAmount(lineTotal(l))}</span>
            </div>
          ))
        )}
      </div>
      <div className="mt-4 flex items-end justify-between border-t border-slate-700 pt-3">
        <span className="text-sm text-slate-400">الإجمالي</span>
        <span className="text-3xl font-bold tabular-nums">{fmtAmount(total)} د.ع</span>
      </div>
    </div>
  );
}
