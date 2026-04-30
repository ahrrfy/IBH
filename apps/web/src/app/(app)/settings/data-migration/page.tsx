'use client';

// Data Migration Center — admin page that drives the 6-step server-side wizard.
// Uses the new `/api/v1/data-migration/*` endpoints for all 15 entity types,
// including financial (opening_stock + opening_balance) which route through
// InventoryService.move() and PostingService.postJournalEntry() respectively.

import { useEffect, useState } from 'react';
import { Download, Upload, AlertCircle, FileSpreadsheet, Loader2, CheckCircle2 } from 'lucide-react';
import { dataMigration, type EntityTypeInfo, type ImportableEntityType, type CreateSessionResponse, type AutoMapResponse, type PreviewResponse, type ImportSummary } from '@/lib/data-migration-client';
import { ApiError } from '@/lib/api';

type Step = 'pick-entity' | 'upload' | 'pick-sheet' | 'mapping' | 'validating' | 'preview' | 'importing' | 'done';

export default function DataMigrationPage() {
  const [entityTypes, setEntityTypes] = useState<EntityTypeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('pick-entity');
  const [entityType, setEntityType] = useState<ImportableEntityType | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [session, setSession] = useState<CreateSessionResponse | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [autoMap, setAutoMap] = useState<AutoMapResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  useEffect(() => {
    dataMigration.listEntityTypes()
      .then(setEntityTypes)
      .catch((e: ApiError) => setError(e.messageAr || e.message));
  }, []);

  async function handleUpload() {
    if (!file || !entityType) return;
    setLoading(true);
    setError(null);
    try {
      const s = await dataMigration.createSession(file, entityType);
      setSession(s);
      if (s.sheets && s.sheets.length > 1) {
        setStep('pick-sheet');
        setSelectedSheet(s.sheets[0].name);
      } else {
        await loadAutoMap(s.sessionId);
        setStep('mapping');
      }
    } catch (e) {
      setError((e as ApiError).messageAr || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectSheet() {
    if (!file || !session || !selectedSheet) return;
    setLoading(true);
    setError(null);
    try {
      await dataMigration.selectSheet(session.sessionId, selectedSheet, file);
      await loadAutoMap(session.sessionId);
      setStep('mapping');
    } catch (e) {
      setError((e as ApiError).messageAr || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadAutoMap(sessionId: string) {
    const m = await dataMigration.autoMap(sessionId);
    setAutoMap(m);
    const initial: Record<string, string> = {};
    m.mappings.forEach((mp) => {
      initial[mp.sourceColumn] = mp.targetField;
    });
    setMapping(initial);
  }

  async function handleConfirmMapping() {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      await dataMigration.confirmMapping(session.sessionId, mapping);
      await dataMigration.startValidation(session.sessionId);
      setStep('validating');
      // Poll preview every 2s until status === 'ready'
      const tick = async () => {
        const p = await dataMigration.preview(session.sessionId);
        setPreview(p);
        if (p.summary.status === 'ready') {
          setStep('preview');
        } else if (['failed', 'completed', 'completed_partial'].includes(p.summary.status)) {
          setStep('preview');
        } else {
          setTimeout(tick, 2000);
        }
      };
      setTimeout(tick, 1500);
    } catch (e) {
      setError((e as ApiError).messageAr || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleStartImport() {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      await dataMigration.startImport(session.sessionId);
      setStep('importing');
      const tick = async () => {
        const s = await dataMigration.summary(session.sessionId);
        setSummary(s);
        if (s.canRollback) {
          setStep('done');
        } else {
          setTimeout(tick, 2000);
        }
      };
      setTimeout(tick, 1500);
    } catch (e) {
      setError((e as ApiError).messageAr || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto p-6" dir="rtl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">مركز ترحيل واستيراد البيانات</h1>
        {entityType && (
          <a
            href={dataMigration.templateUrl(entityType)}
            className="flex items-center gap-2 rounded border border-blue-500 px-4 py-2 text-blue-700 hover:bg-blue-50"
            download
          >
            <Download className="size-4" /> تنزيل القالب
          </a>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded border border-red-300 bg-red-50 p-3 text-red-800">
          <AlertCircle className="size-4" /> {error}
        </div>
      )}

      {step === 'pick-entity' && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">١. اختر نوع البيانات للاستيراد</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {entityTypes.map((et) => (
              <button
                key={et.type}
                onClick={() => { setEntityType(et.type); setStep('upload'); }}
                className="rounded border p-4 text-right hover:border-blue-500 hover:bg-blue-50"
              >
                <div className="font-semibold">{et.label.ar}</div>
                <div className="text-xs text-gray-500">{et.label.en}</div>
                {et.dependencies.length > 0 && (
                  <div className="mt-2 text-xs text-amber-700">
                    يتطلب: {et.dependencies.map((d) => entityTypes.find((e) => e.type === d)?.label.ar ?? d).join('، ')}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'upload' && entityType && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">٢. ارفع الملف (CSV / XLSX / JSON)</h2>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full"
          />
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setStep('pick-entity')}
              className="rounded border px-4 py-2 hover:bg-gray-50"
            >
              رجوع
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || loading}
              className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              رفع وتحليل
            </button>
          </div>
        </div>
      )}

      {step === 'pick-sheet' && session?.sheets && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">٣. اختر الورقة</h2>
          <select
            value={selectedSheet}
            onChange={(e) => setSelectedSheet(e.target.value)}
            className="block w-full rounded border p-2"
          >
            {session.sheets.map((s) => (
              <option key={s.name} value={s.name}>{s.name} — {s.rowCount} سطر</option>
            ))}
          </select>
          <button
            onClick={handleSelectSheet}
            disabled={loading}
            className="mt-4 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            متابعة
          </button>
        </div>
      )}

      {step === 'mapping' && autoMap && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">٤. ربط الأعمدة</h2>
          <table className="w-full border">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-right">العمود في الملف</th>
                <th className="border p-2 text-right">الحقل المستهدف</th>
                <th className="border p-2 text-right">الثقة</th>
              </tr>
            </thead>
            <tbody>
              {autoMap.mappings.map((m) => (
                <tr key={m.sourceColumn}>
                  <td className="border p-2">{m.sourceColumn}</td>
                  <td className="border p-2">{m.targetField}</td>
                  <td className="border p-2">
                    <span className={`rounded px-2 py-1 text-xs ${
                      m.confidence === 'high' ? 'bg-green-100 text-green-800'
                        : m.confidence === 'medium' ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                    }`}>{m.confidence}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={handleConfirmMapping}
            disabled={loading}
            className="mt-4 flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
            تأكيد الربط وبدء التحقق
          </button>
        </div>
      )}

      {step === 'validating' && (
        <div className="flex items-center gap-3 rounded border border-blue-300 bg-blue-50 p-4 text-blue-800">
          <Loader2 className="size-5 animate-spin" />
          <span>جاري التحقق من البيانات…</span>
        </div>
      )}

      {step === 'preview' && preview && session && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">٥. ملخص التحقق</h2>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="الإجمالي" value={preview.summary.total} />
            <Stat label="صالح" value={preview.summary.valid} color="green" />
            <Stat label="أخطاء" value={preview.summary.errors} color="red" />
          </div>
          {preview.summary.errors > 0 && (
            <a
              href={dataMigration.errorReportUrl(session.sessionId)}
              className="mt-3 inline-flex items-center gap-2 text-blue-700 underline"
              download
            >
              <Download className="size-4" /> تنزيل تقرير الأخطاء
            </a>
          )}
          {preview.summary.valid > 0 && (
            <button
              onClick={handleStartImport}
              disabled={loading}
              className="mt-4 rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
            >
              بدء الاستيراد ({preview.summary.valid} سطر)
            </button>
          )}
        </div>
      )}

      {step === 'importing' && summary && (
        <div className="flex items-center gap-3 rounded border border-blue-300 bg-blue-50 p-4 text-blue-800">
          <Loader2 className="size-5 animate-spin" />
          <span>جاري الاستيراد… {summary.imported} / {summary.total}</span>
        </div>
      )}

      {step === 'done' && summary && (
        <div>
          <div className="flex items-center gap-2 rounded border border-green-300 bg-green-50 p-4 text-green-800">
            <CheckCircle2 className="size-5" />
            <span>اكتمل الاستيراد — تم استيراد {summary.imported} سطر في {summary.duration}</span>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-3">
            <Stat label="إجمالي" value={summary.total} />
            <Stat label="مستورد" value={summary.imported} color="green" />
            <Stat label="أخطاء" value={summary.errors} color="red" />
            <Stat label="تحذيرات" value={summary.warnings} color="amber" />
          </div>
          <button
            onClick={() => { setStep('pick-entity'); setSession(null); setFile(null); setEntityType(null); }}
            className="mt-4 rounded border px-4 py-2 hover:bg-gray-50"
          >
            استيراد آخر
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color = 'gray' }: { label: string; value: number; color?: 'gray' | 'green' | 'red' | 'amber' }) {
  const colors = {
    gray: 'border-gray-300 bg-gray-50 text-gray-800',
    green: 'border-green-300 bg-green-50 text-green-800',
    red: 'border-red-300 bg-red-50 text-red-800',
    amber: 'border-amber-300 bg-amber-50 text-amber-800',
  } as const;
  return (
    <div className={`rounded border p-3 text-center ${colors[color]}`}>
      <div className="text-xs">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
