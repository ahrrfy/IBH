'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Truck, Building2, MapPin, Wallet, Activity } from 'lucide-react';
import { api } from '@/lib/api';
import { useLiveResource, useRealtimeStatus } from '@/lib/realtime/use-live-resource';
import { StatCard } from '@/components/stat-card';
import { formatIqd } from '@/lib/format';

type DeliveryRow = {
  id: string;
  number: string;
  status: string;
  codAmountIqd: string;
  codCollectedIqd: string;
  deliveryCompanyId: string | null;
  deliveryCity: string | null;
};

type CompaniesPage = { rows: Array<{ id: string; isActive: boolean; type: string }>; total: number };
type SettlementsPage = { rows: Array<{ status: string; netDueIqd: string }>; total: number };

export default function DeliveryHomePage() {
  const connected = useRealtimeStatus();

  // Live invalidate on relevant events from T31 event-relay
  useLiveResource(['delivery', 'live-summary'], [
    'delivery.created',
    'delivery.status.changed',
    'delivery.cod.collected',
  ]);

  const { data: deliveries } = useQuery({
    queryKey: ['delivery', 'live-summary'],
    queryFn: () => api<{ rows: DeliveryRow[]; total: number }>('/delivery?limit=200'),
  });

  const { data: companies } = useQuery({
    queryKey: ['delivery', 'companies-summary'],
    queryFn: () => api<CompaniesPage>('/delivery/companies?limit=200'),
  });

  const { data: settlements } = useQuery({
    queryKey: ['delivery', 'settlements-summary'],
    queryFn: () => api<SettlementsPage>('/delivery/settlements?limit=50'),
  });

  const rows = deliveries?.rows ?? [];
  const inTransit = rows.filter((r) => r.status === 'in_transit').length;
  const pending = rows.filter((r) => r.status === 'pending_dispatch' || r.status === 'assigned').length;
  const failed = rows.filter((r) => r.status === 'failed').length;
  const codOutstanding = rows
    .filter((r) => r.status === 'delivered')
    .reduce((acc, r) => acc + Number(r.codCollectedIqd ?? 0), 0);

  const activeCompanies = (companies?.rows ?? []).filter((c) => c.isActive).length;
  const externalCompanies = (companies?.rows ?? []).filter((c) => c.type === 'external' && c.isActive).length;
  const proposedSettlements = (settlements?.rows ?? []).filter((s) => s.status === 'proposed').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Truck className="size-8 text-primary" /> التوصيل
        </h1>
        <div className="flex items-center gap-2 text-sm">
          <Activity className={`size-4 ${connected ? 'text-emerald-600' : 'text-slate-400'}`} />
          <span className={connected ? 'text-emerald-700' : 'text-slate-500'}>
            {connected ? 'مباشر' : 'غير متصل'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="قيد التوصيل" value={String(inTransit)} icon={Truck} tone="primary" />
        <StatCard label="بانتظار الإرسال" value={String(pending)} icon={Activity} tone="accent" />
        <StatCard label="فشل/معلّق" value={String(failed)} icon={Activity} tone="danger" />
        <StatCard label="مستحقات COD" value={formatIqd(codOutstanding)} icon={Wallet} tone="success" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/delivery/dispatches"
          className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-primary hover:shadow transition"
        >
          <Truck className="size-6 text-primary mb-2" />
          <div className="font-semibold text-lg">إرساليات التوصيل</div>
          <div className="text-sm text-slate-500">عرض وإنشاء وتتبع</div>
        </Link>
        <Link
          href="/delivery/companies"
          className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-primary hover:shadow transition"
        >
          <Building2 className="size-6 text-primary mb-2" />
          <div className="font-semibold text-lg">شركات التوصيل ({activeCompanies})</div>
          <div className="text-sm text-slate-500">{externalCompanies} خارجية نشطة</div>
        </Link>
        <Link
          href="/delivery/zones"
          className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-primary hover:shadow transition"
        >
          <MapPin className="size-6 text-primary mb-2" />
          <div className="font-semibold text-lg">المناطق والأسعار</div>
          <div className="text-sm text-slate-500">شجرة المناطق + التسعيرات</div>
        </Link>
        <Link
          href="/delivery/settlements"
          className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-primary hover:shadow transition"
        >
          <Wallet className="size-6 text-primary mb-2" />
          <div className="font-semibold text-lg">تسويات COD</div>
          <div className="text-sm text-slate-500">
            {proposedSettlements > 0 ? `${proposedSettlements} بانتظار الاعتماد` : 'لا توجد تسويات معلّقة'}
          </div>
        </Link>
      </div>
    </div>
  );
}
