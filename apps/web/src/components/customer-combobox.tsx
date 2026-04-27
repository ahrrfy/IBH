'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatIqd } from '@/lib/format';

export interface CustomerOption {
  id: string;
  code: string;
  nameAr: string;
  phone?: string | null;
  balanceIqd?: number | string | null;
  creditLimitIqd?: number | string | null;
}

interface Props {
  value: CustomerOption | null;
  onChange: (customer: CustomerOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function CustomerCombobox({ value, onChange, placeholder, disabled }: Props) {
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
    queryKey: ['customers-search', debounced],
    queryFn: () => api<{ items: CustomerOption[] }>(`/customers?limit=10${debounced ? `&search=${encodeURIComponent(debounced)}` : ''}`),
    enabled: open,
    staleTime: 30_000,
  });

  const items: CustomerOption[] = data?.items ?? [];

  if (value) {
    const balance = Number(value.balanceIqd ?? 0);
    const creditLimit = Number(value.creditLimitIqd ?? 0);
    const overLimit = creditLimit > 0 && balance > creditLimit;
    return (
      <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
        <div className="flex-1">
          <div className="font-medium">{value.nameAr}</div>
          <div className="text-xs text-slate-500">
            {value.code}
            {value.phone ? ` · ${value.phone}` : ''}
            {creditLimit > 0 && (
              <> · حد ائتمان: {formatIqd(creditLimit)} · رصيد: <span className={overLimit ? 'text-rose-600 font-semibold' : ''}>{formatIqd(balance)}</span></>
            )}
          </div>
          {overLimit && (
            <div className="mt-1 text-xs text-rose-600">⚠ تجاوز حد الائتمان</div>
          )}
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="إزالة"
          >
            <X size={16} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? 'ابحث عن عميل بالاسم أو الهاتف…'}
          disabled={disabled}
          className="w-full rounded-md border border-slate-300 bg-white py-2 ps-9 pe-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100"
        />
      </div>
      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {isFetching && <div className="px-3 py-2 text-xs text-slate-500">جارٍ البحث…</div>}
          {!isFetching && items.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">لا نتائج</div>
          )}
          {items.map((c) => {
            const bal = Number(c.balanceIqd ?? 0);
            const lim = Number(c.creditLimitIqd ?? 0);
            const over = lim > 0 && bal > lim;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => { onChange(c); setOpen(false); setQuery(''); }}
                className="block w-full text-start px-3 py-2 text-sm hover:bg-sky-50"
              >
                <div className="font-medium">{c.nameAr}</div>
                <div className="text-xs text-slate-500">
                  {c.code}{c.phone ? ` · ${c.phone}` : ''}
                  {lim > 0 && <> · رصيد: <span className={over ? 'text-rose-600' : ''}>{formatIqd(bal)}</span></>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
