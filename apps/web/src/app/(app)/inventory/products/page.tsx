'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Layers, Edit3 } from 'lucide-react';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { formatIqd } from '@/lib/format';

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['products', search],
    queryFn: () => api<any>(`/products?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });
  const rows: any[] = data?.items ?? [];

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">المنتجات</h1>
          <p className="text-sm text-slate-500">{data?.total ?? rows.length} منتج</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            placeholder="بحث…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded border px-3 py-2 text-sm"
          />
          <Link href="/inventory/products/new" className="btn-primary btn-sm">
            <Plus className="h-3.5 w-3.5" />
            منتج جديد
          </Link>
        </div>
      </header>

      <DataTable
        columns={[
          { key: 'sku',      header: 'SKU',
            accessor: (r: any) => (
              <Link href={`/inventory/products/${r.id}/edit`} className="font-mono text-sky-700 hover:underline num-latin">
                {r.sku}
              </Link>
            ),
          },
          { key: 'name',     header: 'الاسم',
            accessor: (r: any) => (
              <Link href={`/inventory/products/${r.id}/edit`} className="font-medium hover:underline">
                {r.nameAr}
              </Link>
            ),
          },
          { key: 'category', header: 'الفئة',   accessor: (r: any) => r.category?.nameAr ?? '—' },
          { key: 'type',     header: 'النوع',   accessor: (r: any) => r.type ?? r.productType ?? '—' },
          { key: 'price',    header: 'السعر',
            accessor: (r: any) => {
              const p = r.defaultSalePriceIqd ?? r.basePriceIqd;
              return p ? formatIqd(Number(p)) : '—';
            },
            align: 'end',
          },
          { key: 'variants', header: 'Variants',
            accessor: (r: any) => <span className="num-latin font-mono">{r.variantCount ?? r.variants?.length ?? 0}</span>,
            align: 'end',
          },
          { key: 'actions',  header: '',
            accessor: (r: any) => (
              <div className="flex items-center justify-end gap-2 text-xs">
                <Link href={`/inventory/products/${r.id}/edit`} className="text-sky-700 hover:underline flex items-center gap-1">
                  <Edit3 className="h-3 w-3" /> تعديل
                </Link>
                <Link href={`/inventory/products/${r.id}/variants`} className="text-sky-700 hover:underline flex items-center gap-1">
                  <Layers className="h-3 w-3" /> Variants
                </Link>
              </div>
            ),
            align: 'end',
          },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر التحميل' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد منتجات — أضف أول منتج من زر «منتج جديد»"
        exportFilename="products"
        getRowKey={(r: any) => r.id}
      />
    </div>
  );
}
