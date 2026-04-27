'use client';

/**
 * صفحة تعديل الحملة التسويقية.
 *
 * تُحمّل البيانات الحالية من GET /marketing/campaigns/:id ثم تُرسل التعديلات
 * عبر PATCH /marketing/campaigns/:id (يطابق ما يقبله campaigns.service.ts → update()).
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';

const CAMPAIGN_CHANNELS = ['whatsapp', 'sms', 'email', 'facebook', 'tiktok', 'instagram', 'in_store'] as const;
type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

const CHANNEL_OPTIONS: ReadonlyArray<{ value: CampaignChannel; labelAr: string }> = [
  { value: 'whatsapp', labelAr: 'واتساب' },
  { value: 'sms', labelAr: 'رسائل SMS' },
  { value: 'email', labelAr: 'بريد إلكتروني' },
  { value: 'facebook', labelAr: 'فيسبوك' },
  { value: 'tiktok', labelAr: 'تيك توك' },
  { value: 'instagram', labelAr: 'انستغرام' },
  { value: 'in_store', labelAr: 'داخل المتجر' },
];

const campaignUpdateSchema = z.object({
  name: z.string().trim().min(1, 'اسم الحملة مطلوب'),
  description: z.string().trim().optional(),
  channel: z.enum(CAMPAIGN_CHANNELS, { errorMap: () => ({ message: 'القناة مطلوبة' }) }),
  messageTemplate: z.string().trim().min(1, 'نص الرسالة مطلوب'),
  scheduledAt: z.string().trim().optional(),
  budgetIqd: z.number().nonnegative('الميزانية لا يمكن أن تكون سالبة').optional(),
  utmSource: z.string().trim().optional(),
  utmMedium: z.string().trim().optional(),
  utmCampaign: z.string().trim().optional(),
});

type CampaignUpdateInput = z.infer<typeof campaignUpdateSchema>;

interface CampaignDetail {
  id: string;
  name: string;
  description: string | null;
  channel: string;
  messageTemplate: string | null;
  scheduledAt: string | null;
  budgetIqd: string | number | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

interface FormState {
  name: string;
  description: string;
  channel: CampaignChannel | '';
  messageTemplate: string;
  scheduledAt: string;
  budgetIqd: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  channel: '',
  messageTemplate: '',
  scheduledAt: '',
  budgetIqd: '',
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
};

/**
 * Convert an ISO datetime string into the value format expected by an
 * <input type="datetime-local">: YYYY-MM-DDTHH:mm (no seconds, no timezone).
 */
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditCampaignPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    setLoadError(null);
    api<CampaignDetail>(`/marketing/campaigns/${id}`)
      .then((data) => {
        if (!active) return;
        setForm({
          name: data.name ?? '',
          description: data.description ?? '',
          channel: (CAMPAIGN_CHANNELS as readonly string[]).includes(data.channel)
            ? (data.channel as CampaignChannel)
            : '',
          messageTemplate: data.messageTemplate ?? '',
          scheduledAt: toDatetimeLocal(data.scheduledAt),
          budgetIqd:
            data.budgetIqd === null || data.budgetIqd === undefined ? '' : String(data.budgetIqd),
          utmSource: data.utmSource ?? '',
          utmMedium: data.utmMedium ?? '',
          utmCampaign: data.utmCampaign ?? '',
        });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(err instanceof ApiError ? err.messageAr : 'تعذَّر تحميل الحملة');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setSubmitError(null);
    setFieldErrors({});

    const candidate = {
      name: form.name,
      description: form.description || undefined,
      channel: form.channel === '' ? undefined : form.channel,
      messageTemplate: form.messageTemplate,
      scheduledAt: form.scheduledAt || undefined,
      budgetIqd: form.budgetIqd ? Number(form.budgetIqd) : undefined,
      utmSource: form.utmSource || undefined,
      utmMedium: form.utmMedium || undefined,
      utmCampaign: form.utmCampaign || undefined,
    };

    const parsed = campaignUpdateSchema.safeParse(candidate);
    if (!parsed.success) {
      const errs: Partial<Record<keyof FormState, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState | undefined;
        if (key && !errs[key]) errs[key] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    setBusy(true);
    try {
      const payload: CampaignUpdateInput = parsed.data;
      await api(`/marketing/campaigns/${id}`, { method: 'PATCH', body: payload });
      router.push(`/marketing/campaigns/${id}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.messageAr : 'تعذَّر حفظ التعديلات');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  }
  if (loadError) {
    return (
      <div className="space-y-4 p-6">
        <div className="rounded bg-rose-50 p-3 text-rose-700" role="alert">
          {loadError}
        </div>
        <Link href="/marketing/campaigns" className="text-sm text-sky-700 hover:underline">
          ← العودة للقائمة
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <Link href={`/marketing/campaigns/${id}`} className="text-sm text-sky-700 hover:underline">
          ← العودة لتفاصيل الحملة
        </Link>
        <h1 className="mt-2 text-3xl font-bold">تعديل حملة</h1>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <section className="grid gap-3 rounded-lg bg-white p-4 shadow-sm md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="text-sm text-slate-500">
              اسم الحملة <span className="text-rose-600">*</span>
            </span>
            <input
              type="text"
              className="mt-1 w-full rounded border px-3 py-2"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              aria-invalid={!!fieldErrors.name}
              required
            />
            {fieldErrors.name && <span className="mt-1 block text-xs text-rose-600">{fieldErrors.name}</span>}
          </label>

          <label className="block">
            <span className="text-sm text-slate-500">
              القناة <span className="text-rose-600">*</span>
            </span>
            <select
              className="mt-1 w-full rounded border px-3 py-2"
              value={form.channel}
              onChange={(e) => setField('channel', e.target.value as CampaignChannel | '')}
              aria-invalid={!!fieldErrors.channel}
              required
            >
              <option value="">—</option>
              {CHANNEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.labelAr}
                </option>
              ))}
            </select>
            {fieldErrors.channel && <span className="mt-1 block text-xs text-rose-600">{fieldErrors.channel}</span>}
          </label>

          <label className="block">
            <span className="text-sm text-slate-500">تاريخ الجدولة</span>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded border px-3 py-2"
              value={form.scheduledAt}
              onChange={(e) => setField('scheduledAt', e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-sm text-slate-500">الميزانية (د.ع)</span>
            <input
              type="number"
              min={0}
              step="1000"
              className="mt-1 w-full rounded border px-3 py-2"
              value={form.budgetIqd}
              onChange={(e) => setField('budgetIqd', e.target.value)}
              aria-invalid={!!fieldErrors.budgetIqd}
            />
            {fieldErrors.budgetIqd && (
              <span className="mt-1 block text-xs text-rose-600">{fieldErrors.budgetIqd}</span>
            )}
          </label>

          <label className="block md:col-span-2">
            <span className="text-sm text-slate-500">الوصف</span>
            <textarea
              className="mt-1 w-full rounded border px-3 py-2"
              rows={2}
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
            />
          </label>

          <label className="block md:col-span-2">
            <span className="text-sm text-slate-500">
              نص الرسالة <span className="text-rose-600">*</span>
            </span>
            <textarea
              className="mt-1 w-full rounded border px-3 py-2"
              rows={4}
              value={form.messageTemplate}
              onChange={(e) => setField('messageTemplate', e.target.value)}
              aria-invalid={!!fieldErrors.messageTemplate}
              required
            />
            {fieldErrors.messageTemplate && (
              <span className="mt-1 block text-xs text-rose-600">{fieldErrors.messageTemplate}</span>
            )}
          </label>

          <label className="block">
            <span className="text-sm text-slate-500">UTM Source</span>
            <input
              type="text"
              className="mt-1 w-full rounded border px-3 py-2"
              value={form.utmSource}
              onChange={(e) => setField('utmSource', e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-sm text-slate-500">UTM Medium</span>
            <input
              type="text"
              className="mt-1 w-full rounded border px-3 py-2"
              value={form.utmMedium}
              onChange={(e) => setField('utmMedium', e.target.value)}
            />
          </label>

          <label className="block md:col-span-2">
            <span className="text-sm text-slate-500">UTM Campaign</span>
            <input
              type="text"
              className="mt-1 w-full rounded border px-3 py-2"
              value={form.utmCampaign}
              onChange={(e) => setField('utmCampaign', e.target.value)}
            />
          </label>
        </section>

        {submitError && (
          <div className="rounded bg-rose-50 p-3 text-rose-700" role="alert">
            {submitError}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Link href={`/marketing/campaigns/${id}`} className="rounded border px-4 py-2">
            إلغاء
          </Link>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50"
          >
            {busy ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}
          </button>
        </div>
      </form>
    </div>
  );
}
