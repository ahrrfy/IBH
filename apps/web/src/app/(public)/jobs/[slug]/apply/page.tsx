'use client';

/**
 * Public apply form (T51).
 *
 * No auth required. Posts to the rate-limited public endpoint:
 *   POST /api/v1/public/jobs/:slug/apply
 *
 * `cvUrl` is optional — frontends that integrate file uploads can plug
 * a presigned PUT here later. For now we accept a URL or pasted text.
 */
import { use, useState } from 'react';
import Link from 'next/link';

export default function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [form, setForm] = useState({
    applicantName: '',
    applicantEmail: '',
    applicantPhone: '',
    yearsExperience: 0,
    cvUrl: '',
    cvText: '',
    coverLetter: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  function field(k: keyof typeof form, label: string, type: 'text' | 'email' | 'tel' | 'number' | 'textarea' | 'url' = 'text') {
    if (type === 'textarea') {
      return (
        <label className="block md:col-span-2">
          <span className="text-sm text-slate-600">{label}</span>
          <textarea
            rows={5}
            className="mt-1 w-full rounded border px-3 py-2"
            value={String(form[k] ?? '')}
            onChange={(e) => setForm({ ...form, [k]: e.target.value })}
          />
        </label>
      );
    }
    return (
      <label className="block">
        <span className="text-sm text-slate-600">{label}</span>
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
      Object.keys(payload).forEach((k) => {
        if (payload[k] === '' || payload[k] == null) delete payload[k];
      });
      payload.yearsExperience = Number(form.yearsExperience) || 0;

      const res = await fetch(`/api/v1/public/jobs/${encodeURIComponent(slug)}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error?.messageAr || data?.messageAr || 'تعذّر إرسال الطلب');
      }
      setSubmittedId(data?.id ?? 'ok');
    } catch (e: any) {
      setErr(e?.message ?? 'تعذّر إرسال الطلب');
    } finally {
      setBusy(false);
    }
  }

  if (submittedId) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-3xl font-bold text-emerald-700">شكراً لك!</h1>
        <p className="text-slate-700">تم استلام طلبك وسيتم مراجعته قريباً.</p>
        <Link href="/jobs" className="inline-block text-sky-700 hover:underline">← عودة إلى الوظائف</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href={`/jobs/${slug}`} className="text-sm text-sky-700 hover:underline">← عودة للوصف</Link>
      <h1 className="text-3xl font-bold">تقديم طلب وظيفي</h1>

      <section className="grid gap-3 rounded-lg bg-white p-6 shadow-sm md:grid-cols-2">
        {field('applicantName', 'الاسم الكامل')}
        {field('applicantEmail', 'البريد الإلكتروني', 'email')}
        {field('applicantPhone', 'الهاتف', 'tel')}
        {field('yearsExperience', 'سنوات الخبرة', 'number')}
        {field('cvUrl', 'رابط السيرة الذاتية (اختياري)', 'url')}
        {field('cvText', 'نص السيرة الذاتية (الصق هنا)', 'textarea')}
        {field('coverLetter', 'رسالة التغطية (اختياري)', 'textarea')}
      </section>

      {err && <div className="rounded bg-rose-50 p-3 text-sm text-rose-700">{err}</div>}

      <button
        type="button"
        onClick={submit}
        disabled={busy || !form.applicantName || !form.applicantEmail}
        className="rounded bg-sky-700 px-6 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
      >
        {busy ? 'جاري الإرسال…' : 'إرسال الطلب'}
      </button>
    </div>
  );
}
