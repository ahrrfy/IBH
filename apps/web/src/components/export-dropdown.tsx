'use client';

import { useRef, useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import type { DataTableColumn } from './data-table';
import type { ExportColumn, CompanyHeader } from '@/lib/export/types';

export type ExportFormat = 'csv' | 'excel' | 'pdf';

interface ExportDropdownProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  filename: string;
  formats: ExportFormat[];
  company?: CompanyHeader;
  title?: string;
}

function toExportColumns<T>(columns: DataTableColumn<T>[]): ExportColumn[] {
  return columns
    .filter((c) => c.exportValue && c.key !== 'actions')
    .map((c) => ({
      key: c.key,
      header: c.header,
      align: c.align === 'end' ? 'left' as const : 'right' as const,
      type: 'string' as const,
      exportValue: c.exportValue!,
    }));
}

function exportCsv<T>(columns: DataTableColumn<T>[], rows: T[], filename: string) {
  const exportCols = columns.filter((c) => c.exportValue && c.key !== 'actions');
  const BOM = '﻿';
  const header = exportCols.map((c) => c.header).join(',');
  const body = rows.map((row) =>
    exportCols.map((c) => {
      const val = c.exportValue!(row);
      if (val == null) return '';
      const str = String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(','),
  ).join('\n');
  const blob = new Blob([BOM + header + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportDropdown<T>({ columns, rows, filename, formats, company, title }: ExportDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  async function doExport(format: ExportFormat) {
    setExporting(format);
    setOpen(false);
    try {
      if (format === 'csv') {
        exportCsv(columns, rows, filename);
      } else if (format === 'excel') {
        const { exportToExcel } = await import('@/lib/export/excel-export');
        await exportToExcel({
          filename,
          title,
          company,
          columns: toExportColumns(columns),
          rows,
        });
      } else if (format === 'pdf') {
        const { exportToPdf } = await import('@/lib/export/pdf-export');
        await exportToPdf({
          filename,
          title,
          company,
          columns: toExportColumns(columns),
          rows,
        });
      }
    } finally {
      setExporting(null);
    }
  }

  if (formats.length === 1) {
    return (
      <button
        onClick={() => doExport(formats[0])}
        disabled={exporting !== null}
        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
        title="تصدير"
      >
        <Download className="h-4 w-4" />
      </button>
    );
  }

  const LABELS: Record<ExportFormat, string> = { csv: 'CSV (.csv)', excel: 'Excel (.xlsx)', pdf: 'PDF (.pdf)' };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={exporting !== null}
        className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        <Download className="h-4 w-4" />
        {exporting ? 'جارٍ التصدير…' : 'تصدير'}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-card animate-fade-in">
          {formats.map((f) => (
            <button
              key={f}
              onClick={() => doExport(f)}
              className="block w-full px-3 py-2 text-sm text-right hover:bg-slate-50"
            >
              {LABELS[f]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
