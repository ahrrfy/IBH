'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">المنتجات</h1>
          <p className="text-sm text-slate-500">{data?.total ?? rows.length} منتج</p>
        </div>
        <input
          placeholder="بحث…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        />
      </header>

      <DataTable
        columns={[
          { key: 'sku',      header: 'SKU',     accessor: (r: any) => <span className="font-mono">{r.sku}</span> },
          { key: 'name',     header: 'الاسم',   accessor: (r: any) => r.nameAr },
          { key: 'category', header: 'الفئة',   accessor: (r: any) => r.category?.nameAr ?? '—' },
          { key: 'type',     header: 'النوع',   accessor: (r: any) => r.productType ?? '—' },
          { key: 'price',    header: 'السعر',   accessor: (r: any) => r.basePriceIqd ? formatIqd(Number(r.basePriceIqd)) : '—', align: 'end' },
        ]}
        rows={rows}
        loading={isLoading}
        error={error ? 'تعذَّر التحميل' : null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد منتجات"
        exportFilename="products"
        getRowKey={(r: any) => r.id}
      />
    </div>
  );
}
