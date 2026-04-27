'use client';

/**
 * HR Recruitment kanban (T51).
 *
 * Shows job postings on the left and applications grouped by status as a
 * kanban on the right. Applications are pre-sorted by `autoScreenScore` desc
 * so the highest-ranked candidates surface first per column.
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

type JobPosting = {
  id: string;
  slug: string;
  titleAr: string;
  status: 'draft' | 'open' | 'paused' | 'closed';
  openedAt?: string | null;
};

type Application = {
  id: string;
  jobPostingId: string;
  applicantName: string;
  applicantEmail: string;
  yearsExperience: number;
  autoScreenScore: number;
  status: 'new' | 'screened' | 'interview' | 'offer' | 'hired' | 'rejected';
  createdAt: string;
};

const STATUS_COLUMNS: Array<{ key: Application['status']; label: string; tone: string }> = [
  { key: 'new',       label: 'جديدة',     tone: 'bg-slate-100 text-slate-800' },
  { key: 'screened',  label: 'مفروزة',    tone: 'bg-sky-100 text-sky-800' },
  { key: 'interview', label: 'مقابلة',    tone: 'bg-amber-100 text-amber-800' },
  { key: 'offer',     label: 'عرض',       tone: 'bg-violet-100 text-violet-800' },
  { key: 'hired',     label: 'مُعيَّن',   tone: 'bg-emerald-100 text-emerald-800' },
  { key: 'rejected',  label: 'مرفوض',    tone: 'bg-rose-100 text-rose-800' },
];

export default function RecruitmentKanbanPage() {
  const qc = useQueryClient();
  const [selectedJob, setSelectedJob] = useState<string | 'all'>('all');

  const postingsQ = useQuery({
    queryKey: ['recruitment', 'postings'],
    queryFn: () => api<JobPosting[]>('/hr/recruitment/postings'),
  });

  const appsQ = useQuery({
    queryKey: ['recruitment', 'applications', selectedJob],
    queryFn: () =>
      api<Application[]>('/hr/recruitment/applications', {
        query: selectedJob !== 'all' ? { jobPostingId: selectedJob } : undefined,
      }),
  });

  const transition = useMutation({
    mutationFn: (input: { id: string; toStatus: Application['status']; rejectionReason?: string }) =>
      api(`/hr/recruitment/applications/${input.id}/transition`, {
        method: 'POST',
        body: { toStatus: input.toStatus, rejectionReason: input.rejectionReason },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recruitment', 'applications'] }),
  });

  const grouped = useMemo(() => {
    const out: Record<Application['status'], Application[]> = {
      new: [], screened: [], interview: [], offer: [], hired: [], rejected: [],
    };
    for (const a of appsQ.data ?? []) out[a.status]?.push(a);
    return out;
  }, [appsQ.data]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">التوظيف</h1>
        <Link
          href="/hr/recruitment/postings/new"
          className="rounded bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800"
        >
          + وظيفة جديدة
        </Link>
      </header>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">الوظائف</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedJob('all')}
            className={`rounded-full px-3 py-1 text-xs ${
              selectedJob === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            الكل
          </button>
          {(postingsQ.data ?? []).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedJob(p.id)}
              className={`rounded-full px-3 py-1 text-xs ${
                selectedJob === p.id ? 'bg-sky-700 text-white' : 'bg-slate-100 text-slate-700'
              }`}
              title={p.status}
            >
              {p.titleAr} <span className="opacity-60">({p.status})</span>
            </button>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {STATUS_COLUMNS.map((col) => (
          <div key={col.key} className="rounded-lg bg-white p-3 shadow-sm">
            <div className={`mb-2 inline-flex rounded px-2 py-0.5 text-xs font-medium ${col.tone}`}>
              {col.label}
              <span className="ms-2 opacity-70">({grouped[col.key].length})</span>
            </div>
            <ul className="space-y-2">
              {grouped[col.key].map((a) => (
                <li key={a.id} className="rounded border border-slate-200 p-2 text-xs">
                  <Link href={`/hr/recruitment/applications/${a.id}`} className="font-medium text-slate-900 hover:underline">
                    {a.applicantName}
                  </Link>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{a.yearsExperience} سنة</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{a.autoScreenScore}</span>
                  </div>
                  {!['hired', 'rejected'].includes(a.status) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {nextStatesFor(a.status).map((next) => (
                        <button
                          key={next}
                          type="button"
                          disabled={transition.isPending}
                          onClick={() => {
                            if (next === 'rejected') {
                              const reason = window.prompt('سبب الرفض؟') || '';
                              if (!reason) return;
                              transition.mutate({ id: a.id, toStatus: 'rejected', rejectionReason: reason });
                            } else {
                              transition.mutate({ id: a.id, toStatus: next });
                            }
                          }}
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                        >
                          → {labelFor(next)}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
              {grouped[col.key].length === 0 && (
                <li className="text-center text-[11px] text-slate-400">—</li>
              )}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

function nextStatesFor(s: Application['status']): Application['status'][] {
  switch (s) {
    case 'new':       return ['screened', 'rejected'];
    case 'screened':  return ['interview', 'rejected'];
    case 'interview': return ['offer', 'rejected'];
    case 'offer':     return ['hired', 'rejected'];
    default:          return [];
  }
}

function labelFor(s: Application['status']): string {
  return STATUS_COLUMNS.find((c) => c.key === s)?.label ?? s;
}
