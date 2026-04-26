'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Building2, Save, ArrowRight } from 'lucide-react';

type BranchForm = {
  nameAr: string;
  nameEn: string;
  phone: string;
  address: string;
  isActive: boolean;
};

const EMPTY: BranchForm = { nameAr: '', nameEn: '', phone: '', address: '', isActive: true };

export default function EditBranchPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const id = params?.id;

  const [form, setForm] = useState<BranchForm>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const branchesQ = useQuery({
    queryKey: ['branches'],
    queryFn: () => api<any>('/company/branches'),
  });

  useEffect(() => {
    if (loaded || !branchesQ.data) return;
    const rows: any[] = Array.isArray(branchesQ.data) ? branchesQ.data : branchesQ.data?.items ?? [];
    const branch = rows.find((b) => b.id === id);
    if (!branch) return;
    setForm({
      nameAr: branch.nameAr ?? '',
      nameEn: branch.nameEn ?? '',
      phone: branch.phone ?? '',
      address: branch.address ?? '',
      isActive: branch.isActive ?? true,
    });
    setLoaded(true);
  }, [branchesQ.data, loaded, id]);

  const update = useMutation({
    mutationFn: (payload: BranchForm) =>
      api<any>(`/company/branches/${id}`, { method: 'PUT', body: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches'] });
      router.push(`/settings/branches/${id}`);
    },
    onError: (e: any) => setError(e?.message ?? 'فشل حفظ التعديلات'),
  });

  if (branchesQ.isLoading || !loaded) {
    return <div className="p-6 text-sm text-slate-500">جاري التحميل…</div>;
  }
  if (branchesQ.error) {
    return <div className="p-6 text-sm text-rose-600">تعذَّر تحميل بيانات الفرع</div>;
  }

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-sky-700" />
            تعديل الفرع
          </h1>
          <p className="text-sm text-slate-500 mt-1">حدِّث بيانات الفرع</p>
        </div>
        <Link
          href={`/settings/branches/${id}`}
          className="text-sm text-slate-500 hover:text-sky-700 flex items-center gap-1"
        >
          <ArrowRight className="h-4 w-4" />
          العودة لتفاصيل الفرع
        </Link>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          update.mutate(form);
        }}
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
          <Field label="رقم الهاتف">
            <input
              className="input num-latin"
              dir="ltr"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="الحالة">
            <label className="flex items-center gap-2 h-9">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4"
              />
              <span className="text-sm text-slate-700">
                {form.isActive ? 'نشط' : 'غير نشط'}
              </span>
            </label>
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
            <Link href={`/settings/branches/${id}`} className="btn-ghost">
              إلغاء
            </Link>
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
  label,
  required,
  help,
  children,
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
