'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { useCartStore } from '@/lib/cart-store';
import { formatIqd } from '@/lib/format';
import { createOrder, ApiError } from '@/lib/api';

const SHIPPING_FLAT = 5000;

type PaymentMethod = 'zain_cash' | 'fastpay' | 'qi_card' | 'cod';

interface FormValues {
  customerName: string;
  customerPhone: string;
  whatsapp?: string;
  deliveryAddress: string;
  city: string;
  paymentMethod: PaymentMethod;
}

const CITIES = ['بغداد', 'البصرة', 'الموصل', 'أربيل', 'النجف', 'كربلاء', 'السليمانية', 'كركوك'];

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clear);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { paymentMethod: 'cod', city: 'بغداد' },
  });

  const [submitError, setSubmitError] = useState<string | null>(null);

  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const shipping = items.length > 0 ? SHIPPING_FLAT : 0;
  const total = subtotal + shipping;

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    if (items.length === 0) {
      setSubmitError('سلة التسوق فارغة');
      return;
    }
    try {
      const resp = await createOrder({
        customerName:    values.customerName,
        customerPhone:   values.customerPhone,
        whatsapp:        values.whatsapp,
        city:            values.city,
        deliveryAddress: values.deliveryAddress,
        lines:           items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
        paymentMethod:   values.paymentMethod,
      });
      const orderId = resp?.id;
      clearCart();
      router.push(`/checkout/success${orderId ? `?orderId=${orderId}` : ''}`);
    } catch (err) {
      if (err instanceof ApiError) setSubmitError(err.messageAr);
      else setSubmitError('تعذر إتمام الطلب. حاول مجدداً');
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8 text-right">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">إتمام الشراء</h1>

        {items.length === 0 ? (
          <div className="text-center py-16 text-gray-500 bg-white rounded-lg border border-gray-100">
            <p>سلة التسوق فارغة</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
                <h2 className="text-lg font-semibold mb-4">بيانات المستلم</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-1">الاسم الكامل *</label>
                    <input
                      {...register('customerName', { required: 'مطلوب', minLength: { value: 2, message: 'قصير جداً' } })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
                    />
                    {errors.customerName && <p className="text-xs text-red-600 mt-1">{errors.customerName.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm mb-1">رقم الهاتف *</label>
                    <input
                      type="tel"
                      inputMode="tel"
                      placeholder="07XX XXX XXXX"
                      {...register('customerPhone', {
                        required: 'مطلوب',
                        pattern: { value: /^07\d{9}$/, message: 'صيغة رقم غير صحيحة' },
                      })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
                    />
                    {errors.customerPhone && <p className="text-xs text-red-600 mt-1">{errors.customerPhone.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm mb-1">واتساب (اختياري)</label>
                    <input
                      type="tel"
                      {...register('whatsapp', {
                        pattern: { value: /^07\d{9}$/, message: 'صيغة رقم غير صحيحة' },
                      })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
                    />
                    {errors.whatsapp && <p className="text-xs text-red-600 mt-1">{errors.whatsapp.message}</p>}
                  </div>
                </div>
              </section>

              <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
                <h2 className="text-lg font-semibold mb-4">عنوان التوصيل</h2>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm mb-1">العنوان التفصيلي *</label>
                    <textarea
                      rows={3}
                      {...register('deliveryAddress', { required: 'مطلوب', minLength: { value: 5, message: 'أدخل عنواناً أكثر تفصيلاً' } })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none resize-none"
                      placeholder="المنطقة، الشارع، رقم الدار…"
                    />
                    {errors.deliveryAddress && <p className="text-xs text-red-600 mt-1">{errors.deliveryAddress.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm mb-1">المدينة *</label>
                    <select
                      {...register('city', { required: 'مطلوب' })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none bg-white"
                    >
                      {CITIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
                <h2 className="text-lg font-semibold mb-4">طريقة الدفع</h2>
                <div className="space-y-2">
                  {[
                    { v: 'zain_cash', label: 'Zain Cash' },
                    { v: 'fastpay', label: 'FastPay' },
                    { v: 'qi_card', label: 'Qi Card' },
                    { v: 'cod', label: 'الدفع عند الاستلام' },
                  ].map((p) => (
                    <label
                      key={p.v}
                      className="flex items-center justify-between gap-3 border border-gray-200 rounded-md px-4 py-3 cursor-pointer hover:border-sky-500"
                    >
                      <span className="text-sm font-medium">{p.label}</span>
                      <input
                        type="radio"
                        value={p.v}
                        {...register('paymentMethod', { required: true })}
                        className="accent-sky-700"
                      />
                    </label>
                  ))}
                </div>
              </section>
            </div>

            <aside className="bg-white rounded-lg shadow-sm border border-gray-100 p-5 h-fit">
              <h2 className="text-lg font-semibold mb-4">ملخص الطلب</h2>
              <ul className="divide-y divide-gray-100 mb-4">
                {items.map((it) => (
                  <li key={it.variantId} className="py-2 text-sm flex justify-between gap-3">
                    <span className="text-gray-700 line-clamp-1">{it.name} × {it.qty}</span>
                    <span className="font-medium shrink-0">{formatIqd(it.price * it.qty)}</span>
                  </li>
                ))}
              </ul>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">المجموع الفرعي</dt>
                  <dd>{formatIqd(subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">التوصيل</dt>
                  <dd>{formatIqd(shipping)}</dd>
                </div>
                <div className="flex justify-between pt-3 border-t border-gray-100 text-base">
                  <dt className="font-semibold">الإجمالي</dt>
                  <dd className="font-bold text-sky-700">{formatIqd(total)}</dd>
                </div>
              </dl>

              {submitError && (
                <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
                  {submitError}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-5 w-full bg-sky-700 hover:bg-sky-800 disabled:bg-gray-400 text-white py-3 rounded-lg font-semibold"
              >
                {isSubmitting ? 'جارٍ الإرسال…' : 'تأكيد الطلب'}
              </button>
            </aside>
          </form>
        )}
      </main>
      <Footer />
    </>
  );
}
