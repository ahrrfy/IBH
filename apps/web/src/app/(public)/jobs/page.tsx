'use client';

/**
 * Public job board (T51) — lists all OPEN postings.
 * No auth required. Backed by the rate-limited `/api/v1/public/jobs` endpoint.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';

type PublicJob = {
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string | null;
  location: string | null;
  employmentType: string;
  minYearsExperience: number;
  openedAt: string | null;
};

export default function PublicJobsPage() {
  const [jobs, setJobs] = useState<PublicJob[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/public/jobs', { headers: { Accept: 'application/json' } })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setJobs(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">الوظائف المتاحة</h1>
      <p className="text-sm text-slate-600">
        تعرّف على الفرص المفتوحة لدينا وقدّم طلبك مباشرة عبر الموقع.
      </p>

      {err && <div className="rounded bg-rose-50 p-3 text-sm text-rose-700">تعذّر تحميل الوظائف.</div>}
      {jobs === null && !err && <div className="text-slate-500">جارٍ التحميل…</div>}

      <ul className="space-y-3">
        {(jobs ?? []).map((j) => (
          <li key={j.id} className="rounded-lg bg-white p-4 shadow-sm">
            <Link href={`/jobs/${j.slug}`} className="text-lg font-semibold text-sky-700 hover:underline">
              {j.titleAr}
            </Link>
            {j.titleEn && <div className="text-xs text-slate-500">{j.titleEn}</div>}
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
              {j.location && <span>📍 {j.location}</span>}
              <span>💼 {labelType(j.employmentType)}</span>
              <span>📅 خبرة ≥ {j.minYearsExperience} سنة</span>
            </div>
          </li>
        ))}
        {jobs && jobs.length === 0 && !err && (
          <li className="rounded-lg bg-white p-6 text-center text-slate-500">
            لا توجد وظائف مفتوحة حالياً.
          </li>
        )}
      </ul>
    </div>
  );
}

function labelType(t: string): string {
  return (
    {
      full_time: 'دوام كامل',
      part_time: 'دوام جزئي',
      contract: 'عقد',
      internship: 'تدريب',
    } as Record<string, string>
  )[t] ?? t;
}
