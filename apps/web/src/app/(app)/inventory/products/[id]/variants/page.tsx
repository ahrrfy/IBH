'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Layers, Plus, ArrowRight, Tag } from 'lucide-react';

export default function ProductVariantsPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: tpl, isLoading: tplLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api<any>(`/products/${id}`),
    enabled: !!id,
  });

  // Server returns template with embedded variants array (per ProductsService.findOneTemplate).
  const variants: any[] = tpl?.variants ?? [];

  const [form, setForm] = useState({
    sku: '', nameAr: '',
    attrs: '',         // free-form, parsed as "key:value, key:value"
    salePrice: '',
    costPrice: '',
    barcode: '',
  });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (payload: any) => api<any>('/products/variants', { method: 'POST', body: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product', id] });
      setForm({ sku: '', nameAr: '', attrs: '', salePrice: '', costPrice: '', barcode: '' });
      setError(null);
    },
    onError: (e: any) => setError(e?.message ?? 'فشل إنشاء الـ variant'),
  });

  function parseAttrs(s: string): Record<string, string> {
    const out: Record<string, string> = {};
    s.split(',').forEach((pair) => {
      const [k, v] = pair.split(':').map((x) => x.trim());
      if (k && v) out[k] = v;
    });
    return out;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.sku || !form.nameAr) { setError('SKU + الاسم مطلوبان'); return; }
    const payload: any = {
      templateId: id,
      sku: form.sku,
      nameAr: form.nameAr,
      attributeValues: parseAttrs(form.attrs),
    };
    if (form.salePrice) payload.salePrice = parseFloat(form.salePrice);
    if (form.costPrice) payload.costPrice = parseFloat(form.costPrice);
    if (form.barcode)   payload.barcodes  = [{ barcode: form.barcode, isPrimary: true }];
    create.mutate(payload);
  }

  if (tplLoading) return <div className="p-6 text-slate-500">جاري التحميل…</div>;
  if (!tpl)       return <div className="p-6 text-rose-600">المنتج غير موجود</div>;

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Layers className="h-6 w-6 text-sky-700" />
            Variants — {tpl.nameAr}
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-mono num-latin">SKU template: {tpl.sku}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/inventory/products/${id}/edit`} className="btn-ghost text-sm">القالب</Link>
          <Link href="/inventory/products" className="text-sm text-slate-500 hover:text-sky-700 flex items-center gap-1">
            <ArrowRight className="h-4 w-4" />
            القائمة
          </Link>
        </div>
      </header>

      {/* Existing variants */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <header className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{variants.length} variant{variants.length === 1 ? '' : 's'}</h2>
        </header>
        {variants.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            لا توجد variants بعد — أضف أول واحد من النموذج أدناه.
            <br />
            <span className="text-[11px]">تذكير: المنتج بدون variants لا يمكن بيعه — يحتاج على الأقل واحد.</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="px-4 py-2 text-start">SKU</th>
                <th className="px-4 py-2 text-start">الاسم</th>
                <th className="px-4 py-2 text-start">السمات</th>
                <th className="px-4 py-2 text-end">الباركود</th>
                <th className="px-4 py-2">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v: any) => (
                <tr key={v.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono num-latin text-xs">{v.sku}</td>
                  <td className="px-4 py-2">{v.nameAr ?? '—'}</td>
                  <td className="px-4 py-2 text-xs">
                    {Object.entries(v.attributeValues ?? {}).map(([k, val]: any) => (
                      <span key={k} className="inline-flex items-center gap-1 mr-2 text-slate-600">
                        <Tag className="h-3 w-3" />
                        {k}: {val}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-2 text-end font-mono num-latin text-xs">
                    {v.barcodes?.[0]?.barcode ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {v.isActive ? <span className="text-emerald-600 text-xs">نشط</span>
                                : <span className="text-slate-400 text-xs">معطّل</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Add variant form */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4 text-sky-700" />
          إضافة variant
        </h2>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="SKU" required>
              <input className="input num-latin uppercase" dir="ltr"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
                required maxLength={80} />
            </Field>
            <Field label="الاسم بالعربية" required>
              <input className="input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required />
            </Field>
            <Field label="السمات (key:value, key:value)" help="مثال: اللون:أزرق, الحجم:M">
              <input className="input"
                value={form.attrs}
                onChange={(e) => setForm({ ...form, attrs: e.target.value })}
                placeholder="اللون:أزرق, الحجم:M" />
            </Field>
            <Field label="الباركود (اختياري)">
              <input className="input num-latin" dir="ltr"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                placeholder="EAN-13" />
            </Field>
            <Field label="سعر البيع (يستخدم سعر القالب لو فارغ)">
              <input type="number" min="0" step="0.001" className="input num-latin" dir="ltr"
                value={form.salePrice}
                onChange={(e) => setForm({ ...form, salePrice: e.target.value })} />
            </Field>
            <Field label="سعر الكلفة (يستخدم سعر القالب لو فارغ)">
              <input type="number" min="0" step="0.001" className="input num-latin" dir="ltr"
                value={form.costPrice}
                onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
            </Field>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            {error && <span className="text-sm text-rose-600">{error}</span>}
            <div className="flex-1" />
            <button type="submit" disabled={create.isPending} className="btn-primary text-sm">
              <Plus className="h-3.5 w-3.5" />
              {create.isPending ? 'جاري الإضافة…' : 'إضافة variant'}
            </button>
          </div>
        </form>
      </section>

      <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded px-3 py-2">
        ⓘ كل variant له قيد مخزون منفصل في StockLedger ويمكن تخصيص سعر/كلفة له. الـ template يحدد الفئة + الوحدات + السعر الافتراضي.
      </div>
    </div>
  );
}

function Field({ label, required, help, children }: { label: string; required?: boolean; help?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
      {help && <span className="mt-1 block text-[11px] text-slate-500">{help}</span>}
    </label>
  );
}

