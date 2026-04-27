'use client';

/**
 * صفحة إنشاء حملة تسويقية جديدة.
 *
 * تستخدم Zod للتحقق من المدخلات قبل إرسالها لـ POST /marketing/campaigns.
 * في حال النجاح، يتم التوجيه إلى صفحة تفاصيل الحملة.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';

// Channels supported by the backend (Prisma enum CampaignChannel).
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

// Zod schema — must mirror what the backend accepts (see campaigns.service.ts → create()).
const campaignCreateSchema = z.object({
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

type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;

interface CreatedCampaign {
  id: string;
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

const INITIAL_FORM: FormState = {
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

export default function NewCampaignPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

    // Build a typed candidate; pass undefined for empty optional fields so Zod
    // can ignore them rather than complain about empty strings.
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

    const parsed = campaignCreateSchema.safeParse(candidate);
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
      const payload: CampaignCreateInput = parsed.data;
      const created = await api<CreatedCampaign>('/marketing/campaigns', {
        method: 'POST',
        body: payload,
      });
      router.push(`/marketing/campaigns/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.messageAr);
      } else {
        setSubmitError('تعذَّر إنشاء الحملة');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <Link href="/marketing/campaigns" className="text-sm text-sky-700 hover:underline">
          ← الحملات التسويقية
        </Link>
        <h1 className="mt-2 text-3xl font-bold">حملة جديدة</h1>
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
          <Link href="/marketing/campaigns" className="rounded border px-4 py-2">
            إلغاء
          </Link>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50"
          >
            {busy ? 'جارٍ الحفظ…' : 'حفظ'}
          </button>
        </div>
      </form>
    </div>
  );
}
