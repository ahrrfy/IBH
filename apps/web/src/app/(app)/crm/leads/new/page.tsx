'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function NewLeadPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    nameAr: '',
    phone: '',
    email: '',
    source: '',
    interest: '',
    estimatedValueIqd: 0,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const created = await api<any>('/crm/leads', { method: 'POST', body: form });
      router.push(`/crm/leads/${created.id}`);
    } catch (e: any) {
      setErr(e?.messageAr ?? 'تعذَّر إنشاء العميل المحتمل');
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
        <Link href="/crm/leads" className="text-sm text-sky-700 hover:underline">← العملاء المحتملون</Link>
        <h1 className="mt-2 text-3xl font-bold">عميل محتمل جديد</h1>
      </header>

      <section className="grid gap-3 rounded-lg bg-white p-4 shadow-sm md:grid-cols-2">
        {field('nameAr', 'الاسم')}
        {field('phone',  'الهاتف')}
        {field('email',  'البريد')}
        <label className="block">
          <span className="text-sm text-slate-500">المصدر</span>
          <select className="mt-1 w-full rounded border px-3 py-2" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            <option value="">—</option>
            <option value="walk_in">زيارة مباشرة</option>
            <option value="phone">هاتف</option>
            <option value="whatsapp">واتساب</option>
            <option value="facebook">فيسبوك</option>
            <option value="instagram">انستغرام</option>
            <option value="referral">إحالة</option>
            <option value="website">الموقع</option>
          </select>
        </label>
        {field('estimatedValueIqd', 'القيمة المتوقعة (د.ع)', 'number')}
        <label className="block md:col-span-2">
          <span className="text-sm text-slate-500">الاهتمام</span>
          <textarea className="mt-1 w-full rounded border px-3 py-2" rows={3} value={form.interest} onChange={(e) => setForm({ ...form, interest: e.target.value })} />
        </label>
      </section>

      {err && <div className="rounded bg-rose-50 p-3 text-rose-700">{err}</div>}

      <div className="flex justify-end gap-2">
        <Link href="/crm/leads" className="rounded border px-4 py-2">إلغاء</Link>
        <button onClick={submit} disabled={busy || !form.nameAr} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">
          {busy ? 'جارٍ الحفظ…' : 'حفظ'}
        </button>
      </div>
    </div>
  );
}
