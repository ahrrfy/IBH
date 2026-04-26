'use client';

/**
 * Dashboard — Role-personalized launcher
 * The user's primary role's first module gets a larger tile.
 * Modules user can't access are hidden entirely.
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingBag, Package, CreditCard, ShoppingCart,
  Hammer, Users, Building2, Landmark,
  Settings, BarChart3, Megaphone, Handshake,
  TrendingUp, Wallet, AlertTriangle, Star,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatIqd } from '@/lib/format';
import {
  type ModuleKey,
  getVisibleModulesForRoles,
  MODULE_HREFS,
  ROLE_LABELS_AR,
} from '@/lib/permissions';

type AppTile = {
  key: ModuleKey;
  label: string;
  icon: React.ElementType;
  bg: string;
  iconBg: string;
};

const TILE_DEFS: Record<ModuleKey, Omit<AppTile, 'key'>> = {
  sales:     { label: 'المبيعات',       icon: ShoppingCart, bg: 'bg-sky-50',     iconBg: 'bg-sky-500' },
  pos:       { label: 'نقطة البيع',     icon: CreditCard,   bg: 'bg-emerald-50', iconBg: 'bg-emerald-500' },
  inventory: { label: 'المخزون',         icon: Package,      bg: 'bg-orange-50',  iconBg: 'bg-orange-500' },
  purchases: { label: 'المشتريات',      icon: ShoppingBag,  bg: 'bg-violet-50',  iconBg: 'bg-violet-500' },
  finance:   { label: 'المالية',         icon: Landmark,     bg: 'bg-pink-50',    iconBg: 'bg-rose-500' },
  assets:    { label: 'الأصول',          icon: Building2,    bg: 'bg-teal-50',    iconBg: 'bg-teal-500' },
  hr:        { label: 'الموارد البشرية', icon: Users,        bg: 'bg-cyan-50',    iconBg: 'bg-cyan-500' },
  jobs:      { label: 'التصنيع',         icon: Hammer,       bg: 'bg-rose-50',    iconBg: 'bg-rose-500' },
  crm:       { label: 'العملاء',         icon: Handshake,    bg: 'bg-indigo-50',  iconBg: 'bg-indigo-500' },
  marketing: { label: 'التسويق',         icon: Megaphone,    bg: 'bg-fuchsia-50', iconBg: 'bg-fuchsia-500' },
  reports:   { label: 'التقارير',        icon: BarChart3,    bg: 'bg-amber-50',   iconBg: 'bg-amber-500' },
  settings:  { label: 'الإعدادات',       icon: Settings,     bg: 'bg-slate-100',  iconBg: 'bg-slate-700' },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const isOwner = Boolean((user as any)?.isSystemOwner);
  // System owner sees everything regardless of roles array.
  const userRoles: string[] = isOwner
    ? ['super_admin']
    : ((user as any)?.roles ?? [(user as any)?.role].filter(Boolean));
  const visible = getVisibleModulesForRoles(userRoles);
  const primaryRole = userRoles[0] ?? 'super_admin';
  const primaryRoleLabel = isOwner ? 'مالك النظام' : (ROLE_LABELS_AR[primaryRole] ?? primaryRole);
  const displayName = (user as any)?.nameAr ?? (user as any)?.name ?? (user as any)?.email?.split('@')[0] ?? 'مستخدم';

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'executive'],
    queryFn: () => api<any>('/dashboards/executive'),
  });

  return (
    <div className="min-h-full bg-slate-50 p-6 sm:p-10">
      <div className="w-full max-w-6xl mx-auto space-y-6">

        {/* Welcome */}
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">
            مرحباً، <span className="text-sky-700">{displayName}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1.5">
            <span className="num-latin">{new Date().toLocaleDateString('en-CA')}</span>
            {' · '}
            <span className="font-medium text-slate-700">{primaryRoleLabel}</span>
            {' · '}
            اختر تطبيقاً للبدء
          </p>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiPill icon={ShoppingCart}   label="مبيعات اليوم"    value={isLoading ? '—' : formatIqd(data?.todaySales ?? 0)}  color="sky" />
          <KpiPill icon={Wallet}         label="النقدية الكلية"  value={isLoading ? '—' : formatIqd(data?.cashPosition ?? 0)} color="emerald" />
          <KpiPill icon={TrendingUp}     label="ذمم مدينة"       value={isLoading ? '—' : formatIqd(data?.arTotal ?? 0)}      color="amber" />
          <KpiPill icon={AlertTriangle}  label="تنبيهات المخزون" value={isLoading ? '—' : String(data?.lowStockCount ?? 0)}  color="rose" />
        </div>

        {/* Launcher card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-panel p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>متصل · جميع الخدمات تعمل</span>
            </div>
            <h2 className="text-sm font-semibold text-slate-700">تطبيقاتك</h2>
          </div>

          {visible.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              لا توجد وحدات متاحة لدورك حالياً
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {visible.map((m, i) => {
                const def = TILE_DEFS[m];
                const isPrimary = i === 0;
                return (
                  <AppLauncherTile
                    key={m}
                    tile={{ key: m, ...def }}
                    href={MODULE_HREFS[m]}
                    isPrimary={isPrimary}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Alerts */}
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

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 pt-4">
          © {new Date().getFullYear()} الرؤية العربية للتجارة · الإصدار <span className="num-latin">1.0.0</span>
        </div>
      </div>
    </div>
  );
}

// ─── App Launcher Tile (primary tile is bigger with star) ────────────────
function AppLauncherTile({ tile, href, isPrimary }: { tile: AppTile; href: string; isPrimary: boolean }) {
  const { label, icon: Icon, bg, iconBg } = tile;
  return (
    <Link
      href={href}
      className={`group ${bg} rounded-2xl flex flex-col items-center justify-center gap-3 text-center
                  transition-all duration-200 hover:shadow-lifted hover:-translate-y-1 active:translate-y-0
                  border border-transparent hover:border-white relative
                  ${isPrimary ? 'sm:col-span-2 sm:row-span-2 p-8' : 'p-5 sm:p-6'}`}
    >
      {isPrimary && (
        <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
          <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
          الرئيسي
        </span>
      )}
      <div className={`rounded-2xl ${iconBg} grid place-items-center
                       shadow-md group-hover:shadow-xl group-hover:scale-105 transition-all duration-200
                       ${isPrimary ? 'h-20 w-20 sm:h-24 sm:w-24' : 'h-14 w-14 sm:h-16 sm:w-16'}`}>
        <Icon className={`text-white ${isPrimary ? 'h-10 w-10 sm:h-12 sm:w-12' : 'h-7 w-7 sm:h-8 sm:w-8'}`} strokeWidth={2.2} />
      </div>
      <span className={`font-bold text-slate-900 ${isPrimary ? 'text-xl sm:text-2xl' : 'text-sm sm:text-base'}`}>
        {label}
      </span>
      {isPrimary && (
        <span className="text-xs text-slate-600 mt-1">الوحدة الأكثر استخداماً لدورك</span>
      )}
    </Link>
  );
}

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
