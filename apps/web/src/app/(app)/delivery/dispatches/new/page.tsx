'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

type Warehouse = { id: string; code: string; nameAr: string };
type AutoAssign = {
  deliveryCompanyId: string;
  deliveryCompanyNameAr: string;
  shippingCostIqd: string;
  reason: string;
};

export default function NewDispatchPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    customerId: '',
    warehouseId: '',
    deliveryAddress: '',
    city: '',
    phone: '',
    codAmountIqd: '',
    plannedDate: '',
    deliveryCompanyId: '',
    notes: '',
  });
  const [skipAutoAssign, setSkipAutoAssign] = useState(false);
  const [autoSuggest, setAutoSuggest] = useState<AutoAssign | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses-list'],
    queryFn: () => api<{ rows: Warehouse[] }>('/warehouses?limit=100'),
    select: (d) => d.rows,
  });

  const { data: companies } = useQuery({
    queryKey: ['delivery-companies-active'],
    queryFn: () => api<{ rows: { id: string; nameAr: string; code: string }[] }>(
      '/delivery/companies?isActive=true&limit=100',
    ),
    select: (d) => d.rows,
  });

  useEffect(() => {
    if (!form.city || skipAutoAssign) return;
    const timeout = setTimeout(async () => {
      try {
        const result = await api<AutoAssign>('/delivery/auto-assign/suggest', {
          method: 'POST',
          body: JSON.stringify({
            city: form.city,
            codAmountIqd: form.codAmountIqd ? Number(form.codAmountIqd) : undefined,
            requireCod: !!form.codAmountIqd,
          }),
        });
        setAutoSuggest(result);
      } catch {
        setAutoSuggest(null);
      }
    }, 600);
    return () => clearTimeout(timeout);
  }, [form.city, form.codAmountIqd, skipAutoAssign]);

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>('/delivery', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          codAmountIqd: form.codAmountIqd ? Number(form.codAmountIqd) : undefined,
          deliveryCompanyId: skipAutoAssign ? form.deliveryCompanyId || undefined : undefined,
        }),
      }),
    onSuccess: (res) => router.push(`/delivery/dispatches/${res.id}`),
    onError: (e: unknown) => {
      setFormError(e instanceof ApiError ? e.messageAr : 'حدث خطأ، حاول مجدداً');
    },
  });

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((p) => ({ ...p, [field]: e.target.value }));
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link href="/delivery/dispatches" className="text-slate-500 hover:text-slate-800">
          <ArrowRight className="size-5" />
        </Link>
        <h1 className="text-2xl font-bold">طلب توصيل جديد</h1>
      </div>

      {formError && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-800 text-sm">
          {formError}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setFormError(null);
          create.mutate();
        }}
        className="space-y-5"
      >
        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold">بيانات الطلب</h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">رقم العميل</label>
            <input
              type="text"
              value={form.customerId}
              onChange={set('customerId')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="CUST-..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">المستودع</label>
            <select
              value={form.warehouseId}
              onChange={set('warehouseId')}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">اختر مستودع...</option>
              {warehouses?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.nameAr} ({w.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">تاريخ التسليم المخطط</label>
            <input
              type="date"
              value={form.plannedDate}
              onChange={set('plannedDate')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold">عنوان التوصيل</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">المدينة</label>
              <input
                type="text"
                value={form.city}
                onChange={set('city')}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="بغداد"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">رقم الهاتف</label>
              <input
                type="tel"
                value={form.phone}
                onChange={set('phone')}
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="07..."
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">العنوان التفصيلي</label>
            <textarea
              value={form.deliveryAddress}
              onChange={set('deliveryAddress')}
              required
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="الحي، الشارع، المبنى..."
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold">COD (الدفع عند الاستلام)</h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">مبلغ COD (IQD)</label>
            <input
              type="number"
              min="0"
              value={form.codAmountIqd}
              onChange={set('codAmountIqd')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="0"
            />
            <p className="mt-1 text-xs text-slate-400">اتركه فارغاً إذا لم يكن الدفع عند الاستلام</p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">شركة التوصيل</h2>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={skipAutoAssign}
                onChange={(e) => setSkipAutoAssign(e.target.checked)}
                className="rounded"
              />
              اختيار يدوي
            </label>
          </div>

          {!skipAutoAssign && (
            <div>
              {autoSuggest ? (
                <div className="rounded-xl bg-sky-50 border border-sky-200 p-4 flex items-start gap-3">
                  <Sparkles className="size-5 text-sky-600 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold text-sky-900">{autoSuggest.deliveryCompanyNameAr}</div>
                    <div className="text-sm text-sky-700 mt-0.5">
                      تكلفة الشحن: {Number(autoSuggest.shippingCostIqd).toLocaleString('ar-IQ')} د.ع
                    </div>
                    <div className="text-xs text-sky-600 mt-1">{autoSuggest.reason}</div>
                  </div>
                </div>
              ) : form.city ? (
                <div className="text-sm text-slate-400">جاري البحث عن أفضل شركة توصيل...</div>
              ) : (
                <div className="text-sm text-slate-400">أدخل المدينة لاقتراح شركة توصيل تلقائياً</div>
              )}
            </div>
          )}

          {skipAutoAssign && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">اختر الشركة</label>
              <select
                value={form.deliveryCompanyId}
                onChange={set('deliveryCompanyId')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="">— تعيين تلقائي لاحقاً —</option>
                {companies?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameAr} ({c.code})
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <label className="block text-sm font-medium text-slate-700 mb-1">ملاحظات</label>
          <textarea
            value={form.notes}
            onChange={set('notes')}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </section>

        <div className="flex justify-end gap-3">
          <Link
            href="/delivery/dispatches"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            إلغاء
          </Link>
          <button
            type="submit"
            disabled={create.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-5 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
          >
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            إنشاء الطلب
          </button>
        </div>
      </form>
    </div>
  );
}
