'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Save, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

export default function NewDeliveryCompanyPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    nameAr: '',
    nameEn: '',
    type: 'external' as 'internal' | 'external',
    contactPerson: '',
    phone: '',
    whatsapp: '',
    email: '',
    address: '',
    commissionPct: '0',
    flatFeePerOrderIqd: '0',
    supportsCod: true,
    codHoldingDays: 7,
    notes: '',
  });

  const create = useMutation({
    mutationFn: (body: typeof form) => api<{ id: string }>('/delivery/companies', { method: 'POST', body }),
    onSuccess: (r) => router.push(`/delivery/companies/${r.id}`),
    onError: (e: unknown) => {
      const msg = e instanceof ApiError ? e.messageAr : 'فشل الإنشاء';
      setError(msg);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.code || !form.nameAr) {
      setError('الكود والاسم العربي مطلوبان');
      return;
    }
    create.mutate(form);
  }

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">شركة توصيل جديدة</h1>
        <Link href="/delivery/companies" className="text-slate-600 hover:text-slate-900 inline-flex items-center gap-1">
          <ArrowRight className="size-4" /> العودة للقائمة
        </Link>
      </div>

      {error && (
        <div role="alert" aria-live="assertive" className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-800 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="الكود *">
            <input
              value={form.code}
              onChange={(e) => update('code', e.target.value)}
              className="w-full rounded-lg border-slate-300"
              placeholder="POSTA"
              required
            />
          </Field>
          <Field label="النوع">
            <select
              value={form.type}
              onChange={(e) => update('type', e.target.value as 'internal' | 'external')}
              className="w-full rounded-lg border-slate-300"
            >
              <option value="external">خارجي (3rd-party)</option>
              <option value="internal">داخلي (سائق تابع)</option>
            </select>
          </Field>
          <Field label="الاسم العربي *">
            <input
              value={form.nameAr}
              onChange={(e) => update('nameAr', e.target.value)}
              className="w-full rounded-lg border-slate-300"
              required
            />
          </Field>
          <Field label="الاسم الإنجليزي">
            <input
              value={form.nameEn}
              onChange={(e) => update('nameEn', e.target.value)}
              className="w-full rounded-lg border-slate-300"
            />
          </Field>
          <Field label="جهة الاتصال">
            <input
              value={form.contactPerson}
              onChange={(e) => update('contactPerson', e.target.value)}
              className="w-full rounded-lg border-slate-300"
            />
          </Field>
          <Field label="الهاتف">
            <input
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              className="w-full rounded-lg border-slate-300"
              dir="ltr"
            />
          </Field>
          <Field label="واتساب">
            <input
              value={form.whatsapp}
              onChange={(e) => update('whatsapp', e.target.value)}
              className="w-full rounded-lg border-slate-300"
              dir="ltr"
            />
          </Field>
          <Field label="بريد إلكتروني">
            <input
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              className="w-full rounded-lg border-slate-300"
              dir="ltr"
            />
          </Field>
          <Field label="نسبة العمولة %">
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={form.commissionPct}
              onChange={(e) => update('commissionPct', e.target.value)}
              className="w-full rounded-lg border-slate-300"
            />
          </Field>
          <Field label="رسوم ثابتة لكل طلب (د.ع)">
            <input
              type="number"
              step="0.001"
              min="0"
              value={form.flatFeePerOrderIqd}
              onChange={(e) => update('flatFeePerOrderIqd', e.target.value)}
              className="w-full rounded-lg border-slate-300"
            />
          </Field>
          <Field label="أيام الاحتفاظ بـ COD">
            <input
              type="number"
              min="0"
              value={form.codHoldingDays}
              onChange={(e) => update('codHoldingDays', Number(e.target.value))}
              className="w-full rounded-lg border-slate-300"
            />
          </Field>
          <Field label="يدعم التحصيل عند التسليم">
            <label className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                checked={form.supportsCod}
                onChange={(e) => update('supportsCod', e.target.checked)}
                className="size-4"
              />
              <span>نعم</span>
            </label>
          </Field>
        </div>

        <Field label="العنوان">
          <textarea
            value={form.address}
            onChange={(e) => update('address', e.target.value)}
            className="w-full rounded-lg border-slate-300"
            rows={2}
          />
        </Field>

        <Field label="ملاحظات">
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            className="w-full rounded-lg border-slate-300"
            rows={2}
          />
        </Field>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={create.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-white hover:bg-primary/90 disabled:opacity-60"
          >
            <Save className="size-4" /> {create.isPending ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-slate-700 mb-1">{label}</div>
      {children}
    </label>
  );
}
