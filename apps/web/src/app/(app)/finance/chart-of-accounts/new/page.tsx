'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { BookOpen, ArrowRight, Save } from 'lucide-react';

const CATEGORIES = [
  { value: 'fixed_assets',    labelAr: 'أصول ثابتة',     defaultType: 'debit_normal' },
  { value: 'current_assets',  labelAr: 'أصول متداولة',   defaultType: 'debit_normal' },
  { value: 'liabilities',     labelAr: 'الخصوم',         defaultType: 'credit_normal' },
  { value: 'equity',          labelAr: 'حقوق الملكية',   defaultType: 'credit_normal' },
  { value: 'revenue',         labelAr: 'الإيرادات',      defaultType: 'credit_normal' },
  { value: 'expense',         labelAr: 'المصروفات',      defaultType: 'debit_normal' },
] as const;

type AccountForm = {
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  accountType: string;
  parentId: string;
  isHeader: boolean;
  allowDirectPosting: boolean;
};

const EMPTY: AccountForm = {
  code: '',
  nameAr: '',
  nameEn: '',
  category: 'current_assets',
  accountType: 'debit_normal',
  parentId: '',
  isHeader: false,
  allowDirectPosting: true,
};

export default function NewAccountPage() {
  const router = useRouter();
  const qc = useQueryClient();

  // Read ?parentId= on mount — avoids useSearchParams which requires <Suspense>
  // in Next.js 15 and breaks static prerendering. Same pattern as login page.
  const [form, setForm] = useState<AccountForm>({ ...EMPTY });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search).get('parentId');
    if (p) setForm((f) => ({ ...f, parentId: p }));
  }, []);

  const accountsQ = useQuery({
    queryKey: ['chart-of-accounts'],
    queryFn: () => api<any[]>('/finance/gl/accounts'),
  });
  const accounts: any[] = accountsQ.data ?? [];

  const create = useMutation({
    mutationFn: () =>
      api<any>('/finance/gl/accounts', {
        method: 'POST',
        body: {
          code: form.code,
          nameAr: form.nameAr,
          nameEn: form.nameEn || undefined,
          category: form.category,
          accountType: form.accountType,
          parentId: form.parentId || null,
          isHeader: form.isHeader,
          allowDirectPosting: form.allowDirectPosting,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chart-of-accounts'] });
      router.push('/finance/chart-of-accounts');
    },
    onError: (e: any) => setError(e?.messageAr ?? e?.message ?? 'فشل إنشاء الحساب'),
  });

  function handleCategoryChange(category: string) {
    const cat = CATEGORIES.find((c) => c.value === category);
    setForm({ ...form, category, accountType: cat?.defaultType ?? form.accountType, parentId: '' });
  }

  const validParents = accounts.filter((a) => a.category === form.category && a.id !== form.parentId);

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-sky-700" />
            حساب جديد
          </h1>
          <p className="text-sm text-slate-500 mt-1">أضف حساباً للدليل المحاسبي</p>
        </div>
        <Link href="/finance/chart-of-accounts" className="text-sm text-slate-500 hover:text-sky-700 flex items-center gap-1">
          <ArrowRight className="h-4 w-4" />
          العودة للدليل
        </Link>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate();
        }}
        className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="الكود" required help="رقم تسلسلي فريد، مثال: 221">
            <input
              className="input num-latin font-mono"
              dir="ltr"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
              maxLength={10}
            />
          </Field>
          <Field label="التصنيف" required>
            <select
              className="input"
              value={form.category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              required
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.labelAr}</option>
              ))}
            </select>
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
          <Field label="نوع الرصيد" required>
            <select
              className="input"
              value={form.accountType}
              onChange={(e) => setForm({ ...form, accountType: e.target.value })}
            >
              <option value="debit_normal">مدين بطبيعته</option>
              <option value="credit_normal">دائن بطبيعته</option>
            </select>
          </Field>
          <Field label="الحساب الأب" help="فقط حسابات بنفس التصنيف">
            <select
              className="input"
              value={form.parentId}
              onChange={(e) => setForm({ ...form, parentId: e.target.value })}
            >
              <option value="">— لا أب (حساب جذر) —</option>
              {validParents.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.nameAr}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex flex-wrap gap-4 pt-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isHeader}
              onChange={(e) => setForm({ ...form, isHeader: e.target.checked })}
              className="h-4 w-4"
            />
            حساب رأس مجموعة
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.allowDirectPosting}
              onChange={(e) => setForm({ ...form, allowDirectPosting: e.target.checked })}
              className="h-4 w-4"
            />
            يقبل ترحيلاً مباشراً
          </label>
        </div>

        <div className="flex items-center justify-between pt-3 border-t">
          {error && <span className="text-sm text-rose-600">{error}</span>}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Link href="/finance/chart-of-accounts" className="btn-ghost">إلغاء</Link>
            <button type="submit" disabled={create.isPending} className="btn-primary">
              <Save className="h-4 w-4" />
              {create.isPending ? 'جاري الإنشاء…' : 'إنشاء'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({
  label, required, help, children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
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
