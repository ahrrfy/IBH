'use client';

/**
 * Employee policy acknowledgment portal (T52).
 *
 * Auth-required but per-employee scoped — the API resolves the employee row
 * from the current user. Lists every published policy and lets the employee
 * acknowledge each one. Acknowledgments are immutable + hash-chained on the
 * server; the portal merely shows status and POSTs new acks.
 */
import { useEffect, useState } from 'react';
import { api, getToken } from '@/lib/api';

type PolicyEntry = {
  id: string;
  code: string;
  titleAr: string;
  bodyMd: string;
  version: number;
  publishedAt: string | null;
  acknowledged: boolean;
};

export default function PolicyAckPage() {
  const [policies, setPolicies] = useState<PolicyEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try {
      if (!getToken()) {
        setErr('يجب تسجيل الدخول كموظف لعرض السياسات.');
        return;
      }
      const data = await api<PolicyEntry[]>('/hr/policies/me/list');
      setPolicies(data);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const acknowledge = async (p: PolicyEntry) => {
    setBusy(p.id);
    try {
      await api('/hr/policies/me/acknowledge', {
        method: 'POST',
        body: { policyId: p.id, policyVersion: p.version },
      });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">السياسات والإقرارات</h1>
      <p className="text-sm text-slate-600">
        راجع كل سياسة ووقّع على إقرارك. الإقرار نهائي ومحفوظ في سجل غير قابل للتعديل.
      </p>

      {err && <div className="rounded bg-rose-50 p-3 text-sm text-rose-700">{err}</div>}

      {policies?.length === 0 && (
        <div className="rounded border bg-white p-4 text-sm text-slate-500">
          لا توجد سياسات منشورة حالياً.
        </div>
      )}

      <div className="space-y-4">
        {(policies ?? []).map((p) => (
          <article key={p.id} className="rounded border bg-white p-4">
            <header className="mb-2 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{p.titleAr}</h2>
                <p className="text-xs text-slate-500">
                  الرمز: {p.code} · الإصدار {p.version}
                </p>
              </div>
              {p.acknowledged ? (
                <span className="rounded bg-emerald-100 px-3 py-1 text-xs text-emerald-800">
                  ✓ تم الإقرار
                </span>
              ) : (
                <button
                  className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white disabled:opacity-50"
                  onClick={() => acknowledge(p)}
                  disabled={busy === p.id}
                >
                  {busy === p.id ? '...' : 'أقرّ بالاطلاع'}
                </button>
              )}
            </header>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">
              {p.bodyMd}
            </pre>
          </article>
        ))}
      </div>
    </div>
  );
}
