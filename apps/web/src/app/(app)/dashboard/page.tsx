'use client';

/**
 * Dashboard — Home Launcher
 * App-launcher style approved by user. Pastel tiles with saturated icons.
 * This is the primary landing screen after login.
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingBag, Package, CreditCard, ShoppingCart,
  Hammer, Users, Building2, Landmark,
  Settings, BarChart3, Megaphone, Handshake,
  TrendingUp, Wallet, AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatIqd } from '@/lib/format';

type AppTile = {
  href: string;
  label: string;
  icon: React.ElementType;
  bg: string;       // pastel background of the tile
  iconBg: string;   // saturated background of the icon container
};

const APPS: AppTile[] = [
  { href: '/purchases/orders',       label: 'المشتريات',     icon: ShoppingBag, bg: 'bg-violet-50',  iconBg: 'bg-violet-500' },
  { href: '/inventory/stock',        label: 'المخزون',        icon: Package,     bg: 'bg-orange-50',  iconBg: 'bg-orange-500' },
  { href: '/pos/shifts',             label: 'نقطة البيع',     icon: CreditCard,  bg: 'bg-emerald-50', iconBg: 'bg-emerald-500' },
  { href: '/sales/invoices',         label: 'المبيعات',       icon: ShoppingCart,bg: 'bg-sky-50',     iconBg: 'bg-sky-500' },

  { href: '/job-orders',             label: 'التصنيع',        icon: Hammer,      bg: 'bg-rose-50',    iconBg: 'bg-rose-500' },
  { href: '/hr/employees',           label: 'الموارد',        icon: Users,       bg: 'bg-cyan-50',    iconBg: 'bg-cyan-500' },
  { href: '/assets',                 label: 'الأصول',         icon: Building2,   bg: 'bg-teal-50',    iconBg: 'bg-teal-500' },
  { href: '/finance/journal-entries',label: 'المالية',        icon: Landmark,    bg: 'bg-pink-50',    iconBg: 'bg-rose-500' },

  { href: '/settings',               label: 'الإعدادات',      icon: Settings,    bg: 'bg-slate-100',  iconBg: 'bg-slate-700' },
  { href: '/reports',                label: 'التقارير',       icon: BarChart3,   bg: 'bg-amber-50',   iconBg: 'bg-amber-500' },
  { href: '/marketing/promotions',   label: 'التسويق',        icon: Megaphone,   bg: 'bg-fuchsia-50', iconBg: 'bg-fuchsia-500' },
  { href: '/crm/leads',              label: 'العملاء',        icon: Handshake,   bg: 'bg-indigo-50',  iconBg: 'bg-indigo-500' },
];

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'executive'],
    queryFn: () => api<any>('/dashboards/executive'),
  });

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-start justify-center p-6 sm:p-10">
      <div className="w-full max-w-6xl space-y-6">

        {/* ─── Welcome strip ──────────────────────────────────────────────── */}
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">مرحباً بك</h1>
          <p className="text-sm text-slate-500 mt-1">اختر تطبيقاً للبدء — جميع وحدات الرؤية العربية في مكان واحد</p>
        </div>

        {/* ─── KPI strip (subtle, above launcher) ─────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiPill
            icon={ShoppingCart}
            label="مبيعات اليوم"
            value={isLoading ? '—' : formatIqd(data?.todaySales ?? 0)}
            color="sky"
          />
          <KpiPill
            icon={Wallet}
            label="النقدية الكلية"
            value={isLoading ? '—' : formatIqd(data?.cashPosition ?? 0)}
            color="emerald"
          />
          <KpiPill
            icon={TrendingUp}
            label="ذمم مدينة"
            value={isLoading ? '—' : formatIqd(data?.arTotal ?? 0)}
            color="amber"
          />
          <KpiPill
            icon={AlertTriangle}
            label="تنبيهات المخزون"
            value={isLoading ? '—' : String(data?.lowStockCount ?? 0)}
            color="rose"
          />
        </div>

        {/* ─── Launcher Card ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-panel p-6 sm:p-8">
          <div className="flex items-center justify-between mb-5 sm:mb-6">
            <div />
            <h2 className="text-sm font-semibold text-slate-700">جميع التطبيقات</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {APPS.map((app) => (
              <AppLauncherTile key={app.href} {...app} />
            ))}
          </div>
        </div>

        {/* ─── Alerts strip (only if any) ────────────────────────────────── */}
        {data?.alerts?.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-900 mb-1">تنبيهات تتطلب الانتباه</h3>
              <ul className="text-xs text-amber-800 space-y-0.5">
                {data.alerts.slice(0, 3).map((a: any, i: number) => (
                  <li key={i}>• {a.message}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── App Launcher Tile ─────────────────────────────────────────────────────
function AppLauncherTile({ href, label, icon: Icon, bg, iconBg }: AppTile) {
  return (
    <Link
      href={href}
      className={`group ${bg} rounded-2xl p-5 sm:p-6 flex flex-col items-center justify-center gap-3
                  text-center transition-all duration-200
                  hover:shadow-lifted hover:-translate-y-1 active:translate-y-0
                  border border-transparent hover:border-white`}
    >
      <div className={`h-14 w-14 sm:h-16 sm:w-16 rounded-2xl ${iconBg} grid place-items-center
                       shadow-md group-hover:shadow-xl group-hover:scale-105 transition-all duration-200`}>
        <Icon className="h-7 w-7 sm:h-8 sm:w-8 text-white" strokeWidth={2.2} />
      </div>
      <span className="text-sm sm:text-base font-bold text-slate-900">{label}</span>
    </Link>
  );
}

// ─── KPI Pill (small, subtle, complements launcher) ────────────────────────
function KpiPill({
  icon: Icon, label, value, color,
}: { icon: React.ElementType; label: string; value: string; color: 'sky' | 'emerald' | 'amber' | 'rose' }) {
  const map = {
    sky:     { bg: 'bg-sky-100',     ic: 'text-sky-700',     v: 'text-sky-900' },
    emerald: { bg: 'bg-emerald-100', ic: 'text-emerald-700', v: 'text-emerald-900' },
    amber:   { bg: 'bg-amber-100',   ic: 'text-amber-700',   v: 'text-amber-900' },
    rose:    { bg: 'bg-rose-100',    ic: 'text-rose-700',    v: 'text-rose-900' },
  };
  const c = map[color];
  return (
    <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center gap-3 shadow-card hover:shadow-lifted transition-shadow">
      <div className={`h-10 w-10 rounded-xl ${c.bg} ${c.ic} grid place-items-center shrink-0`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-slate-500">{label}</div>
        <div className={`text-base font-bold ${c.v} truncate num-latin font-mono`}>{value}</div>
      </div>
    </div>
  );
}
