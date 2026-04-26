'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { BookOpen, ArrowRight, Save } from 'lucide-react';

const CATEGORIES = [
  { value: 'fixed_assets',    labelAr: 'أصول ثابتة' },
  { value: 'current_assets',  labelAr: 'أصول متداولة' },
  { value: 'liabilities',     labelAr: 'الخصوم' },
  { value: 'equity',          labelAr: 'حقوق الملكية' },
  { value: 'revenue',         labelAr: 'الإيرادات' },
  { value: 'expense',         labelAr: 'المصروفات' },
] as const;

type AccountForm = {
  nameAr: string;
  nameEn: string;
  category: string;
  accountType: string;
  parentId: string;
  isHeader: boolean;
  isActive: boolean;
  allowDirectPosting: boolean;
};

export default function EditAccountPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const id = params?.id;

  const [form, setForm] = useState<AccountForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accountQ = useQuery({
    queryKey: ['chart-of-accounts', id],
    queryFn: () => api<any>(`/finance/gl/accounts/${id}`),
    enabled: Boolean(id),
  });
  const accountsQ = useQuery({
    queryKey: ['chart-of-accounts'],
    queryFn: () => api<any[]>('/finance/gl/accounts'),
  });

  useEffect(() => {
    if (!form && accountQ.data) {
      const a = accountQ.data;
      setForm({
        nameAr: a.nameAr ?? '',
        nameEn: a.nameEn ?? '',
        category: a.category,
        accountType: a.accountType,
        parentId: a.parentId ?? '',
        isHeader: a.isHeader ?? false,
        isActive: a.isActive ?? true,
        allowDirectPosting: a.allowDirectPosting ?? true,
      });
    }
  }, [accountQ.data, form]);

  const update = useMutation({
    mutationFn: () => {
      if (!form) throw new Error('form not loaded');
      return api<any>(`/finance/gl/accounts/${id}`, {
        method: 'PUT',
        body: {
          nameAr: form.nameAr,
          nameEn: form.nameEn || null,
          category: form.category,
          accountType: form.accountType,
          parentId: form.parentId || null,
          isHeader: form.isHeader,
          isActive: form.isActive,
          allowDirectPosting: form.allowDirectPosting,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chart-of-accounts'] });
      router.push('/finance/chart-of-accounts');
    },
    onError: (e: any) => setError(e?.messageAr ?? e?.message ?? 'فشل حفظ التعديلات'),
  });

  if (accountQ.isLoading || !form) {
    return <div className="p-6 text-sm text-slate-500">جاري التحميل…</div>;
  }
  if (accountQ.error || !accountQ.data) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-sm text-rose-600">تعذَّر تحميل الحساب</p>
        <Link href="/finance/chart-of-accounts" className="btn-ghost btn-sm inline-flex">
          <ArrowRight className="h-4 w-4" />
          العودة للدليل
        </Link>
      </div>
    );
  }

  const account = accountQ.data;
  const allAccounts: any[] = accountsQ.data ?? [];
  const validParents = allAccounts.filter(
    (a: any) => a.category === form.category && a.id !== id,
  );

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-sky-700" />
            تعديل حساب
            <span className="font-mono num-latin text-base text-slate-500">· {account.code}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">{account.nameAr}</p>
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
          update.mutate();
        }}
        className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="التصنيف" help="لا يمكن التغيير إذا الحساب مستخدم في قيود">
            <select
              className="input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value, parentId: '' })}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.labelAr}</option>
              ))}
            </select>
          </Field>
          <Field label="نوع الرصيد" help="لا يمكن التغيير إذا الحساب مستخدم في قيود">
            <select
              className="input"
              value={form.accountType}
              onChange={(e) => setForm({ ...form, accountType: e.target.value })}
            >
              <option value="debit_normal">مدين بطبيعته</option>
              <option value="credit_normal">دائن بطبيعته</option>
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
          <Field label="الحساب الأب">
            <select
              className="input"
              value={form.parentId}
              onChange={(e) => setForm({ ...form, parentId: e.target.value })}
            >
              <option value="">— لا أب (حساب جذر) —</option>
              {validParents.map((a: any) => (
                <option key={a.id} value={a.id}>{a.code} · {a.nameAr}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex flex-wrap gap-4 pt-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="h-4 w-4"
            />
            نشط
          </label>
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
            <button type="submit" disabled={update.isPending} className="btn-primary">
              <Save className="h-4 w-4" />
              {update.isPending ? 'جاري الحفظ…' : 'حفظ'}
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
