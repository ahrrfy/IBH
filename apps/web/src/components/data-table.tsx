'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Inbox, ArrowUpDown, Columns3, Rows3, Printer } from 'lucide-react';
import { ExportDropdown, type ExportFormat } from './export-dropdown';
import type { CompanyHeader } from '@/lib/export/types';

function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }, [key, val]);
  return [val, setVal];
}

export interface DataTableColumn<T> {
  key: string;
  header: string;
  accessor: (row: T) => ReactNode;
  exportValue?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  className?: string;
  align?: 'start' | 'center' | 'end';
  hideable?: boolean;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  pageSize?: number;
  exportFilename?: string;
  exportFormats?: ExportFormat[];
  exportTitle?: string;
  companyHeader?: CompanyHeader;
  getRowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  columnToggle?: boolean;
  densityToggle?: boolean;
  printable?: boolean;
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
}

export function DataTable<T>({
  columns,
  rows,
  loading,
  error,
  onRetry,
  emptyMessage = 'لا توجد بيانات لعرضها',
  emptyIcon,
  pageSize = 20,
  exportFilename = 'export',
  exportFormats,
  exportTitle,
  companyHeader,
  getRowKey,
  onRowClick,
  columnToggle,
  densityToggle,
  printable,
  selectable,
  selectedKeys,
  onSelectionChange,
}: DataTableProps<T>) {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [colDropOpen, setColDropOpen] = useState(false);
  const colRef = useRef<HTMLDivElement>(null);

  const [hiddenCols, setHiddenCols] = useLocalStorage<string[]>(`dt-cols-${exportFilename}`, []);
  const [density, setDensity] = useLocalStorage<'comfortable' | 'compact'>(`dt-density-${exportFilename}`, 'comfortable');

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (colRef.current && !colRef.current.contains(e.target as Node)) setColDropOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hiddenCols.includes(c.key)),
    [columns, hiddenCols],
  );

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [rows, columns, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  function onSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  function toggleCol(key: string) {
    setHiddenCols((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }

  const allPageSelected = selectable && pageRows.length > 0 && pageRows.every((r, i) => selectedKeys?.has(getRowKey(r, safePage * pageSize + i)));

  function toggleSelectAll() {
    if (!onSelectionChange) return;
    const next = new Set(selectedKeys);
    if (allPageSelected) {
      pageRows.forEach((r, i) => next.delete(getRowKey(r, safePage * pageSize + i)));
    } else {
      pageRows.forEach((r, i) => next.add(getRowKey(r, safePage * pageSize + i)));
    }
    onSelectionChange(next);
  }

  function toggleRow(key: string) {
    if (!onSelectionChange) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key); else next.add(key);
    onSelectionChange(next);
  }

  const cellPad = density === 'compact' ? 'px-4 py-1.5 text-xs' : 'px-4 py-3';

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 no-print">
        <div className="text-sm text-slate-600">
          {loading ? 'جارٍ التحميل…' : `${sorted.length} سجل`}
        </div>
        <div className="flex items-center gap-2">
          {columnToggle && (
            <div className="relative" ref={colRef}>
              <button onClick={() => setColDropOpen(!colDropOpen)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50" title="إظهار/إخفاء الأعمدة">
                <Columns3 className="h-4 w-4" />
              </button>
              {colDropOpen && (
                <div className="absolute left-0 top-full mt-1 z-30 w-48 rounded-lg border border-slate-200 bg-white shadow-lg p-2 text-sm" dir="rtl">
                  {columns.filter((c) => c.hideable !== false && c.header).map((c) => (
                    <label key={c.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={!hiddenCols.includes(c.key)} onChange={() => toggleCol(c.key)} className="rounded border-slate-300" />
                      {c.header}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          {densityToggle && (
            <button onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50" title={density === 'comfortable' ? 'عرض مدمج' : 'عرض مريح'}>
              <Rows3 className="h-4 w-4" />
            </button>
          )}
          {printable && (
            <button onClick={() => window.print()} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50" title="طباعة">
              <Printer className="h-4 w-4" />
            </button>
          )}
          <ExportDropdown
            columns={columns}
            rows={sorted}
            filename={exportFilename}
            title={exportTitle}
            companyHeader={companyHeader}
            formats={exportFormats}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {selectable && (
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={!!allPageSelected} onChange={toggleSelectAll} className="rounded border-slate-300" />
                </th>
              )}
              {visibleColumns.map((c) => (
                <th key={c.key} className={['px-4 py-3 font-semibold text-xs uppercase tracking-wide', c.align === 'center' ? 'text-center' : c.align === 'end' ? 'text-left' : 'text-right'].join(' ')}>
                  {c.sortable ? (
                    <button onClick={() => onSort(c.key)} className="inline-flex items-center gap-1 hover:text-slate-900">
                      {c.header}
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`skel-${i}`} className="border-t border-slate-100">
                  {selectable && <td className={cellPad}><div className="h-4 w-4 animate-pulse rounded bg-slate-100" /></td>}
                  {visibleColumns.map((c) => (
                    <td key={c.key} className={cellPad}><div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" /></td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={visibleColumns.length + (selectable ? 1 : 0)} className="px-4 py-10">
                  <div className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 p-4 text-center">
                    <div className="font-semibold text-red-800">{error}</div>
                    {onRetry && <button onClick={onRetry} className="mt-3 rounded-lg bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700">إعادة المحاولة</button>}
                  </div>
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (selectable ? 1 : 0)} className="px-4 py-16">
                  <div className="flex flex-col items-center justify-center text-slate-500">
                    {emptyIcon ?? <Inbox className="mb-2 h-10 w-10 text-slate-300" />}
                    <div className="text-sm">{emptyMessage}</div>
                  </div>
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => {
                const rowKey = getRowKey(row, safePage * pageSize + idx);
                const isSelected = selectedKeys?.has(rowKey);
                return (
                  <tr
                    key={rowKey}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={[
                      'border-t border-slate-100',
                      onRowClick ? 'cursor-pointer hover:bg-slate-50' : '',
                      isSelected ? 'bg-brand-50' : '',
                    ].join(' ')}
                  >
                    {selectable && (
                      <td className={cellPad} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={!!isSelected} onChange={() => toggleRow(rowKey)} className="rounded border-slate-300" />
                      </td>
                    )}
                    {visibleColumns.map((c) => (
                      <td key={c.key} className={[cellPad, 'text-slate-800', c.align === 'center' ? 'text-center' : c.align === 'end' ? 'text-left' : 'text-right', c.className ?? ''].join(' ')}>
                        {c.accessor(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm no-print">
          <div className="text-slate-600">صفحة {safePage + 1} من {totalPages}</div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50">
              <ChevronRight className="h-4 w-4" /> السابق
            </button>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50">
              التالي <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
