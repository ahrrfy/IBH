'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Package, Save, ArrowRight, AlertTriangle } from 'lucide-react';

// T41: shape returned by GET /products/check-duplicate
interface DuplicateMatch {
  id: string;
  sku: string;
  generatedFullName: string;
  name1: string;
  name2: string | null;
  name3: string | null;
}

const PRODUCT_TYPES: Array<{ value: string; label: string }> = [
  { value: 'storable',      label: 'مخزن (Storable)' },
  { value: 'service',       label: 'خدمة (Service)' },
  { value: 'raw_material',  label: 'مادة خام (Raw Material)' },
  { value: 'semi_finished', label: 'نصف مصنّع' },
  { value: 'custom',        label: 'تصنيع حسب الطلب' },
  { value: 'bundle',        label: 'حزمة (Bundle)' },
];

export default function NewProductPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data: cats }  = useQuery({ queryKey: ['products','categories'], queryFn: () => api<any>('/products/categories') });
  const { data: units } = useQuery({ queryKey: ['products','units'],      queryFn: () => api<any>('/products/units') });

  const catList:  any[] = Array.isArray(cats)  ? cats  : cats?.items  ?? [];
  const unitList: any[] = Array.isArray(units) ? units : units?.items ?? [];

  const [form, setForm] = useState({
    sku: '',
    // T41: 3-field structured naming. name1 is required, name2/name3 are optional descriptors.
    name1: '',
    name2: '',
    name3: '',
    nameEn: '',
    categoryId: '',
    type: 'storable',
    baseUnitId: '',
    saleUnitId: '',
    purchaseUnitId: '',
    defaultSalePriceIqd: 0,
    defaultPurchasePriceIqd: 0,
    minSalePriceIqd: 0,
    description: '',
    isPublishedOnline: false,
  });
  const [error, setError] = useState<string | null>(null);

  // T41: composed full name shown to the user as a live preview.
  const generatedFullName = useMemo(
    () => [form.name1, form.name2, form.name3].map((s) => s.trim()).filter(Boolean).join(' '),
    [form.name1, form.name2, form.name3],
  );

  // T41: 300ms debounced duplicate-detection query against the backend.
  const [debouncedNames, setDebouncedNames] = useState({ name1: '', name2: '', name3: '' });
  useEffect(() => {
    const t = setTimeout(
      () => setDebouncedNames({ name1: form.name1.trim(), name2: form.name2.trim(), name3: form.name3.trim() }),
      300,
    );
    return () => clearTimeout(t);
  }, [form.name1, form.name2, form.name3]);

  const dupQuery = useQuery({
    queryKey: ['products', 'check-duplicate', debouncedNames],
    enabled: debouncedNames.name1.length >= 2,
    queryFn: () => {
      const qs = new URLSearchParams();
      if (debouncedNames.name1) qs.set('name1', debouncedNames.name1);
      if (debouncedNames.name2) qs.set('name2', debouncedNames.name2);
      if (debouncedNames.name3) qs.set('name3', debouncedNames.name3);
      return api<{ matches: DuplicateMatch[] }>(`/products/check-duplicate?${qs.toString()}`);
    },
    staleTime: 30_000,
  });
  const duplicates: DuplicateMatch[] = dupQuery.data?.matches ?? [];

  const create = useMutation({
    mutationFn: (payload: any) => api<any>('/products', { method: 'POST', body: payload }),
    onSuccess: (created: any) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      router.push(`/inventory/products/${created.id}/edit`);
    },
    onError: (e: any) => setError(e?.message ?? 'فشل إنشاء المنتج'),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name1.trim()) { setError('الحقل الأول من الاسم مطلوب'); return; }
    if (!form.categoryId)   { setError('اختر فئة'); return; }
    if (!form.baseUnitId)   { setError('اختر وحدة القياس الأساسية'); return; }
    // Sale + purchase units default to base if not set
    const payload: Record<string, unknown> = {
      sku:            form.sku,
      // T41: send the 3 structured fields. nameAr is kept for compatibility with
      // legacy consumers and mirrors generatedFullName so reports still render.
      name1:          form.name1.trim(),
      name2:          form.name2.trim() || undefined,
      name3:          form.name3.trim() || undefined,
      nameAr:         generatedFullName,
      nameEn:         form.nameEn || undefined,
      categoryId:     form.categoryId,
      type:           form.type,
      baseUnitId:     form.baseUnitId,
      saleUnitId:     form.saleUnitId     || form.baseUnitId,
      purchaseUnitId: form.purchaseUnitId || form.baseUnitId,
      defaultSalePriceIqd:     Number(form.defaultSalePriceIqd),
      defaultPurchasePriceIqd: Number(form.defaultPurchasePriceIqd),
      minSalePriceIqd:         Number(form.minSalePriceIqd),
      description:             form.description || undefined,
      isPublishedOnline:       form.isPublishedOnline,
    };
    create.mutate(payload);
  }

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="h-6 w-6 text-sky-700" />
            منتج جديد
          </h1>
          <p className="text-sm text-slate-500 mt-1">قالب المنتج (Template) — variants تُضاف بعد الإنشاء</p>
        </div>
        <Link href="/inventory/products" className="text-sm text-slate-500 hover:text-sky-700 flex items-center gap-1">
          <ArrowRight className="h-4 w-4" />
          العودة للقائمة
        </Link>
      </header>

      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="SKU" required help="رمز فريد، حروف لاتينية وأرقام">
            <input className="input num-latin uppercase" dir="ltr"
              value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
              required maxLength={50} pattern="[A-Z0-9._-]{2,50}" />
          </Field>

          <Field label="النوع" required>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} required>
              {PRODUCT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>

          {/* T41: 3-field structured naming. */}
          <Field label="الاسم — الجزء الأول" required help="مثال: حليب">
            <input className="input" value={form.name1} onChange={(e) => setForm({ ...form, name1: e.target.value })} required maxLength={200} />
          </Field>

          <Field label="الاسم — الجزء الثاني" help="مثال: كامل الدسم">
            <input className="input" value={form.name2} onChange={(e) => setForm({ ...form, name2: e.target.value })} maxLength={200} />
          </Field>

          <Field label="الاسم — الجزء الثالث" help="مثال: 1 لتر">
            <input className="input" value={form.name3} onChange={(e) => setForm({ ...form, name3: e.target.value })} maxLength={200} />
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

          <Field label="وحدة القياس الأساسية" required help="مثلاً: حبة، كيلو، متر">
            <select className="input" value={form.baseUnitId} onChange={(e) => setForm({ ...form, baseUnitId: e.target.value })} required>
              <option value="">— اختر —</option>
              {unitList.map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.nameAr} ({u.abbreviation}){u.isBaseUnit ? ' • أساسية' : ''}
                </option>
              ))}
            </select>
          </Field>

          <Field label="وحدة البيع" help="افتراضي: نفس الوحدة الأساسية">
            <select className="input" value={form.saleUnitId} onChange={(e) => setForm({ ...form, saleUnitId: e.target.value })}>
              <option value="">— كالأساسية —</option>
              {unitList.map((u: any) => <option key={u.id} value={u.id}>{u.nameAr} ({u.abbreviation})</option>)}
            </select>
          </Field>

          <Field label="وحدة الشراء" help="افتراضي: نفس الوحدة الأساسية">
            <select className="input" value={form.purchaseUnitId} onChange={(e) => setForm({ ...form, purchaseUnitId: e.target.value })}>
              <option value="">— كالأساسية —</option>
              {unitList.map((u: any) => <option key={u.id} value={u.id}>{u.nameAr} ({u.abbreviation})</option>)}
            </select>
          </Field>

          <Field label="سعر البيع الافتراضي (IQD)" required>
            <input type="number" min="0" step="0.001" className="input num-latin" dir="ltr"
              value={form.defaultSalePriceIqd}
              onChange={(e) => setForm({ ...form, defaultSalePriceIqd: parseFloat(e.target.value || '0') })}
              required />
          </Field>

          <Field label="سعر الشراء الافتراضي (IQD)" required>
            <input type="number" min="0" step="0.001" className="input num-latin" dir="ltr"
              value={form.defaultPurchasePriceIqd}
              onChange={(e) => setForm({ ...form, defaultPurchasePriceIqd: parseFloat(e.target.value || '0') })}
              required />
          </Field>

          <Field label="أقل سعر بيع (IQD)" required help="حد أدنى يمنع البيع تحته">
            <input type="number" min="0" step="0.001" className="input num-latin" dir="ltr"
              value={form.minSalePriceIqd}
              onChange={(e) => setForm({ ...form, minSalePriceIqd: parseFloat(e.target.value || '0') })}
              required />
          </Field>
        </div>

        {/* T41: live preview + duplicate detection */}
        {generatedFullName && (
          <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            <span className="font-medium">الاسم الكامل المُولَّد:</span>{' '}
            <span dir="auto">{generatedFullName}</span>
          </div>
        )}
        {duplicates.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              منتج مشابه موجود — تأكّد قبل الحفظ
            </div>
            <ul className="mt-2 space-y-1">
              {duplicates.map((m) => (
                <li key={m.id} className="flex items-baseline justify-between gap-3">
                  <span dir="auto">{m.generatedFullName || m.name1}</span>
                  <span className="text-xs text-amber-700 num-latin" dir="ltr">{m.sku}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Field label="الوصف">
          <textarea className="input min-h-[80px]" maxLength={2000}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4"
            checked={form.isPublishedOnline}
            onChange={(e) => setForm({ ...form, isPublishedOnline: e.target.checked })} />
          <span>منشور على المتجر الإلكتروني</span>
        </label>

        <div className="flex items-center justify-between pt-3 border-t">
          {error && <span className="text-sm text-rose-600">{error}</span>}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Link href="/inventory/products" className="btn-ghost">إلغاء</Link>
            <button type="submit" disabled={create.isPending} className="btn-primary">
              <Save className="h-4 w-4" />
              {create.isPending ? 'جاري الإنشاء…' : 'إنشاء وفتح للتعديل'}
            </button>
          </div>
        </div>
      </form>
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
