'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowRight, Save, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { formatIqd } from '@/lib/format';
// TODO(T35-cycle2): replace with smart bidirectional combobox (live credit-limit check, customer balance, alternative-product suggestion)
import { CustomerCombobox, CustomerOption } from '@/components/customer-combobox';
import { ProductCombobox, VariantOption } from '@/components/product-combobox';

interface LineDraft {
  variantId: string;
  variantSku: string;
  variantNameAr: string;
  qtyOnHand: number;
  qty: number;
  unitPriceIqd: number;
}

/**
 * Sales order create payload — mirrors the backend DTO contract
 * accepted by POST /sales-orders (apps/api/src/modules/sales/orders).
 * Cycle 1: structural validation only; semantic checks (credit limit,
 * stock availability) are enforced server-side and surfaced via ApiError.
 */
const createSalesOrderSchema = z.object({
  customerId: z.string().min(1, 'يجب اختيار العميل'),
  warehouseId: z.string().min(1, 'يجب اختيار المخزن'),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ غير صالح'),
  notes: z.string().optional(),
  discountIqd: z.number().min(0, 'الخصم لا يمكن أن يكون سالباً'),
  taxIqd: z.number().min(0, 'الضريبة لا يمكن أن تكون سالبة'),
  lines: z
    .array(
      z.object({
        variantId: z.string().min(1),
        qty: z.number().positive('الكمية يجب أن تكون أكبر من صفر'),
        unitPriceIqd: z.number().min(0, 'السعر لا يمكن أن يكون سالباً'),
      }),
    )
    .min(1, 'يجب إضافة بند واحد على الأقل'),
});

type CreateSalesOrderInput = z.infer<typeof createSalesOrderSchema>;

export default function NewSalesOrderPage() {
  const router = useRouter();

  const [customer, setCustomer] = useState<CustomerOption | null>(null);
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [orderDate, setOrderDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [discountIqd, setDiscountIqd] = useState<number>(0);
  const [taxIqd, setTaxIqd] = useState<number>(0);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: warehousesResp } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api<any>('/inventory/warehouses'),
  });
  const warehouses: Array<{ id: string; nameAr: string }> = Array.isArray(warehousesResp)
    ? warehousesResp
    : warehousesResp?.items ?? [];

  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.unitPriceIqd) || 0), 0),
    [lines],
  );
  const total = useMemo(
    () => Math.max(0, subtotal - (Number(discountIqd) || 0) + (Number(taxIqd) || 0)),
    [subtotal, discountIqd, taxIqd],
  );

  function addVariant(v: VariantOption) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.variantId === v.variantId);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          variantId: v.variantId,
          variantSku: v.variantSku,
          variantNameAr: v.templateNameAr,
          qtyOnHand: v.qtyOnHand,
          qty: 1,
          unitPriceIqd: v.defaultPriceIqd,
        },
      ];
    });
  }

  function updateLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  const create = useMutation({
    mutationFn: (payload: CreateSalesOrderInput) =>
      api<{ id: string }>('/sales-orders', {
        method: 'POST',
        body: payload,
      }),
    onSuccess: (order) => {
      if (order?.id) router.push(`/sales/orders/${order.id}`);
      else router.push('/sales/orders');
    },
    onError: (e: unknown) => {
      setError(e instanceof ApiError ? e.messageAr : 'تعذّر إنشاء الطلب');
    },
  });

  function handleSubmit() {
    setError(null);
    const candidate = {
      customerId: customer?.id ?? '',
      warehouseId,
      orderDate,
      notes: notes || undefined,
      discountIqd: Number(discountIqd) || 0,
      taxIqd: Number(taxIqd) || 0,
      lines: lines.map((l) => ({
        variantId: l.variantId,
        qty: Number(l.qty) || 0,
        unitPriceIqd: Number(l.unitPriceIqd) || 0,
      })),
    };
    const parsed = createSalesOrderSchema.safeParse(candidate);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setError(first?.message ?? 'بيانات غير صالحة');
      return;
    }
    create.mutate(parsed.data);
  }

  const insufficientStock = lines.some((l) => l.qty > l.qtyOnHand);
  const canSubmit =
    !!customer &&
    !!warehouseId &&
    lines.length > 0 &&
    lines.every((l) => l.qty > 0 && l.unitPriceIqd >= 0) &&
    !create.isPending;

  return (
    <div className="space-y-6">
      <header>
        <Link href="/sales/orders" className="inline-flex items-center gap-1 text-sm text-sky-700 hover:underline">
          <ArrowRight size={14} /> العودة للقائمة
        </Link>
        <h1 className="mt-2 text-3xl font-bold">أمر بيع جديد</h1>
      </header>

      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-700" role="alert">
          {error}
        </div>
      )}

      <section className="grid gap-4 rounded-lg bg-white p-4 shadow-sm md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">العميل</label>
          <CustomerCombobox value={customer} onChange={setCustomer} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">المخزن</label>
          <select
            value={warehouseId}
            onChange={(e) => { setWarehouseId(e.target.value); setLines([]); }}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="">— اختر مخزناً —</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.nameAr}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">تاريخ الطلب</label>
          <input
            type="date"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">ملاحظات</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="اختياري"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">البنود</h2>
          <div className="flex-1 max-w-md">
            <ProductCombobox warehouseId={warehouseId || null} onPick={addVariant} />
          </div>
        </div>

        {lines.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            {warehouseId ? 'ابحث عن منتج لإضافته' : 'اختر المخزن لبدء إضافة البنود'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="text-start pb-2">المنتج</th>
                <th className="text-end pb-2 w-32">الكمية</th>
                <th className="text-end pb-2 w-40">سعر الوحدة (IQD)</th>
                <th className="text-end pb-2 w-32">المجموع</th>
                <th className="pb-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const lineTotal = (Number(l.qty) || 0) * (Number(l.unitPriceIqd) || 0);
                const insufficient = l.qty > l.qtyOnHand;
                return (
                  <tr key={l.variantId} className="border-t">
                    <td className="py-2">
                      <div className="font-medium">{l.variantNameAr}</div>
                      <div className="text-xs text-slate-500">
                        {l.variantSku} · متوفر: {l.qtyOnHand.toLocaleString('ar-IQ')}
                      </div>
                    </td>
                    <td className="py-2 text-end">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={l.qty}
                        onChange={(e) => updateLine(i, { qty: Number(e.target.value) })}
                        className={`w-24 rounded-md border bg-white px-2 py-1 text-end text-sm shadow-sm focus:outline-none focus:ring-1 ${
                          insufficient
                            ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500'
                            : 'border-slate-300 focus:border-sky-500 focus:ring-sky-500'
                        }`}
                      />
                      {insufficient && (
                        <div className="mt-1 text-xs text-rose-600">⚠ يتجاوز المتوفر</div>
                      )}
                    </td>
                    <td className="py-2 text-end">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={l.unitPriceIqd}
                        onChange={(e) => updateLine(i, { unitPriceIqd: Number(e.target.value) })}
                        className="w-32 rounded-md border border-slate-300 bg-white px-2 py-1 text-end text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </td>
                    <td className="py-2 text-end font-medium">{formatIqd(lineTotal)}</td>
                    <td className="py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        aria-label="حذف البند"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t">
                <td colSpan={3} className="py-2 text-end text-slate-600">المجموع الفرعي</td>
                <td className="py-2 text-end font-medium">{formatIqd(subtotal)}</td>
                <td></td>
              </tr>
              <tr>
                <td colSpan={3} className="py-1 text-end text-slate-600">خصم الرأس (د.ع)</td>
                <td className="py-1 text-end">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={discountIqd}
                    onChange={(e) => setDiscountIqd(Number(e.target.value))}
                    className="w-32 rounded-md border border-slate-300 bg-white px-2 py-1 text-end text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </td>
                <td></td>
              </tr>
              <tr>
                <td colSpan={3} className="py-1 text-end text-slate-600">الضريبة (د.ع)</td>
                <td className="py-1 text-end">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={taxIqd}
                    onChange={(e) => setTaxIqd(Number(e.target.value))}
                    className="w-32 rounded-md border border-slate-300 bg-white px-2 py-1 text-end text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </td>
                <td></td>
              </tr>
              <tr className="border-t font-semibold">
                <td colSpan={3} className="py-3 text-end">الإجمالي</td>
                <td className="py-3 text-end text-lg">{formatIqd(total)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      <div className="flex items-center justify-between">
        {insufficientStock && (
          <p className="text-sm text-rose-600">⚠ بعض البنود تتجاوز الكمية المتوفرة في المخزن</p>
        )}
        <div className="ms-auto">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Save size={16} />
            {create.isPending ? 'جارٍ الحفظ…' : 'حفظ الأمر'}
          </button>
        </div>
      </div>
    </div>
  );
}
