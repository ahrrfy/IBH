'use client';

/**
 * Preview v2 — STRONG Windows/Office identity + 4 sidebar variants
 * URL: https://ibherp.cloud/preview/v2
 *
 * Adds explicitly Microsoft-Office vibe:
 *   - Office Ribbon TABS (Home, Insert, View, Actions)
 *   - Document tabs (browser-like) for multi-open
 *   - Window chrome titlebar
 *   - Fluent UI colors (Win11 blue + Mica)
 *
 * Toggle navigation modes:
 *   A) Classic Sidebar (current)
 *   B) Activity Bar (VSCode/Win11)
 *   C) Top Tabs only (no sidebar — Microsoft 365)
 *   D) App Launcher (mega-menu overlay)
 */

import { useState } from 'react';
import {
  ShoppingCart, CreditCard, Package, ShoppingBag, Landmark,
  Users, Handshake, BarChart3, Building2, Hammer, Megaphone,
  Search, Bell, Home, ChevronLeft, Plus, Save, Printer,
  Download, Filter, Settings, MoreHorizontal, ChevronRight,
  TrendingUp, AlertTriangle, Wallet, FileText, Grid3x3,
  X, Maximize2, Minus as MinusIcon, ChevronDown, Pin,
  Copy, Trash2, Eye, RefreshCw, ArrowUpRight,
  LayoutGrid, FileSpreadsheet, Calendar, MessageSquare,
} from 'lucide-react';

type NavMode = 'sidebar' | 'activity' | 'topnav' | 'launcher';

const APPS = [
  { key: 'sales',     label: 'المبيعات',       icon: ShoppingCart, color: 'sky' },
  { key: 'pos',       label: 'نقطة البيع',     icon: CreditCard,   color: 'emerald' },
  { key: 'inventory', label: 'المخزون',         icon: Package,      color: 'amber' },
  { key: 'purchases', label: 'المشتريات',      icon: ShoppingBag,  color: 'violet' },
  { key: 'finance',   label: 'المالية',         icon: Landmark,     color: 'rose' },
  { key: 'assets',    label: 'الأصول',          icon: Building2,    color: 'teal' },
  { key: 'hr',        label: 'الموارد',         icon: Users,        color: 'cyan' },
  { key: 'jobs',      label: 'التصنيع',         icon: Hammer,       color: 'orange' },
  { key: 'crm',       label: 'العملاء',         icon: Handshake,    color: 'indigo' },
  { key: 'marketing', label: 'التسويق',         icon: Megaphone,    color: 'pink' },
  { key: 'reports',   label: 'التقارير',        icon: BarChart3,    color: 'yellow' },
  { key: 'settings',  label: 'الإعدادات',       icon: Settings,     color: 'slate' },
];

const ACCENTS: Record<string, { bg: string; ic: string; brd: string }> = {
  sky:     { bg: 'bg-sky-50',     ic: 'bg-sky-600',     brd: 'border-sky-200' },
  emerald: { bg: 'bg-emerald-50', ic: 'bg-emerald-600', brd: 'border-emerald-200' },
  amber:   { bg: 'bg-amber-50',   ic: 'bg-amber-600',   brd: 'border-amber-200' },
  violet:  { bg: 'bg-violet-50',  ic: 'bg-violet-600',  brd: 'border-violet-200' },
  rose:    { bg: 'bg-rose-50',    ic: 'bg-rose-600',    brd: 'border-rose-200' },
  teal:    { bg: 'bg-teal-50',    ic: 'bg-teal-600',    brd: 'border-teal-200' },
  cyan:    { bg: 'bg-cyan-50',    ic: 'bg-cyan-600',    brd: 'border-cyan-200' },
  orange:  { bg: 'bg-orange-50',  ic: 'bg-orange-600',  brd: 'border-orange-200' },
  indigo:  { bg: 'bg-indigo-50',  ic: 'bg-indigo-600',  brd: 'border-indigo-200' },
  pink:    { bg: 'bg-pink-50',    ic: 'bg-pink-600',    brd: 'border-pink-200' },
  yellow:  { bg: 'bg-yellow-50',  ic: 'bg-yellow-600',  brd: 'border-yellow-200' },
  slate:   { bg: 'bg-slate-100',  ic: 'bg-slate-700',   brd: 'border-slate-300' },
};

const RECENT = [
  { num: 'INV-2401', date: '2026-04-25', cust: 'شركة الميسرة',  amt: '1,250,000', st: 'مرحَّلة',   c: 'success' },
  { num: 'INV-2400', date: '2026-04-25', cust: 'مؤسسة بغداد',   amt: '850,000',   st: 'مرحَّلة',   c: 'success' },
  { num: 'INV-2399', date: '2026-04-24', cust: 'متجر السلام',   amt: '320,000',   st: 'قيد المراجعة', c: 'warning' },
  { num: 'INV-2398', date: '2026-04-24', cust: 'الزمزم للتجارة', amt: '2,100,000', st: 'مدفوعة',   c: 'info' },
  { num: 'INV-2397', date: '2026-04-23', cust: 'الفرات الجنوبي', amt: '425,000',   st: 'مرحَّلة',   c: 'success' },
];

const STATUS_BADGE: Record<string, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50  text-amber-700  border-amber-200',
  info:    'bg-sky-50    text-sky-700    border-sky-200',
  danger:  'bg-rose-50   text-rose-700   border-rose-200',
};

const RIBBON_TABS = [
  { key: 'home',    label: 'الرئيسية' },
  { key: 'insert',  label: 'إدراج' },
  { key: 'view',    label: 'عرض' },
  { key: 'actions', label: 'إجراءات' },
];

export default function PreviewV2() {
  const [mode, setMode] = useState<NavMode>('activity');
  const [ribbonTab, setRibbonTab] = useState('home');
  const [selectedApp, setSelectedApp] = useState('sales');
  const [openDocs] = useState([
    { key: 'd1', title: 'لوحة التحكم',         icon: Home,         pinned: true },
    { key: 'd2', title: 'الفواتير — جميعها',   icon: FileText,     pinned: false, active: true },
    { key: 'd3', title: 'فاتورة جديدة',         icon: Plus,         pinned: false },
    { key: 'd4', title: 'تقرير المبيعات',       icon: BarChart3,    pinned: false },
  ]);
  const [launcherOpen, setLauncherOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-[#f3f3f3] overflow-hidden font-sans" dir="rtl">

      {/* ═══════════════════════════════════════════════════════════════════
          1. TITLE BAR (Windows 11 style — thin, with controls)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="h-8 bg-[#fafafa] border-b border-slate-200 flex items-center px-3 gap-3 select-none">
        {/* Window controls (right side in RTL = visual left) */}
        <div className="flex items-center gap-0.5">
          <button className="h-7 w-10 grid place-items-center hover:bg-slate-200 rounded">
            <MinusIcon className="h-3 w-3" />
          </button>
          <button className="h-7 w-10 grid place-items-center hover:bg-slate-200 rounded">
            <Maximize2 className="h-3 w-3" />
          </button>
          <button className="h-7 w-10 grid place-items-center hover:bg-rose-500 hover:text-white rounded">
            <X className="h-3 w-3" />
          </button>
        </div>
        {/* Title */}
        <div className="flex-1 text-center text-xs text-slate-700 font-medium">
          الرؤية العربية ERP — لوحة الإدارة
        </div>
        {/* Mode switcher */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-500">نمط التنقّل:</span>
          {([
            { k: 'sidebar',  l: 'A. Sidebar',     d: 'كلاسيكي' },
            { k: 'activity', l: 'B. Activity',    d: 'VSCode' },
            { k: 'topnav',   l: 'C. Top Tabs',    d: 'Office' },
            { k: 'launcher', l: 'D. Launcher',    d: 'Win11' },
          ] as const).map((o) => (
            <button
              key={o.k}
              onClick={() => setMode(o.k)}
              className={`px-2 h-6 rounded text-[10px] font-medium transition
                ${mode === o.k ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
              title={o.d}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          2. TOP NAV BAR (logo + breadcrumbs + search + user)
          ═══════════════════════════════════════════════════════════════════ */}
      <header className="h-12 bg-white border-b border-slate-200 flex items-center px-3 gap-3">
        <button
          onClick={() => mode === 'launcher' && setLauncherOpen(!launcherOpen)}
          className="h-9 px-2 flex items-center gap-2 hover:bg-slate-100 rounded"
        >
          {mode === 'launcher' && <Grid3x3 className="h-5 w-5 text-sky-700" />}
          <div className="h-7 w-7 rounded bg-sky-700 text-white grid place-items-center font-bold text-sm shadow">
            ر
          </div>
          <span className="text-sm font-bold text-slate-900">الرؤية</span>
        </button>

        {/* Top tabs (mode C) */}
        {mode === 'topnav' && (
          <nav className="flex items-center gap-0 mr-4">
            {APPS.slice(0, 8).map((a) => {
              const Icon = a.icon;
              const active = a.key === selectedApp;
              return (
                <button
                  key={a.key}
                  onClick={() => setSelectedApp(a.key)}
                  className={`h-12 px-3 flex items-center gap-2 text-sm border-b-2 transition
                    ${active
                      ? 'border-sky-600 text-sky-700 bg-sky-50/50 font-semibold'
                      : 'border-transparent text-slate-700 hover:bg-slate-50'}`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{a.label}</span>
                </button>
              );
            })}
            <button className="h-12 px-3 flex items-center gap-1 text-sm text-slate-500 hover:bg-slate-50">
              <ChevronDown className="h-4 w-4" />
              <span>المزيد</span>
            </button>
          </nav>
        )}

        {/* Breadcrumbs */}
        {mode !== 'topnav' && (
          <nav className="flex items-center gap-1.5 text-sm">
            <Home className="h-3.5 w-3.5 text-slate-400" />
            <ChevronLeft className="h-3 w-3 text-slate-300" />
            <span className="text-slate-600">المبيعات</span>
            <ChevronLeft className="h-3 w-3 text-slate-300" />
            <span className="font-semibold text-slate-900">الفواتير</span>
          </nav>
        )}

        <div className="flex-1" />

        {/* Search */}
        <div className="relative w-72">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="search"
            placeholder="ابحث في كل النظام..."
            className="h-8 w-full rounded bg-slate-100 border border-transparent pr-9 pl-2 text-sm
                       focus:outline-none focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          />
          <kbd className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-600 font-mono">⌘K</kbd>
        </div>

        <button className="h-8 w-8 grid place-items-center rounded hover:bg-slate-100 relative">
          <Bell className="h-4 w-4 text-slate-600" />
          <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-rose-500" />
        </button>
        <button className="h-8 px-2 flex items-center gap-2 rounded hover:bg-slate-100">
          <div className="h-6 w-6 rounded-full bg-sky-700 text-white grid place-items-center text-xs font-bold">م</div>
          <span className="text-sm font-medium text-slate-800">المدير</span>
        </button>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════
          3. OFFICE RIBBON (tabs + commands per tab)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-white border-b border-slate-200">
        {/* Ribbon tabs */}
        <div className="h-9 flex items-center gap-0 px-3 border-b border-slate-100">
          {RIBBON_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setRibbonTab(t.key)}
              className={`h-9 px-4 text-sm transition border-b-2 -mb-px
                ${ribbonTab === t.key
                  ? 'border-sky-600 text-sky-700 font-semibold bg-sky-50/40'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
            >
              {t.label}
            </button>
          ))}
          <div className="flex-1" />
          <button className="h-9 px-3 flex items-center gap-1.5 text-xs text-slate-500 hover:bg-slate-50">
            <Pin className="h-3.5 w-3.5" />
            <span>تثبيت الشريط</span>
          </button>
        </div>

        {/* Ribbon commands (groups) */}
        <div className="h-[68px] px-2 flex items-stretch gap-0">
          {ribbonTab === 'home' && (
            <>
              <RibbonGroup title="عمليات">
                <RibbonBigBtn icon={Plus} label="جديد" primary />
                <RibbonSmallBtn icon={Save} label="حفظ" />
                <RibbonSmallBtn icon={Copy} label="نسخ" />
                <RibbonSmallBtn icon={Trash2} label="حذف" />
              </RibbonGroup>
              <RibbonGroup title="استيراد/تصدير">
                <RibbonBigBtn icon={Download} label="تصدير" />
                <RibbonSmallBtn icon={Printer} label="طباعة" />
                <RibbonSmallBtn icon={FileSpreadsheet} label="Excel" />
              </RibbonGroup>
              <RibbonGroup title="عرض">
                <RibbonBigBtn icon={Filter} label="تصفية" />
                <RibbonSmallBtn icon={LayoutGrid} label="شبكة" />
                <RibbonSmallBtn icon={Eye} label="أعمدة" />
              </RibbonGroup>
              <RibbonGroup title="تحديث">
                <RibbonBigBtn icon={RefreshCw} label="تحديث" />
              </RibbonGroup>
            </>
          )}
          {ribbonTab === 'insert' && (
            <RibbonGroup title="إدراج عناصر">
              <RibbonBigBtn icon={FileText} label="فاتورة" primary />
              <RibbonBigBtn icon={Users} label="عميل" />
              <RibbonBigBtn icon={Package} label="منتج" />
              <RibbonSmallBtn icon={Calendar} label="تذكير" />
              <RibbonSmallBtn icon={MessageSquare} label="ملاحظة" />
            </RibbonGroup>
          )}
          {ribbonTab === 'view' && (
            <>
              <RibbonGroup title="التخطيط">
                <RibbonBigBtn icon={LayoutGrid} label="بطاقات" />
                <RibbonBigBtn icon={FileSpreadsheet} label="جدول" primary />
                <RibbonBigBtn icon={Calendar} label="تقويم" />
              </RibbonGroup>
              <RibbonGroup title="تكبير">
                <RibbonSmallBtn icon={Eye} label="حجم 100%" />
                <RibbonSmallBtn icon={Eye} label="ملء الشاشة" />
              </RibbonGroup>
            </>
          )}
          {ribbonTab === 'actions' && (
            <RibbonGroup title="إجراءات الفاتورة">
              <RibbonBigBtn icon={Save} label="ترحيل" primary />
              <RibbonBigBtn icon={X} label="إلغاء" />
              <RibbonBigBtn icon={Printer} label="طباعة A4" />
              <RibbonSmallBtn icon={Download} label="PDF" />
            </RibbonGroup>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          4. DOCUMENT TABS (browser-like)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="h-9 bg-[#f3f3f3] border-b border-slate-200 flex items-center px-1 overflow-x-auto">
        {openDocs.map((d) => {
          const Icon = d.icon;
          return (
            <div
              key={d.key}
              className={`h-8 px-3 flex items-center gap-2 text-xs rounded-t-lg border-x border-t border-transparent
                ${d.active
                  ? 'bg-white border-slate-200 text-slate-900 font-medium'
                  : 'text-slate-600 hover:bg-white/60'}`}
            >
              {d.pinned && <Pin className="h-3 w-3 text-slate-400" />}
              <Icon className="h-3.5 w-3.5" />
              <span className="whitespace-nowrap">{d.title}</span>
              <button className="h-4 w-4 grid place-items-center rounded hover:bg-slate-200">
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
        <button className="h-8 w-8 grid place-items-center text-slate-500 hover:bg-white/60 rounded">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          5. BODY: Sidebar (mode A/B) + Main
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* MODE A — Classic Sidebar */}
        {mode === 'sidebar' && (
          <aside className="w-56 bg-slate-900 text-slate-300 flex flex-col">
            <div className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
              الوحدات
            </div>
            <nav className="flex-1 overflow-y-auto px-2 space-y-0.5">
              {APPS.map((a) => {
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
          </aside>
        )}

        {/* MODE B — Activity Bar (icons only, 56px) */}
        {mode === 'activity' && (
          <aside className="w-14 bg-slate-900 flex flex-col items-center py-2 gap-1">
            {APPS.map((a) => {
              const Icon = a.icon;
              const active = a.key === selectedApp;
              return (
                <button
                  key={a.key}
                  onClick={() => setSelectedApp(a.key)}
                  title={a.label}
                  className={`relative h-10 w-10 grid place-items-center rounded-lg transition group
                    ${active ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                >
                  <Icon className="h-5 w-5" />
                  {active && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-white rounded-l" />}
                  {/* Tooltip */}
                  <div className="absolute right-full mr-2 px-2 py-1 bg-slate-950 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-50">
                    {a.label}
                  </div>
                </button>
              );
            })}
          </aside>
        )}

        {/* MAIN content area */}
        <main className="flex-1 overflow-y-auto bg-[#f3f3f3]">
          <div className="p-5 space-y-5">

            {/* Page title */}
            <div className="flex items-end justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">الفواتير</h1>
                <p className="text-xs text-slate-500 mt-1">إدارة فواتير المبيعات وتتبّع المدفوعات</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>عرض:</span>
                <select className="h-7 rounded border border-slate-300 bg-white px-2 text-xs">
                  <option>الكل</option>
                  <option>قيد المراجعة</option>
                  <option>مرحَّلة</option>
                </select>
              </div>
            </div>

            {/* KPI strip */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile icon={ShoppingCart}  color="sky"     label="مبيعات اليوم"  value="3,250,000"  unit="د.ع" trend="+12%" up />
              <KpiTile icon={Wallet}         color="emerald" label="النقدية الكلية" value="18,420,000" unit="د.ع" trend="+5%"  up />
              <KpiTile icon={TrendingUp}     color="amber"   label="ذمم مدينة"     value="6,820,000"  unit="د.ع" trend="-2%"  up={false} />
              <KpiTile icon={AlertTriangle}  color="rose"    label="مخزون تحت الحد" value="14"         unit="صنف"  trend="عاجل" up={false} />
            </section>

            {/* Dense data table */}
            <section className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
                <div className="text-sm font-semibold text-slate-700">آخر الفواتير</div>
                <span className="badge-neutral text-[10px]">5 من 250</span>
                <div className="flex-1" />
                <button className="text-xs text-sky-700 hover:underline flex items-center gap-1">
                  عرض الكل <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2 text-start font-semibold text-xs">الرقم</th>
                    <th className="px-4 py-2 text-start font-semibold text-xs">التاريخ</th>
                    <th className="px-4 py-2 text-start font-semibold text-xs">العميل</th>
                    <th className="px-4 py-2 text-end font-semibold text-xs">المبلغ</th>
                    <th className="px-4 py-2 text-start font-semibold text-xs">الحالة</th>
                    <th className="px-4 py-2 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {RECENT.map((r) => (
                    <tr key={r.num} className="border-b border-slate-100 hover:bg-sky-50/40 last:border-0 transition-colors">
                      <td className="px-4 py-2 font-mono text-sky-700 font-medium">{r.num}</td>
                      <td className="px-4 py-2 text-slate-600 num-latin">{r.date}</td>
                      <td className="px-4 py-2 text-slate-900">{r.cust}</td>
                      <td className="px-4 py-2 text-end font-mono font-semibold num-latin">{r.amt}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_BADGE[r.c]}`}>
                          {r.st}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-end">
                        <button className="h-7 w-7 inline-grid place-items-center rounded hover:bg-slate-200">
                          <MoreHorizontal className="h-4 w-4 text-slate-500" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

          </div>
        </main>

        {/* MODE D — App Launcher overlay (Win11 Start) */}
        {mode === 'launcher' && launcherOpen && (
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm z-40 grid place-items-center"
            onClick={() => setLauncherOpen(false)}
          >
            <div
              className="bg-white/95 backdrop-blur-xl rounded-xl shadow-2xl border border-white/40 p-6 w-[640px]"
              onClick={(e) => e.stopPropagation()}
              style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
            >
              <div className="text-xs uppercase text-slate-500 font-semibold mb-3">جميع التطبيقات</div>
              <div className="grid grid-cols-4 gap-2">
                {APPS.map((a) => {
                  const Icon = a.icon;
                  const c = ACCENTS[a.color];
                  return (
                    <button
                      key={a.key}
                      onClick={() => { setSelectedApp(a.key); setLauncherOpen(false); }}
                      className={`p-4 rounded-lg ${c.bg} hover:shadow-md hover:-translate-y-0.5 transition group text-center`}
                    >
                      <div className={`h-12 w-12 mx-auto mb-2 rounded-xl ${c.ic} grid place-items-center text-white shadow`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="text-sm font-semibold text-slate-900">{a.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          6. STATUS BAR (Windows-like)
          ═══════════════════════════════════════════════════════════════════ */}
      <footer className="h-6 bg-sky-700 text-white text-[11px] flex items-center px-3 gap-4">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
          <span>متصل</span>
        </div>
        <span>المستخدم: <strong>user@company.iq</strong></span>
        <span>الفرع: <strong>بغداد الرئيسي</strong></span>
        <span>الفترة: <strong className="num-latin">2026-04</strong></span>
        <div className="flex-1" />
        <span>250 فاتورة محمَّلة</span>
        <span className="num-latin">{new Date().toLocaleDateString('en-CA')}</span>
      </footer>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Sub-components

function RibbonGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-stretch border-l border-slate-200 px-2 py-1 last:border-0">
      <div className="flex-1 flex items-stretch gap-0.5">{children}</div>
      <div className="text-[10px] text-slate-500 text-center mt-0.5">{title}</div>
    </div>
  );
}

function RibbonBigBtn({ icon: Icon, label, primary }: { icon: any; label: string; primary?: boolean }) {
  return (
    <button
      className={`flex flex-col items-center justify-center gap-0.5 h-12 w-14 rounded transition
        ${primary ? 'bg-sky-50 hover:bg-sky-100' : 'hover:bg-slate-100'}`}
    >
      <Icon className={`h-5 w-5 ${primary ? 'text-sky-700' : 'text-slate-700'}`} />
      <span className={`text-[10px] ${primary ? 'text-sky-800 font-semibold' : 'text-slate-700'}`}>{label}</span>
    </button>
  );
}

function RibbonSmallBtn({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <button className="flex items-center gap-1.5 h-6 px-2 rounded text-[11px] text-slate-700 hover:bg-slate-100">
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}

function KpiTile({
  icon: Icon, color, label, value, unit, trend, up,
}: { icon: any; color: string; label: string; value: string; unit: string; trend: string; up: boolean }) {
  const c = ACCENTS[color];
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm hover:shadow-md transition">
      <div className="flex items-center justify-between mb-2">
        <div className={`h-8 w-8 rounded-md ${c.ic} text-white grid place-items-center shadow`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className={`text-[10px] font-medium ${up ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'} px-1.5 py-0.5 rounded`}>
          {trend}
        </span>
      </div>
      <div className="text-[11px] text-slate-500 mb-0.5">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-bold text-slate-900 num-latin">{value}</span>
        <span className="text-[11px] text-slate-500">{unit}</span>
      </div>
    </div>
  );
}
