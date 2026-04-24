'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { getMyOrders } from '@/lib/api';
import { getPhone, logout } from '@/lib/auth';
import { formatIqd, formatDate } from '@/lib/format';

interface OrderRow {
  id: string;
  status: string;
  createdAt?: string;
  total?: number;
}

interface Address {
  id: string;
  label: string;
  city: string;
  address: string;
}

const STATUS_LABELS: Record<string, string> = {
  placed: 'تم الطلب',
  preparing: 'قيد التجهيز',
  dispatched: 'تم الشحن',
  delivered: 'تم التوصيل',
  cancelled: 'ملغي',
};

export default function AccountPage() {
  const router = useRouter();
  const [phone, setPhone] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loyaltyPoints] = useState(0);
  const [addresses] = useState<Address[]>([]);

  useEffect(() => {
    setPhone(getPhone());
    (async () => {
      try {
        const resp = await getMyOrders();
        const list = (Array.isArray(resp) ? resp : (resp as { items?: OrderRow[] })?.items ?? []) as OrderRow[];
        setOrders(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذر تحميل الطلبات');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function onLogout() {
    logout();
    router.push('/');
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-8 text-right">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">حسابي</h1>
          <button
            type="button"
            onClick={onLogout}
            className="text-sm text-red-600 hover:underline"
          >
            تسجيل الخروج
          </button>
        </div>

        {/* Loyalty + profile summary */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
            <div className="text-sm text-gray-500">رقم الهاتف</div>
            <div className="mt-1 text-lg font-semibold">{phone ?? '—'}</div>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-5">
            <div className="text-sm text-amber-800">نقاط الولاء</div>
            <div className="mt-1 text-2xl font-bold text-amber-600">{loyaltyPoints} نقطة</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
            <div className="text-sm text-gray-500">عدد الطلبات</div>
            <div className="mt-1 text-2xl font-bold text-sky-700">{orders.length}</div>
          </div>
        </div>

        {/* Orders */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden mb-8">
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
                    <td className="p-3 font-mono">{o.id.slice(0, 8)}</td>
                    <td className="p-3">{o.createdAt ? formatDate(o.createdAt) : '—'}</td>
                    <td className="p-3">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 text-xs font-medium">
                        {STATUS_LABELS[o.status] ?? o.status}
                      </span>
                    </td>
                    <td className="p-3 font-semibold">{o.total ? formatIqd(o.total) : '—'}</td>
                    <td className="p-3 text-left">
                      <Link href={`/orders/${o.id}`} className="text-sky-700 hover:underline">
                        التتبع
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Addresses */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
          <h2 className="text-lg font-semibold mb-4">العناوين المحفوظة</h2>
          {addresses.length === 0 ? (
            <p className="text-sm text-gray-500">لا توجد عناوين محفوظة بعد</p>
          ) : (
            <ul className="space-y-2">
              {addresses.map((a) => (
                <li key={a.id} className="border border-gray-200 rounded-md p-3 text-sm">
                  <div className="font-medium">{a.label}</div>
                  <div className="text-gray-600">{a.address}، {a.city}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
