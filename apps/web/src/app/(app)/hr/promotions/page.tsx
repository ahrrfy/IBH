'use client';

/**
 * HR Promotions list page (T53).
 *
 * Shows pending/recent promotions and an auto-suggest panel
 * (Tier 3 rule-based candidates: tenure ≥ 12 months, attendance ≥ 90%).
 * Managers can create a new promotion or approve/reject pending ones.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Promotion = {
  id: string;
  promotionNo: string;
  employeeId: string;
  fromPositionTitle: string | null;
  toPositionTitle: string | null;
  fromSalaryIqd: string;
  toSalaryIqd: string;
  effectiveDate: string;
  status:
    | 'draft'
    | 'pending_hr'
    | 'pending_director'
    | 'approved'
    | 'rejected'
    | 'cancelled';
  autoSuggestBasis: string | null;
  reason: string | null;
};

type PromotionCandidate = {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  tenureMonths: number;
  attendanceRate: number;
  kpiScore: number | null;
  currentSalaryIqd: number;
  currentPositionTitle: string | null;
  autoSuggestBasis: string;
};

const STATUS_LABEL: Record<Promotion['status'], string> = {
  draft: 'مسودة',
  pending_hr: 'بانتظار مدير الموارد البشرية',
  pending_director: 'بانتظار المدير',
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

export default function PromotionsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);
  const [form, setForm] = useState({
    employeeId: '',
    toPositionTitle: '',
    toSalaryIqd: '',
    toPayGradeId: '',
    toSalaryBandId: '',
    effectiveDate: '',
    reason: '',
  });
  const [createError, setCreateError] = useState<string | null>(null);

  const promotionsQ = useQuery({
    queryKey: ['hr', 'promotions', statusFilter],
    queryFn: () =>
      api<Promotion[]>(
        `/hr/promotions${statusFilter ? `?status=${statusFilter}` : ''}`,
      ),
  });

  const suggestQ = useQuery({
    queryKey: ['hr', 'promotions', 'suggest'],
    queryFn: () => api<PromotionCandidate[]>('/hr/promotions/suggest'),
    enabled: showSuggest,
  });

  const createMut = useMutation({
    mutationFn: (data: typeof form) =>
      api('/hr/promotions', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: data.employeeId,
          toPositionTitle: data.toPositionTitle || undefined,
          toSalaryIqd: Number(data.toSalaryIqd),
          toPayGradeId: data.toPayGradeId || undefined,
          toSalaryBandId: data.toSalaryBandId || undefined,
          effectiveDate: data.effectiveDate,
          reason: data.reason || undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr', 'promotions'] });
      setForm({
        employeeId: '',
        toPositionTitle: '',
        toSalaryIqd: '',
        toPayGradeId: '',
        toSalaryBandId: '',
        effectiveDate: '',
        reason: '',
      });
      setCreateError(null);
    },
    onError: (e: Error) => setCreateError(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">الترقيات الوظيفية</h1>
          <p className="text-sm text-gray-500 mt-1">إدارة طلبات الترقية والموافقة عليها</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSuggest((p) => !p)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            {showSuggest ? 'إخفاء المقترحات' : 'مقترحات الترقية الذكية'}
          </button>
          <Link
            href="/hr/salary-bands"
            className="px-4 py-2 border rounded text-sm hover:bg-gray-50"
          >
            نطاقات الرواتب
          </Link>
        </div>
      </div>

      {/* Auto-suggest panel */}
      {showSuggest && (
        <section className="border border-blue-200 rounded-lg p-4 bg-blue-50">
          <h2 className="font-semibold text-blue-800 mb-3">
            مرشحون للترقية (قواعد تلقائية: الخدمة ≥ 12 شهر + الحضور ≥ 90%)
          </h2>
          {suggestQ.isLoading && <p className="text-sm text-gray-500">جارٍ التحليل…</p>}
          {suggestQ.data && suggestQ.data.length === 0 && (
            <p className="text-sm text-gray-500">لا توجد مرشحون بناءً على معايير القواعد الحالية.</p>
          )}
          {suggestQ.data && suggestQ.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="text-sm w-full">
                <thead>
                  <tr className="text-xs text-gray-600 border-b">
                    <th className="text-right py-2 px-2">الموظف</th>
                    <th className="text-right py-2 px-2">مدة الخدمة</th>
                    <th className="text-right py-2 px-2">نسبة الحضور</th>
                    <th className="text-right py-2 px-2">الراتب الحالي (د.ع)</th>
                    <th className="text-right py-2 px-2">أساس الاقتراح</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {suggestQ.data.map((c) => (
                    <tr key={c.employeeId} className="border-b hover:bg-blue-100">
                      <td className="py-2 px-2">{c.employeeName} <span className="text-gray-400">({c.employeeNumber})</span></td>
                      <td className="py-2 px-2">{c.tenureMonths} شهر</td>
                      <td className="py-2 px-2">{c.attendanceRate}%</td>
                      <td className="py-2 px-2">{c.currentSalaryIqd.toLocaleString('ar-IQ')}</td>
                      <td className="py-2 px-2 text-xs text-gray-500">{c.autoSuggestBasis}</td>
                      <td className="py-2 px-2">
                        <button
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              employeeId: c.employeeId,
                            }))
                          }
                          className="text-blue-600 hover:underline text-xs"
                        >
                          إنشاء طلب
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Create promotion form */}
      <section className="border rounded-lg p-4">
        <h2 className="font-semibold mb-3">إنشاء طلب ترقية جديد</h2>
        {createError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2 mb-3">
            {createError}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <label className="block text-xs text-gray-600 mb-1">رقم الموظف / المعرّف *</label>
            <input
              value={form.employeeId}
              onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
              placeholder="ULID الموظف"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">المسمى الوظيفي الجديد</label>
            <input
              value={form.toPositionTitle}
              onChange={(e) => setForm((f) => ({ ...f, toPositionTitle: e.target.value }))}
              placeholder="مثال: مدير قسم"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">الراتب المقترح (د.ع) *</label>
            <input
              type="number"
              value={form.toSalaryIqd}
              onChange={(e) => setForm((f) => ({ ...f, toSalaryIqd: e.target.value }))}
              placeholder="مثال: 750000"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">تاريخ النفاذ *</label>
            <input
              type="date"
              value={form.effectiveDate}
              onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">معرّف نطاق الراتب (اختياري)</label>
            <input
              value={form.toSalaryBandId}
              onChange={(e) => setForm((f) => ({ ...f, toSalaryBandId: e.target.value }))}
              placeholder="ULID النطاق"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">معرّف درجة الراتب (اختياري)</label>
            <input
              value={form.toPayGradeId}
              onChange={(e) => setForm((f) => ({ ...f, toPayGradeId: e.target.value }))}
              placeholder="ULID الدرجة"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-600 mb-1">سبب الترقية</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              rows={2}
              placeholder="أسباب الترقية..."
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          onClick={() => createMut.mutate(form)}
          disabled={!form.employeeId || !form.toSalaryIqd || !form.effectiveDate || createMut.isPending}
          className="mt-3 px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
        >
          {createMut.isPending ? 'جارٍ الحفظ…' : 'إنشاء طلب الترقية'}
        </button>
      </section>

      {/* Promotions list */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="font-semibold">قائمة الترقيات</h2>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded px-3 py-1 text-sm"
          >
            <option value="">كل الحالات</option>
            <option value="draft">مسودة</option>
            <option value="pending_hr">بانتظار م.الموارد البشرية</option>
            <option value="pending_director">بانتظار المدير</option>
            <option value="approved">معتمد</option>
            <option value="rejected">مرفوض</option>
          </select>
        </div>

        {promotionsQ.isLoading && <p className="text-sm text-gray-500">جارٍ التحميل…</p>}
        {promotionsQ.isError && (
          <p className="text-sm text-red-500">حدث خطأ: {(promotionsQ.error as Error).message}</p>
        )}
        {promotionsQ.data && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-600">
                  <th className="text-right p-3 border-b">رقم الطلب</th>
                  <th className="text-right p-3 border-b">المسمى الجديد</th>
                  <th className="text-right p-3 border-b">الراتب الحالي</th>
                  <th className="text-right p-3 border-b">الراتب المقترح</th>
                  <th className="text-right p-3 border-b">تاريخ النفاذ</th>
                  <th className="text-right p-3 border-b">الحالة</th>
                  <th className="p-3 border-b" />
                </tr>
              </thead>
              <tbody>
                {promotionsQ.data.map((p) => (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs">{p.promotionNo}</td>
                    <td className="p-3">{p.toPositionTitle ?? '—'}</td>
                    <td className="p-3">
                      {Number(p.fromSalaryIqd).toLocaleString('ar-IQ')}
                    </td>
                    <td className="p-3 font-semibold text-green-700">
                      {Number(p.toSalaryIqd).toLocaleString('ar-IQ')}
                    </td>
                    <td className="p-3">{new Date(p.effectiveDate).toLocaleDateString('ar-IQ')}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${STATUS_COLOR[p.status]}`}>
                        {STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/hr/promotions/${p.id}`}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        التفاصيل
                      </Link>
                    </td>
                  </tr>
                ))}
                {promotionsQ.data.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center p-6 text-gray-400 text-sm">
                      لا توجد طلبات ترقية
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
