'use client';

import { useEffect, useState } from 'react';
import { ApiError, getMyLoyalty, type PortalLoyalty } from '@/lib/api';
import { getCustomerToken } from '@/lib/customer-auth';
import { formatIqd, formatDate } from '@/lib/format';

export default function LoyaltyPage() {
  const [data, setData] = useState<PortalLoyalty | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getCustomerToken();
    if (!token) return;
    (async () => {
      try {
        setData(await getMyLoyalty(token));
      } catch (err) {
        setError(err instanceof ApiError ? err.messageAr : 'تعذر تحميل النقاط');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="h-40 bg-gray-100 rounded-lg animate-pulse" />;
  }
  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
        {error ?? 'تعذر تحميل النقاط'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-6">
        <div className="text-sm text-amber-800">رصيد نقاط الولاء</div>
        <div className="mt-1 text-4xl font-bold text-amber-600">{data.points}</div>
        {data.tier && (
          <div className="mt-2 inline-block px-3 py-1 rounded-full bg-amber-200 text-amber-900 text-xs font-semibold">
            المستوى: {data.tier}
          </div>
        )}
      </section>

      <section className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <h2 className="text-lg font-semibold p-5 border-b border-gray-100">سجل النقاط</h2>
        {data.history.length === 0 ? (
          <div className="p-10 text-center text-gray-500 text-sm">لا توجد حركات نقاط بعد</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 text-sm text-gray-600">
              <tr>
                <th className="p-3 text-right font-medium">رقم الفاتورة</th>
                <th className="p-3 text-right font-medium">التاريخ</th>
                <th className="p-3 text-right font-medium">الإجمالي</th>
                <th className="p-3 text-right font-medium">مكتسبة</th>
                <th className="p-3 text-right font-medium">مستخدمة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.history.map((h) => (
                <tr key={h.id} className="text-sm">
                  <td className="p-3 font-mono">{h.number}</td>
                  <td className="p-3">{formatDate(h.date)}</td>
                  <td className="p-3">{formatIqd(h.total)}</td>
                  <td className="p-3 text-green-700 font-semibold">+{h.earned}</td>
                  <td className="p-3 text-red-600 font-semibold">{h.used > 0 ? `-${h.used}` : '0'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
