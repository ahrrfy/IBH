'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit, Wallet, MapPin, ArrowRight, Power } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd } from '@/lib/format';

type Rate = {
  id: string;
  baseFeeIqd: string;
  perKgIqd: string;
  estimatedHours: number;
  deliveryZone: { id: string; code: string; nameAr: string; city: string | null };
};

type Detail = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  type: 'internal' | 'external';
  isActive: boolean;
  autoSuspendedAt: string | null;
  autoSuspendReason: string | null;
  commissionPct: string;
  flatFeePerOrderIqd: string;
  supportsCod: boolean;
  codHoldingDays: number;
  totalDispatched: number;
  totalDelivered: number;
  totalFailed: number;
  totalReturned: number;
  successRatePct: string;
  avgDeliveryHours: string;
  contactPerson: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  rates: Rate[];
};

export default function DeliveryCompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: company, isLoading, error } = useQuery({
    queryKey: ['delivery-company', id],
    queryFn: () => api<Detail>(`/delivery/companies/${id}`),
  });

  const deactivate = useMutation({
    mutationFn: () => api(`/delivery/companies/${id}/deactivate`, { method: 'POST' }),
    onSuccess: () => {
      setConfirmDeactivate(false);
      qc.invalidateQueries({ queryKey: ['delivery-company', id] });
      qc.invalidateQueries({ queryKey: ['delivery-companies'] });
    },
    onError: (e: unknown) => {
      setActionError(e instanceof ApiError ? e.messageAr : 'فشل الإيقاف');
      setConfirmDeactivate(false);
    },
  });

  if (isLoading) return <div className="text-slate-500">جاري التحميل...</div>;
  if (error || !company) return <div className="text-red-600">خطأ في التحميل</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            {company.nameAr}{' '}
            <span className="text-slate-400 text-base">({company.code})</span>
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge
              status={company.autoSuspendedAt ? 'suspended' : company.isActive ? 'active' : 'inactive'}
            />
            <span className="text-sm text-slate-500">
              {company.type === 'internal' ? 'داخلي' : 'خارجي'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/delivery/companies/${id}/edit`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50"
          >
            <Edit className="size-4" /> تعديل
          </Link>
          <Link
            href={`/delivery/settlements?companyId=${id}`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50"
          >
            <Wallet className="size-4" /> التسويات
          </Link>
          {company.isActive && !company.autoSuspendedAt && (
            <button
              onClick={() => {
                setActionError(null);
                setConfirmDeactivate(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-red-300 text-red-700 bg-white px-4 py-2 hover:bg-red-50"
            >
              <Power className="size-4" /> إيقاف
            </button>
          )}
          <Link
            href="/delivery/companies"
            className="text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
          >
            <ArrowRight className="size-4" /> القائمة
          </Link>
        </div>
      </div>

      {actionError && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-800 text-sm">
          {actionError}
        </div>
      )}

      {company.autoSuspendedAt && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-amber-900">
          <div className="font-semibold">⚠️ الشركة مُعلَّقة تلقائياً</div>
          <div className="text-sm mt-1">{company.autoSuspendReason ?? 'انخفاض في معدل النجاح'}</div>
          <div className="text-xs text-amber-700 mt-1">
            {new Date(company.autoSuspendedAt).toLocaleString('ar-IQ')} — يمكن إعادة التفعيل من شاشة التعديل
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="معدل النجاح" value={company.totalDispatched > 0 ? `${company.successRatePct}%` : '—'} hint={`${company.totalDelivered} من ${company.totalDispatched}`} />
        <Card title="متوسط زمن التسليم" value={Number(company.avgDeliveryHours) > 0 ? `${company.avgDeliveryHours} س` : '—'} hint="آخر 100 توصيل" />
        <Card title="فشل / مرتجع" value={`${company.totalFailed} / ${company.totalReturned}`} hint="حسابي" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-lg mb-3">معلومات الشركة</h2>
          <dl className="space-y-2 text-sm">
            <Row label="جهة الاتصال" value={company.contactPerson} />
            <Row label="الهاتف" value={company.phone} dir="ltr" />
            <Row label="واتساب" value={company.whatsapp} dir="ltr" />
            <Row label="البريد" value={company.email} dir="ltr" />
            <Row label="العنوان" value={company.address} />
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-lg mb-3">إعدادات التسعير</h2>
          <dl className="space-y-2 text-sm">
            <Row label="نسبة العمولة" value={`${company.commissionPct}%`} />
            <Row label="رسوم ثابتة لكل طلب" value={formatIqd(company.flatFeePerOrderIqd)} />
            <Row label="يدعم COD" value={company.supportsCod ? 'نعم' : 'لا'} />
            <Row label="أيام الاحتفاظ بـ COD" value={`${company.codHoldingDays} يوم`} />
          </dl>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <MapPin className="size-5" /> التسعيرات حسب المنطقة ({company.rates.length})
          </h2>
          <Link href="/delivery/zones" className="text-sm text-primary hover:underline">
            إدارة المناطق
          </Link>
        </div>
        {company.rates.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">
            لا توجد تسعيرات. أضف منطقة وأنشئ تسعيرة من شاشة المناطق.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-start py-2">المنطقة</th>
                  <th className="text-start py-2">المدينة</th>
                  <th className="text-end py-2">الرسوم الأساسية</th>
                  <th className="text-end py-2">لكل كغ</th>
                  <th className="text-end py-2">الزمن المتوقع</th>
                </tr>
              </thead>
              <tbody>
                {company.rates.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2 font-medium">{r.deliveryZone.nameAr}</td>
                    <td className="py-2 text-slate-600">{r.deliveryZone.city ?? '—'}</td>
                    <td className="py-2 text-end">{formatIqd(r.baseFeeIqd)}</td>
                    <td className="py-2 text-end">{Number(r.perKgIqd) > 0 ? formatIqd(r.perKgIqd) : '—'}</td>
                    <td className="py-2 text-end">{r.estimatedHours} س</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {company.notes && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-lg mb-2">ملاحظات</h2>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{company.notes}</p>
        </section>
      )}

      <ConfirmDialog
        open={confirmDeactivate}
        onCancel={() => setConfirmDeactivate(false)}
        onConfirm={() => deactivate.mutate()}
        title="إيقاف الشركة"
        message="سيتم إيقاف هذه الشركة. لن تُختار تلقائياً للتوصيلات الجديدة. يمكن إعادة تفعيلها لاحقاً من شاشة التعديل."
        confirmLabel="إيقاف"
        tone="danger"
        loading={deactivate.isPending}
      />
    </div>
  );
}

function Card({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

function Row({ label, value, dir }: { label: string; value: string | null | undefined; dir?: 'ltr' | 'rtl' }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800 font-medium" dir={dir}>{value ?? '—'}</dd>
    </div>
  );
}
