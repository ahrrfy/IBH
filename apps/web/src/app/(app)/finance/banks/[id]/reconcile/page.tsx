'use client';

import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';
import {
  ScanLine, ArrowRight, Plus, CheckCircle2, Save, Link as LinkIcon, Unlink,
} from 'lucide-react';

export default function ReconcileWorkspacePage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const bankId = params?.id;
  const recoId = search?.get('recoId') ?? null;

  const bankQ = useQuery({
    queryKey: ['bank-account', bankId],
    queryFn: () => api<any>(`/finance/banks/${bankId}`),
    enabled: Boolean(bankId),
  });

  const recoListQ = useQuery({
    queryKey: ['reconciliations', bankId],
    queryFn: () =>
      api<any[]>(`/finance/banks/reconciliation?bankAccountId=${bankId}`),
    enabled: Boolean(bankId),
  });

  if (bankQ.isLoading) {
    return <div className="p-6 text-sm text-slate-500">جاري التحميل…</div>;
  }
  if (bankQ.error || !bankQ.data) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-sm text-rose-600">تعذَّر تحميل بيانات الحساب</p>
        <Link href="/finance/banks" className="btn-ghost btn-sm inline-flex">
          <ArrowRight className="h-4 w-4" />
          العودة للقائمة
        </Link>
      </div>
    );
  }

  const bank = bankQ.data;
  const recoList: any[] = recoListQ.data ?? [];

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ScanLine className="h-6 w-6 text-sky-700" />
            مطابقة بنكية
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            <span className="font-semibold">{bank.nameAr ?? bank.name}</span>
            {bank.bankName && <> · {bank.bankName}</>}
            {bank.accountNumber && <span className="font-mono num-latin"> · {bank.accountNumber}</span>}
          </p>
        </div>
        <Link href="/finance/banks" className="btn-ghost btn-sm">
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Link>
      </header>

      {!recoId ? (
        <RecoLanding bankId={bankId!} recoList={recoList} onPicked={(id) => router.push(`?recoId=${id}`)} />
      ) : (
        <ReconciliationWorkspace
          recoId={recoId}
          onClose={() => router.push(`/finance/banks/${bankId}/reconcile`)}
        />
      )}
    </div>
  );
}

function RecoLanding({
  bankId,
  recoList,
  onPicked,
}: {
  bankId: string;
  recoList: any[];
  onPicked: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [statementDate, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [statementBalance, setBalance] = useState('');
  const [error, setError] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: () =>
      api<any>('/finance/banks/reconciliation/start', {
        method: 'POST',
        body: { bankAccountId: bankId, statementDate, statementBalance: Number(statementBalance) },
      }),
    onSuccess: (created: any) => {
      qc.invalidateQueries({ queryKey: ['reconciliations', bankId] });
      onPicked(created.id);
    },
    onError: (e: any) => setError(e?.messageAr ?? e?.message ?? 'تعذَّر بدء المطابقة'),
  });

  const inProgress = recoList.filter((r) => r.status === 'in_progress');
  const completed = recoList.filter((r) => r.status === 'completed');

  return (
    <>
      {inProgress.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">مطابقات جارية</h2>
          <div className="space-y-2">
            {inProgress.map((r) => (
              <button
                key={r.id}
                onClick={() => onPicked(r.id)}
                className="w-full text-right rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 p-3 transition flex items-center justify-between"
              >
                <div>
                  <div className="text-sm font-medium text-slate-900">
                    كشف {formatDate(r.statementDate)}
                  </div>
                  <div className="text-xs text-slate-500 num-latin font-mono">
                    رصيد الكشف: {Number(r.statementBalance ?? 0).toLocaleString()} د.ع
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">بدء مطابقة جديدة</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="تاريخ كشف الحساب" required>
            <input
              type="date"
              className="input num-latin"
              value={statementDate}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="رصيد الكشف (د.ع)" required>
            <input
              type="number"
              step="0.01"
              className="input num-latin text-end"
              value={statementBalance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </Field>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="text-end">
          <button
            onClick={() => {
              setError(null);
              start.mutate();
            }}
            disabled={!statementDate || !statementBalance || start.isPending}
            className="btn-primary btn-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            {start.isPending ? 'جاري البدء…' : 'بدء المطابقة'}
          </button>
        </div>
      </div>

      {completed.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">سجل المطابقات السابقة</h2>
          <div className="space-y-1">
            {completed.map((r) => (
              <Link
                key={r.id}
                href={`?recoId=${r.id}`}
                className="block rounded-lg border border-slate-200 hover:bg-slate-50 p-3 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm">{formatDate(r.statementDate)}</div>
                  <span className="text-xs text-slate-500 num-latin font-mono">
                    {Number(r.statementBalance ?? 0).toLocaleString()} د.ع
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function ReconciliationWorkspace({
  recoId,
  onClose,
}: {
  recoId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjForm, setAdjForm] = useState({
    description: '',
    amountIqd: '',
    direction: 'debit' as 'debit' | 'credit',
  });

  const recoQ = useQuery({
    queryKey: ['reconciliation', recoId],
    queryFn: () => api<any>(`/finance/banks/reconciliation/${recoId}`),
  });
  const discQ = useQuery({
    queryKey: ['reconciliation', recoId, 'disc'],
    queryFn: () => api<any>(`/finance/banks/reconciliation/${recoId}/discrepancy`),
  });

  const match = useMutation({
    mutationFn: (vars: { itemId: string; jeLineId: string | null }) =>
      api<any>(`/finance/banks/reconciliation/items/${vars.itemId}/match`, {
        method: 'POST',
        body: vars.jeLineId ? { journalEntryLineId: vars.jeLineId } : {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reconciliation', recoId] });
      qc.invalidateQueries({ queryKey: ['reconciliation', recoId, 'disc'] });
    },
    onError: (e: any) => setError(e?.messageAr ?? e?.message ?? 'تعذَّر التطابق'),
  });

  const unmatch = useMutation({
    mutationFn: (itemId: string) =>
      api<any>(`/finance/banks/reconciliation/items/${itemId}/unmatch`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reconciliation', recoId] });
      qc.invalidateQueries({ queryKey: ['reconciliation', recoId, 'disc'] });
    },
    onError: (e: any) => setError(e?.messageAr ?? e?.message ?? 'تعذَّر فك التطابق'),
  });

  const addAdj = useMutation({
    mutationFn: () =>
      api<any>('/finance/banks/reconciliation/adjustment', {
        method: 'POST',
        body: {
          reconciliationId: recoId,
          description: adjForm.description,
          amountIqd: Number(adjForm.amountIqd),
          direction: adjForm.direction,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reconciliation', recoId] });
      qc.invalidateQueries({ queryKey: ['reconciliation', recoId, 'disc'] });
      setAdjOpen(false);
      setAdjForm({ description: '', amountIqd: '', direction: 'debit' });
    },
    onError: (e: any) => setError(e?.messageAr ?? e?.message ?? 'تعذَّر إضافة التسوية'),
  });

  const complete = useMutation({
    mutationFn: () =>
      api<any>(`/finance/banks/reconciliation/${recoId}/complete`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reconciliation', recoId] });
      qc.invalidateQueries({ queryKey: ['reconciliations'] });
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
    },
    onError: (e: any) => setError(e?.messageAr ?? e?.message ?? 'تعذَّر الإكمال'),
  });

  if (recoQ.isLoading) {
    return <div className="text-sm text-slate-500">جاري التحميل…</div>;
  }
  if (recoQ.error || !recoQ.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-600">تعذَّر تحميل المطابقة</p>
        <button onClick={onClose} className="btn-ghost btn-sm">العودة</button>
      </div>
    );
  }

  const reco = recoQ.data;
  const disc = discQ.data;
  const items: any[] = reco.items ?? [];
  const isCompleted = reco.status === 'completed';
  const canComplete = !isCompleted && disc && Number(disc.discrepancy ?? 0) === 0;

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            كشف {formatDate(reco.statementDate)}
            <StatusBadge status={reco.status} />
          </h2>
          <p className="text-xs text-slate-500 num-latin font-mono">
            رصيد الكشف: {Number(reco.statementBalance ?? 0).toLocaleString()} د.ع
          </p>
        </div>
        <button onClick={onClose} className="btn-ghost btn-sm">
          <ArrowRight className="h-4 w-4" />
          مطابقة أخرى
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {disc && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="رصيد الدفاتر" value={Number(disc.bookBalance ?? 0).toLocaleString()} />
          <Stat label="رصيد الكشف"   value={Number(disc.statementBalance ?? 0).toLocaleString()} />
          <Stat label="مطابق"         value={<span className="num-latin">{disc.matchedCount ?? 0}</span>} />
          <Stat
            label="الفرق"
            value={
              <span className={Number(disc.discrepancy ?? 0) === 0 ? 'text-emerald-700' : 'text-rose-700'}>
                {Number(disc.discrepancy ?? 0).toLocaleString()}
              </span>
            }
          />
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">البنود ({items.length})</h3>
          {!isCompleted && (
            <button onClick={() => setAdjOpen((v) => !v)} className="btn-ghost btn-sm">
              <Plus className="h-3 w-3" />
              تسوية
            </button>
          )}
        </div>

        {adjOpen && !isCompleted && (
          <div className="p-4 border-b border-slate-100 bg-amber-50/40 grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="وصف">
              <input
                className="input"
                value={adjForm.description}
                onChange={(e) => setAdjForm({ ...adjForm, description: e.target.value })}
              />
            </Field>
            <Field label="المبلغ (د.ع)">
              <input
                type="number"
                step="0.01"
                className="input num-latin text-end"
                value={adjForm.amountIqd}
                onChange={(e) => setAdjForm({ ...adjForm, amountIqd: e.target.value })}
              />
            </Field>
            <Field label="الجانب">
              <select
                className="input"
                value={adjForm.direction}
                onChange={(e) => setAdjForm({ ...adjForm, direction: e.target.value as any })}
              >
                <option value="debit">مدين</option>
                <option value="credit">دائن</option>
              </select>
            </Field>
            <div className="md:col-span-3 text-end">
              <button
                onClick={() => {
                  setError(null);
                  addAdj.mutate();
                }}
                disabled={!adjForm.description || !adjForm.amountIqd || addAdj.isPending}
                className="btn-primary btn-sm"
              >
                <Save className="h-3.5 w-3.5" />
                {addAdj.isPending ? 'جاري الحفظ…' : 'حفظ التسوية'}
              </button>
            </div>
          </div>
        )}

        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="text-right px-4 py-2 font-medium">الوصف</th>
              <th className="text-end px-4 py-2 font-medium">مدين</th>
              <th className="text-end px-4 py-2 font-medium">دائن</th>
              <th className="text-center px-4 py-2 font-medium">مطابق</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it: any) => {
              const debit = it.side === 'debit' ? Number(it.amountIqd ?? 0) : 0;
              const credit = it.side === 'credit' ? Number(it.amountIqd ?? 0) : 0;
              return (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <div className="text-sm text-slate-900">{it.description ?? '—'}</div>
                    {it.journalEntryLineId && (
                      <div className="text-[10px] text-slate-400 font-mono num-latin">
                        JE-Line: {it.journalEntryLineId.slice(0, 8)}…
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-end num-latin font-mono">
                    {debit ? debit.toLocaleString() : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-end num-latin font-mono">
                    {credit ? credit.toLocaleString() : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {it.matched ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        نعم
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">لا</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {!isCompleted && (
                      <button
                        onClick={() => {
                          setError(null);
                          if (it.matched) unmatch.mutate(it.id);
                          else match.mutate({ itemId: it.id, jeLineId: it.journalEntryLineId });
                        }}
                        className={it.matched ? 'btn-ghost btn-sm text-rose-600' : 'btn-ghost btn-sm text-sky-700'}
                      >
                        {it.matched ? <Unlink className="h-3 w-3" /> : <LinkIcon className="h-3 w-3" />}
                        {it.matched ? 'فك' : 'تطابق'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center px-4 py-6 text-sm text-slate-400">
                  لا توجد بنود — كل الحركات مطابقة سابقاً
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!isCompleted && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {canComplete
              ? 'الفرق صفر — يمكن إكمال المطابقة الآن'
              : 'يجب أن يكون الفرق صفراً قبل الإكمال (طابق العناصر أو أضف تسوية)'}
          </p>
          <button
            onClick={() => {
              setError(null);
              complete.mutate();
            }}
            disabled={!canComplete || complete.isPending}
            className="btn-primary btn-sm"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {complete.isPending ? 'جاري الإكمال…' : 'إكمال المطابقة'}
          </button>
        </div>
      )}

      {isCompleted && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          المطابقة مكتملة — لا يمكن تعديلها
        </div>
      )}
    </>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-slate-500 mb-1">{label}</div>
      <div className="text-sm font-semibold text-slate-900 num-latin font-mono">{value}</div>
    </div>
  );
}
