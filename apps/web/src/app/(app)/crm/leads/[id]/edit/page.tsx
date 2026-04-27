'use client';

/**
 * صفحة تعديل عميل محتمل.
 *
 * تُحمّل البيانات الحالية من GET /crm/leads/:id ثم تُرسل التعديلات
 * عبر PUT /crm/leads/:id (يطابق ما يقبله الـ backend في leads.service.ts → update()).
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';

// Backend update() accepts a Partial of these fields.
const leadUpdateSchema = z.object({
  nameAr: z.string().trim().min(1, 'اسم العميل المحتمل مطلوب'),
  phone: z.string().trim().optional(),
  email: z.string().trim().email('بريد إلكتروني غير صالح').optional().or(z.literal('')),
  source: z.string().trim().optional(),
  interest: z.string().trim().optional(),
  estimatedValueIqd: z.number().nonnegative('القيمة المتوقعة لا يمكن أن تكون سالبة').optional(),
});

type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;

interface LeadDetail {
  id: string;
  nameAr: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  interest: string | null;
  estimatedValueIqd: string | number | null;
}

const SOURCE_OPTIONS: ReadonlyArray<{ value: string; labelAr: string }> = [
  { value: '', labelAr: '—' },
  { value: 'walk_in', labelAr: 'زيارة مباشرة' },
  { value: 'phone', labelAr: 'هاتف' },
  { value: 'whatsapp', labelAr: 'واتساب' },
  { value: 'facebook', labelAr: 'فيسبوك' },
  { value: 'instagram', labelAr: 'انستغرام' },
  { value: 'referral', labelAr: 'إحالة' },
  { value: 'website', labelAr: 'الموقع' },
  { value: 'manual', labelAr: 'يدوي' },
];

interface FormState {
  nameAr: string;
  phone: string;
  email: string;
  source: string;
  interest: string;
  estimatedValueIqd: string;
}

const EMPTY_FORM: FormState = {
  nameAr: '',
  phone: '',
  email: '',
  source: '',
  interest: '',
  estimatedValueIqd: '',
};

export default function EditLeadPage() {
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
    api<LeadDetail>(`/crm/leads/${id}`)
      .then((data) => {
        if (!active) return;
        setForm({
          nameAr: data.nameAr ?? '',
          phone: data.phone ?? '',
          email: data.email ?? '',
          source: data.source ?? '',
          interest: data.interest ?? '',
          estimatedValueIqd:
            data.estimatedValueIqd === null || data.estimatedValueIqd === undefined
              ? ''
              : String(data.estimatedValueIqd),
        });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(err instanceof ApiError ? err.messageAr : 'تعذَّر تحميل العميل المحتمل');
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

    const candidate: LeadUpdateInput = {
      nameAr: form.nameAr,
      phone: form.phone || undefined,
      email: form.email || undefined,
      source: form.source || undefined,
      interest: form.interest || undefined,
      estimatedValueIqd: form.estimatedValueIqd ? Number(form.estimatedValueIqd) : undefined,
    };

    const parsed = leadUpdateSchema.safeParse(candidate);
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
      await api(`/crm/leads/${id}`, { method: 'PUT', body: parsed.data });
      router.push(`/crm/leads/${id}`);
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
        <Link href="/crm/leads" className="text-sm text-sky-700 hover:underline">
          ← العودة للقائمة
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <Link href={`/crm/leads/${id}`} className="text-sm text-sky-700 hover:underline">
          ← العودة لتفاصيل العميل المحتمل
        </Link>
        <h1 className="mt-2 text-3xl font-bold">تعديل عميل محتمل</h1>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <section className="grid gap-3 rounded-lg bg-white p-4 shadow-sm md:grid-cols-2">
          <label className="block">
            <span className="text-sm text-slate-500">
              الاسم <span className="text-rose-600">*</span>
            </span>
            <input
              type="text"
              className="mt-1 w-full rounded border px-3 py-2"
              value={form.nameAr}
              onChange={(e) => setField('nameAr', e.target.value)}
              aria-invalid={!!fieldErrors.nameAr}
              required
            />
            {fieldErrors.nameAr && <span className="mt-1 block text-xs text-rose-600">{fieldErrors.nameAr}</span>}
          </label>

          <label className="block">
            <span className="text-sm text-slate-500">الهاتف</span>
            <input
              type="tel"
              className="mt-1 w-full rounded border px-3 py-2"
              value={form.phone}
              onChange={(e) => setField('phone', e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-sm text-slate-500">البريد</span>
            <input
              type="email"
              className="mt-1 w-full rounded border px-3 py-2"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              aria-invalid={!!fieldErrors.email}
            />
            {fieldErrors.email && <span className="mt-1 block text-xs text-rose-600">{fieldErrors.email}</span>}
          </label>

          <label className="block">
            <span className="text-sm text-slate-500">المصدر</span>
            <select
              className="mt-1 w-full rounded border px-3 py-2"
              value={form.source}
              onChange={(e) => setField('source', e.target.value)}
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.labelAr}
                </option>
              ))}
              {/* If the current source is not in the predefined list, render it so we don't lose it. */}
              {form.source && !SOURCE_OPTIONS.some((o) => o.value === form.source) && (
                <option value={form.source}>{form.source}</option>
              )}
            </select>
          </label>

          <label className="block">
            <span className="text-sm text-slate-500">القيمة المتوقعة (د.ع)</span>
            <input
              type="number"
              min={0}
              step="1000"
              className="mt-1 w-full rounded border px-3 py-2"
              value={form.estimatedValueIqd}
              onChange={(e) => setField('estimatedValueIqd', e.target.value)}
              aria-invalid={!!fieldErrors.estimatedValueIqd}
            />
            {fieldErrors.estimatedValueIqd && (
              <span className="mt-1 block text-xs text-rose-600">{fieldErrors.estimatedValueIqd}</span>
            )}
          </label>

          <label className="block md:col-span-2">
            <span className="text-sm text-slate-500">الاهتمام</span>
            <textarea
              className="mt-1 w-full rounded border px-3 py-2"
              rows={3}
              value={form.interest}
              onChange={(e) => setField('interest', e.target.value)}
            />
          </label>
        </section>

        {submitError && (
          <div className="rounded bg-rose-50 p-3 text-rose-700" role="alert">
            {submitError}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Link href={`/crm/leads/${id}`} className="rounded border px-4 py-2">
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
