'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';

export interface VariantOption {
  variantId: string;
  variantSku: string;
  templateNameAr: string;
  qtyOnHand: number;
  defaultPriceIqd: number;
}

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
  placeholder?: string;
}

export function ProductCombobox({ warehouseId, onPick, disabled, placeholder }: Props) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ['stock-search', warehouseId, debounced],
    queryFn: () =>
      api<{ items: StockItem[] }>(
        `/inventory/stock?limit=10${warehouseId ? `&warehouseId=${warehouseId}` : ''}${debounced ? `&search=${encodeURIComponent(debounced)}` : ''}`,
      ),
    enabled: open && !!warehouseId,
    staleTime: 15_000,
  });

  const items: StockItem[] = data?.items ?? [];

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? (warehouseId ? 'ابحث عن منتج بالـ SKU أو الاسم…' : 'اختر مخزناً أولاً')}
          disabled={disabled || !warehouseId}
          className="w-full rounded-md border border-slate-300 bg-white py-2 ps-9 pe-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100 disabled:text-slate-400"
        />
      </div>
      {open && warehouseId && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {isFetching && <div className="px-3 py-2 text-xs text-slate-500">جارٍ البحث…</div>}
          {!isFetching && items.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">لا نتائج</div>
          )}
          {items.map((row) => {
            const v = row.variant;
            if (!v) return null;
            const qty = Number(row.qtyOnHand ?? 0);
            const low = qty <= 0;
            const opt: VariantOption = {
              variantId: v.id,
              variantSku: v.sku,
              templateNameAr: v.template?.nameAr ?? v.sku,
              qtyOnHand: qty,
              defaultPriceIqd: Number(v.template?.defaultPriceIqd ?? 0),
            };
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => { onPick(opt); setOpen(false); setQuery(''); }}
                className="block w-full text-start px-3 py-2 text-sm hover:bg-sky-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{opt.templateNameAr}</div>
                    <div className="text-xs text-slate-500">{opt.variantSku}</div>
                  </div>
                  <div className={`text-xs font-medium ${low ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {low ? 'نفد المخزون' : `متوفر: ${qty.toLocaleString('ar-IQ')}`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
