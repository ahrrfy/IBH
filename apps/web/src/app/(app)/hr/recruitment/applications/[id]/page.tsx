'use client';

/**
 * Application detail page (T51).
 *
 * Shows the candidate's contact info, auto-screen score, the interview
 * stages timeline, and the offer letter (if any). Hiring managers can
 * schedule interviews, record outcomes, and create + send an offer.
 */
import Link from 'next/link';
import { use, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

type InterviewStage = {
  id: string;
  roundNumber: number;
  scheduledAt: string | null;
  outcome: 'pending' | 'passed' | 'failed' | 'no_show';
  score: number | null;
  notes: string | null;
};

type OfferLetter = {
  id: string;
  proposedSalaryIqd: string;
  startDate: string;
  expiresAt: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';
};

type ApplicationDetail = {
  id: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string | null;
  yearsExperience: number;
  cvUrl: string | null;
  cvText: string | null;
  coverLetter: string | null;
  autoScreenScore: number;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  stages: InterviewStage[];
  offer: OfferLetter | null;
};

export default function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [round, setRound] = useState(1);
  const [scheduledAt, setScheduledAt] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['recruitment', 'application', id],
    queryFn: () => api<ApplicationDetail>(`/hr/recruitment/applications/${id}`),
  });

  const schedule = useMutation({
    mutationFn: () =>
      api(`/hr/recruitment/applications/${id}/interviews`, {
        method: 'POST',
        body: { roundNumber: round, scheduledAt: scheduledAt || undefined },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recruitment', 'application', id] }),
  });

  const recordOutcome = useMutation({
    mutationFn: (input: { stageId: string; outcome: InterviewStage['outcome']; score?: number }) =>
      api(`/hr/recruitment/interviews/${input.stageId}`, {
        method: 'PATCH',
        body: { outcome: input.outcome, score: input.score },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recruitment', 'application', id] }),
  });

  const createOffer = useMutation({
    mutationFn: (input: { proposedSalaryIqd: number; startDate: string; expiresAt: string }) =>
      api(`/hr/recruitment/applications/${id}/offer`, { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recruitment', 'application', id] }),
  });

  const sendOffer = useMutation({
    mutationFn: (offerId: string) =>
      api(`/hr/recruitment/offers/${offerId}/send`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recruitment', 'application', id] }),
  });

  if (isLoading) return <div>جاري التحميل…</div>;
  if (error || !data) return <div className="text-rose-700">تعذّر التحميل</div>;

  return (
    <div className="space-y-6">
      <header>
        <Link href="/hr/recruitment" className="text-sm text-sky-700 hover:underline">← التوظيف</Link>
        <h1 className="mt-2 text-3xl font-bold">{data.applicantName}</h1>
        <div className="mt-1 flex flex-wrap gap-4 text-sm text-slate-600">
          <span>{data.applicantEmail}</span>
          {data.applicantPhone && <span>{data.applicantPhone}</span>}
          <span>الخبرة: {data.yearsExperience} سنة</span>
          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono">
            النتيجة الآلية: {data.autoScreenScore}/100
          </span>
          <span className="rounded bg-sky-100 px-2 py-0.5">{data.status}</span>
        </div>
      </header>

      {data.cvUrl && (
        <a
          href={data.cvUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block rounded border px-3 py-1 text-sm text-sky-700 hover:bg-sky-50"
        >
          عرض السيرة الذاتية ↗
        </a>
      )}

      {data.coverLetter && (
        <section className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">رسالة التغطية</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{data.coverLetter}</p>
        </section>
      )}

      {data.cvText && (
        <section className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">نص السيرة</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{data.cvText}</p>
        </section>
      )}

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">جولات المقابلات</h2>
        <ul className="space-y-2">
          {data.stages.map((s) => (
            <li key={s.id} className="rounded border p-2 text-sm">
              <div className="flex items-center justify-between">
                <span>الجولة {s.roundNumber}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{s.outcome}</span>
              </div>
              {s.scheduledAt && (
                <div className="text-xs text-slate-500">
                  موعد: {new Date(s.scheduledAt).toLocaleString('ar-IQ')}
                </div>
              )}
              {s.outcome === 'pending' && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => recordOutcome.mutate({ stageId: s.id, outcome: 'passed', score: 8 })}
                    className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800"
                  >
                    اجتاز
                  </button>
                  <button
                    type="button"
                    onClick={() => recordOutcome.mutate({ stageId: s.id, outcome: 'failed' })}
                    className="rounded bg-rose-100 px-2 py-0.5 text-xs text-rose-800"
                  >
                    رسب
                  </button>
                </div>
              )}
            </li>
          ))}
          {data.stages.length === 0 && (
            <li className="text-xs text-slate-400">لا توجد جولات بعد.</li>
          )}
        </ul>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="text-xs text-slate-500">رقم الجولة</span>
            <input
              type="number"
              min={1}
              value={round}
              onChange={(e) => setRound(Number(e.target.value))}
              className="mt-1 w-20 rounded border px-2 py-1 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">الموعد</span>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="mt-1 rounded border px-2 py-1 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={schedule.isPending}
            onClick={() => schedule.mutate()}
            className="rounded bg-sky-700 px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            جدولة جولة
          </button>
        </div>
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">العرض الوظيفي</h2>
        {data.offer ? (
          <div className="space-y-2 text-sm">
            <div>الراتب المقترح: <span className="font-mono">{data.offer.proposedSalaryIqd}</span> IQD</div>
            <div>تاريخ المباشرة: {new Date(data.offer.startDate).toLocaleDateString('ar-IQ')}</div>
            <div>تنتهي صلاحية العرض: {new Date(data.offer.expiresAt).toLocaleString('ar-IQ')}</div>
            <div>الحالة: {data.offer.status}</div>
            {data.offer.status === 'draft' && (
              <button
                type="button"
                onClick={() => sendOffer.mutate(data.offer!.id)}
                className="rounded bg-violet-700 px-3 py-1 text-sm text-white"
              >
                إرسال العرض
              </button>
            )}
          </div>
        ) : (
          <CreateOfferForm onCreate={(p) => createOffer.mutate(p)} pending={createOffer.isPending} />
        )}
      </section>
    </div>
  );
}

function CreateOfferForm(props: {
  onCreate: (input: { proposedSalaryIqd: number; startDate: string; expiresAt: string }) => void;
  pending: boolean;
}) {
  const [salary, setSalary] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <label className="block">
        <span className="text-xs text-slate-500">الراتب المقترح (IQD)</span>
        <input
          type="number"
          value={salary}
          onChange={(e) => setSalary(Number(e.target.value))}
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
        />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">تاريخ المباشرة</span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
        />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">تنتهي بعد</span>
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
        />
      </label>
      <div className="md:col-span-3">
        <button
          type="button"
          disabled={props.pending || !salary || !startDate || !expiresAt}
          onClick={() => props.onCreate({ proposedSalaryIqd: salary, startDate, expiresAt })}
          className="rounded bg-violet-700 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          إصدار عرض (مسودة)
        </button>
      </div>
    </div>
  );
}
