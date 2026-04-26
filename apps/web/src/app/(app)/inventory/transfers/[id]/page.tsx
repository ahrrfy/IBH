'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';
import { ArrowLeftRight, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function TransferDetailPage() {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();
  const id = params?.id;
  const [error, setError] = useState<string | null>(null);

  const transferQ = useQuery({
    queryKey: ['transfers', id],
    queryFn: () => api<any>(`/inventory/transfers/${id}`),
    enabled: Boolean(id),
  });

  const approve = useMutation({
    mutationFn: () => api<any>(`/inventory/transfers/${id}/approve`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['transfers', id] });
    },
    onError: (e: any) => setError(e?.messageAr ?? e?.message ?? 'تعذَّر اعتماد التحويل'),
  });

  if (transferQ.isLoading) {
    return <div className="p-6 text-sm text-slate-500">جاري التحميل…</div>;
  }
  if (transferQ.error || !transferQ.data) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-sm text-rose-600">تعذَّر تحميل التحويل أو غير موجود</p>
        <Link href="/inventory/transfers" className="btn-ghost btn-sm inline-flex">
          <ArrowRight className="h-4 w-4" />
          العودة للقائمة
        </Link>
      </div>
    );
  }

  const t = transferQ.data;
  const isDraft = t.status === 'draft';

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 text-sky-700" />
            <span className="font-mono num-latin">{t.transferNumber}</span>
            <StatusBadge status={t.status ?? 'draft'} />
          </h1>
          <p className="text-sm text-slate-500 mt-1 num-latin">
            {formatDate(t.transferDate ?? t.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/inventory/transfers" className="btn-ghost btn-sm">
            <ArrowRight className="h-4 w-4" />
            رجوع
          </Link>
          {isDraft && (
            <button
              onClick={() => {
                setError(null);
                approve.mutate();
              }}
              disabled={approve.isPending}
              className="btn-primary btn-sm"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {approve.isPending ? 'جاري الاعتماد…' : 'اعتماد التحويل'}
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
        <Info
          label="من مستودع"
          value={
            <span>
              {t.fromWarehouse?.nameAr ?? '—'}{' '}
              <span className="font-mono num-latin text-xs text-slate-400">
                ({t.fromWarehouse?.code})
              </span>
            </span>
          }
        />
        <Info
          label="إلى مستودع"
          value={
            <span>
              {t.toWarehouse?.nameAr ?? '—'}{' '}
              <span className="font-mono num-latin text-xs text-slate-400">
                ({t.toWarehouse?.code})
              </span>
            </span>
          }
        />
        {t.notes && <Info label="ملاحظات" value={t.notes} fullWidth />}
        {t.approvedAt && (
          <Info
            label="اعتُمد في"
            value={<span className="font-mono num-latin text-xs">{formatDate(t.approvedAt)}</span>}
          />
        )}
        {t.receivedAt && (
          <Info
            label="استُلم في"
            value={<span className="font-mono num-latin text-xs">{formatDate(t.receivedAt)}</span>}
          />
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
          البنود ({t.lines?.length ?? 0})
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="text-right px-4 py-2 font-medium">معرّف الصنف</th>
              <th className="text-end px-4 py-2 font-medium">المطلوبة</th>
              <th className="text-end px-4 py-2 font-medium">المُستلمة</th>
            </tr>
          </thead>
          <tbody>
            {(t.lines ?? []).map((l: any) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-mono num-latin text-xs">{l.variantId}</td>
                <td className="px-4 py-2 text-end num-latin font-mono">{l.qtyRequested}</td>
                <td className="px-4 py-2 text-end num-latin font-mono">{l.qtyReceived}</td>
              </tr>
            ))}
            {(!t.lines || t.lines.length === 0) && (
              <tr>
                <td colSpan={3} className="text-center px-4 py-6 text-sm text-slate-400">
                  لا توجد بنود
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  fullWidth,
}: {
  label: string;
  value: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? 'md:col-span-2' : ''}>
      <div className="text-[11px] font-medium text-slate-500 mb-1">{label}</div>
      <div className="text-sm text-slate-900">{value}</div>
    </div>
  );
}
