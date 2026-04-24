'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatCard } from '@/components/stat-card';
import { SalesTrendChart } from '@/components/charts/sales-trend';
import { ProfitMarginChart } from '@/components/charts/profit-margin';
import { formatIqd } from '@/lib/format';
import { ShoppingCart, Wallet, TrendingUp, AlertTriangle } from 'lucide-react';

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'executive'],
    queryFn: () => api<any>('/dashboards/executive'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">لوحة التحكم التنفيذية</h1>
        <p className="text-sm text-slate-500 mt-1">نظرة عامة لحظية على أداء الشركة</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="مبيعات اليوم"
          value={isLoading ? '—' : formatIqd(data?.todaySales ?? 0)}
          icon={<ShoppingCart className="h-5 w-5 text-sky-600" />}
          trend={data?.salesTrend ?? 0}
        />
        <StatCard
          label="النقدية الكلية"
          value={isLoading ? '—' : formatIqd(data?.cashPosition ?? 0)}
          icon={<Wallet className="h-5 w-5 text-emerald-600" />}
        />
        <StatCard
          label="ذمم مدينة"
          value={isLoading ? '—' : formatIqd(data?.arTotal ?? 0)}
          icon={<TrendingUp className="h-5 w-5 text-amber-600" />}
        />
        <StatCard
          label="مخزون تحت نقطة الطلب"
          value={isLoading ? '—' : String(data?.lowStockCount ?? 0)}
          icon={<AlertTriangle className="h-5 w-5 text-rose-600" />}
          hint="أصناف تحتاج إعادة طلب"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-800">المبيعات آخر 30 يوماً</h2>
          <SalesTrendChart data={data?.salesByDay ?? []} />
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-800">الربحية حسب الفرع</h2>
          <ProfitMarginChart data={data?.profitByBranch ?? []} />
        </div>
      </div>

      {data?.alerts?.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="mb-2 font-semibold text-amber-900">تنبيهات تتطلب الانتباه</h3>
          <ul className="space-y-1 text-sm text-amber-800">
            {data.alerts.map((a: any, i: number) => (
              <li key={i}>⚠️ {a.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
