'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

interface SearchFilter { type: 'search'; key: string; placeholder?: string }
interface SelectFilter { type: 'select'; key: string; label: string; options: { value: string; label: string }[] }
interface DateRangeFilter { type: 'date-range'; keyFrom: string; keyTo: string; label?: string }

export type FilterConfig = SearchFilter | SelectFilter | DateRangeFilter;

export interface FilterBarProps {
  filters: FilterConfig[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}

export function FilterBar({ filters, values, onChange }: FilterBarProps) {
  const [localSearch, setLocalSearch] = useState(values[filters.find((f) => f.type === 'search')?.key ?? ''] ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const searchKey = (filters.find((f) => f.type === 'search') as SearchFilter | undefined)?.key;

  useEffect(() => {
    if (!searchKey) return;
    const ext = values[searchKey] ?? '';
    if (ext !== localSearch) setLocalSearch(ext);
  }, [values, searchKey]);

  function set(key: string, val: string) {
    const next = { ...values };
    if (val) next[key] = val;
    else delete next[key];
    onChange(next);
  }

  function onSearchInput(val: string) {
    setLocalSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (searchKey) set(searchKey, val);
    }, 250);
  }

  const activeCount = Object.keys(values).filter((k) => values[k]).length;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      {filters.map((f) => {
        if (f.type === 'search') {
          return (
            <div key={f.key} className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={localSearch}
                onChange={(e) => onSearchInput(e.target.value)}
                placeholder={f.placeholder ?? 'بحث…'}
                className="w-full rounded-lg border border-slate-200 py-2 pr-9 pl-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          );
        }
        if (f.type === 'select') {
          return (
            <select
              key={f.key}
              value={values[f.key] ?? ''}
              onChange={(e) => set(f.key, e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
            >
              <option value="">{f.label}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          );
        }
        if (f.type === 'date-range') {
          return (
            <div key={f.keyFrom} className="flex items-center gap-2">
              {f.label && <span className="text-xs text-slate-500">{f.label}</span>}
              <input
                type="date"
                value={values[f.keyFrom] ?? ''}
                onChange={(e) => set(f.keyFrom, e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
              <span className="text-slate-400">—</span>
              <input
                type="date"
                value={values[f.keyTo] ?? ''}
                onChange={(e) => set(f.keyTo, e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </div>
          );
        }
        return null;
      })}

      {activeCount > 0 && (
        <button
          onClick={() => onChange({})}
          className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          <X className="h-3 w-3" />
          مسح الفلاتر ({activeCount})
        </button>
      )}
    </div>
  );
}
