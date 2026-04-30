'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit3, Layers, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { FilterBar, type FilterConfig } from '@/components/filter-bar';
import { BulkActionBar } from '@/components/bulk-action-bar';
import { ImportWizard, type ImportField } from '@/components/import-wizard';
import { formatIqd } from '@/lib/format';
import { toast } from '@/components/toast';

const TYPE_OPTIONS = [
  { value: 'goods',   label: 'بضاعة' },
  { value: 'service', label: 'خدمة' },
];

const FILTERS: FilterConfig[] = [
  { type: 'search', key: 'search', placeholder: 'بحث بالاسم أو SKU…' },
  { type: 'select', key: 'type', label: 'كل الأنواع', options: TYPE_OPTIONS },
];

const IMPORT_FIELDS: ImportField[] = [
  { key: 'nameAr', label: 'اسم المنتج', type: 'string', required: true, aliases: ['الاسم', 'المنتج', 'name'] },
  { key: 'sku', label: 'رمز المنتج', type: 'string', required: true, aliases: ['SKU', 'الرمز', 'code'] },
  { key: 'nameEn', label: 'الاسم بالإنجليزية', type: 'string', aliases: ['English Name'] },
  { key: 'type', label: 'النوع', type: 'string', aliases: ['productType', 'نوع'] },
  { key: 'basePriceIqd', label: 'السعر الأساسي', type: 'number', aliases: ['السعر', 'price', 'التكلفة'] },
  { key: 'barcode', label: 'الباركود', type: 'string', aliases: ['EAN', 'UPC'] },
  { key: 'unitOfMeasure', label: 'وحدة القياس', type: 'string', aliases: ['الوحدة', 'unit'] },
];

export default function ProductsPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['products', filters],
    queryFn: () => api<any>(`/products?limit=100&${new URLSearchParams(filters).toString()}`),
  });
  const rows: any[] = data?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">المنتجات</h1>
          <p className="text-sm text-slate-500">{data?.total ?? rows.length} منتج</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowImport(true)} className="btn-secondary">
            <Upload className="h-4 w-4" />
            استيراد Excel
          </button>
          <Link href="/inventory/products/new" className="btn-primary">
            <Plus className="h-4 w-4" />
            منتج جديد
          </Link>
        </div>
      </header>

      <FilterBar filters={FILTERS} values={filters} onChange={setFilters} />

      <DataTable
        columns={[
          { key: 'sku', header: 'SKU', accessor: (r: any) => (
              <Link href={`/inventory/products/${r.id}/edit`} className="font-mono text-sky-700 hover:underline num-latin">{r.sku}</Link>
            ), sortable: true, sortValue: (r: any) => r.sku ?? '', exportValue: (r: any) => r.sku },
          { key: 'name', header: 'الاسم', accessor: (r: any) => (
              <Link href={`/inventory/products/${r.id}/edit`} className="font-medium hover:underline">{r.nameAr}</Link>
            ), exportValue: (r: any) => r.nameAr },
          { key: 'category', header: 'الفئة', accessor: (r: any) => r.category?.nameAr ?? '—', exportValue: (r: any) => r.category?.nameAr ?? '' },
          { key: 'type', header: 'النوع', accessor: (r: any) => r.type ?? r.productType ?? '—', exportValue: (r: any) => r.type ?? r.productType ?? '' },
          { key: 'price', header: 'السعر', accessor: (r: any) => {
              const p = r.defaultSalePriceIqd ?? r.basePriceIqd;
              return p ? formatIqd(Number(p)) : '—';
            }, align: 'end', sortable: true, sortValue: (r: any) => Number(r.defaultSalePriceIqd ?? r.basePriceIqd ?? 0), exportValue: (r: any) => Number(r.defaultSalePriceIqd ?? r.basePriceIqd ?? 0) },
          { key: 'variants', header: 'المتغيرات', accessor: (r: any) => <span className="num-latin font-mono">{r.variantCount ?? r.variants?.length ?? 0}</span>, align: 'end', sortable: true, sortValue: (r: any) => Number(r.variantCount ?? r.variants?.length ?? 0), exportValue: (r: any) => Number(r.variantCount ?? r.variants?.length ?? 0) },
          { key: 'actions', header: '', hideable: false, accessor: (r: any) => (
              <div className="flex items-center justify-end gap-2 text-xs">
                <Link href={`/inventory/products/${r.id}/edit`} className="text-sky-700 hover:underline flex items-center gap-1">
                  <Edit3 className="h-3 w-3" /> تعديل
                </Link>
                <Link href={`/inventory/products/${r.id}/variants`} className="text-sky-700 hover:underline flex items-center gap-1">
                  <Layers className="h-3 w-3" /> المتغيرات
                </Link>
              </div>
            ), align: 'end' },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر التحميل' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد منتجات — أضف أول منتج من زر «منتج جديد»"
        getRowKey={(r: any) => r.id}
        exportFilename="products"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="المنتجات"
        columnToggle
        densityToggle
        printable
        selectable
        selectedKeys={selected}
        onSelectionChange={setSelected}
      />

      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <button
          className="btn-secondary btn-sm"
          onClick={() => toast.info(`تصدير ${selected.size} منتج — قريباً`)}
        >
          تصدير المحدد
        </button>
      </BulkActionBar>

      {showImport && (
        <ImportWizard
          title="استيراد المنتجات"
          fields={IMPORT_FIELDS}
          onImportBatch={(rows) =>
            api<{ inserted?: number; errors?: string[] }>('/products/import', {
              method: 'POST',
              body: JSON.stringify({ rows }),
            })
          }
          onComplete={() => {
            qc.invalidateQueries({ queryKey: ['products'] });
            toast.success('تم استيراد المنتجات بنجاح');
          }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
