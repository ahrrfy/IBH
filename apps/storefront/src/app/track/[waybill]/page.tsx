import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { getPublicTracking, type PublicTracking } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

const STEPS: { key: PublicTracking['status']; labelAr: string }[] = [
  { key: 'pending_dispatch', labelAr: 'بانتظار الإرسال' },
  { key: 'assigned',         labelAr: 'مُعيَّن لشركة' },
  { key: 'in_transit',       labelAr: 'في الطريق' },
  { key: 'delivered',        labelAr: 'تم التوصيل' },
];

const TERMINAL_BAD: PublicTracking['status'][] = ['failed', 'returned', 'cancelled'];

const STATUS_LABEL: Record<PublicTracking['status'], string> = {
  pending_dispatch: 'بانتظار الإرسال',
  assigned:         'مُعيَّن',
  in_transit:       'في الطريق',
  delivered:        'تم التوصيل',
  failed:           'فشل التوصيل',
  returned:         'أُعيد للمخزن',
  cancelled:        'ملغى',
};

function stepIndex(s: PublicTracking['status']): number {
  const i = STEPS.findIndex((x) => x.key === s);
  return i < 0 ? -1 : i;
}

export const dynamic = 'force-dynamic';

export default async function PublicTrackPage({
  params,
}: {
  params: Promise<{ waybill: string }>;
}) {
  const { waybill } = await params;

  let tracking: PublicTracking | null = null;
  let loadError: string | null = null;

  try {
    tracking = await getPublicTracking(waybill);
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'تعذر تحميل تفاصيل الشحنة';
  }

  const currentIdx = tracking ? stepIndex(tracking.status) : -1;
  const isBadTerminal = tracking ? TERMINAL_BAD.includes(tracking.status) : false;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 text-right">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">تتبع الشحنة</h1>
        <p className="text-sm text-gray-600 mb-6">
          رقم الشحنة:{' '}
          <span className="font-mono font-semibold text-gray-900">{waybill}</span>
        </p>

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
            {loadError}
          </div>
        )}

        {tracking && (
          <div className="space-y-6">
            <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">حالة الشحنة</h2>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium ${
                    isBadTerminal
                      ? 'bg-red-100 text-red-700'
                      : tracking.status === 'delivered'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-sky-100 text-sky-700'
                  }`}
                >
                  {STATUS_LABEL[tracking.status]}
                </span>
              </div>

              {!isBadTerminal && (
                <ol className="grid grid-cols-4 gap-2">
                  {STEPS.map((step, idx) => {
                    const reached = currentIdx >= idx;
                    const active = currentIdx === idx;
                    return (
                      <li key={step.key} className="text-center">
                        <div
                          className={`mx-auto flex size-9 items-center justify-center rounded-full border-2 text-sm font-bold ${
                            reached
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : 'border-gray-300 bg-white text-gray-400'
                          } ${active ? 'ring-4 ring-emerald-100' : ''}`}
                        >
                          {idx + 1}
                        </div>
                        <div
                          className={`mt-2 text-xs ${
                            reached ? 'text-gray-900 font-medium' : 'text-gray-400'
                          }`}
                        >
                          {step.labelAr}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              {isBadTerminal && tracking.failureReason && (
                <p className="text-sm text-red-700 mt-2">{tracking.failureReason}</p>
              )}
            </section>

            <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold mb-4">معلومات الشحنة</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <Row label="المدينة" value={tracking.deliveryCity ?? '—'} />
                <Row
                  label="الموعد المتوقع"
                  value={tracking.plannedDate ? formatDateTime(tracking.plannedDate) : '—'}
                />
                <Row
                  label="تاريخ الإرسال"
                  value={tracking.dispatchedAt ? formatDateTime(tracking.dispatchedAt) : '—'}
                />
                <Row
                  label="تاريخ التسليم"
                  value={tracking.deliveredAt ? formatDateTime(tracking.deliveredAt) : '—'}
                />
                {tracking.externalWaybillNo && (
                  <Row label="رقم الشركة الخارجية" value={tracking.externalWaybillNo} mono />
                )}
              </dl>
            </section>

            {tracking.deliveryCompany && (
              <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
                <h2 className="text-lg font-semibold mb-4">شركة التوصيل</h2>
                <p className="text-base font-medium text-gray-900 mb-2">
                  {tracking.deliveryCompany.nameAr}
                </p>
                <div className="flex flex-wrap gap-3">
                  {tracking.deliveryCompany.whatsapp && (
                    <a
                      href={`https://wa.me/${tracking.deliveryCompany.whatsapp.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm hover:bg-emerald-700"
                    >
                      تواصل عبر واتساب
                    </a>
                  )}
                  {tracking.deliveryCompany.phone && (
                    <a
                      href={`tel:${tracking.deliveryCompany.phone}`}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                    >
                      اتصال: {tracking.deliveryCompany.phone}
                    </a>
                  )}
                </div>
              </section>
            )}

            {tracking.statusLogs.length > 0 && (
              <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
                <h2 className="text-lg font-semibold mb-4">سجل التحديثات</h2>
                <ol className="space-y-3">
                  {[...tracking.statusLogs].reverse().map((log, i) => (
                    <li key={i} className="border-r-2 border-emerald-300 pr-4">
                      <div className="text-sm font-medium text-gray-900">
                        {STATUS_LABEL[log.toStatus as PublicTracking['status']] ?? log.toStatus}
                      </div>
                      <div className="text-xs text-gray-500">{formatDateTime(log.changedAt)}</div>
                      {log.notes && (
                        <div className="text-sm text-gray-700 mt-1">{log.notes}</div>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-gray-100 pb-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`text-gray-900 font-medium ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
