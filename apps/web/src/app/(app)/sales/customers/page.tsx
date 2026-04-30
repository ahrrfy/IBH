'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Upload } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { FilterBar, type FilterConfig } from '@/components/filter-bar';
import { ImportWizard, type ImportField } from '@/components/import-wizard';
import { formatIqd } from '@/lib/format';
import { toast } from '@/components/toast';

const FILTERS: FilterConfig[] = [
  { type: 'search', key: 'search', placeholder: 'بحث بالاسم أو الرمز أو الهاتف...' },
];

const IMPORT_FIELDS: ImportField[] = [
  { key: 'nameAr', label: 'اسم العميل', type: 'string', required: true, aliases: ['الاسم', 'العميل', 'name'] },
  { key: 'phone', label: 'الهاتف', type: 'string', aliases: ['رقم الهاتف', 'mobile', 'الموبايل'] },
  { key: 'email', label: 'البريد', type: 'string', aliases: ['الإيميل', 'email'] },
  { key: 'address', label: 'العنوان', type: 'string', aliases: ['الموقع', 'address'] },
  { key: 'taxId', label: 'الرقم الضريبي', type: 'string', aliases: ['tax', 'ضريبي'] },
];

export default function CustomersPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showImport, setShowImport] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['customers', filters],
    queryFn: () => api<any>(`/sales/customers?${new URLSearchParams(filters).toString()}`),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">العملاء</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowImport(true)} className="btn-secondary">
            <Upload className="h-4 w-4" />
            استيراد Excel
          </button>
          <Link href="/sales/customers/new" className="btn-primary">
            <Plus className="h-4 w-4" />
            عميل جديد
          </Link>
        </div>
      </header>

      <FilterBar filters={FILTERS} values={filters} onChange={setFilters} />

      <DataTable
        columns={[
          { key: 'code', header: 'الرمز', accessor: (r: any) => r.code, sortable: true, sortValue: (r: any) => r.code ?? '', exportValue: (r: any) => r.code },
          { key: 'name', header: 'الاسم', accessor: (r: any) => r.nameAr, exportValue: (r: any) => r.nameAr },
          { key: 'phone', header: 'الهاتف', accessor: (r: any) => <span className="num-latin">{r.phone ?? '—'}</span>, exportValue: (r: any) => r.phone ?? '' },
          { key: 'balance', header: 'الرصيد', accessor: (r: any) => formatIqd(r.creditBalanceIqd), align: 'end', sortable: true, sortValue: (r: any) => Number(r.creditBalanceIqd ?? 0), exportValue: (r: any) => Number(r.creditBalanceIqd ?? 0) },
          { key: 'tier', header: 'المستوى', accessor: (r: any) => r.loyaltyTier ?? 'عادي', exportValue: (r: any) => r.loyaltyTier ?? '' },
          { key: 'points', header: 'النقاط', accessor: (r: any) => <span className="num-latin">{r.loyaltyPoints ?? 0}</span>, align: 'center', exportValue: (r: any) => r.loyaltyPoints ?? 0 },
        ]}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error ? 'تعذَّر تحميل العملاء' : null}
        onRetry={() => refetch()}
        emptyMessage="لا يوجد عملاء"
        getRowKey={(r: any) => r.id}
        exportFilename="customers"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="العملاء"
        columnToggle
        densityToggle
        printable
      />

      {showImport && (
        <ImportWizard
          title="استيراد العملاء"
          fields={IMPORT_FIELDS}
          onImportBatch={(rows) =>
            api<{ inserted?: number; errors?: string[] }>('/sales/customers/import', {
              method: 'POST',
              body: JSON.stringify({ rows }),
            })
          }
          onComplete={() => {
            qc.invalidateQueries({ queryKey: ['customers'] });
            toast.success('تم استيراد العملاء بنجاح');
          }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
