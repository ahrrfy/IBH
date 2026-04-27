/**
 * T63 — Plans page (super-admin, read-only).
 *
 * Displays the seeded Plan rows from T60 with their feature matrix.
 * Editing seed plans is intentionally out of scope.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface PlanFeature {
  id: string;
  featureCode: string;
  isEnabled: boolean;
  limits: Record<string, unknown> | null;
}

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthlyPriceIqd: string;
  annualPriceIqd: string;
  maxUsers: number | null;
  maxBranches: number | null;
  maxCompanies: number | null;
  isActive: boolean;
  isPublic: boolean;
  features: PlanFeature[];
}

export default function PlansPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-licensing', 'plans-detail'],
    queryFn: () => api<Plan[]>('/admin/licensing/plans'),
  });

  if (isLoading) return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  if (error) return <div className="p-6 text-red-600">تعذّر تحميل الباقات.</div>;

  const plans = data ?? [];

  // Build the union of all feature codes for the matrix header.
  const allFeatures = Array.from(
    new Set(plans.flatMap((p) => p.features.map((f) => f.featureCode))),
  ).sort();

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">الباقات</h1>
        <p className="text-sm text-slate-500 mt-1">
          عرض للقراءة فقط — تعديل الباقات يتم عبر بذور قاعدة البيانات.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((p) => (
          <article
            key={p.id}
            className="border border-slate-200 rounded-lg bg-white p-4 space-y-2"
          >
            <header className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{p.name}</h2>
                <p className="text-xs text-slate-500">{p.code}</p>
              </div>
              {!p.isActive ? (
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                  غير نشط
                </span>
              ) : null}
            </header>
            {p.description ? (
              <p className="text-sm text-slate-600">{p.description}</p>
            ) : null}
            <dl className="grid grid-cols-2 gap-1 text-sm">
              <dt className="text-slate-500">شهري</dt>
              <dd className="text-slate-900 font-medium text-end">
                {Number(p.monthlyPriceIqd).toLocaleString('en-US')} IQD
              </dd>
              <dt className="text-slate-500">سنوي</dt>
              <dd className="text-slate-900 font-medium text-end">
                {Number(p.annualPriceIqd).toLocaleString('en-US')} IQD
              </dd>
              <dt className="text-slate-500">الحد الأقصى للمستخدمين</dt>
              <dd className="text-slate-900 font-medium text-end">{p.maxUsers ?? '∞'}</dd>
              <dt className="text-slate-500">الحد الأقصى للفروع</dt>
              <dd className="text-slate-900 font-medium text-end">{p.maxBranches ?? '∞'}</dd>
            </dl>
          </article>
        ))}
      </section>

      {allFeatures.length > 0 ? (
        <section className="border border-slate-200 rounded-lg bg-white overflow-x-auto">
          <h3 className="px-4 pt-4 pb-2 text-base font-semibold text-slate-900">
            مصفوفة الميزات
          </h3>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="text-start px-4 py-2 font-semibold">الميزة</th>
                {plans.map((p) => (
                  <th key={p.id} className="text-center px-4 py-2 font-semibold">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allFeatures.map((code) => (
                <tr key={code}>
                  <td className="px-4 py-2 text-slate-700">{code}</td>
                  {plans.map((p) => {
                    const feat = p.features.find((f) => f.featureCode === code);
                    return (
                      <td key={p.id} className="text-center px-4 py-2">
                        {feat?.isEnabled ? '✓' : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
