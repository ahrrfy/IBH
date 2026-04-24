'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Download, Inbox, ArrowUpDown } from 'lucide-react';
import { downloadCsv, toCsv } from '@/lib/format';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  accessor: (row: T) => ReactNode;
  exportValue?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  className?: string;
  align?: 'start' | 'center' | 'end';
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
  getRowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
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
  exportFilename = 'export.csv',
  getRowKey,
  onRowClick,
}: DataTableProps<T>) {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

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
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function onExport() {
    const keys = columns.map((c) => c.key);
    const headers: Record<string, string> = {};
    columns.forEach((c) => (headers[c.key] = c.header));
    const plain = sorted.map((r) => {
      const o: Record<string, unknown> = {};
      columns.forEach((c) => {
        o[c.key] = c.exportValue ? c.exportValue(r) : '';
      });
      return o;
    });
    const csv = [keys.map((k) => headers[k]).join(','), toCsv(plain, keys).split('\n').slice(1).join('\n')].join('\n');
    downloadCsv(exportFilename, csv);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="text-sm text-slate-600">
          {loading ? 'جارٍ التحميل…' : `${sorted.length} سجل`}
        </div>
        <button
          onClick={onExport}
          disabled={loading || sorted.length === 0}
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          تصدير CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={[
                    'px-4 py-3 font-semibold text-xs uppercase tracking-wide',
                    c.align === 'center' ? 'text-center' : c.align === 'end' ? 'text-left' : 'text-right',
                  ].join(' ')}
                >
                  {c.sortable ? (
                    <button onClick={() => onSort(c.key)} className="inline-flex items-center gap-1 hover:text-slate-900">
                      {c.header}
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`skel-${i}`} className="border-t border-slate-100">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10">
                  <div className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 p-4 text-center">
                    <div className="font-semibold text-red-800">{error}</div>
                    {onRetry && (
                      <button
                        onClick={onRetry}
                        className="mt-3 rounded-lg bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700"
                      >
                        إعادة المحاولة
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-16">
                  <div className="flex flex-col items-center justify-center text-slate-500">
                    {emptyIcon ?? <Inbox className="mb-2 h-10 w-10 text-slate-300" />}
                    <div className="text-sm">{emptyMessage}</div>
                  </div>
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr
                  key={getRowKey(row, idx)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={[
                    'border-t border-slate-100',
                    onRowClick ? 'cursor-pointer hover:bg-slate-50' : '',
                  ].join(' ')}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={[
                        'px-4 py-3 text-slate-800',
                        c.align === 'center' ? 'text-center' : c.align === 'end' ? 'text-left' : 'text-right',
                        c.className ?? '',
                      ].join(' ')}
                    >
                      {c.accessor(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
          <div className="text-slate-600">
            صفحة {safePage + 1} من {totalPages}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
            >
              <ChevronRight className="h-4 w-4" /> السابق
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
            >
              التالي <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
