'use client';

/**
 * HR Salary Bands management page (T53).
 *
 * Salary bands define the allowable compensation range per grade + sub-band.
 * Each band has min / mid / max IQD values.
 * Linked to PayGrade for payroll enforcement — additive, not replacing PayGrade.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';

type SalaryBand = {
  id: string;
  grade: string;
  band: string;
  nameAr: string;
  minIqd: string;
  midIqd: string;
  maxIqd: string;
  isActive: boolean;
};

export default function SalaryBandsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    grade: '',
    band: '',
    nameAr: '',
    minIqd: '',
    midIqd: '',
    maxIqd: '',
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<SalaryBand>>({});
  const [error, setError] = useState<string | null>(null);

  const bandsQ = useQuery({
    queryKey: ['hr', 'salary-bands'],
    queryFn: () => api<SalaryBand[]>('/hr/salary-bands'),
  });

  const createMut = useMutation({
    mutationFn: () =>
      api('/hr/salary-bands', {
        method: 'POST',
        body: JSON.stringify({
          grade: form.grade,
          band: form.band,
          nameAr: form.nameAr,
          minIqd: Number(form.minIqd),
          midIqd: Number(form.midIqd),
          maxIqd: Number(form.maxIqd),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr', 'salary-bands'] });
      setForm({ grade: '', band: '', nameAr: '', minIqd: '', midIqd: '', maxIqd: '' });
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SalaryBand> }) =>
      api(`/hr/salary-bands/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nameAr: data.nameAr,
          minIqd: data.minIqd !== undefined ? Number(data.minIqd) : undefined,
          midIqd: data.midIqd !== undefined ? Number(data.midIqd) : undefined,
          maxIqd: data.maxIqd !== undefined ? Number(data.maxIqd) : undefined,
          isActive: data.isActive,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr', 'salary-bands'] });
      setEditId(null);
      setEditForm({});
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  // Group bands by grade for display
  const grouped: Record<string, SalaryBand[]> = {};
  (bandsQ.data ?? []).forEach((b) => {
    if (!grouped[b.grade]) grouped[b.grade] = [];
    grouped[b.grade].push(b);
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">نطاقات الرواتب</h1>
          <p className="text-sm text-gray-500 mt-1">تحديد حدود الراتب لكل درجة وشريحة</p>
        </div>
        <Link href="/hr/promotions" className="text-sm text-blue-600 hover:underline">
          ← الترقيات
        </Link>
      </div>

      {/* Create form */}
      <section className="border rounded-lg p-4">
        <h2 className="font-semibold mb-3">إضافة نطاق راتب جديد</h2>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2 mb-3">
            {error}
          </div>
        )}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <label className="block text-xs text-gray-600 mb-1">الدرجة *</label>
            <input
              value={form.grade}
              onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))}
              placeholder="مثال: G5"
              maxLength={10}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">الشريحة *</label>
            <select
              value={form.band}
              onChange={(e) => setForm((f) => ({ ...f, band: e.target.value }))}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">اختر</option>
              <option value="A">A — مبتدئ</option>
              <option value="B">B — متمكن</option>
              <option value="C">C — خبير</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">الاسم *</label>
            <input
              value={form.nameAr}
              onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))}
              placeholder="مثال: مهندس أول - مبتدئ"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">الحد الأدنى (د.ع) *</label>
            <input
              type="number"
              value={form.minIqd}
              onChange={(e) => setForm((f) => ({ ...f, minIqd: e.target.value }))}
              placeholder="300000"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">المتوسط (د.ع) *</label>
            <input
              type="number"
              value={form.midIqd}
              onChange={(e) => setForm((f) => ({ ...f, midIqd: e.target.value }))}
              placeholder="500000"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">الحد الأقصى (د.ع) *</label>
            <input
              type="number"
              value={form.maxIqd}
              onChange={(e) => setForm((f) => ({ ...f, maxIqd: e.target.value }))}
              placeholder="700000"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          onClick={() => createMut.mutate()}
          disabled={
            !form.grade ||
            !form.band ||
            !form.nameAr ||
            !form.minIqd ||
            !form.midIqd ||
            !form.maxIqd ||
            createMut.isPending
          }
          className="mt-3 px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
        >
          {createMut.isPending ? 'جارٍ الحفظ…' : 'إضافة النطاق'}
        </button>
      </section>

      {/* Bands table grouped by grade */}
      {bandsQ.isLoading && <p className="text-sm text-gray-500">جارٍ التحميل…</p>}
      {Object.keys(grouped)
        .sort()
        .map((grade) => (
          <section key={grade} className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b">
              <h3 className="font-semibold text-sm">الدرجة {grade}</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b">
                  <th className="text-right px-4 py-2">الشريحة</th>
                  <th className="text-right px-4 py-2">الاسم</th>
                  <th className="text-right px-4 py-2">الحد الأدنى</th>
                  <th className="text-right px-4 py-2">المتوسط</th>
                  <th className="text-right px-4 py-2">الحد الأقصى</th>
                  <th className="text-right px-4 py-2">الحالة</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {grouped[grade].map((b) => (
                  <tr key={b.id} className="border-b hover:bg-gray-50">
                    {editId === b.id ? (
                      <>
                        <td className="px-4 py-2 font-bold">{b.band}</td>
                        <td className="px-4 py-2">
                          <input
                            value={editForm.nameAr ?? b.nameAr}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, nameAr: e.target.value }))
                            }
                            className="border rounded px-2 py-1 text-sm w-full"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={editForm.minIqd ?? b.minIqd}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, minIqd: e.target.value }))
                            }
                            className="border rounded px-2 py-1 text-sm w-28"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={editForm.midIqd ?? b.midIqd}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, midIqd: e.target.value }))
                            }
                            className="border rounded px-2 py-1 text-sm w-28"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={editForm.maxIqd ?? b.maxIqd}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, maxIqd: e.target.value }))
                            }
                            className="border rounded px-2 py-1 text-sm w-28"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={editForm.isActive ?? b.isActive}
                              onChange={(e) =>
                                setEditForm((f) => ({ ...f, isActive: e.target.checked }))
                              }
                            />
                            نشط
                          </label>
                        </td>
                        <td className="px-4 py-2 flex gap-2">
                          <button
                            onClick={() =>
                              updateMut.mutate({ id: b.id, data: editForm })
                            }
                            disabled={updateMut.isPending}
                            className="text-green-600 hover:underline text-xs"
                          >
                            حفظ
                          </button>
                          <button
                            onClick={() => {
                              setEditId(null);
                              setEditForm({});
                            }}
                            className="text-gray-500 hover:underline text-xs"
                          >
                            إلغاء
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 font-bold">{b.band}</td>
                        <td className="px-4 py-2">{b.nameAr}</td>
                        <td className="px-4 py-2">{Number(b.minIqd).toLocaleString('ar-IQ')}</td>
                        <td className="px-4 py-2">{Number(b.midIqd).toLocaleString('ar-IQ')}</td>
                        <td className="px-4 py-2">{Number(b.maxIqd).toLocaleString('ar-IQ')}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              b.isActive
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {b.isActive ? 'نشط' : 'غير نشط'}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => {
                              setEditId(b.id);
                              setEditForm({});
                            }}
                            className="text-blue-600 hover:underline text-xs"
                          >
                            تعديل
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

      {bandsQ.data && bandsQ.data.length === 0 && (
        <div className="text-center py-10 text-gray-400 text-sm">
          لا توجد نطاقات رواتب — أضف نطاقاً جديداً أعلاه
        </div>
      )}
    </div>
  );
}
