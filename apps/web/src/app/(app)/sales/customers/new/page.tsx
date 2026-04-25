'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function NewCustomerPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    code: '',
    nameAr: '',
    nameEn: '',
    type: 'individual',
    phone: '',
    email: '',
    address: '',
    creditLimitIqd: 0,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const created = await api<any>('/sales/customers', { method: 'POST', body: form });
      router.push(`/sales/customers/${created.id}`);
    } catch (e: any) {
      setErr(e?.messageAr ?? 'تعذَّر إنشاء العميل');
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
        <Link href="/sales/customers" className="text-sm text-sky-700 hover:underline">← العملاء</Link>
        <h1 className="mt-2 text-3xl font-bold">عميل جديد</h1>
      </header>

      <section className="grid gap-3 rounded-lg bg-white p-4 shadow-sm md:grid-cols-2">
        {field('code',  'الكود')}
        {field('nameAr','الاسم بالعربية')}
        {field('nameEn','الاسم بالإنجليزية')}
        <label className="block">
          <span className="text-sm text-slate-500">النوع</span>
          <select className="mt-1 w-full rounded border px-3 py-2" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="individual">فرد</option>
            <option value="business">شركة</option>
          </select>
        </label>
        {field('phone',  'الهاتف')}
        {field('email',  'البريد')}
        {field('address','العنوان')}
        {field('creditLimitIqd', 'حد الائتمان', 'number')}
      </section>

      {err && <div className="rounded bg-rose-50 p-3 text-rose-700">{err}</div>}

      <div className="flex justify-end gap-2">
        <Link href="/sales/customers" className="rounded border px-4 py-2">إلغاء</Link>
        <button onClick={submit} disabled={busy || !form.nameAr} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">
          {busy ? 'جارٍ الحفظ…' : 'حفظ'}
        </button>
      </div>
    </div>
  );
}
