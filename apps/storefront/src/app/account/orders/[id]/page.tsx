'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { ApiError, getMyOrder, type PortalOrderDetail } from '@/lib/api';
import { getCustomerToken } from '@/lib/customer-auth';
import { formatIqd, formatDateTime } from '@/lib/format';

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  placed: 'تم الطلب',
  confirmed: 'مؤكد',
  preparing: 'قيد التجهيز',
  dispatched: 'تم الشحن',
  delivered: 'تم التوصيل',
  cancelled: 'ملغي',
};

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [order, setOrder] = useState<PortalOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getCustomerToken();
    if (!token) return;
    (async () => {
      try {
        const data = await getMyOrder(token, id);
        setOrder(data);
      } catch (err) {
        setError(err instanceof ApiError ? err.messageAr : 'تعذر تحميل تفاصيل الطلب');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return <div className="h-40 bg-gray-100 rounded-lg animate-pulse" />;
  }
  if (error || !order) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
        {error ?? 'الطلب غير موجود'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold">طلب رقم {order.number}</h2>
            <p className="text-sm text-gray-500 mt-1">
              {formatDateTime(order.createdAt)} —{' '}
              <span className="inline-block px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 text-xs font-medium">
                {STATUS_LABELS[order.status] ?? order.status}
              </span>
            </p>
          </div>
          {order.trackingId && (
            <Link
              href={`/track/order/${order.trackingId}`}
              className="bg-sky-700 hover:bg-sky-800 text-white px-4 py-2 rounded-lg text-sm font-semibold"
            >
              تتبع الطلب
            </Link>
          )}
        </div>
        <dl className="grid md:grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-gray-600">طريقة الدفع</dt>
            <dd className="font-medium">{order.paymentMethod ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-600">حالة الدفع</dt>
            <dd className="font-medium">{order.paymentStatus ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-600">الإجمالي</dt>
            <dd className="font-bold text-sky-700">{formatIqd(order.total)}</dd>
          </div>
        </dl>
      </section>

      <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold mb-4">المنتجات</h2>
        <ul className="divide-y divide-gray-100">
          {order.lines.map((l) => (
            <li key={l.id} className="py-3 flex justify-between gap-3 text-sm">
              <span className="text-gray-800">
                {l.nameAr} <span className="text-gray-500">× {l.qty}</span>
              </span>
              <span className="font-medium shrink-0">{formatIqd(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 pt-3 border-t border-gray-100 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">المجموع الفرعي</span>
            <span>{formatIqd(order.subtotal)}</span>
          </div>
          {order.shipping > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">التوصيل</span>
              <span>{formatIqd(order.shipping)}</span>
            </div>
          )}
          <div className="flex justify-between text-base pt-2 border-t border-gray-100">
            <span className="font-semibold">الإجمالي</span>
            <span className="font-bold text-sky-700">{formatIqd(order.total)}</span>
          </div>
        </div>
      </section>

      {order.delivery && (
        <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold mb-4">حالة التوصيل</h2>
          <dl className="grid md:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-gray-600">الحالة</dt>
              <dd className="font-medium">{order.delivery.status}</dd>
            </div>
            {order.delivery.deliveryCity && (
              <div>
                <dt className="text-gray-600">المدينة</dt>
                <dd className="font-medium">{order.delivery.deliveryCity}</dd>
              </div>
            )}
            {order.delivery.dispatchedAt && (
              <div>
                <dt className="text-gray-600">تاريخ الشحن</dt>
                <dd className="font-medium">{formatDateTime(order.delivery.dispatchedAt)}</dd>
              </div>
            )}
            {order.delivery.deliveredAt && (
              <div>
                <dt className="text-gray-600">تاريخ التوصيل</dt>
                <dd className="font-medium">{formatDateTime(order.delivery.deliveredAt)}</dd>
              </div>
            )}
          </dl>
        </section>
      )}
    </div>
  );
}
