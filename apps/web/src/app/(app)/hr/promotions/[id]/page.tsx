'use client';

/**
 * HR Promotion detail + approval page (T53).
 *
 * Approval workflow:
 *   draft → submit → pending_hr → hr-approve → pending_director → director-approve → approved
 * Each approval step records the approver + optional note.
 * Rejection at any step closes the request.
 *
 * After director approval, system automatically updates the employee record
 * (salary + pay grade + position title) and a contract amendment is drafted
 * by HR staff via the contracts module — NOT auto-issued.
 */
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';

type ApprovalRecord = {
  id: string;
  step: number;
  decision: 'approved' | 'rejected';
  approvedBy: string;
  note: string | null;
  decidedAt: string;
};

type Promotion = {
  id: string;
  promotionNo: string;
  employeeId: string;
  fromPositionTitle: string | null;
  toPositionTitle: string | null;
  fromSalaryIqd: string;
  toSalaryIqd: string;
  fromPayGradeId: string | null;
  toPayGradeId: string | null;
  toSalaryBandId: string | null;
  effectiveDate: string;
  reason: string | null;
  autoSuggestBasis: string | null;
  status:
    | 'draft'
    | 'pending_hr'
    | 'pending_director'
    | 'approved'
    | 'rejected'
    | 'cancelled';
  approvals: ApprovalRecord[];
  createdAt: string;
};

const STATUS_LABEL: Record<Promotion['status'], string> = {
  draft: 'مسودة',
  pending_hr: 'بانتظار مدير الموارد البشرية',
  pending_director: 'بانتظار المدير العام',
  approved: 'معتمد',
  rejected: 'مرفوض',
  cancelled: 'ملغي',
};

const STATUS_COLOR: Record<Promotion['status'], string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_hr: 'bg-yellow-100 text-yellow-800',
  pending_director: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-200 text-gray-500',
};

export default function PromotionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [actionNote, setActionNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const promoQ = useQuery({
    queryKey: ['hr', 'promotions', id],
    queryFn: () => api<Promotion>(`/hr/promotions/${id}`),
  });

  const submitMut = useMutation({
    mutationFn: () => api(`/hr/promotions/${id}/submit`, { method: 'PATCH', body: '{}' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr', 'promotions'] });
      setActionError(null);
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const hrApproveMut = useMutation({
    mutationFn: (note: string) =>
      api(`/hr/promotions/${id}/hr-approve`, {
        method: 'PATCH',
        body: JSON.stringify({ note: note || undefined }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr', 'promotions'] });
      setActionNote('');
      setActionError(null);
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const directorApproveMut = useMutation({
    mutationFn: (note: string) =>
      api(`/hr/promotions/${id}/director-approve`, {
        method: 'PATCH',
        body: JSON.stringify({ note: note || undefined }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr', 'promotions'] });
      setActionNote('');
      setActionError(null);
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: (note: string) =>
      api(`/hr/promotions/${id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr', 'promotions'] });
      setActionNote('');
      setActionError(null);
    },
    onError: (e: Error) => setActionError(e.message),
  });

  if (promoQ.isLoading) return <div className="p-6 text-sm text-gray-500">جارٍ التحميل…</div>;
  if (promoQ.isError)
    return <div className="p-6 text-sm text-red-500">خطأ: {(promoQ.error as Error).message}</div>;

  const p = promoQ.data!;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/hr/promotions" className="text-sm text-blue-600 hover:underline">
            ← الترقيات
          </Link>
          <h1 className="text-xl font-bold mt-1">طلب ترقية {p.promotionNo}</h1>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm ${STATUS_COLOR[p.status]}`}>
          {STATUS_LABEL[p.status]}
        </span>
      </div>

      {/* Details */}
      <section className="border rounded-lg p-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-gray-500 mb-1">المسمى الحالي</p>
          <p className="font-medium">{p.fromPositionTitle ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">المسمى المقترح</p>
          <p className="font-medium text-blue-700">{p.toPositionTitle ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">الراتب الحالي (د.ع)</p>
          <p className="font-medium">{Number(p.fromSalaryIqd).toLocaleString('ar-IQ')}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">الراتب المقترح (د.ع)</p>
          <p className="font-semibold text-green-700">{Number(p.toSalaryIqd).toLocaleString('ar-IQ')}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">تاريخ النفاذ</p>
          <p>{new Date(p.effectiveDate).toLocaleDateString('ar-IQ')}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">تاريخ الطلب</p>
          <p>{new Date(p.createdAt).toLocaleDateString('ar-IQ')}</p>
        </div>
        {p.reason && (
          <div className="col-span-2">
            <p className="text-xs text-gray-500 mb-1">سبب الترقية</p>
            <p>{p.reason}</p>
          </div>
        )}
        {p.autoSuggestBasis && (
          <div className="col-span-2">
            <p className="text-xs text-gray-500 mb-1">أساس الاقتراح الذكي</p>
            <p className="text-xs text-blue-600 font-mono">{p.autoSuggestBasis}</p>
          </div>
        )}
      </section>

      {/* Approval history */}
      {p.approvals.length > 0 && (
        <section className="border rounded-lg p-4">
          <h2 className="font-semibold mb-3 text-sm">سجل الموافقات</h2>
          <div className="space-y-2">
            {p.approvals.map((a) => (
              <div
                key={a.id}
                className={`flex items-start gap-3 p-2 rounded text-sm ${
                  a.decision === 'approved' ? 'bg-green-50' : 'bg-red-50'
                }`}
              >
                <span
                  className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    a.decision === 'approved'
                      ? 'bg-green-200 text-green-800'
                      : 'bg-red-200 text-red-800'
                  }`}
                >
                  {a.step}
                </span>
                <div className="flex-1">
                  <p className="font-medium">
                    {a.decision === 'approved' ? 'موافقة' : 'رفض'} —{' '}
                    {a.step === 1 ? 'مدير الموارد البشرية' : 'المدير العام'}
                  </p>
                  {a.note && <p className="text-gray-600 text-xs mt-0.5">{a.note}</p>}
                  <p className="text-gray-400 text-xs">
                    {new Date(a.decidedAt).toLocaleString('ar-IQ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Action panel */}
      {(p.status === 'draft' ||
        p.status === 'pending_hr' ||
        p.status === 'pending_director') && (
        <section className="border rounded-lg p-4">
          <h2 className="font-semibold mb-3 text-sm">الإجراءات</h2>

          {actionError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2 mb-3">
              {actionError}
            </div>
          )}

          {(p.status === 'pending_hr' || p.status === 'pending_director') && (
            <div className="mb-3">
              <label className="block text-xs text-gray-600 mb-1">
                ملاحظة الموافقة / الرفض (اختياري)
              </label>
              <textarea
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                rows={2}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="ملاحظات إضافية…"
              />
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {p.status === 'draft' && (
              <button
                onClick={() => submitMut.mutate()}
                disabled={submitMut.isPending}
                className="px-4 py-2 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600 disabled:opacity-50"
              >
                {submitMut.isPending ? 'جارٍ…' : 'تقديم للمراجعة'}
              </button>
            )}
            {p.status === 'pending_hr' && (
              <>
                <button
                  onClick={() => hrApproveMut.mutate(actionNote)}
                  disabled={hrApproveMut.isPending}
                  className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {hrApproveMut.isPending ? 'جارٍ…' : 'موافقة م.الموارد البشرية'}
                </button>
                <button
                  onClick={() => rejectMut.mutate(actionNote || 'رفض بدون ملاحظة')}
                  disabled={rejectMut.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
                >
                  {rejectMut.isPending ? 'جارٍ…' : 'رفض'}
                </button>
              </>
            )}
            {p.status === 'pending_director' && (
              <>
                <button
                  onClick={() => directorApproveMut.mutate(actionNote)}
                  disabled={directorApproveMut.isPending}
                  className="px-4 py-2 bg-green-700 text-white rounded text-sm hover:bg-green-800 disabled:opacity-50"
                >
                  {directorApproveMut.isPending ? 'جارٍ…' : 'موافقة المدير العام (تأكيد نهائي)'}
                </button>
                <button
                  onClick={() => rejectMut.mutate(actionNote || 'رفض المدير')}
                  disabled={rejectMut.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
                >
                  {rejectMut.isPending ? 'جارٍ…' : 'رفض'}
                </button>
              </>
            )}
          </div>

          {p.status === 'pending_director' && (
            <p className="text-xs text-gray-500 mt-3">
              ملاحظة: عند موافقة المدير، سيتم تحديث بيانات الموظف تلقائياً (الراتب + الدرجة + المسمى).
              يجب على فريق الموارد البشرية مراجعة وإصدار تعديل العقد يدوياً.
            </p>
          )}
        </section>
      )}

      {p.status === 'approved' && (
        <section className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
          <p className="font-semibold mb-1">تم اعتماد الترقية</p>
          <p>تم تحديث بيانات الموظف. تفضّل بمراجعة وحدة العقود لإصدار تعديل العقد الرسمي.</p>
          <Link href="/hr/contracts" className="text-green-700 underline mt-2 inline-block">
            الانتقال لإدارة العقود ←
          </Link>
        </section>
      )}
    </div>
  );
}
