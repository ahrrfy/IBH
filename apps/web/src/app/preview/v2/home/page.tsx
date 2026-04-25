'use client';

/**
 * Preview — Main Home Screen (App Launcher style)
 * URL: https://ibherp.cloud/preview/v2/home
 * The same layout will be at /dashboard after login.
 */

import {
  ShoppingBag, Package, CreditCard, ShoppingCart,
  Hammer, Users, Building2, Landmark,
  Settings, BarChart3, Megaphone, Handshake,
  TrendingUp, Wallet, AlertTriangle, Bell, Search, User, LogOut,
} from 'lucide-react';

type AppTile = {
  key: string;
  label: string;
  icon: React.ElementType;
  bg: string;
  iconBg: string;
};

const APPS: AppTile[] = [
  { key: 'purchases', label: 'المشتريات',     icon: ShoppingBag, bg: 'bg-violet-50',  iconBg: 'bg-violet-500' },
  { key: 'inventory', label: 'المخزون',        icon: Package,     bg: 'bg-orange-50',  iconBg: 'bg-orange-500' },
  { key: 'pos',       label: 'نقطة البيع',     icon: CreditCard,  bg: 'bg-emerald-50', iconBg: 'bg-emerald-500' },
  { key: 'sales',     label: 'المبيعات',       icon: ShoppingCart,bg: 'bg-sky-50',     iconBg: 'bg-sky-500' },
  { key: 'jobs',      label: 'التصنيع',        icon: Hammer,      bg: 'bg-rose-50',    iconBg: 'bg-rose-500' },
  { key: 'hr',        label: 'الموارد',        icon: Users,       bg: 'bg-cyan-50',    iconBg: 'bg-cyan-500' },
  { key: 'assets',    label: 'الأصول',         icon: Building2,   bg: 'bg-teal-50',    iconBg: 'bg-teal-500' },
  { key: 'finance',   label: 'المالية',        icon: Landmark,    bg: 'bg-pink-50',    iconBg: 'bg-rose-500' },
  { key: 'settings',  label: 'الإعدادات',      icon: Settings,    bg: 'bg-slate-100',  iconBg: 'bg-slate-700' },
  { key: 'reports',   label: 'التقارير',       icon: BarChart3,   bg: 'bg-amber-50',   iconBg: 'bg-amber-500' },
  { key: 'marketing', label: 'التسويق',        icon: Megaphone,   bg: 'bg-fuchsia-50', iconBg: 'bg-fuchsia-500' },
  { key: 'crm',       label: 'العملاء',        icon: Handshake,   bg: 'bg-indigo-50',  iconBg: 'bg-indigo-500' },
];

export default function HomePreview() {
  return (
    <div className="min-h-[calc(100vh-2.75rem)] bg-slate-50 flex flex-col" dir="rtl">

      {/* ─── Topbar (slim, just identity) ───────────────────────────────── */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center px-5 gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-sky-700 text-white grid place-items-center font-bold text-lg shadow">
            ر
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-slate-900">الرؤية العربية</div>
            <div className="text-[10px] text-slate-500">نظام تخطيط الموارد المؤسسي</div>
          </div>
        </div>

        <div className="flex-1 max-w-md mx-auto">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="search"
              placeholder="ابحث في كل النظام..."
              className="h-9 w-full rounded-lg bg-slate-100 border border-transparent pr-10 pl-3 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            />
          </div>
        </div>

        <button className="h-9 w-9 grid place-items-center rounded-lg hover:bg-slate-100 relative">
          <Bell className="h-4 w-4 text-slate-600" />
          <span className="absolute top-1.5 right-2 h-1.5 w-1.5 rounded-full bg-rose-500" />
        </button>
        <button className="h-9 px-3 flex items-center gap-2 rounded-lg hover:bg-slate-100">
          <div className="h-7 w-7 rounded-full bg-sky-700 text-white grid place-items-center text-xs font-bold">م</div>
          <div className="text-start leading-tight">
            <div className="text-xs font-semibold text-slate-900">المدير العام</div>
            <div className="text-[10px] text-slate-500">بغداد الرئيسي</div>
          </div>
        </button>
      </header>

      {/* ─── Main: centered launcher ────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-6 sm:p-10">
        <div className="w-full max-w-5xl mx-auto space-y-6">

          {/* Welcome */}
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">مرحباً بك</h1>
            <p className="text-sm text-slate-500 mt-1.5">
              <span className="num-latin">{new Date().toLocaleDateString('en-CA')}</span>
              {' · '}
              اختر تطبيقاً للبدء
            </p>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiPill icon={ShoppingCart}   label="مبيعات اليوم"   value="3,250,000"  unit="د.ع"  color="sky" />
            <KpiPill icon={Wallet}         label="النقدية الكلية" value="18,420,000" unit="د.ع"  color="emerald" />
            <KpiPill icon={TrendingUp}     label="ذمم مدينة"      value="6,820,000"  unit="د.ع"  color="amber" />
            <KpiPill icon={AlertTriangle}  label="تنبيهات المخزون" value="14"         unit="صنف"  color="rose" />
          </div>

          {/* Launcher card */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-panel p-6 sm:p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>متصل · جميع الخدمات تعمل</span>
              </div>
              <h2 className="text-sm font-semibold text-slate-700">جميع التطبيقات</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {APPS.map((app) => (
                <AppLauncherTile key={app.key} {...app} />
              ))}
            </div>
          </div>

          {/* Quick stats below */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <InfoCard
              title="آخر النشاطات"
              items={[
                { lab: 'فاتورة INV-2401', val: 'قبل 5 دقائق' },
                { lab: 'وردية #24',       val: 'قبل 12 دقيقة' },
                { lab: 'استلام GRN-89',  val: 'قبل 25 دقيقة' },
              ]}
            />
            <InfoCard
              title="المهام المعلّقة"
              items={[
                { lab: 'موافقة فاتورة',  val: '3 طلبات' },
                { lab: 'مراجعة GRN',     val: '2 طلب' },
                { lab: 'تأكيد دفعات',    val: '5 طلبات' },
              ]}
            />
            <InfoCard
              title="الاختصارات السريعة"
              items={[
                { lab: 'فاتورة جديدة',     val: 'Ctrl+N' },
                { lab: 'بحث عام',           val: 'Ctrl+K' },
                { lab: 'فتح وردية POS',    val: 'Ctrl+P' },
              ]}
            />
          </div>

          {/* Footer */}
          <div className="text-center text-xs text-slate-400 pt-4">
            © {new Date().getFullYear()} الرؤية العربية للتجارة · الإصدار <span className="num-latin">1.0.0</span>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── App Launcher Tile (matches user's approved design) ───────────────────
function AppLauncherTile({ label, icon: Icon, bg, iconBg }: AppTile) {
  return (
    <button
      className={`group ${bg} rounded-2xl p-5 sm:p-6 flex flex-col items-center justify-center gap-3 text-center
                  transition-all duration-200 hover:shadow-lifted hover:-translate-y-1 active:translate-y-0
                  border border-transparent hover:border-white`}
    >
      <div className={`h-14 w-14 sm:h-16 sm:w-16 rounded-2xl ${iconBg} grid place-items-center
                       shadow-md group-hover:shadow-xl group-hover:scale-105 transition-all duration-200`}>
        <Icon className="h-7 w-7 sm:h-8 sm:w-8 text-white" strokeWidth={2.2} />
      </div>
      <span className="text-sm sm:text-base font-bold text-slate-900">{label}</span>
    </button>
  );
}

// ─── KPI Pill ──────────────────────────────────────────────────────────────
function KpiPill({
  icon: Icon, label, value, unit, color,
}: { icon: React.ElementType; label: string; value: string; unit: string; color: 'sky' | 'emerald' | 'amber' | 'rose' }) {
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
        <div className="flex items-baseline gap-1">
          <span className={`text-base font-bold ${c.v} num-latin font-mono`}>{value}</span>
          <span className="text-[10px] text-slate-500">{unit}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Info Card (recent activity, tasks, shortcuts) ────────────────────────
function InfoCard({ title, items }: { title: string; items: { lab: string; val: string }[] }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-card">
      <h3 className="text-sm font-bold text-slate-900 mb-3">{title}</h3>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-center justify-between text-xs">
            <span className="text-slate-700">{item.lab}</span>
            <span className="text-slate-500 num-latin font-mono">{item.val}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
