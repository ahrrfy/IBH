'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import {
  ScrollText, ShieldCheck, ShieldAlert, ShieldQuestion,
  Filter, RefreshCw, ArrowRight,
} from 'lucide-react';

interface AuditEntry {
  id: string;
  occurredAt: string;
  userId: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  changedFields: any;
  ipAddress: string | null;
  reason: string | null;
  hash: string;
  previousHash: string;
}

export default function AuditLogPage() {
  const { user } = useAuth();
  const isOwner = Boolean((user as any)?.isSystemOwner);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [userId, setUserId] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ from: '', to: '', action: '', entityType: '', userId: '' });

  const qs = new URLSearchParams();
  if (appliedFilters.from)       qs.set('from', appliedFilters.from);
  if (appliedFilters.to)         qs.set('to',   appliedFilters.to);
  if (appliedFilters.action)     qs.set('action', appliedFilters.action);
  if (appliedFilters.entityType) qs.set('entityType', appliedFilters.entityType);
  if (appliedFilters.userId)     qs.set('userId', appliedFilters.userId);
  qs.set('limit', '100');

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['audit-logs', appliedFilters],
    queryFn: () => api<{ items: AuditEntry[]; nextCursor: string | null; hasMore: boolean }>(`/audit-logs?${qs.toString()}`),
  });

  const [chainState, setChainState] = useState<'idle' | 'checking' | 'intact' | 'tampered' | 'error'>('idle');
  const [chainMsg, setChainMsg] = useState<string | null>(null);

  async function verifyChain() {
    setChainState('checking');
    setChainMsg(null);
    try {
      const res = await api<{ intact: boolean; checked: number }>('/audit-logs/verify-chain?limit=1000');
      setChainState(res.intact ? 'intact' : 'tampered');
      setChainMsg(res.intact
        ? `سلسلة الـ hash سليمة (آخر ${res.checked} قيد).`
        : `🚨 تم اكتشاف تلاعب في سلسلة الـ hash (فحص ${res.checked} قيد).`);
    } catch (e: any) {
      setChainState('error');
      setChainMsg(e?.message ?? 'فشل التحقق');
    }
  }

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setAppliedFilters({ from, to, action, entityType, userId });
  }

  function resetFilters() {
    setFrom(''); setTo(''); setAction(''); setEntityType(''); setUserId('');
    setAppliedFilters({ from: '', to: '', action: '', entityType: '', userId: '' });
  }

  if (!isOwner) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            سجل التدقيق متاح فقط لمالك النظام. اطلب من المالك مراجعة الأحداث.
          </div>
        </div>
        <Link href="/settings" className="mt-3 inline-flex items-center gap-1 text-sm text-sky-700 hover:underline">
          <ArrowRight className="h-4 w-4" />
          العودة للإعدادات
        </Link>
      </div>
    );
  }

  const items = data?.items ?? [];

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-sky-700" />
            سجل التدقيق
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {items.length} حدث {data?.hasMore ? '(أحدث ١٠٠ — ضيِّق الفلاتر للمزيد)' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-ghost text-sm gap-1"
            title="إعادة التحميل"
          >
            <RefreshCw className={'h-3.5 w-3.5 ' + (isFetching ? 'animate-spin' : '')} />
            تحديث
          </button>
          <button
            type="button"
            onClick={verifyChain}
            disabled={chainState === 'checking'}
            className="btn-primary btn-sm gap-1"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {chainState === 'checking' ? 'جاري الفحص…' : 'تحقق من سلسلة الـ hash'}
          </button>
        </div>
      </header>

      {chainMsg && (
        <div
          className={
            'rounded-md border px-3 py-2 text-sm flex items-start gap-2 ' +
            (chainState === 'intact'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : chainState === 'tampered'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-slate-200 bg-slate-50 text-slate-700')
          }
        >
          {chainState === 'intact'   && <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />}
          {chainState === 'tampered' && <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />}
          {chainState !== 'intact' && chainState !== 'tampered' && <ShieldQuestion className="h-4 w-4 mt-0.5 shrink-0" />}
          <span>{chainMsg}</span>
        </div>
      )}

      <form onSubmit={applyFilters} className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        <Field label="من تاريخ">
          <input type="datetime-local" className="input num-latin" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" />
        </Field>
        <Field label="إلى تاريخ">
          <input type="datetime-local" className="input num-latin" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" />
        </Field>
        <Field label="العملية" help="مثال: login أو sales">
          <input className="input num-latin" value={action} onChange={(e) => setAction(e.target.value)} dir="ltr" placeholder="login, sales..." />
        </Field>
        <Field label="نوع الكيان" help="مثال: User, SalesInvoice">
          <input className="input num-latin" value={entityType} onChange={(e) => setEntityType(e.target.value)} dir="ltr" placeholder="User, SalesInvoice..." />
        </Field>
        <Field label="معرّف المستخدم (ULID)">
          <input className="input num-latin" value={userId} onChange={(e) => setUserId(e.target.value)} dir="ltr" />
        </Field>
        <div className="col-span-2 md:col-span-5 flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={resetFilters} className="btn-ghost text-sm">إعادة تعيين</button>
          <button type="submit" className="btn-primary btn-sm gap-1">
            <Filter className="h-3.5 w-3.5" />
            تطبيق
          </button>
        </div>
      </form>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          تعذَّر تحميل السجل
        </div>
      ) : isLoading ? (
        <div className="text-slate-500 text-sm">جارٍ التحميل…</div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-white px-4 py-8 text-center text-slate-500">
          لا توجد أحداث مطابقة للفلاتر
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-start px-3 py-2 font-medium">الوقت</th>
                <th className="text-start px-3 py-2 font-medium">المستخدم</th>
                <th className="text-start px-3 py-2 font-medium">العملية</th>
                <th className="text-start px-3 py-2 font-medium">الكيان</th>
                <th className="text-start px-3 py-2 font-medium">المعرّف</th>
                <th className="text-start px-3 py-2 font-medium">السبب / IP</th>
                <th className="text-start px-3 py-2 font-medium">Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 num-latin font-mono text-xs whitespace-nowrap">
                    {formatDate(row.occurredAt, true)}
                  </td>
                  <td className="px-3 py-2 num-latin text-xs">{row.userEmail}</td>
                  <td className="px-3 py-2"><ActionBadge action={row.action} /></td>
                  <td className="px-3 py-2">{row.entityType}</td>
                  <td className="px-3 py-2 num-latin font-mono text-[10px] text-slate-500">
                    {row.entityId || '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {row.reason && <div>{row.reason}</div>}
                    {row.ipAddress && <div className="num-latin font-mono text-[10px] text-slate-400">{row.ipAddress}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <HashBadge hash={row.hash} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  // Color by suffix verb: create=emerald, update=amber, delete/reverse=rose, login=sky
  const color =
    /create$/.test(action)             ? 'bg-emerald-100 text-emerald-800' :
    /update$/.test(action)             ? 'bg-amber-100 text-amber-800' :
    /(delete|reverse|reject)$/.test(action) ? 'bg-rose-100 text-rose-800' :
    /login|auth/.test(action)          ? 'bg-sky-100 text-sky-800' :
    /(approve|post|submit)$/.test(action) ? 'bg-violet-100 text-violet-800' :
    'bg-slate-100 text-slate-700';
  return (
    <span className={'inline-block rounded px-2 py-0.5 text-xs font-mono num-latin ' + color}>
      {action}
    </span>
  );
}

function HashBadge({ hash }: { hash: string }) {
  // Show first/last 6 of the SHA-256 hex on hover-tooltip; chain integrity is
  // verified by the dedicated button at the top — per-row we just confirm
  // a hash exists.
  const short = hash ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : '—';
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-mono num-latin text-emerald-700"
      title={hash}
    >
      <ShieldCheck className="h-3 w-3" />
      {short}
    </span>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>
      {children}
      {help && <span className="mt-0.5 block text-[10px] text-slate-500">{help}</span>}
    </label>
  );
}
