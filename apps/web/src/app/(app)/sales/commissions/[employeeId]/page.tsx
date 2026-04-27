'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatIqd, formatDate } from '@/lib/format';

interface CommissionEntry {
  id: string;
  kind: string;
  refType: string;
  refId: string;
  baseAmountIqd: string;
  pctApplied: string;
  amountIqd: string;
  status: string;
  createdAt: string;
  plan?: { code: string; nameAr: string };
}

interface Summary {
  today: number;
  mtd: number;
  ytd: number;
}

export default function EmployeeCommissionsPage() {
  const params = useParams();
  const employeeId = params.employeeId as string;

  const { data: summary } = useQuery({
    queryKey: ['commission-summary', employeeId],
    queryFn: () => api<Summary>(`/sales/commissions/summary/${employeeId}`),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['commission-entries-by-employee', employeeId],
    queryFn: () =>
      api<{ items: CommissionEntry[]; total: number }>(
        `/sales/commissions/entries?employeeId=${employeeId}&limit=100`,
      ),
  });

  const Card = ({ label, value }: { label: string; value: number | undefined }) => (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{formatIqd(value ?? 0)}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">عمولات الموظف</h1>
        <p className="text-sm text-slate-500 font-mono">{employeeId}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card label="اليوم" value={summary?.today} />
        <Card label="هذا الشهر (MTD)" value={summary?.mtd} />
        <Card label="هذه السنة (YTD)" value={summary?.ytd} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-right p-3">التاريخ</th>
              <th className="text-right p-3">الخطة</th>
              <th className="text-right p-3">المرجع</th>
              <th className="text-right p-3">النوع</th>
              <th className="text-right p-3">الأساس</th>
              <th className="text-right p-3">النسبة</th>
              <th className="text-right p-3">المبلغ</th>
              <th className="text-right p-3">الحالة</th>
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
            {!isLoading && (data?.items?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-500">
                  لا توجد قيود لهذا الموظف
                </td>
              </tr>
            )}
            {data?.items?.map((e) => (
              <tr key={e.id} className="border-t border-slate-100">
                <td className="p-3">{formatDate(e.createdAt)}</td>
                <td className="p-3">{e.plan?.nameAr ?? '—'}</td>
                <td className="p-3 font-mono text-xs">
                  {e.refType}:{e.refId.slice(-6)}
                </td>
                <td className="p-3">{e.kind}</td>
                <td className="p-3">{formatIqd(Number(e.baseAmountIqd))}</td>
                <td className="p-3">{Number(e.pctApplied).toFixed(2)}%</td>
                <td className="p-3 font-medium">{formatIqd(Number(e.amountIqd))}</td>
                <td className="p-3">{e.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
