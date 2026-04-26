'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Building2, Save, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function NewBranchPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState({ code: '', nameAr: '', nameEn: '', phone: '', address: '' });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (payload: typeof form) => api<any>('/company/branches', { method: 'POST', body: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches'] });
      router.push('/settings/branches');
    },
    onError: (e: any) => setError(e?.message ?? 'فشل إنشاء الفرع'),
  });

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-sky-700" />
            فرع جديد
          </h1>
          <p className="text-sm text-slate-500 mt-1">أدخِل بيانات الفرع الأساسية</p>
        </div>
        <Link href="/settings/branches" className="text-sm text-slate-500 hover:text-sky-700 flex items-center gap-1">
          <ArrowRight className="h-4 w-4" />
          العودة لقائمة الفروع
        </Link>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); setError(null); create.mutate(form); }}
        className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="الكود" required help="رمز قصير فريد، 3-10 حروف لاتينية كبيرة (مثل BGD لبغداد)">
            <input
              className="input num-latin uppercase"
              dir="ltr"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              required
              maxLength={10}
              pattern="[A-Z0-9]{2,10}"
            />
          </Field>
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
          <Field label="رقم الهاتف">
            <input
              className="input num-latin"
              dir="ltr"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
        </div>
        <Field label="العنوان">
          <textarea
            className="input min-h-[80px]"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </Field>

        <div className="flex items-center justify-between pt-3 border-t">
          {error && <span className="text-sm text-rose-600">{error}</span>}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Link href="/settings/branches" className="btn-ghost">إلغاء</Link>
            <button type="submit" disabled={create.isPending} className="btn-primary">
              <Save className="h-4 w-4" />
              {create.isPending ? 'جاري الحفظ…' : 'إنشاء الفرع'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, help, children }: { label: string; required?: boolean; help?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
      {help && <span className="mt-1 block text-[11px] text-slate-500">{help}</span>}
    </label>
  );
}
