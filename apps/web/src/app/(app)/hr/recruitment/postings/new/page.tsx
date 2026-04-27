'use client';

/**
 * Create a new job posting (T51 admin).
 * Drafts can be flipped to `open` from the kanban or detail view later.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function NewJobPostingPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    slug: '',
    titleAr: '',
    titleEn: '',
    descriptionAr: '',
    requirementsAr: '',
    keywords: '',
    minYearsExperience: 0,
    employmentType: 'full_time' as 'full_time' | 'part_time' | 'contract' | 'internship',
    location: '',
    salaryMinIqd: '' as string | number,
    salaryMaxIqd: '' as string | number,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function field<K extends keyof typeof form>(k: K, label: string, type: 'text' | 'number' | 'textarea' = 'text') {
    if (type === 'textarea') {
      return (
        <label className="block md:col-span-2">
          <span className="text-sm text-slate-500">{label}</span>
          <textarea
            rows={4}
            className="mt-1 w-full rounded border px-3 py-2"
            value={String(form[k] ?? '')}
            onChange={(e) => setForm({ ...form, [k]: e.target.value })}
          />
        </label>
      );
    }
    return (
      <label className="block">
        <span className="text-sm text-slate-500">{label}</span>
        <input
          type={type}
          className="mt-1 w-full rounded border px-3 py-2"
          value={String(form[k] ?? '')}
          onChange={(e) =>
            setForm({ ...form, [k]: type === 'number' ? Number(e.target.value) : e.target.value })
          }
        />
      </label>
    );
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const payload: any = { ...form };
      if (payload.salaryMinIqd === '') delete payload.salaryMinIqd;
      if (payload.salaryMaxIqd === '') delete payload.salaryMaxIqd;
      await api<any>('/hr/recruitment/postings', { method: 'POST', body: payload });
      router.push(`/hr/recruitment`);
    } catch (e: any) {
      setErr(e?.messageAr ?? 'تعذَّر إنشاء الوظيفة');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <Link href="/hr/recruitment" className="text-sm text-sky-700 hover:underline">← التوظيف</Link>
        <h1 className="mt-2 text-3xl font-bold">وظيفة جديدة</h1>
      </header>

      <section className="grid gap-3 rounded-lg bg-white p-4 shadow-sm md:grid-cols-2">
        {field('slug', 'الرابط (slug، أحرف لاتينية صغيرة)')}
        {field('titleAr', 'المسمى الوظيفي (عربي)')}
        {field('titleEn', 'Job title (English)')}
        {field('location', 'الموقع')}
        {field('minYearsExperience', 'الحد الأدنى للخبرة (سنوات)', 'number')}
        <label className="block">
          <span className="text-sm text-slate-500">نوع العمل</span>
          <select
            className="mt-1 w-full rounded border px-3 py-2"
            value={form.employmentType}
            onChange={(e) => setForm({ ...form, employmentType: e.target.value as any })}
          >
            <option value="full_time">دوام كامل</option>
            <option value="part_time">دوام جزئي</option>
            <option value="contract">عقد</option>
            <option value="internship">تدريب</option>
          </select>
        </label>
        {field('salaryMinIqd', 'الحد الأدنى للراتب (IQD)', 'number')}
        {field('salaryMaxIqd', 'الحد الأعلى للراتب (IQD)', 'number')}
        {field('keywords', 'كلمات مفتاحية للفرز (مفصولة بفواصل)')}
        {field('descriptionAr', 'الوصف', 'textarea')}
        {field('requirementsAr', 'المتطلبات', 'textarea')}
      </section>

      {err && <div className="rounded bg-rose-50 p-3 text-sm text-rose-700">{err}</div>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !form.slug || !form.titleAr || !form.descriptionAr}
          className="rounded bg-sky-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'جاري الحفظ…' : 'حفظ كمسوّدة'}
        </button>
        <Link href="/hr/recruitment" className="rounded border px-4 py-2 text-sm">
          إلغاء
        </Link>
      </div>
    </div>
  );
}
