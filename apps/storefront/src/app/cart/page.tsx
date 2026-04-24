'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { useCartStore } from '@/lib/cart-store';
import { formatIqd } from '@/lib/format';

const SHIPPING_FLAT = 5000;

export default function CartPage() {
  const items = useCartStore((s) => s.items);
  const updateQty = useCartStore((s) => s.updateQty);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);

  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const shipping = items.length > 0 ? SHIPPING_FLAT : 0;
  const total = subtotal + shipping;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8 text-right">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">سلة التسوق</h1>

        {items.length === 0 ? (
          <div className="text-center py-16 text-gray-500 bg-white rounded-lg border border-gray-100">
            <div className="text-6xl mb-4">🛒</div>
            <p className="mb-4">سلة التسوق فارغة</p>
            <Link
              href="/categories"
              className="inline-block bg-sky-700 hover:bg-sky-800 text-white px-5 py-2 rounded-lg text-sm font-semibold"
            >
              تصفح المنتجات
            </Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 text-sm text-gray-600">
                  <tr>
                    <th className="p-3 text-right font-medium">المنتج</th>
                    <th className="p-3 text-center font-medium">السعر</th>
                    <th className="p-3 text-center font-medium">الكمية</th>
                    <th className="p-3 text-center font-medium">الإجمالي</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((it) => (
                    <tr key={it.variantId}>
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="relative w-14 h-14 rounded-md bg-gray-100 overflow-hidden shrink-0">
                            {it.image ? (
                              <Image src={it.image} alt={it.name} fill sizes="56px" className="object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xl">🛍️</div>
                            )}
                          </div>
                          <span className="text-sm font-medium text-gray-900">{it.name}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center text-sm">{formatIqd(it.price)}</td>
                      <td className="p-3">
                        <div className="inline-flex items-center border border-gray-300 rounded-md">
                          <button
                            type="button"
                            onClick={() => updateQty(it.variantId, it.qty + 1)}
                            className="px-2 py-1 text-gray-600 hover:bg-gray-50"
                            aria-label="زيادة"
                          >
                            +
                          </button>
                          <span className="px-3 text-sm">{it.qty}</span>
                          <button
                            type="button"
                            onClick={() => updateQty(it.variantId, Math.max(1, it.qty - 1))}
                            className="px-2 py-1 text-gray-600 hover:bg-gray-50"
                            aria-label="إنقاص"
                          >
                            −
                          </button>
                        </div>
                      </td>
                      <td className="p-3 text-center text-sm font-semibold text-sky-700">
                        {formatIqd(it.price * it.qty)}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => remove(it.variantId)}
                          className="text-red-600 text-sm hover:underline"
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-3 border-t border-gray-100 flex justify-end">
                <button
                  type="button"
                  onClick={clear}
                  className="text-sm text-gray-600 hover:text-red-600"
                >
                  إفراغ السلة
                </button>
              </div>
            </div>

            <aside className="bg-white rounded-lg shadow-sm border border-gray-100 p-5 h-fit">
              <h2 className="text-lg font-semibold mb-4">ملخص الطلب</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">المجموع الفرعي</dt>
                  <dd className="font-medium">{formatIqd(subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">التوصيل (تقديري)</dt>
                  <dd className="font-medium">{formatIqd(shipping)}</dd>
                </div>
                <div className="flex justify-between pt-3 border-t border-gray-100 text-base">
                  <dt className="font-semibold">الإجمالي</dt>
                  <dd className="font-bold text-sky-700">{formatIqd(total)}</dd>
                </div>
              </dl>
              <Link
                href="/checkout"
                className="mt-5 block text-center bg-sky-700 hover:bg-sky-800 text-white py-3 rounded-lg font-semibold"
              >
                إتمام الشراء
              </Link>
              <Link
                href="/categories"
                className="mt-2 block text-center text-sm text-gray-600 hover:text-sky-700"
              >
                متابعة التسوق
              </Link>
            </aside>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
