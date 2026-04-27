'use client';

/**
 * QuickItems — top-12 quick-tap grid.
 *
 * Auto-curated: backend has no dedicated "top sellers" endpoint yet,
 * so we use the inventory stock list filtered to the current warehouse
 * (server orders by name); operators can scroll. When a real top-sellers
 * report ships (T38 reports module), swap the queryKey/path.
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtAmount } from '@/components/money';
import type { VariantOption } from '@/components/product-combobox';

interface StockItem {
  variantId: string;
  qtyOnHand: number | string;
  variant?: {
    id: string;
    sku: string;
    template?: { sku?: string; nameAr?: string; defaultPriceIqd?: number | string | null };
  };
}

interface Props {
  warehouseId: string | null;
  onPick: (variant: VariantOption) => void;
  disabled?: boolean;
}

export function QuickItems({ warehouseId, onPick, disabled }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['pos-quick-items', warehouseId],
    queryFn: () =>
      api<{ items: StockItem[] }>(
        `/inventory/stock?limit=12${warehouseId ? `&warehouseId=${warehouseId}` : ''}`,
      ),
    enabled: !!warehouseId,
    staleTime: 60_000,
  });

  if (!warehouseId) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
        اختر وردية مفتوحة لعرض المنتجات السريعة
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-md bg-slate-100" />
        ))}
      </div>
    );
  }

  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
        لا منتجات في هذا المخزن
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {items.map((row) => {
        const v = row.variant;
        if (!v) return null;
        const qty = Number(row.qtyOnHand ?? 0);
        const price = Number(v.template?.defaultPriceIqd ?? 0);
        const out = qty <= 0;
        return (
          <button
            key={v.id}
            type="button"
            disabled={disabled || out}
            onClick={() =>
              onPick({
                variantId: v.id,
                variantSku: v.sku,
                templateNameAr: v.template?.nameAr ?? v.sku,
                qtyOnHand: qty,
                defaultPriceIqd: price,
              })
            }
            className="flex h-20 flex-col justify-between rounded-md border border-slate-200 bg-white p-2 text-start text-xs shadow-sm transition hover:border-sky-400 hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="truncate font-medium text-slate-900">{v.template?.nameAr ?? v.sku}</div>
            <div className="flex items-center justify-between">
              <span className="tabular-nums text-slate-700">{fmtAmount(price)}</span>
              <span className={out ? 'text-rose-600' : 'text-emerald-700'}>
                {out ? 'نفد' : qty.toLocaleString('ar-IQ')}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
