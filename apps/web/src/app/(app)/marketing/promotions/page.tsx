'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { formatIqd, formatDate } from '@/lib/format';

export default function PromotionsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['promotions'],
    queryFn: () => api<any>('/marketing/promotions'),
  });
  const rows: any[] = Array.isArray(data) ? data : data?.items ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">العروض الترويجية</h1>
        <p className="text-sm text-slate-500">{rows.length} عرض</p>
      </header>

      <DataTable
        columns={[
          { key: 'code',  header: 'الكود',  accessor: (r: any) => r.code ? <span className="font-mono">{r.code}</span> : <span className="text-slate-400">تلقائي</span> },
          { key: 'name',  header: 'الاسم',  accessor: (r: any) => r.nameAr },
          { key: 'type',  header: 'النوع',  accessor: (r: any) => r.type },
          { key: 'value', header: 'القيمة', accessor: (r: any) => r.type === 'percent' ? `${r.value}%` : formatIqd(r.value), align: 'end' },
          { key: 'used',  header: 'الاستخدامات', accessor: (r: any) => r.maxUses ? `${r.usedCount}/${r.maxUses}` : String(r.usedCount), align: 'end' },
          { key: 'period',header: 'الفترة', accessor: (r: any) => `${formatDate(r.startDate)} → ${formatDate(r.endDate)}` },
          { key: 'active',header: 'الحالة', accessor: (r: any) => r.isActive ? <span className="text-emerald-700">نشط</span> : <span className="text-slate-500">معطّل</span> },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر التحميل' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد عروض"
        exportFilename="promotions"
        getRowKey={(r: any) => r.id}
      />
    </div>
  );
}
