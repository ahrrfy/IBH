'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

export default function JournalEntriesPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['journal-entries'],
    queryFn: () => api<any>('/finance/gl/entries'),
  });
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">القيود المحاسبية</h1>
      <DataTable
        columns={[
          { key: 'number', header: 'الرقم', accessor: (r: any) => r.entryNumber },
          { key: 'date', header: 'التاريخ', accessor: (r: any) => formatDate(r.entryDate) },
          { key: 'desc', header: 'الوصف', accessor: (r: any) => r.description },
          { key: 'ref', header: 'المرجع', accessor: (r: any) => `${r.refType}:${r.refId?.slice(-6)}` },
          { key: 'debit', header: 'مدين', accessor: (r: any) => formatIqd(r.totalDebitIqd), align: 'end' },
          { key: 'credit', header: 'دائن', accessor: (r: any) => formatIqd(r.totalCreditIqd), align: 'end' },
          { key: 'status', header: 'الحالة', accessor: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error ? 'خطأ' : null}
        onRetry={() => refetch()}
        getRowKey={(r: any) => r.id}
        exportFilename="journal-entries"
      />
    </div>
  );
}
