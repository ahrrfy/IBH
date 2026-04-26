'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Shield, Save, ArrowRight } from 'lucide-react';
import { PermissionMatrix, type PermissionMap } from '../[id]/permission-matrix';

type RoleForm = {
  name: string;
  displayNameAr: string;
  displayNameEn: string;
};

export default function NewRolePage() {
  const router = useRouter();
  const qc = useQueryClient();

  const [form, setForm] = useState<RoleForm>({ name: '', displayNameAr: '', displayNameEn: '' });
  const [perms, setPerms] = useState<PermissionMap>({});
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api<any>('/company/roles', {
        method: 'POST',
        body: {
          name: form.name,
          displayNameAr: form.displayNameAr,
          displayNameEn: form.displayNameEn || undefined,
          permissions: perms,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      router.push('/settings/roles');
    },
    onError: (e: any) => setError(e?.message ?? 'فشل إنشاء الدور'),
  });

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="h-6 w-6 text-sky-700" />
            دور جديد
          </h1>
          <p className="text-sm text-slate-500 mt-1">حدِّد اسم الدور وصلاحياته على كل مورد</p>
        </div>
        <Link href="/settings/roles" className="text-sm text-slate-500 hover:text-sky-700 flex items-center gap-1">
          <ArrowRight className="h-4 w-4" />
          العودة لقائمة الأدوار
        </Link>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate();
        }}
        className="space-y-5"
      >
        <div className="bg-white border border-slate-200 rounded-lg p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="المعرّف الفني" required help="حروف لاتينية صغيرة + شرطة سفلية، مثل: branch_manager">
            <input
              className="input num-latin"
              dir="ltr"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase() })}
              required
              maxLength={50}
              pattern="[a-z][a-z0-9_]*"
            />
          </Field>
          <Field label="الاسم بالعربية" required>
            <input
              className="input"
              value={form.displayNameAr}
              onChange={(e) => setForm({ ...form, displayNameAr: e.target.value })}
              required
            />
          </Field>
          <Field label="الاسم بالإنجليزية">
            <input
              className="input"
              value={form.displayNameEn}
              onChange={(e) => setForm({ ...form, displayNameEn: e.target.value })}
            />
          </Field>
        </div>

        <PermissionMatrix value={perms} onChange={setPerms} />

        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-4">
          {error && <span className="text-sm text-rose-600">{error}</span>}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Link href="/settings/roles" className="btn-ghost">إلغاء</Link>
            <button type="submit" disabled={create.isPending} className="btn-primary">
              <Save className="h-4 w-4" />
              {create.isPending ? 'جاري الإنشاء…' : 'إنشاء الدور'}
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
