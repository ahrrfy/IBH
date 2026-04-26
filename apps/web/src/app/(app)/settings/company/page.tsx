'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Building2, Save, Phone, MapPin, Image as ImageIcon } from 'lucide-react';

export default function CompanySettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['company'],
    queryFn: () => api<any>('/company'),
  });

  const [form, setForm] = useState({ nameAr: '', nameEn: '', phone: '', address: '', logoUrl: '' });
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setForm({
        nameAr:  data.nameAr  ?? '',
        nameEn:  data.nameEn  ?? '',
        phone:   data.phone   ?? '',
        address: data.address ?? '',
        logoUrl: data.logoUrl ?? '',
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: (payload: typeof form) => api<any>('/company', { method: 'PUT', body: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company'] });
      setSaved('تم الحفظ ✓');
      setTimeout(() => setSaved(null), 2500);
    },
    onError: (e: any) => setSaved('فشل الحفظ: ' + (e?.message ?? '')),
  });

  if (isLoading) return <div className="p-6 text-slate-500">جاري التحميل…</div>;
  if (error)     return <div className="p-6 text-rose-600">تعذَّر تحميل بيانات الشركة</div>;

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Building2 className="h-6 w-6 text-sky-700" />
          بيانات الشركة
        </h1>
        <p className="text-sm text-slate-500 mt-1">الاسم، الشعار، التواصل</p>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}
        className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="الاسم بالعربية" required>
            <input
              className="input"
              value={form.nameAr}
              onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
              required
            />
          </Field>
          <Field label="الاسم بالإنجليزية">
            <input
              className="input"
              value={form.nameEn}
              onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
            />
          </Field>
          <Field label="رقم الهاتف" icon={<Phone className="h-3.5 w-3.5" />}>
            <input
              className="input num-latin"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              dir="ltr"
            />
          </Field>
          <Field label="رابط الشعار" icon={<ImageIcon className="h-3.5 w-3.5" />}>
            <input
              className="input"
              value={form.logoUrl}
              onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              dir="ltr"
              placeholder="https://…"
            />
          </Field>
        </div>
        <Field label="العنوان" icon={<MapPin className="h-3.5 w-3.5" />}>
          <textarea
            className="input min-h-[80px]"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </Field>

        <div className="flex items-center justify-between pt-3 border-t">
          <span className={'text-sm ' + (saved?.startsWith('تم') ? 'text-emerald-600' : 'text-rose-600')}>{saved}</span>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            <Save className="h-4 w-4" />
            {save.isPending ? 'جاري الحفظ…' : 'حفظ التغييرات'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, icon, children }: { label: string; required?: boolean; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
        {icon}
        {label}
        {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}
