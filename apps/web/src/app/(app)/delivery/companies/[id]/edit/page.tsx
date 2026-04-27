'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

type Detail = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  contactPerson: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  commissionPct: string;
  flatFeePerOrderIqd: string;
  supportsCod: boolean;
  codHoldingDays: number;
  isActive: boolean;
  notes: string | null;
};

export default function EditDeliveryCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Detail>>({});

  const { data: company, isLoading } = useQuery({
    queryKey: ['delivery-company', id],
    queryFn: () => api<Detail>(`/delivery/companies/${id}`),
  });

  useEffect(() => {
    if (company) {
      setForm({
        nameAr: company.nameAr,
        nameEn: company.nameEn ?? '',
        contactPerson: company.contactPerson ?? '',
        phone: company.phone ?? '',
        whatsapp: company.whatsapp ?? '',
        email: company.email ?? '',
        address: company.address ?? '',
        commissionPct: company.commissionPct,
        flatFeePerOrderIqd: company.flatFeePerOrderIqd,
        supportsCod: company.supportsCod,
        codHoldingDays: company.codHoldingDays,
        isActive: company.isActive,
        notes: company.notes ?? '',
      });
    }
  }, [company]);

  const update = useMutation({
    mutationFn: (body: Partial<Detail>) => api(`/delivery/companies/${id}`, { method: 'PUT', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delivery-company', id] });
      qc.invalidateQueries({ queryKey: ['delivery-companies'] });
      router.push(`/delivery/companies/${id}`);
    },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.messageAr : 'فشل التحديث'),
  });

  if (isLoading || !company) return <div className="text-slate-500">جاري التحميل...</div>;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    update.mutate(form);
  }

  function set<K extends keyof Detail>(k: K, v: Detail[K] | string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">تعديل: {company.nameAr}</h1>
        <Link href={`/delivery/companies/${id}`} className="text-slate-600 hover:text-slate-900 inline-flex items-center gap-1">
          <ArrowRight className="size-4" /> العودة
        </Link>
      </div>

      {error && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-800 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="الكود (لا يُعدَّل)">
            <input value={company.code} disabled className="w-full rounded-lg border-slate-300 bg-slate-50" />
          </Field>
          <Field label="الحالة">
            <select
              value={form.isActive ? 'active' : 'inactive'}
              onChange={(e) => set('isActive', e.target.value === 'active')}
              className="w-full rounded-lg border-slate-300"
            >
              <option value="active">نشط</option>
              <option value="inactive">موقوف</option>
            </select>
          </Field>
          <Field label="الاسم العربي *">
            <input
              value={form.nameAr ?? ''}
              onChange={(e) => set('nameAr', e.target.value)}
              className="w-full rounded-lg border-slate-300"
              required
            />
          </Field>
          <Field label="الاسم الإنجليزي">
            <input
              value={form.nameEn ?? ''}
              onChange={(e) => set('nameEn', e.target.value)}
              className="w-full rounded-lg border-slate-300"
            />
          </Field>
          <Field label="جهة الاتصال">
            <input
              value={form.contactPerson ?? ''}
              onChange={(e) => set('contactPerson', e.target.value)}
              className="w-full rounded-lg border-slate-300"
            />
          </Field>
          <Field label="الهاتف">
            <input
              value={form.phone ?? ''}
              onChange={(e) => set('phone', e.target.value)}
              className="w-full rounded-lg border-slate-300"
              dir="ltr"
            />
          </Field>
          <Field label="واتساب">
            <input
              value={form.whatsapp ?? ''}
              onChange={(e) => set('whatsapp', e.target.value)}
              className="w-full rounded-lg border-slate-300"
              dir="ltr"
            />
          </Field>
          <Field label="بريد إلكتروني">
            <input
              type="email"
              value={form.email ?? ''}
              onChange={(e) => set('email', e.target.value)}
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
              value={form.commissionPct ?? ''}
              onChange={(e) => set('commissionPct', e.target.value)}
              className="w-full rounded-lg border-slate-300"
            />
          </Field>
          <Field label="رسوم ثابتة لكل طلب (د.ع)">
            <input
              type="number"
              step="0.001"
              min="0"
              value={form.flatFeePerOrderIqd ?? ''}
              onChange={(e) => set('flatFeePerOrderIqd', e.target.value)}
              className="w-full rounded-lg border-slate-300"
            />
          </Field>
          <Field label="أيام الاحتفاظ بـ COD">
            <input
              type="number"
              min="0"
              value={form.codHoldingDays ?? 0}
              onChange={(e) => set('codHoldingDays', Number(e.target.value))}
              className="w-full rounded-lg border-slate-300"
            />
          </Field>
          <Field label="يدعم COD">
            <label className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                checked={form.supportsCod ?? true}
                onChange={(e) => set('supportsCod', e.target.checked)}
                className="size-4"
              />
              <span>نعم</span>
            </label>
          </Field>
        </div>

        <Field label="العنوان">
          <textarea
            value={form.address ?? ''}
            onChange={(e) => set('address', e.target.value)}
            className="w-full rounded-lg border-slate-300"
            rows={2}
          />
        </Field>
        <Field label="ملاحظات">
          <textarea
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
            className="w-full rounded-lg border-slate-300"
            rows={2}
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Link
            href={`/delivery/companies/${id}`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50"
          >
            إلغاء
          </Link>
          <button
            type="submit"
            disabled={update.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-white hover:bg-primary/90 disabled:opacity-60"
          >
            <Save className="size-4" /> {update.isPending ? 'جاري الحفظ...' : 'حفظ التعديلات'}
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
