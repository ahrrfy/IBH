'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatIqd } from '@/lib/format';

function firstOfYear() { return new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10); }
function today() { return new Date().toISOString().slice(0, 10); }

export default function EquityPage() {
  const [from, setFrom] = useState(firstOfYear());
  const [to, setTo] = useState(today());

  const { data, isLoading, error } = useQuery({
    queryKey: ['equity', from, to],
    queryFn: () => api<any>(`/finance/reports/equity?from=${from}&to=${to}`),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">قائمة التغير في حقوق الملكية</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <label>من: <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border px-3 py-1" /></label>
          <label>إلى: <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border px-3 py-1" /></label>
        </div>
      </header>

      {isLoading && <div className="text-slate-500">جارٍ التحميل…</div>}
      {error && <div className="rounded bg-rose-50 p-3 text-rose-700">تعذَّر التحميل</div>}

      {data && (
        <details className="rounded-lg bg-slate-50 p-4 text-xs" open>
          <summary className="cursor-pointer font-semibold text-slate-700">JSON</summary>
          <pre className="mt-2 overflow-x-auto">{JSON.stringify(data, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
