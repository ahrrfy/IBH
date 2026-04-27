'use client';

/**
 * Public job detail (T51).
 * No auth required. Links to the apply form for the same slug.
 */
import { use, useEffect, useState } from 'react';
import Link from 'next/link';

type JobDetail = {
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string | null;
  descriptionAr: string;
  requirementsAr: string | null;
  location: string | null;
  employmentType: string;
  minYearsExperience: number;
  salaryMinIqd: string | null;
  salaryMaxIqd: string | null;
};

export default function PublicJobDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [job, setJob] = useState<JobDetail | null | 'missing'>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/public/jobs/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
    })
      .then(async (r) => {
        if (r.status === 404) {
          if (!cancelled) setJob('missing');
          return null;
        }
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data) => {
        if (data && !cancelled) setJob(data);
      })
      .catch(() => {
        if (!cancelled) setJob('missing');
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (job === null) return <div className="text-slate-500">جارٍ التحميل…</div>;
  if (job === 'missing') {
    return (
      <div className="space-y-3">
        <Link href="/jobs" className="text-sm text-sky-700 hover:underline">← كل الوظائف</Link>
        <div className="rounded bg-white p-6 text-center text-slate-600">الوظيفة غير متاحة.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/jobs" className="text-sm text-sky-700 hover:underline">← كل الوظائف</Link>
      <header>
        <h1 className="text-3xl font-bold">{job.titleAr}</h1>
        {job.titleEn && <div className="text-sm text-slate-500">{job.titleEn}</div>}
      </header>
      <div className="flex flex-wrap gap-3 text-sm text-slate-600">
        {job.location && <span>📍 {job.location}</span>}
        <span>💼 {job.employmentType}</span>
        <span>📅 خبرة ≥ {job.minYearsExperience} سنة</span>
        {job.salaryMinIqd && job.salaryMaxIqd && (
          <span>💰 {job.salaryMinIqd} – {job.salaryMaxIqd} IQD</span>
        )}
      </div>

      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">الوصف</h2>
        <p className="whitespace-pre-wrap text-sm text-slate-700">{job.descriptionAr}</p>
      </section>

      {job.requirementsAr && (
        <section className="rounded-lg bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">المتطلبات</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{job.requirementsAr}</p>
        </section>
      )}

      <Link
        href={`/jobs/${slug}/apply`}
        className="inline-block rounded bg-sky-700 px-6 py-2 text-sm font-medium text-white hover:bg-sky-800"
      >
        تقديم طلب
      </Link>
    </div>
  );
}
