'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';

interface Plan {
  id: string;
  code: string;
  nameAr: string;
  basis: string;
  kind: string;
  flatPct: string;
  isActive: boolean;
  validFrom: string;
  validUntil: string | null;
  _count?: { assignments: number; entries: number };
}

export default function CommissionPlansPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['commission-plans'],
    queryFn: () => api<Plan[]>('/sales/commissions/plans'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">خطط العمولة</h1>
          <p className="text-sm text-slate-500">{data?.length ?? 0} خطة</p>
        </div>
        <Link
          href="/sales/commissions/plans/new"
          className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800"
        >
          <Plus className="size-4" /> خطة جديدة
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-right p-3">الكود</th>
              <th className="text-right p-3">الاسم</th>
              <th className="text-right p-3">النوع</th>
              <th className="text-right p-3">الأساس</th>
              <th className="text-right p-3">النسبة الموحّدة</th>
              <th className="text-right p-3">نشطة</th>
              <th className="text-right p-3">المعيّنون</th>
              <th className="text-right p-3">من تاريخ</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-500">
                  جاري التحميل...
                </td>
              </tr>
            )}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-500">
                  لا توجد خطط بعد
                </td>
              </tr>
            )}
            {data?.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-3 font-mono">{p.code}</td>
                <td className="p-3">
                  <Link
                    href={`/sales/commissions/plans/${p.id}`}
                    className="text-sky-700 hover:underline"
                  >
                    {p.nameAr}
                  </Link>
                </td>
                <td className="p-3">{p.kind}</td>
                <td className="p-3">{p.basis}</td>
                <td className="p-3">{Number(p.flatPct).toFixed(2)}%</td>
                <td className="p-3">{p.isActive ? '✓' : '—'}</td>
                <td className="p-3">{p._count?.assignments ?? 0}</td>
                <td className="p-3">{formatDate(p.validFrom)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
