'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError, getMyOrders, type PortalOrderListItem } from '@/lib/api';
import { getCustomerToken } from '@/lib/customer-auth';
import { formatIqd, formatDate } from '@/lib/format';

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  placed: 'تم الطلب',
  confirmed: 'مؤكد',
  preparing: 'قيد التجهيز',
  dispatched: 'تم الشحن',
  delivered: 'تم التوصيل',
  cancelled: 'ملغي',
};

export default function OrdersListPage() {
  const [orders, setOrders] = useState<PortalOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getCustomerToken();
    if (!token) return;
    (async () => {
      try {
        const resp = await getMyOrders(token);
        setOrders(resp.items);
      } catch (err) {
        setError(err instanceof ApiError ? err.messageAr : 'تعذر تحميل الطلبات');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <section className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      <h2 className="text-lg font-semibold p-5 border-b border-gray-100">طلباتي</h2>
      {loading ? (
        <div className="p-5 space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-200 animate-pulse rounded-md" />
          ))}
        </div>
      ) : error ? (
        <div className="p-5 text-red-600 text-sm">{error}</div>
      ) : orders.length === 0 ? (
        <div className="p-10 text-center text-gray-500">
          <div className="text-4xl mb-3">📦</div>
          <p className="text-sm">لا توجد طلبات بعد</p>
          <Link href="/categories" className="mt-3 inline-block text-sky-700 hover:underline text-sm">
            ابدأ التسوق
          </Link>
        </div>
      ) : (
        <table className="w-full">
          <thead className="bg-gray-50 text-sm text-gray-600">
            <tr>
              <th className="p-3 text-right font-medium">رقم الطلب</th>
              <th className="p-3 text-right font-medium">التاريخ</th>
              <th className="p-3 text-right font-medium">الحالة</th>
              <th className="p-3 text-right font-medium">الإجمالي</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orders.map((o) => (
              <tr key={o.id} className="text-sm">
                <td className="p-3 font-mono">{o.number || o.id.slice(0, 8)}</td>
                <td className="p-3">{formatDate(o.createdAt)}</td>
                <td className="p-3">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 text-xs font-medium">
                    {STATUS_LABELS[o.status] ?? o.status}
                  </span>
                </td>
                <td className="p-3 font-semibold">{formatIqd(o.total)}</td>
                <td className="p-3 text-left">
                  <Link href={`/account/orders/${o.id}`} className="text-sky-700 hover:underline">
                    التفاصيل
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
