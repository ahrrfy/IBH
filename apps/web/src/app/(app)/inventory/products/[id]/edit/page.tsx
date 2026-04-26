'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Package, Save, ArrowRight, Layers } from 'lucide-react';

export default function EditProductPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api<any>(`/products/${id}`),
    enabled: !!id,
  });
  const { data: cats } = useQuery({ queryKey: ['products','categories'], queryFn: () => api<any>('/products/categories') });
  const catList: any[] = Array.isArray(cats) ? cats : cats?.items ?? [];

  // PUT /products/:id only accepts a subset (per controller signature).
  const [form, setForm] = useState({
    nameAr: '', nameEn: '', description: '',
    categoryId: '', salePrice: 0, minSalePrice: 0, isActive: true,
  });
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setForm({
        nameAr:       data.nameAr ?? '',
        nameEn:       data.nameEn ?? '',
        description:  data.description ?? '',
        categoryId:   data.categoryId ?? '',
        salePrice:    Number(data.defaultSalePriceIqd ?? 0),
        minSalePrice: Number(data.minSalePriceIqd ?? 0),
        isActive:     data.isActive ?? true,
      });
    }
  }, [data]);

  const update = useMutation({
    mutationFn: (payload: any) => api<any>(`/products/${id}`, { method: 'PUT', body: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['product', id] });
      setSaved('تم الحفظ ✓');
      setTimeout(() => setSaved(null), 2500);
    },
    onError: (e: any) => setSaved('فشل الحفظ: ' + (e?.message ?? '')),
  });

  if (isLoading) return <div className="p-6 text-slate-500">جاري التحميل…</div>;
  if (loadError) return <div className="p-6 text-rose-600">تعذَّر تحميل المنتج</div>;

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="h-6 w-6 text-sky-700" />
            {data?.sku} — تعديل
          </h1>
          <p className="text-sm text-slate-500 mt-1">{data?.nameAr}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/inventory/products/${id}/variants`} className="btn-ghost text-sm">
            <Layers className="h-4 w-4" />
            إدارة الـ Variants
          </Link>
          <Link href="/inventory/products" className="text-sm text-slate-500 hover:text-sky-700 flex items-center gap-1">
            <ArrowRight className="h-4 w-4" />
            القائمة
          </Link>
        </div>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); update.mutate(form); }}
        className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="الاسم بالعربية" required>
            <input className="input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required maxLength={300} />
          </Field>
          <Field label="الاسم بالإنجليزية">
            <input className="input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} maxLength={300} />
          </Field>
          <Field label="الفئة" required>
            <select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
              <option value="">— اختر —</option>
              {catList.map((c: any) => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
            </select>
          </Field>
          <Field label="سعر البيع (IQD)" required>
            <input type="number" min="0" step="0.001" className="input num-latin" dir="ltr"
              value={form.salePrice}
              onChange={(e) => setForm({ ...form, salePrice: parseFloat(e.target.value || '0') })}
              required />
          </Field>
          <Field label="أقل سعر بيع (IQD)" required>
            <input type="number" min="0" step="0.001" className="input num-latin" dir="ltr"
              value={form.minSalePrice}
              onChange={(e) => setForm({ ...form, minSalePrice: parseFloat(e.target.value || '0') })}
              required />
          </Field>
          <Field label="الحالة">
            <select className="input"
              value={form.isActive ? 'active' : 'inactive'}
              onChange={(e) => setForm({ ...form, isActive: e.target.value === 'active' })}>
              <option value="active">نشط</option>
              <option value="inactive">معطّل</option>
            </select>
          </Field>
        </div>

        <Field label="الوصف">
          <textarea className="input min-h-[80px]" maxLength={2000}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>

        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded px-3 py-2">
          ⓘ SKU + النوع + وحدات القياس مقفلة بعد الإنشاء (لمنع كسر القيود التاريخية في المخزون والمحاسبة).
        </p>

        <div className="flex items-center justify-between pt-3 border-t">
          <span className={'text-sm ' + (saved?.startsWith('تم') ? 'text-emerald-600' : 'text-rose-600')}>{saved}</span>
          <button type="submit" disabled={update.isPending} className="btn-primary">
            <Save className="h-4 w-4" />
            {update.isPending ? 'جاري الحفظ…' : 'حفظ'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}
