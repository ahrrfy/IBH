'use client';

/**
 * صفحة تفاصيل الحملة التسويقية.
 *
 * تعرض بيانات الحملة من GET /marketing/campaigns/:id بشكل قراءة فقط،
 * مع زر تعديل (إذا كانت الحالة تسمح به) وحساب حجم الجمهور.
 */

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

interface CampaignDetail {
  id: string;
  name: string;
  description: string | null;
  channel: string;
  status: string;
  audienceSize: number | null;
  audienceCriteria: unknown;
  messageTemplate: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  budgetIqd: string | number | null;
  spentIqd: string | number | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'واتساب',
  sms: 'رسائل SMS',
  email: 'بريد إلكتروني',
  facebook: 'فيسبوك',
  tiktok: 'تيك توك',
  instagram: 'انستغرام',
  in_store: 'داخل المتجر',
};

// Statuses where editing is still allowed (mirrors campaigns.service.ts → update()).
const EDITABLE_STATUSES = new Set(['draft', 'scheduled', 'paused']);

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api<CampaignDetail>(`/marketing/campaigns/${id}`),
    enabled: !!id,
  });

  async function handleCalculateAudience(): Promise<void> {
    if (!id) return;
    setActionError(null);
    setBusy(true);
    try {
      await api(`/marketing/campaigns/${id}/calculate-audience`, { method: 'POST' });
      await refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.messageAr : 'تعذَّر حساب الجمهور');
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  if (error || !data) {
    return (
      <div className="space-y-4 p-6">
        <div className="rounded bg-rose-50 p-3 text-rose-700" role="alert">
          {error instanceof ApiError ? error.messageAr : 'تعذَّر تحميل الحملة'}
        </div>
        <Link href="/marketing/campaigns" className="text-sm text-sky-700 hover:underline">
          ← العودة للقائمة
        </Link>
      </div>
    );
  }

  const canEdit = EDITABLE_STATUSES.has(data.status);
  const channelLabel = CHANNEL_LABELS[data.channel] ?? data.channel;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link href="/marketing/campaigns" className="text-sm text-sky-700 hover:underline">
            ← العودة للقائمة
          </Link>
          <h1 className="mt-2 flex items-center gap-3 text-3xl font-bold">
            <span>{data.name}</span>
            <StatusBadge status={data.status} />
          </h1>
          <p className="text-sm text-slate-500">{channelLabel}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCalculateAudience}
            disabled={busy}
            className="rounded border px-4 py-2 text-sm text-sky-700 hover:bg-sky-50 disabled:opacity-50"
          >
            {busy ? 'جارٍ الحساب…' : 'حساب الجمهور'}
          </button>
          {canEdit && (
            <Link
              href={`/marketing/campaigns/${id}/edit`}
              className="rounded border px-4 py-2 text-sm text-sky-700 hover:bg-sky-50"
            >
              تعديل
            </Link>
          )}
        </div>
      </header>

      {actionError && (
        <div className="rounded bg-rose-50 p-3 text-rose-700" role="alert">
          {actionError}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">المعلومات الأساسية</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">القناة</dt>
            <dd>{channelLabel}</dd>
            <dt className="text-slate-500">الحالة</dt>
            <dd><StatusBadge status={data.status} /></dd>
            <dt className="text-slate-500">حجم الجمهور</dt>
            <dd>{data.audienceSize ?? 0}</dd>
            <dt className="text-slate-500">الميزانية</dt>
            <dd>{formatIqd(data.budgetIqd ?? 0)}</dd>
            <dt className="text-slate-500">المنفق</dt>
            <dd>{formatIqd(data.spentIqd ?? 0)}</dd>
          </dl>
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">المواعيد</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">مجدولة في</dt>
            <dd>{data.scheduledAt ? formatDate(data.scheduledAt, true) : '—'}</dd>
            <dt className="text-slate-500">بدأت في</dt>
            <dd>{data.startedAt ? formatDate(data.startedAt, true) : '—'}</dd>
            <dt className="text-slate-500">انتهت في</dt>
            <dd>{data.completedAt ? formatDate(data.completedAt, true) : '—'}</dd>
          </dl>
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm md:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">الوصف</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{data.description || '—'}</p>
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm md:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">نص الرسالة</h2>
          <p className="whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm text-slate-700">
            {data.messageTemplate || '—'}
          </p>
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm md:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">معاملات UTM</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">UTM Source</dt>
            <dd>{data.utmSource || '—'}</dd>
            <dt className="text-slate-500">UTM Medium</dt>
            <dd>{data.utmMedium || '—'}</dd>
            <dt className="text-slate-500">UTM Campaign</dt>
            <dd>{data.utmCampaign || '—'}</dd>
          </dl>
        </div>
      </section>
    </div>
  );
}
