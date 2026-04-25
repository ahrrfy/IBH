'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function NewEmployeePage() {
  const router = useRouter();
  const [form, setForm] = useState({
    employeeNumber: '',
    fullNameAr: '',
    fullNameEn: '',
    nationalId: '',
    phone: '',
    email: '',
    departmentId: '',
    jobTitleAr: '',
    hireDate: new Date().toISOString().slice(0, 10),
    baseSalaryIqd: 0,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const created = await api<any>('/hr/employees', { method: 'POST', body: form });
      router.push(`/hr/employees/${created.id}`);
    } catch (e: any) {
      setErr(e?.messageAr ?? 'تعذَّر إنشاء الموظف');
    } finally { setBusy(false); }
  }

  function field<K extends keyof typeof form>(k: K, label: string, type = 'text') {
    return (
      <label className="block">
        <span className="text-sm text-slate-500">{label}</span>
        <input
          type={type}
          className="mt-1 w-full rounded border px-3 py-2"
          value={String(form[k] ?? '')}
          onChange={(e) => setForm({ ...form, [k]: type === 'number' ? Number(e.target.value) : e.target.value })}
        />
      </label>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <Link href="/hr/employees" className="text-sm text-sky-700 hover:underline">← الموظفون</Link>
        <h1 className="mt-2 text-3xl font-bold">موظف جديد</h1>
      </header>

      <section className="grid gap-3 rounded-lg bg-white p-4 shadow-sm md:grid-cols-2">
        {field('employeeNumber','الرقم الوظيفي')}
        {field('fullNameAr',    'الاسم بالعربية')}
        {field('fullNameEn',    'الاسم بالإنجليزية')}
        {field('nationalId',    'الرقم الوطني')}
        {field('phone',         'الهاتف')}
        {field('email',         'البريد')}
        {field('departmentId',  'القسم (ID)')}
        {field('jobTitleAr',    'المسمى الوظيفي')}
        {field('hireDate',      'تاريخ التوظيف', 'date')}
        {field('baseSalaryIqd', 'الراتب الأساسي', 'number')}
      </section>

      {err && <div className="rounded bg-rose-50 p-3 text-rose-700">{err}</div>}

      <div className="flex justify-end gap-2">
        <Link href="/hr/employees" className="rounded border px-4 py-2">إلغاء</Link>
        <button onClick={submit} disabled={busy || !form.fullNameAr} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">
          {busy ? 'جارٍ الحفظ…' : 'حفظ'}
        </button>
      </div>
    </div>
  );
}
