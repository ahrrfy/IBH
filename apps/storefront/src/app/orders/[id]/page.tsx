import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { getOrder } from '@/lib/api';
import { formatIqd, formatDateTime } from '@/lib/format';

interface OrderLine {
  variantId: string;
  nameAr?: string;
  qty: number;
  price: number;
}

interface Order {
  id: string;
  status: OrderStatus;
  createdAt?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  total?: number;
  subtotal?: number;
  shipping?: number;
  paymentMethod?: string;
  lines?: OrderLine[];
}

type OrderStatus = 'placed' | 'preparing' | 'dispatched' | 'delivered' | 'cancelled';

const STEPS: { key: OrderStatus; labelAr: string }[] = [
  { key: 'placed', labelAr: 'تم الطلب' },
  { key: 'preparing', labelAr: 'قيد التجهيز' },
  { key: 'dispatched', labelAr: 'تم الشحن' },
  { key: 'delivered', labelAr: 'تم التوصيل' },
];

function statusIndex(s: OrderStatus): number {
  const i = STEPS.findIndex((x) => x.key === s);
  return i < 0 ? 0 : i;
}

export const dynamic = 'force-dynamic';

export default async function OrderTrackingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let order: Order | null = null;
  let loadError: string | null = null;

  try {
    order = (await getOrder(id)) as Order;
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'تعذر تحميل تفاصيل الطلب';
  }

  const currentIdx = order ? statusIndex(order.status) : -1;
  const cancelled = order?.status === 'cancelled';

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8 text-right">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">تتبع الطلب</h1>
        <p className="text-sm text-gray-600 mb-6">
          رقم الطلب: <span className="font-mono font-semibold text-gray-900">{id}</span>
        </p>

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
            {loadError}
          </div>
        )}

        {order && (
          <div className="space-y-6">
            <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold mb-6">حالة الطلب</h2>

              {cancelled ? (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
                  تم إلغاء هذا الطلب
                </div>
              ) : (
                <ol className="flex items-center justify-between relative">
                  <div
                    aria-hidden
                    className="absolute top-4 right-4 left-4 h-0.5 bg-gray-200"
                  />
                  <div
                    aria-hidden
                    className="absolute top-4 right-4 h-0.5 bg-sky-600 transition-all"
                    style={{ width: `calc(${(currentIdx / (STEPS.length - 1)) * 100}% - 1rem)` }}
                  />
                  {STEPS.map((step, i) => {
                    const done = i <= currentIdx;
                    return (
                      <li key={step.key} className="relative z-10 flex flex-col items-center gap-2">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                            done
                              ? 'bg-sky-600 border-sky-600 text-white'
                              : 'bg-white border-gray-300 text-gray-400'
                          }`}
                        >
                          {done ? '✓' : i + 1}
                        </div>
                        <span className={`text-xs text-center ${done ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                          {step.labelAr}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}

              {order.createdAt && (
                <p className="mt-6 text-sm text-gray-500">
                  تاريخ الطلب: {formatDateTime(order.createdAt)}
                </p>
              )}
            </section>

            <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold mb-4">تفاصيل التوصيل</h2>
              <dl className="grid md:grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-gray-600">الاسم</dt>
                  <dd className="font-medium">{order.customerName ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-600">الهاتف</dt>
                  <dd className="font-medium">{order.customerPhone ?? '—'}</dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-gray-600">العنوان</dt>
                  <dd className="font-medium">{order.deliveryAddress ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-600">طريقة الدفع</dt>
                  <dd className="font-medium">{order.paymentMethod ?? '—'}</dd>
                </div>
              </dl>
            </section>

            {order.lines && order.lines.length > 0 && (
              <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
                <h2 className="text-lg font-semibold mb-4">المنتجات</h2>
                <ul className="divide-y divide-gray-100">
                  {order.lines.map((l, i) => (
                    <li key={`${l.variantId}-${i}`} className="py-2 flex justify-between text-sm">
                      <span>{l.nameAr ?? l.variantId} × {l.qty}</span>
                      <span className="font-medium">{formatIqd(l.price * l.qty)}</span>
                    </li>
                  ))}
                </ul>
                {typeof order.total === 'number' && (
                  <div className="flex justify-between mt-4 pt-3 border-t border-gray-100 text-base">
                    <span className="font-semibold">الإجمالي</span>
                    <span className="font-bold text-sky-700">{formatIqd(order.total)}</span>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
