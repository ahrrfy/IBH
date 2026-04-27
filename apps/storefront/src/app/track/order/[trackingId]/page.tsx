'use client';

import { use, useEffect, useState } from 'react';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { getPublicOrderStatus, ApiError, type PublicOrderStatus } from '@/lib/api';
import { formatIqd } from '@/lib/format';

/**
 * T55 — Public order tracking page.
 *
 * Polls /public/orders/:trackingId/status every 30 seconds. The trackingId
 * is an opaque token (not the order number), so guessing one order never
 * leaks another customer's order. No PII leaves the API on this surface.
 */

const POLL_INTERVAL_MS = 30_000;

const STATUS_LABEL_AR: Record<string, string> = {
  draft:            'مُسودة',
  confirmed:        'مؤكد',
  processing:       'قيد التجهيز',
  shipped:          'تم الشحن',
  delivered:        'تم التوصيل',
  cancelled:        'ملغى',
  pending_dispatch: 'بانتظار الإرسال',
  assigned:         'مُعيَّن لشركة التوصيل',
  in_transit:       'في الطريق',
  failed:           'فشل التوصيل',
  returned:         'أُعيد للمخزن',
};

const PAYMENT_LABEL_AR: Record<string, string> = {
  pending:  'بانتظار الدفع',
  paid:     'مدفوع',
  refunded: 'مُسترد',
  failed:   'فشل الدفع',
};

const PAYMENT_METHOD_LABEL_AR: Record<string, string> = {
  cod:      'الدفع عند الاستلام',
  zaincash: 'Zain Cash',
  fastpay:  'FastPay',
  qi_card:  'Qi Card',
};

export default function OrderTrackingPage({
  params,
}: {
  params: Promise<{ trackingId: string }>;
}) {
  const { trackingId } = use(params);
  const [data,    setData]    = useState<PublicOrderStatus | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const next = await getPublicOrderStatus(trackingId);
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError) setError(err.messageAr);
          else                         setError('تعذر جلب حالة الطلب');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [trackingId]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-10 text-right">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">تتبع الطلب</h1>

        {loading && !data && (
          <div className="bg-white rounded-lg border border-gray-100 p-8 text-center text-gray-500">
            جاري التحميل…
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-4 mb-4 text-sm">
            {error}
          </div>
        )}

        {data && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">رقم الطلب</span>
              <span className="font-mono font-semibold text-gray-900">{data.orderNumber}</span>
            </div>

            <Row label="حالة الطلب">
              <Badge tone="sky">{STATUS_LABEL_AR[data.status] ?? data.status}</Badge>
            </Row>

            {data.deliveryStatus && (
              <Row label="حالة التوصيل">
                <Badge tone={data.deliveryStatus === 'delivered' ? 'green' : 'amber'}>
                  {STATUS_LABEL_AR[data.deliveryStatus] ?? data.deliveryStatus}
                </Badge>
              </Row>
            )}

            {data.paymentStatus && (
              <Row label="حالة الدفع">
                <Badge tone={data.paymentStatus === 'paid' ? 'green' : 'amber'}>
                  {PAYMENT_LABEL_AR[data.paymentStatus] ?? data.paymentStatus}
                </Badge>
              </Row>
            )}

            {data.paymentMethod && (
              <Row label="طريقة الدفع">
                <span className="text-sm">
                  {PAYMENT_METHOD_LABEL_AR[data.paymentMethod] ?? data.paymentMethod}
                </span>
              </Row>
            )}

            {data.deliveryCity && (
              <Row label="مدينة التوصيل">
                <span className="text-sm">{data.deliveryCity}</span>
              </Row>
            )}

            {data.eta && (
              <Row label="الموعد المتوقع">
                <span className="text-sm">{new Date(data.eta).toLocaleDateString('ar-IQ')}</span>
              </Row>
            )}

            {data.waybill && (
              <Row label="رقم الشحنة">
                <span className="font-mono text-sm">{data.waybill}</span>
              </Row>
            )}

            <div className="flex justify-between pt-3 border-t border-gray-100">
              <span className="font-semibold">الإجمالي</span>
              <span className="font-bold text-sky-700">{formatIqd(data.totalIqd)}</span>
            </div>

            <p className="text-xs text-gray-400 text-center pt-2">
              يتم تحديث الحالة تلقائياً كل 30 ثانية
            </p>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600">{label}</span>
      {children}
    </div>
  );
}

function Badge({ tone, children }: { tone: 'sky' | 'green' | 'amber'; children: React.ReactNode }) {
  const cls =
    tone === 'green' ? 'bg-green-50 text-green-700 border-green-200'
  : tone === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-200'
  :                    'bg-sky-50 text-sky-700 border-sky-200';
  return (
    <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full border ${cls}`}>
      {children}
    </span>
  );
}
