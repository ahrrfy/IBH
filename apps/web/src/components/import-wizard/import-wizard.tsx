'use client';

import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { Upload, FileSpreadsheet, ArrowLeft, ArrowRight, Check, AlertCircle, Loader2, Download, X } from 'lucide-react';
import type { ParsedSheet } from '@/lib/export/excel-import';
import type { ZodSchema, ZodError } from 'zod';

export interface ImportField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  required?: boolean;
  aliases?: string[];
}

interface ImportWizardProps {
  title: string;
  fields: ImportField[];
  validationSchema?: ZodSchema;
  onImportBatch: (rows: Record<string, unknown>[]) => Promise<{ inserted?: number; errors?: string[] }>;
  onComplete?: () => void;
  onClose?: () => void;
  batchSize?: number;
}

type Step = 'upload' | 'sheet' | 'mapping' | 'validation' | 'progress' | 'result';

interface WizardState {
  step: Step;
  file: File | null;
  sheets: ParsedSheet[];
  selectedSheet: number;
  mapping: Record<string, string>;
  validRows: Record<string, unknown>[];
  errorRows: { row: number; data: Record<string, unknown>; errors: string[] }[];
  progress: { total: number; done: number; failed: number };
  resultSummary: { inserted: number; skipped: number; failed: number; errorDetails: string[] };
}

type Action =
  | { type: 'SET_FILE'; file: File; sheets: ParsedSheet[] }
  | { type: 'SELECT_SHEET'; index: number }
  | { type: 'SET_MAPPING'; mapping: Record<string, string> }
  | { type: 'SET_VALIDATION'; validRows: Record<string, unknown>[]; errorRows: WizardState['errorRows'] }
  | { type: 'SET_STEP'; step: Step }
  | { type: 'UPDATE_PROGRESS'; done: number; failed: number }
  | { type: 'SET_RESULT'; summary: WizardState['resultSummary'] }
  | { type: 'RESET' };

const INIT: WizardState = {
  step: 'upload',
  file: null,
  sheets: [],
  selectedSheet: 0,
  mapping: {},
  validRows: [],
  errorRows: [],
  progress: { total: 0, done: 0, failed: 0 },
  resultSummary: { inserted: 0, skipped: 0, failed: 0, errorDetails: [] },
};

function reducer(state: WizardState, action: Action): WizardState {
  switch (action.type) {
    case 'SET_FILE':
      return { ...state, file: action.file, sheets: action.sheets, step: action.sheets.length > 1 ? 'sheet' : 'mapping', selectedSheet: 0 };
    case 'SELECT_SHEET':
      return { ...state, selectedSheet: action.index, step: 'mapping' };
    case 'SET_MAPPING':
      return { ...state, mapping: action.mapping };
    case 'SET_VALIDATION':
      return { ...state, validRows: action.validRows, errorRows: action.errorRows, step: 'validation' };
    case 'SET_STEP':
      return { ...state, step: action.step };
    case 'UPDATE_PROGRESS':
      return { ...state, progress: { ...state.progress, done: action.done, failed: action.failed } };
    case 'SET_RESULT':
      return { ...state, resultSummary: action.summary, step: 'result' };
    case 'RESET':
      return INIT;
    default:
      return state;
  }
}

function similarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-]/g, '');
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  let matches = 0;
  for (let i = 0; i < Math.min(na.length, nb.length); i++) {
    if (na[i] === nb[i]) matches++;
  }
  return matches / Math.max(na.length, nb.length);
}

export function ImportWizard({ title, fields, validationSchema, onImportBatch, onComplete, onClose, batchSize = 50 }: ImportWizardProps) {
  const [state, dispatch] = useReducer(reducer, INIT);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  const sheet = state.sheets[state.selectedSheet];

  const autoMapping = useMemo(() => {
    if (!sheet) return {};
    const map: Record<string, string> = {};
    for (const field of fields) {
      const candidates = [field.label, field.key, ...(field.aliases ?? [])];
      let bestScore = 0;
      let bestHeader = '';
      for (const header of sheet.headers) {
        for (const candidate of candidates) {
          const score = similarity(header, candidate);
          if (score > bestScore && score >= 0.6) {
            bestScore = score;
            bestHeader = header;
          }
        }
      }
      if (bestHeader) map[field.key] = bestHeader;
    }
    return map;
  }, [sheet, fields]);

  const [localMapping, setLocalMapping] = useState<Record<string, string>>({});
  const effectiveMapping = Object.keys(localMapping).length > 0 ? localMapping : autoMapping;

  async function handleFile(file: File) {
    setParsing(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'csv') {
        const { parseCsvFile } = await import('@/lib/export/excel-import');
        const parsed = await parseCsvFile(file);
        dispatch({ type: 'SET_FILE', file, sheets: [parsed] });
      } else {
        const { parseExcelFile } = await import('@/lib/export/excel-import');
        const sheets = await parseExcelFile(file);
        dispatch({ type: 'SET_FILE', file, sheets });
      }
    } finally {
      setParsing(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function runValidation() {
    if (!sheet) return;
    const validRows: Record<string, unknown>[] = [];
    const errorRows: WizardState['errorRows'] = [];

    for (let i = 0; i < sheet.rows.length; i++) {
      const raw = sheet.rows[i];
      const mapped: Record<string, unknown> = {};
      for (const field of fields) {
        const header = effectiveMapping[field.key];
        if (header) {
          let val = raw[header];
          if (field.type === 'number' && val != null) val = Number(val);
          if (field.type === 'boolean' && val != null) val = val === true || val === 'true' || val === '1';
          mapped[field.key] = val;
        }
      }

      if (validationSchema) {
        try {
          validationSchema.parse(mapped);
          validRows.push(mapped);
        } catch (err) {
          const zodErr = err as ZodError;
          errorRows.push({
            row: i + 2,
            data: mapped,
            errors: zodErr.issues?.map((iss) => `${iss.path.join('.')}: ${iss.message}`) ?? ['unknown'],
          });
        }
      } else {
        const errs: string[] = [];
        for (const field of fields) {
          if (field.required && (mapped[field.key] == null || mapped[field.key] === '')) {
            errs.push(`${field.label} required`);
          }
        }
        if (errs.length > 0) errorRows.push({ row: i + 2, data: mapped, errors: errs });
        else validRows.push(mapped);
      }
    }

    dispatch({ type: 'SET_VALIDATION', validRows, errorRows });
  }

  const startImport = useCallback(async () => {
    setImporting(true);
    const total = state.validRows.length;
    dispatch({ type: 'SET_STEP', step: 'progress' });

    let done = 0;
    let failed = 0;
    const allErrors: string[] = [];

    for (let i = 0; i < total; i += batchSize) {
      const batch = state.validRows.slice(i, i + batchSize);
      try {
        const result = await onImportBatch(batch);
        done += result.inserted ?? batch.length;
        if (result.errors) {
          failed += result.errors.length;
          allErrors.push(...result.errors);
        }
      } catch (err) {
        failed += batch.length;
        allErrors.push(`batch ${Math.floor(i / batchSize) + 1}: ${err instanceof Error ? err.message : 'error'}`);
      }
      dispatch({ type: 'UPDATE_PROGRESS', done: done + failed, failed });
    }

    dispatch({
      type: 'SET_RESULT',
      summary: { inserted: done, skipped: state.errorRows.length, failed, errorDetails: allErrors },
    });
    setImporting(false);
  }, [state.validRows, state.errorRows.length, batchSize, onImportBatch]);

  function downloadErrorReport() {
    const bom = '﻿';
    const headers = ['Row', 'Errors', ...fields.map((f) => f.label)];
    const csvRows = state.errorRows.map((er) => [
      er.row,
      `"${er.errors.join('; ')}"`,
      ...fields.map((f) => {
        const v = er.data[f.key];
        return v != null ? `"${String(v)}"` : '';
      }),
    ]);
    const csv = [headers.join(','), ...csvRows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const STEPS: { key: Step; label: string }[] = [
    { key: 'upload', label: 'رفع الملف' },
    { key: 'sheet', label: 'اختيار الورقة' },
    { key: 'mapping', label: 'ربط الأعمدة' },
    { key: 'validation', label: 'المعاينة' },
    { key: 'progress', label: 'الاستيراد' },
    { key: 'result', label: 'النتائج' },
  ];

  const stepIndex = STEPS.findIndex((s) => s.key === state.step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {STEPS[stepIndex]?.label}
            </p>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
              <X className="h-5 w-5 text-slate-500" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 px-6 py-3 border-b border-slate-100 overflow-x-auto">
          {STEPS.map((s, i) => {
            if (s.key === 'sheet' && state.sheets.length <= 1) return null;
            const isActive = i === stepIndex;
            const isDone = i < stepIndex;
            return (
              <div key={s.key} className={`flex items-center gap-1.5 text-xs whitespace-nowrap ${isActive ? 'text-sky-700 font-bold' : isDone ? 'text-emerald-600' : 'text-slate-400'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${isActive ? 'bg-sky-100 text-sky-700' : isDone ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100'}`}>
                  {isDone ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                {s.label}
                {i < STEPS.length - 1 && <span className="text-slate-300 mx-1">{'›'}</span>}
              </div>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {state.step === 'upload' && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition ${dragging ? 'border-sky-500 bg-sky-50' : 'border-slate-300 hover:border-sky-400 hover:bg-slate-50'}`}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {parsing ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-10 w-10 text-sky-600 animate-spin" />
                  <p className="text-sm text-slate-600">{'جارٍ تحليل الملف...'}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Upload className="h-10 w-10 text-slate-400" />
                  <p className="text-sm text-slate-700 font-medium">{'اسحب ملف Excel أو CSV هنا'}</p>
                  <p className="text-xs text-slate-500">{'أو اضغط لاختيار ملف — يدعم .xlsx, .xls, .csv'}</p>
                </div>
              )}
            </div>
          )}

          {state.step === 'sheet' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 mb-4">{`الملف يحتوي ${state.sheets.length} أوراق`}</p>
              {state.sheets.map((s, i) => (
                <button
                  key={i}
                  onClick={() => dispatch({ type: 'SELECT_SHEET', index: i })}
                  className={`w-full text-right p-4 rounded-lg border transition ${state.selectedSheet === i ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-slate-500 num-latin">{s.rowCount} rows &mdash; {s.headers.length} columns</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {state.step === 'mapping' && sheet && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">{'اربط أعمدة الملف بحقول النظام:'}</p>
              <div className="space-y-2">
                {fields.map((field) => (
                  <div key={field.key} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
                    <div className="flex-1">
                      <span className="text-sm font-medium">{field.label}</span>
                      {field.required && <span className="text-rose-500 text-xs mr-1">*</span>}
                      <span className="text-[10px] text-slate-400 mr-2">({field.type})</span>
                    </div>
                    <ArrowLeft className="h-4 w-4 text-slate-400" />
                    <select
                      value={effectiveMapping[field.key] ?? ''}
                      onChange={(e) => setLocalMapping({ ...effectiveMapping, [field.key]: e.target.value })}
                      className="w-48 rounded border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">{'— لا ربط —'}</option>
                      {sheet.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex justify-end pt-2">
                <button onClick={runValidation} className="flex items-center gap-1.5 rounded-lg bg-sky-700 px-4 py-2 text-sm text-white hover:bg-sky-800">
                  <Check className="h-4 w-4" /> {'معاينة وتحقق'}
                </button>
              </div>
            </div>
          )}

          {state.step === 'validation' && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1 text-emerald-700">
                  <Check className="h-4 w-4" /> {state.validRows.length} {'صف صالح'}
                </span>
                {state.errorRows.length > 0 && (
                  <span className="flex items-center gap-1 text-rose-700">
                    <AlertCircle className="h-4 w-4" /> {state.errorRows.length} {'خطأ'}
                  </span>
                )}
              </div>

              {state.errorRows.length > 0 && (
                <div className="max-h-60 overflow-y-auto border border-rose-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-rose-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-right">{'الصف'}</th>
                        <th className="px-3 py-2 text-right">{'الأخطاء'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.errorRows.slice(0, 50).map((er) => (
                        <tr key={er.row} className="border-t border-rose-100">
                          <td className="px-3 py-1.5 num-latin">{er.row}</td>
                          <td className="px-3 py-1.5 text-rose-700">{er.errors.join(' | ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {state.validRows.length > 0 && (
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        {fields.slice(0, 6).map((f) => (
                          <th key={f.key} className="px-3 py-2 text-right">{f.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {state.validRows.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          {fields.slice(0, 6).map((f) => (
                            <td key={f.key} className="px-3 py-1.5">{row[f.key] != null ? String(row[f.key]) : '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {state.step === 'progress' && (
            <div className="flex flex-col items-center gap-6 py-8">
              <Loader2 className="h-12 w-12 text-sky-600 animate-spin" />
              <div className="w-full max-w-md">
                <div className="flex justify-between text-sm text-slate-600 mb-2">
                  <span>{'جارٍ الاستيراد...'}</span>
                  <span className="num-latin">{state.progress.done} / {state.validRows.length}</span>
                </div>
                <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-600 rounded-full transition-all duration-300"
                    style={{ width: `${state.validRows.length > 0 ? (state.progress.done / state.validRows.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {state.step === 'result' && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-4">
                <ResultCard label={'تم استيراده'} value={state.resultSummary.inserted} tone="success" />
                <ResultCard label={'تم تخطيه'} value={state.resultSummary.skipped} tone="warning" />
                <ResultCard label={'فشل'} value={state.resultSummary.failed} tone="error" />
              </div>

              {state.errorRows.length > 0 && (
                <button onClick={downloadErrorReport} className="flex items-center gap-2 text-sm text-sky-700 hover:underline">
                  <Download className="h-4 w-4" /> {'تنزيل تقرير الأخطاء'}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200">
          <div>
            {state.step !== 'upload' && state.step !== 'progress' && state.step !== 'result' && (
              <button
                onClick={() => {
                  const prev = stepIndex > 0 ? STEPS[stepIndex - 1].key : 'upload';
                  dispatch({ type: 'SET_STEP', step: prev });
                }}
                className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
              >
                <ArrowRight className="h-4 w-4" /> {'السابق'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {state.step === 'validation' && state.validRows.length > 0 && (
              <button onClick={startImport} disabled={importing} className="flex items-center gap-1.5 rounded-lg bg-sky-700 px-4 py-2 text-sm text-white hover:bg-sky-800 disabled:opacity-50">
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeft className="h-4 w-4" />}
                {`استيراد ${state.validRows.length} صف`}
              </button>
            )}
            {state.step === 'result' && (
              <button
                onClick={() => { onComplete?.(); onClose?.(); }}
                className="flex items-center gap-1.5 rounded-lg bg-sky-700 px-4 py-2 text-sm text-white hover:bg-sky-800"
              >
                <Check className="h-4 w-4" /> {'إغلاق'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ label, value, tone }: { label: string; value: number; tone: 'success' | 'warning' | 'error' }) {
  const colors = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    error: 'bg-rose-50 border-rose-200 text-rose-900',
  }[tone];
  return (
    <div className={`rounded-xl border p-4 text-center ${colors}`}>
      <div className="text-2xl font-bold num-latin">{value}</div>
      <div className="text-xs mt-1">{label}</div>
    </div>
  );
}
