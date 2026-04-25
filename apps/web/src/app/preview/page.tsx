'use client';

/**
 * Preview page — hybrid Odoo + SAP + Windows style
 * URL: https://ibherp.cloud/preview
 * Purpose: visual approval before propagating to all pages.
 */

import { useState } from 'react';
import {
  ShoppingCart, CreditCard, Package, ShoppingBag, Landmark,
  Users, Handshake, BarChart3, Building2, Hammer, Megaphone,
  Search, Bell, User, Home, ChevronLeft, Plus, Save, Printer,
  Download, Filter, Settings, MoreHorizontal, ChevronRight,
  TrendingUp, AlertTriangle, Wallet, FileText,
} from 'lucide-react';

const APPS = [
  { key: 'sales',     label: 'المبيعات',       icon: ShoppingCart, color: 'sky',     count: '250 فاتورة',   trend: '+12%' },
  { key: 'pos',       label: 'نقطة البيع',     icon: CreditCard,   color: 'emerald', count: '18 وردية',     trend: '+5%' },
  { key: 'inventory', label: 'المخزون',         icon: Package,      color: 'amber',   count: '1,420 صنف',    trend: 'مستقر' },
  { key: 'purchases', label: 'المشتريات',      icon: ShoppingBag,  color: 'violet',  count: '45 أمر',       trend: '+8%' },
  { key: 'finance',   label: 'المالية',         icon: Landmark,     color: 'rose',    count: '120 قيد',      trend: '+3%' },
  { key: 'assets',    label: 'الأصول الثابتة', icon: Building2,    color: 'teal',    count: '38 أصل',       trend: 'ثابت' },
  { key: 'hr',        label: 'الموارد البشرية',icon: Users,        color: 'cyan',    count: '24 موظف',      trend: '—' },
  { key: 'jobs',      label: 'طلبات التصنيع',  icon: Hammer,       color: 'orange',  count: '12 طلب',       trend: '+2' },
  { key: 'crm',       label: 'العملاء',         icon: Handshake,    color: 'indigo',  count: '180 عميل',     trend: '+15' },
  { key: 'marketing', label: 'التسويق',         icon: Megaphone,    color: 'pink',    count: '8 حملات',      trend: '—' },
  { key: 'reports',   label: 'التقارير',        icon: BarChart3,    color: 'yellow',  count: '17 تقرير',     trend: '—' },
  { key: 'settings',  label: 'الإعدادات',       icon: Settings,     color: 'slate',   count: 'النظام',       trend: '' },
];

const ACCENTS: Record<string, { tile: string; icon: string; ring: string }> = {
  sky:     { tile: 'bg-sky-50',     icon: 'bg-sky-600 text-white',     ring: 'ring-sky-200' },
  emerald: { tile: 'bg-emerald-50', icon: 'bg-emerald-600 text-white', ring: 'ring-emerald-200' },
  amber:   { tile: 'bg-amber-50',   icon: 'bg-amber-600 text-white',   ring: 'ring-amber-200' },
  violet:  { tile: 'bg-violet-50',  icon: 'bg-violet-600 text-white',  ring: 'ring-violet-200' },
  rose:    { tile: 'bg-rose-50',    icon: 'bg-rose-600 text-white',    ring: 'ring-rose-200' },
  teal:    { tile: 'bg-teal-50',    icon: 'bg-teal-600 text-white',    ring: 'ring-teal-200' },
  cyan:    { tile: 'bg-cyan-50',    icon: 'bg-cyan-600 text-white',    ring: 'ring-cyan-200' },
  orange:  { tile: 'bg-orange-50',  icon: 'bg-orange-600 text-white',  ring: 'ring-orange-200' },
  indigo:  { tile: 'bg-indigo-50',  icon: 'bg-indigo-600 text-white',  ring: 'ring-indigo-200' },
  pink:    { tile: 'bg-pink-50',    icon: 'bg-pink-600 text-white',    ring: 'ring-pink-200' },
  yellow:  { tile: 'bg-yellow-50',  icon: 'bg-yellow-600 text-white',  ring: 'ring-yellow-200' },
  slate:   { tile: 'bg-slate-100',  icon: 'bg-slate-700 text-white',   ring: 'ring-slate-200' },
};

const RECENT_INVOICES = [
  { num: 'INV-2401', date: '2026-04-25', customer: 'شركة الميسرة',     amount: '1,250,000', status: 'مرحَّلة',   color: 'success' },
  { num: 'INV-2400', date: '2026-04-25', customer: 'مؤسسة بغداد',      amount: '850,000',   status: 'مرحَّلة',   color: 'success' },
  { num: 'INV-2399', date: '2026-04-24', customer: 'متجر السلام',      amount: '320,000',   status: 'قيد المراجعة', color: 'warning' },
  { num: 'INV-2398', date: '2026-04-24', customer: 'الزمزم للتجارة',   amount: '2,100,000', status: 'مدفوعة',   color: 'info' },
  { num: 'INV-2397', date: '2026-04-23', customer: 'الفرات الجنوبي',  amount: '425,000',   status: 'مرحَّلة',   color: 'success' },
  { num: 'INV-2396', date: '2026-04-23', customer: 'دجلة العام',      amount: '180,000',   status: 'ملغاة',    color: 'danger' },
];

const STATUS_BADGE: Record<string, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  info:    'bg-sky-50 text-sky-700 border-sky-200',
  danger:  'bg-rose-50 text-rose-700 border-rose-200',
};

export default function PreviewPage() {
  const [selectedApp, setSelectedApp] = useState('home');

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden font-sans" dir="rtl">
      {/* ═══════════════════════════════════════════════════════════════════
          TOPBAR (Windows-like titlebar + breadcrumbs)
          ═══════════════════════════════════════════════════════════════════ */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-4 shadow-sm">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-sky-700 text-white grid place-items-center font-bold shadow">
            ر
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-slate-900">الرؤية العربية</div>
            <div className="text-[10px] text-slate-500">ERP · v1.0</div>
          </div>
        </div>

        <div className="h-7 w-px bg-slate-200" />

        {/* Breadcrumbs (Windows Explorer style) */}
        <nav className="flex items-center gap-1 text-sm text-slate-600">
          <Home className="h-4 w-4" />
          <ChevronLeft className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-medium text-slate-900">لوحة التحكم</span>
        </nav>

        {/* Search (SAP-like global search) */}
        <div className="flex-1 max-w-md mx-auto">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="search"
              placeholder="ابحث في كل النظام... (Ctrl+K)"
              className="h-9 w-full rounded-lg bg-slate-100 border border-transparent pr-10 pl-3 text-sm
                         placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-sky-300
                         focus:ring-2 focus:ring-sky-100 transition"
            />
          </div>
        </div>

        {/* Actions (Windows-like) */}
        <div className="flex items-center gap-1">
          <button className="h-9 w-9 grid place-items-center rounded-lg hover:bg-slate-100 text-slate-600">
            <Bell className="h-4 w-4" />
          </button>
          <button className="h-9 px-3 flex items-center gap-2 rounded-lg hover:bg-slate-100 text-slate-700">
            <div className="h-7 w-7 rounded-full bg-sky-700 text-white grid place-items-center text-xs font-bold">م</div>
            <span className="text-sm font-medium">المدير</span>
          </button>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════
          BODY: Sidebar + Main
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── SIDEBAR (SAP Fiori-like) ─────────────────────────────────────── */}
        <aside className="w-56 bg-slate-900 text-slate-300 flex flex-col">
          <div className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            الوحدات
          </div>
          <nav className="flex-1 overflow-y-auto px-2 space-y-0.5">
            {APPS.slice(0, 11).map((a) => {
              const Icon = a.icon;
              const active = a.key === selectedApp;
              return (
                <button
                  key={a.key}
                  onClick={() => setSelectedApp(a.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition
                    ${active ? 'bg-sky-700 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-start">{a.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="p-3 border-t border-slate-800">
            <button className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-slate-400 hover:bg-slate-800">
              <Settings className="h-3.5 w-3.5" />
              الإعدادات
            </button>
          </div>
        </aside>

        {/* ── MAIN ────────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          {/* Ribbon toolbar (Windows Office-like) */}
          <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-1 shadow-sm sticky top-0 z-10">
            <h1 className="text-base font-bold text-slate-900 ml-4">لوحة التحكم التنفيذية</h1>
            <div className="h-5 w-px bg-slate-200 mx-2" />
            <RibbonBtn icon={Plus}     label="إضافة" primary />
            <RibbonBtn icon={Save}     label="حفظ" />
            <RibbonBtn icon={Printer}  label="طباعة" />
            <RibbonBtn icon={Download} label="تصدير" />
            <div className="h-5 w-px bg-slate-200 mx-2" />
            <RibbonBtn icon={Filter}   label="تصفية" />
            <RibbonBtn icon={Settings} label="عرض" />
            <div className="flex-1" />
            <span className="text-xs text-slate-500">آخر تحديث: قبل 3 دقائق</span>
          </div>

          {/* Content */}
          <div className="p-5 space-y-5">
            {/* ── KPI strip (SAP Fiori KPI tiles) ──────────────────────── */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile icon={ShoppingCart}    color="sky"     label="مبيعات اليوم"      value="3,250,000"  unit="د.ع" trend="+12%" trendUp />
              <KpiTile icon={Wallet}          color="emerald" label="النقدية الكلية"     value="18,420,000" unit="د.ع" trend="+5%"  trendUp />
              <KpiTile icon={TrendingUp}      color="amber"   label="ذمم مدينة"          value="6,820,000"  unit="د.ع" trend="-2%"  trendUp={false} />
              <KpiTile icon={AlertTriangle}   color="rose"    label="مخزون تحت الحد"     value="14"         unit="صنف"  trend="عاجل" trendUp={false} />
            </section>

            {/* ── App tiles (Odoo + Windows Start) + Recent activity ──── */}
            <div className="grid lg:grid-cols-3 gap-5">
              {/* App tiles (col-span-2) */}
              <section className="lg:col-span-2">
                <SectionHeader title="الوحدات" subtitle="انقر للوصول السريع" />
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {APPS.map((a) => {
                    const Icon = a.icon;
                    const c = ACCENTS[a.color];
                    return (
                      <button
                        key={a.key}
                        className={`group relative ${c.tile} rounded-xl p-4 text-right border border-transparent
                                     hover:border-slate-300 hover:shadow-md transition-all duration-150
                                     hover:-translate-y-0.5`}
                      >
                        <div className={`h-10 w-10 rounded-lg ${c.icon} grid place-items-center mb-3 shadow`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="text-sm font-bold text-slate-900">{a.label}</div>
                        <div className="text-[11px] text-slate-600 mt-0.5">{a.count}</div>
                        {a.trend && (
                          <div className="absolute top-3 left-3 text-[10px] text-slate-500 font-medium">
                            {a.trend}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Activity feed (right col) */}
              <section>
                <SectionHeader title="النشاط الأخير" subtitle="آخر العمليات" />
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {[
                    { icon: FileText, color: 'sky', text: 'فاتورة INV-2401 — شركة الميسرة', time: 'قبل 5 دقائق' },
                    { icon: CreditCard, color: 'emerald', text: 'وردية 24 فُتحت — كاشير 1', time: 'قبل 12 دقيقة' },
                    { icon: Package, color: 'amber', text: 'استلام GRN-89 — 45 صنف', time: 'قبل 25 دقيقة' },
                    { icon: Users, color: 'cyan', text: 'موظف جديد: محمد عبدالله', time: 'قبل ساعة' },
                    { icon: Landmark, color: 'rose', text: 'قيد JE-1240 مرحَّل', time: 'قبل ساعتين' },
                  ].map((item, i) => {
                    const Icon = item.icon;
                    const c = ACCENTS[item.color];
                    return (
                      <div key={i} className="px-4 py-3 flex items-start gap-3 border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <div className={`h-8 w-8 rounded-md ${c.icon} grid place-items-center shrink-0`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-slate-900 truncate">{item.text}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{item.time}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* ── Dense data table (SAP-style) ───────────────────────── */}
            <section>
              <SectionHeader title="آخر الفواتير" subtitle="6 من 250" actionLabel="عرض الكل" />
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 text-start font-semibold text-xs">الرقم</th>
                      <th className="px-4 py-2.5 text-start font-semibold text-xs">التاريخ</th>
                      <th className="px-4 py-2.5 text-start font-semibold text-xs">العميل</th>
                      <th className="px-4 py-2.5 text-end font-semibold text-xs">المبلغ</th>
                      <th className="px-4 py-2.5 text-start font-semibold text-xs">الحالة</th>
                      <th className="px-4 py-2.5 text-end font-semibold text-xs w-12">⋮</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RECENT_INVOICES.map((inv) => (
                      <tr key={inv.num} className="border-b border-slate-100 hover:bg-sky-50/30 last:border-0 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-sky-700 font-medium">{inv.num}</td>
                        <td className="px-4 py-2.5 text-slate-600 num-latin">{inv.date}</td>
                        <td className="px-4 py-2.5 text-slate-900">{inv.customer}</td>
                        <td className="px-4 py-2.5 text-end font-mono font-semibold text-slate-900 num-latin">{inv.amount}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_BADGE[inv.color]}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-end">
                          <button className="h-7 w-7 inline-grid place-items-center rounded hover:bg-slate-200">
                            <MoreHorizontal className="h-4 w-4 text-slate-500" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </main>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          STATUS BAR (Windows-like)
          ═══════════════════════════════════════════════════════════════════ */}
      <footer className="h-7 bg-sky-700 text-white text-xs flex items-center px-4 gap-6">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
          <span>متصل</span>
        </div>
        <span className="opacity-80">المستخدم: <span className="font-medium">admin@al-ruya.iq</span></span>
        <span className="opacity-80">الفرع: <span className="font-medium">بغداد الرئيسي</span></span>
        <span className="opacity-80">الفترة: <span className="font-medium num-latin">2026-04</span></span>
        <div className="flex-1" />
        <span className="opacity-80 num-latin">{new Date().toLocaleDateString('ar-IQ')}</span>
      </footer>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Sub-components

function RibbonBtn({ icon: Icon, label, primary }: { icon: any; label: string; primary?: boolean }) {
  return (
    <button
      className={`h-9 px-3 flex items-center gap-1.5 rounded-md text-sm transition
        ${primary
          ? 'bg-sky-700 text-white hover:bg-sky-800 shadow-sm'
          : 'text-slate-700 hover:bg-slate-100'}`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}

function KpiTile({
  icon: Icon, color, label, value, unit, trend, trendUp,
}: { icon: any; color: string; label: string; value: string; unit: string; trend: string; trendUp: boolean }) {
  const c = ACCENTS[color];
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition">
      <div className="flex items-center justify-between mb-3">
        <div className={`h-9 w-9 rounded-lg ${c.icon} grid place-items-center shadow`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className={`text-xs font-medium ${trendUp ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'} px-2 py-0.5 rounded`}>
          {trend}
        </span>
      </div>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-bold text-slate-900 num-latin">{value}</span>
        <span className="text-xs text-slate-500">{unit}</span>
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle, actionLabel }: { title: string; subtitle?: string; actionLabel?: string }) {
  return (
    <div className="flex items-end justify-between mb-3">
      <div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actionLabel && (
        <button className="text-xs font-medium text-sky-700 hover:text-sky-800 flex items-center gap-1">
          {actionLabel}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
