'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatIqd } from '@/lib/format';
import { useLiveResource } from '@/lib/realtime/use-live-resource';

/**
 * T44 — Customer 360 detail view.
 *
 * Reads the aggregated `/sales/customer-360/:id` endpoint and live-refreshes
 * via the `customer.rfm_updated` event bus (no DB polling).
 */

interface CustomerSummary {
  id: string;
  code: string;
  nameAr: string;
  type: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  creditLimitIqd: string;
  creditBalanceIqd: string;
  loyaltyPoints: number;
  loyaltyTier: string | null;
  defaultDiscountPct: string;
  isActive: boolean;
}

interface RfmBlock {
  recencyDays: number | null;
  frequency: number | null;
  monetaryIqd: string | null;
  rScore: number | null;
  fScore: number | null;
  mScore: number | null;
  segment: 'Champion' | 'Loyal' | 'At-Risk' | 'Lost' | 'New' | null;
  computedAt: string | null;
}

interface Customer360 {
  customer: CustomerSummary;
  rfm: RfmBlock;
  lifetime: {
    invoiceCount: number;
    totalIqd: string;
    outstandingIqd: string;
    firstInvoiceAt: string | null;
    lastInvoiceAt: string | null;
  };
  recentInvoices: Array<{
    id: string;
    number: string;
    invoiceDate: string;
    dueDate: string | null;
    status: string;
    totalIqd: string;
    paidIqd: string;
    balanceIqd: string;
  }>;
  recentQuotations: Array<{
    id: string;
    number: string;
    quotationDate: string;
    validUntil: string;
    status: string;
    totalIqd: string;
  }>;
  recentOrders: Array<{
    id: string;
    number: string;
    orderDate: string;
    status: string;
    totalIqd: string;
  }>;
  aging: {
    current: string;
    d1_30: string;
    d31_60: string;
    d61_90: string;
    d90plus: string;
    total: string;
  };
  topProducts: Array<{
    variantId: string;
    sku: string | null;
    nameAr: string | null;
    qty: string;
    totalIqd: string;
  }>;
}

const SEGMENT_LABEL_AR: Record<string, { ar: string; cls: string }> = {
  Champion: { ar: 'بطل', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-300' },
  Loyal:    { ar: 'وفي', cls: 'bg-sky-100 text-sky-800 ring-sky-300' },
  'At-Risk':{ ar: 'في خطر', cls: 'bg-amber-100 text-amber-800 ring-amber-300' },
  Lost:     { ar: 'مفقود', cls: 'bg-rose-100 text-rose-800 ring-rose-300' },
  New:      { ar: 'جديد', cls: 'bg-slate-100 text-slate-700 ring-slate-300' },
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['customer-360', id],
    queryFn: () => api<Customer360>(`/sales/customer-360/${id}`),
    enabled: !!id,
  });

  // Live updates — refetch when the nightly RFM job (or a per-customer
  // recompute) emits a relevant event for this company/customer.
  useLiveResource<{ customerId?: string; scope?: string }>(
    ['customer-360', id],
    'customer.rfm_updated',
    (p) => p?.scope === 'company' || p?.customerId === id,
  );

  if (isLoading) {
    return <div className="p-6 text-slate-500">جارٍ التحميل…</div>;
  }
  if (error || !data) {
    return <div className="p-6 text-rose-600">تعذَّر تحميل بيانات العميل</div>;
  }

  const c = data.customer;
  const seg = data.rfm.segment ? SEGMENT_LABEL_AR[data.rfm.segment] : null;

  return (
    <div className="space-y-6">
      <header>
        <Link href="/sales/customers" className="text-sm text-sky-700 hover:underline">
          ← العودة للقائمة
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold">{c.nameAr}</h1>
          {seg && (
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ring-1 ${seg.cls}`}
              title={`R${data.rfm.rScore} · F${data.rfm.fScore} · M${data.rfm.mScore}`}
            >
              {seg.ar}
            </span>
          )}
          {!c.isActive && (
            <span className="inline-flex items-center rounded-full bg-slate-200 px-3 py-1 text-xs text-slate-600">
              غير نشط
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500">{c.code} · {c.type ?? '—'}</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Card title="معلومات الاتصال">
          <Row label="الهاتف" value={c.phone ?? '—'} />
          <Row label="واتساب" value={c.whatsapp ?? '—'} />
          <Row label="البريد" value={c.email ?? '—'} />
          <Row label="العنوان" value={c.address ?? '—'} />
          <Row label="المدينة" value={c.city ?? '—'} />
        </Card>

        <Card title="الرصيد والولاء">
          <Row label="حد الائتمان" value={formatIqd(c.creditLimitIqd)} />
          <Row label="الرصيد الحالي" value={formatIqd(c.creditBalanceIqd)} />
          <Row label="نقاط الولاء" value={String(c.loyaltyPoints)} />
          <Row label="فئة الولاء" value={c.loyaltyTier ?? '—'} />
          <Row label="الخصم الافتراضي" value={`${c.defaultDiscountPct}%`} />
        </Card>

        <Card title="RFM">
          {data.rfm.segment ? (
            <>
              <Row label="آخر شراء" value={data.rfm.recencyDays != null ? `قبل ${data.rfm.recencyDays} يوم` : '—'} />
              <Row label="عدد الفواتير (سنة)" value={String(data.rfm.frequency ?? 0)} />
              <Row
                label="إجمالي الإنفاق (سنة)"
                value={data.rfm.monetaryIqd ? formatIqd(data.rfm.monetaryIqd) : '—'}
              />
              <Row label="R · F · M" value={`${data.rfm.rScore ?? '?'} / ${data.rfm.fScore ?? '?'} / ${data.rfm.mScore ?? '?'}`} />
              <Row
                label="آخر تحديث"
                value={data.rfm.computedAt ? new Date(data.rfm.computedAt).toLocaleString('ar') : '—'}
              />
            </>
          ) : (
            <p className="text-sm text-slate-500">لم يُحسب بعد — الجدولة الليلية ستحدّثه.</p>
          )}
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card title="القيمة الإجمالية للعمر (Lifetime)">
          <Row label="عدد الفواتير" value={String(data.lifetime.invoiceCount)} />
          <Row label="إجمالي المبيعات" value={formatIqd(data.lifetime.totalIqd)} />
          <Row label="المستحقات" value={formatIqd(data.lifetime.outstandingIqd)} />
          <Row label="أول فاتورة" value={data.lifetime.firstInvoiceAt ? new Date(data.lifetime.firstInvoiceAt).toLocaleDateString('en-CA') : '—'} />
          <Row label="آخر فاتورة" value={data.lifetime.lastInvoiceAt ? new Date(data.lifetime.lastInvoiceAt).toLocaleDateString('en-CA') : '—'} />
        </Card>

        <Card title="أعمار الذمم (AR Aging)">
          <Row label="جارية" value={formatIqd(data.aging.current)} />
          <Row label="1–30 يوم" value={formatIqd(data.aging.d1_30)} />
          <Row label="31–60 يوم" value={formatIqd(data.aging.d31_60)} />
          <Row label="61–90 يوم" value={formatIqd(data.aging.d61_90)} />
          <Row label="أكثر من 90 يوم" value={formatIqd(data.aging.d90plus)} />
          <Row label="الإجمالي" value={formatIqd(data.aging.total)} bold />
        </Card>
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">آخر الفواتير</h2>
        {data.recentInvoices.length === 0 ? (
          <p className="text-sm text-slate-500">لا توجد فواتير.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-right text-slate-500">
                <th className="py-2">الرقم</th>
                <th>التاريخ</th>
                <th>الحالة</th>
                <th>الإجمالي</th>
                <th>المدفوع</th>
                <th>المتبقي</th>
              </tr>
            </thead>
            <tbody>
              {data.recentInvoices.map((inv) => (
                <tr key={inv.id} className="border-b last:border-0">
                  <td className="py-2 font-mono">{inv.number}</td>
                  <td>{new Date(inv.invoiceDate).toLocaleDateString('en-CA')}</td>
                  <td>{inv.status}</td>
                  <td>{formatIqd(inv.totalIqd)}</td>
                  <td>{formatIqd(inv.paidIqd)}</td>
                  <td>{formatIqd(inv.balanceIqd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card title="آخر العروض">
          {data.recentQuotations.length === 0 ? (
            <p className="text-sm text-slate-500">لا توجد عروض.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.recentQuotations.map((q) => (
                <li key={q.id} className="flex justify-between">
                  <span className="font-mono">{q.number}</span>
                  <span>{q.status}</span>
                  <span>{formatIqd(q.totalIqd)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="آخر الطلبات">
          {data.recentOrders.length === 0 ? (
            <p className="text-sm text-slate-500">لا توجد طلبات.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.recentOrders.map((o) => (
                <li key={o.id} className="flex justify-between">
                  <span className="font-mono">{o.number}</span>
                  <span>{o.status}</span>
                  <span>{formatIqd(o.totalIqd)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">أكثر المنتجات شراءً (آخر 90 يوم)</h2>
        {data.topProducts.length === 0 ? (
          <p className="text-sm text-slate-500">لا توجد بيانات.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.topProducts.map((p) => (
              <li key={p.variantId} className="flex justify-between">
                <span>{p.nameAr ?? '—'}</span>
                <span className="font-mono text-slate-500">{p.sku ?? '—'}</span>
                <span>الكمية: {p.qty}</span>
                <span>{formatIqd(p.totalIqd)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">{children}</dl>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className={bold ? 'font-semibold' : ''}>{value}</dd>
    </>
  );
}
