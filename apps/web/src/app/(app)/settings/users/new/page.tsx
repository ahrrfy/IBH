'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { UserPlus, Save, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { ROLE_LABELS_AR } from '@/lib/permissions';

export default function NewUserPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: () => api<any>('/company/branches') });
  const { data: roles }    = useQuery({ queryKey: ['roles'],    queryFn: () => api<any>('/company/roles') });

  const branchList: any[] = Array.isArray(branches) ? branches : branches?.items ?? [];
  const roleList:   any[] = Array.isArray(roles)    ? roles    : roles?.items    ?? [];

  const [form, setForm] = useState({
    email: '', username: '', nameAr: '', nameEn: '',
    password: '', branchId: '', roles: [] as string[], isActive: true,
  });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (payload: any) => api<any>('/users', { method: 'POST', body: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      router.push('/settings/users');
    },
    onError: (e: any) => setError(e?.message ?? 'فشل إنشاء المستخدم'),
  });

  function toggleRole(name: string) {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(name) ? f.roles.filter((r) => r !== name) : [...f.roles, name],
    }));
  }

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <UserPlus className="h-6 w-6 text-sky-700" />
            مستخدم جديد
          </h1>
          <p className="text-sm text-slate-500 mt-1">أدخِل بيانات الموظف وكلمة مروره الأولى وأدواره</p>
        </div>
        <Link href="/settings/users" className="text-sm text-slate-500 hover:text-sky-700 flex items-center gap-1">
          <ArrowRight className="h-4 w-4" />
          العودة لقائمة المستخدمين
        </Link>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (form.roles.length === 0) { setError('يجب اختيار دور واحد على الأقل'); return; }
          const payload: any = {
            email:   form.email,
            username: form.username || undefined,
            nameAr:  form.nameAr,
            nameEn:  form.nameEn || undefined,
            password: form.password,
            roles:   form.roles,
            branchId: form.branchId || undefined,
            isActive: form.isActive,
          };
          create.mutate(payload);
        }}
        className="bg-white border border-slate-200 rounded-lg p-6 space-y-5"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="الاسم بالعربية" required>
            <input className="input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required />
          </Field>
          <Field label="الاسم بالإنجليزية">
            <input className="input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
          </Field>
          <Field label="البريد الإلكتروني" required>
            <input className="input num-latin" dir="ltr" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label="اسم المستخدم" help="اختياري — للدخول بدون بريد. حروف صغيرة وأرقام و(. _ -)">
            <input className="input num-latin" dir="ltr" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} pattern="[a-z0-9._-]{2,40}" />
          </Field>
          <Field label="كلمة المرور الأولى" required help="8 حروف على الأقل، أحرف وأرقام">
            <input className="input num-latin" dir="ltr" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
          </Field>
          <Field label="الفرع">
            <select className="input" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              <option value="">— غير محدد (كل الفروع) —</option>
              {branchList.map((b: any) => <option key={b.id} value={b.id}>{b.nameAr} ({b.code})</option>)}
            </select>
          </Field>
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-slate-700">الأدوار <span className="text-rose-500">*</span></span>
          {roleList.length === 0 ? (
            <p className="text-sm text-slate-500">لا توجد أدوار متاحة. أنشئ دوراً أولاً من <Link href="/settings/roles" className="text-sky-700 hover:underline">صفحة الأدوار</Link>.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {roleList.map((r: any) => (
                <label key={r.id} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.roles.includes(r.name)}
                    onChange={() => toggleRole(r.name)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-slate-900">{r.displayNameAr ?? ROLE_LABELS_AR[r.name] ?? r.name}</span>
                    <span className="block text-[11px] text-slate-500 font-mono num-latin">{r.name}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4" />
          <span>المستخدم نشط (يستطيع تسجيل الدخول)</span>
        </label>

        <div className="flex items-center justify-between pt-3 border-t">
          {error && <span className="text-sm text-rose-600">{error}</span>}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Link href="/settings/users" className="btn-ghost">إلغاء</Link>
            <button type="submit" disabled={create.isPending} className="btn-primary">
              <Save className="h-4 w-4" />
              {create.isPending ? 'جاري الإنشاء…' : 'إنشاء المستخدم'}
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
