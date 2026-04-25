'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

export default function JournalEntryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['journal-entry', id],
    queryFn: () => api<any>(`/finance/gl/entries/${id}`),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  if (error || !data) return <div className="p-6 text-rose-600">تعذَّر تحميل القيد</div>;

  const lines: any[] = data.lines ?? [];
  const totalDebit  = lines.filter((l) => l.side === 'debit').reduce((a, l) => a + Number(l.amountIqd), 0);
  const totalCredit = lines.filter((l) => l.side === 'credit').reduce((a, l) => a + Number(l.amountIqd), 0);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/finance/journal-entries" className="text-sm text-sky-700 hover:underline">← العودة للقائمة</Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-3xl font-bold">قيد {data.entryNumber}</h1>
          <StatusBadge status={data.status} />
        </div>
        <p className="text-sm text-slate-500">{formatDate(data.entryDate)} · {data.description}</p>
      </header>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr><th className="text-start">الحساب</th><th className="text-start">الوصف</th><th className="text-end">مدين</th><th className="text-end">دائن</th></tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="py-2 font-mono">{l.accountCode} — {l.accountNameAr}</td>
                <td>{l.description ?? '—'}</td>
                <td className="text-end">{l.side === 'debit'  ? formatIqd(l.amountIqd) : '—'}</td>
                <td className="text-end">{l.side === 'credit' ? formatIqd(l.amountIqd) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 font-semibold">
            <tr>
              <td colSpan={2} className="py-2">المجموع</td>
              <td className="text-end">{formatIqd(totalDebit)}</td>
              <td className="text-end">{formatIqd(totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
        {Math.abs(totalDebit - totalCredit) > 0.01 && (
          <p className="mt-3 text-rose-600">⚠️ القيد غير متوازن</p>
        )}
      </section>
    </div>
  );
}
