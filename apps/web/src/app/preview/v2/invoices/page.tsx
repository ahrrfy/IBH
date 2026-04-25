'use client';

import { useState } from 'react';
import {
  Search, Plus, Download, Printer, Filter, RefreshCw,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  MoreHorizontal, Eye, Edit, Copy, Trash2, FileText,
  ShoppingCart, CreditCard, Package, ShoppingBag, Landmark,
  Building2, Users, Hammer, Handshake, Megaphone, BarChart3,
  Settings, Home, ChevronDown, X, Calendar, ArrowUpDown,
  CheckSquare, Square,
} from 'lucide-react';

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
];

const INVOICES = Array.from({ length: 25 }, (_, i) => {
  const num = 2401 - i;
  const customers = ['شركة الميسرة', 'مؤسسة بغداد', 'متجر السلام', 'الزمزم للتجارة', 'الفرات الجنوبي', 'دجلة العام', 'النور للأقمشة', 'ابن الرافدين'];
  const statuses = [
    { lab: 'مرحَّلة',   c: 'success' },
    { lab: 'مدفوعة',   c: 'info' },
    { lab: 'قيد المراجعة', c: 'warning' },
    { lab: 'ملغاة',    c: 'danger' },
  ];
  const branches = ['بغداد الرئيسي', 'أربيل'];
  const s = statuses[i % statuses.length];
  return {
    num: `INV-${num}`,
    date: `2026-04-${String(25 - (i % 22)).padStart(2, '0')}`,
    customer: customers[i % customers.length],
    branch: branches[i % branches.length],
    items: 3 + (i % 9),
    amount: (250000 + i * 73000) % 3500000 + 150000,
    status: s.lab,
    color: s.c,
  };
});

const STATUS_BADGE: Record<string, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50  text-amber-700  border-amber-200',
  info:    'bg-sky-50    text-sky-700    border-sky-200',
  danger:  'bg-rose-50   text-rose-700   border-rose-200',
};

export default function InvoicesPreview() {
  const [selected, setSelected] = useState<Set<string>>(new Set(['INV-2398']));
  const [showFilters, setShowFilters] = useState(true);

  function toggle(num: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(num) ? n.delete(num) : n.add(num);
      return n;
    });
  }

  return (
    <div className="h-[calc(100vh-2.75rem)] flex flex-col bg-slate-100" dir="rtl">

      {/* Topbar */}
      <header className="h-12 bg-white border-b border-slate-200 flex items-center px-3 gap-3 shrink-0">
        <div className="h-7 w-7 rounded bg-sky-700 text-white grid place-items-center font-bold text-sm">ر</div>
        <nav className="flex items-center gap-1.5 text-sm">
          <Home className="h-3.5 w-3.5 text-slate-400" />
          <ChevronLeft className="h-3 w-3 text-slate-300" />
          <span className="text-slate-600">المبيعات</span>
          <ChevronLeft className="h-3 w-3 text-slate-300" />
          <span className="font-semibold text-slate-900">الفواتير</span>
        </nav>
        <div className="flex-1" />
        <div className="relative w-72">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="search"
            placeholder="ابحث في النظام..."
            className="h-8 w-full rounded bg-slate-100 pr-9 pl-2 text-sm focus:outline-none focus:bg-white"
          />
        </div>
        <button className="h-8 w-8 grid place-items-center rounded hover:bg-slate-100">
          <Settings className="h-4 w-4 text-slate-600" />
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">

        {/* Activity Bar (icons only) */}
        <aside className="w-14 bg-slate-900 flex flex-col items-center py-2 gap-1 shrink-0">
          {APPS.map((a) => {
            const Icon = a.icon;
            const active = a.key === 'sales';
            return (
              <button
                key={a.key}
                title={a.label}
                className={`relative h-10 w-10 grid place-items-center rounded-lg transition group
                  ${active ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                <Icon className="h-5 w-5" />
                {active && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-white rounded-l" />}
                <div className="absolute right-full mr-2 px-2 py-1 bg-slate-950 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-50">
                  {a.label}
                </div>
              </button>
            );
          })}
        </aside>

        {/* Sub-sidebar (sales module sections) */}
        <aside className="w-56 bg-white border-l border-slate-200 flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-slate-200">
            <div className="text-xs uppercase text-slate-500 font-semibold mb-1">المبيعات</div>
            <div className="text-sm text-slate-900 font-bold">القوائم</div>
          </div>
          <nav className="flex-1 overflow-y-auto p-2 space-y-0.5 text-sm">
            {[
              { lab: 'الفواتير',       count: 250, active: true },
              { lab: 'المرتجعات',     count: 14 },
              { lab: 'الطلبات',        count: 38 },
              { lab: 'عروض الأسعار',  count: 22 },
              { lab: 'المدفوعات',     count: 180 },
              { lab: 'العملاء',         count: 120 },
            ].map((item) => (
              <button
                key={item.lab}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded text-sm transition
                  ${item.active ? 'bg-sky-50 text-sky-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                <span>{item.lab}</span>
                <span className={`text-[10px] ${item.active ? 'bg-sky-200 text-sky-800' : 'bg-slate-100 text-slate-500'} px-1.5 rounded font-mono num-latin`}>
                  {item.count}
                </span>
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-slate-200 text-xs text-slate-500">
            <div>إجمالي 2026: <span className="num-latin font-mono font-semibold text-slate-900">85.4M د.ع</span></div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col overflow-hidden bg-slate-50">

          {/* Page header */}
          <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-end justify-between shrink-0">
            <div>
              <h1 className="text-xl font-bold text-slate-900">الفواتير</h1>
              <p className="text-xs text-slate-500 mt-0.5">إدارة فواتير المبيعات وتتبّع المدفوعات والمرتجعات</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn btn-secondary btn-sm">
                <Download className="h-3.5 w-3.5" />
                تصدير
              </button>
              <button className="btn btn-secondary btn-sm">
                <Printer className="h-3.5 w-3.5" />
                طباعة
              </button>
              <button className="btn btn-primary btn-sm">
                <Plus className="h-3.5 w-3.5" />
                فاتورة جديدة
              </button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="bg-white border-b border-slate-200 px-5 py-2.5 flex items-center gap-2 shrink-0 flex-wrap">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="h-8 px-3 rounded bg-slate-100 hover:bg-slate-200 text-xs flex items-center gap-1.5"
            >
              <Filter className="h-3.5 w-3.5" />
              {showFilters ? 'إخفاء الفلاتر' : 'إظهار الفلاتر'}
            </button>
            {showFilters && (
              <>
                <FilterPill label="التاريخ" value="آخر 30 يوم" />
                <FilterPill label="الحالة" value="الكل" />
                <FilterPill label="الفرع" value="بغداد الرئيسي" />
                <FilterPill label="العميل" value="—" />
                <button className="text-xs text-rose-600 hover:underline">مسح الفلاتر</button>
              </>
            )}
            <div className="flex-1" />
            <div className="flex items-center gap-1 text-xs text-slate-600">
              <span>عرض:</span>
              <select className="h-7 rounded border border-slate-300 bg-white px-2 text-xs num-latin">
                <option>25</option>
                <option>50</option>
                <option>100</option>
              </select>
              <span>صف</span>
            </div>
            <button className="h-7 w-7 grid place-items-center rounded hover:bg-slate-100">
              <RefreshCw className="h-3.5 w-3.5 text-slate-600" />
            </button>
          </div>

          {/* Selection toolbar (when items selected) */}
          {selected.size > 0 && (
            <div className="bg-sky-50 border-b border-sky-200 px-5 py-2 flex items-center gap-3 shrink-0">
              <span className="text-sm text-sky-900">
                <strong className="num-latin">{selected.size}</strong> فاتورة محدّدة
              </span>
              <button className="btn btn-sm bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">
                <Printer className="h-3.5 w-3.5" />
                طباعة المحدّدة
              </button>
              <button className="btn btn-sm bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">
                <Download className="h-3.5 w-3.5" />
                تصدير
              </button>
              <button className="btn btn-sm bg-rose-600 text-white hover:bg-rose-700">
                <Trash2 className="h-3.5 w-3.5" />
                حذف
              </button>
              <div className="flex-1" />
              <button onClick={() => setSelected(new Set())} className="text-xs text-slate-600 hover:underline">
                إلغاء التحديد
              </button>
            </div>
          )}

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-700 border-b-2 border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="w-10 px-3 py-2.5 text-center">
                    <button onClick={() => setSelected(selected.size === INVOICES.length ? new Set() : new Set(INVOICES.map(i => i.num)))}>
                      {selected.size === INVOICES.length
                        ? <CheckSquare className="h-4 w-4 text-sky-600" />
                        : <Square className="h-4 w-4 text-slate-400" />}
                    </button>
                  </th>
                  {[
                    { lab: 'الرقم', sort: true },
                    { lab: 'التاريخ', sort: true },
                    { lab: 'العميل', sort: true },
                    { lab: 'الفرع', sort: false },
                    { lab: 'البنود', sort: true, end: true },
                    { lab: 'المبلغ', sort: true, end: true },
                    { lab: 'الحالة', sort: false },
                  ].map((h) => (
                    <th key={h.lab} className={`px-4 py-2.5 ${h.end ? 'text-end' : 'text-start'} font-semibold text-xs uppercase tracking-wide`}>
                      <button className="inline-flex items-center gap-1 hover:text-sky-700">
                        {h.lab}
                        {h.sort && <ArrowUpDown className="h-3 w-3 text-slate-400" />}
                      </button>
                    </th>
                  ))}
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {INVOICES.map((inv) => {
                  const isSel = selected.has(inv.num);
                  return (
                    <tr
                      key={inv.num}
                      className={`border-b border-slate-100 transition-colors cursor-pointer ${isSel ? 'bg-sky-50' : 'hover:bg-slate-50'}`}
                      onClick={() => toggle(inv.num)}
                    >
                      <td className="px-3 py-2 text-center">
                        {isSel
                          ? <CheckSquare className="h-4 w-4 text-sky-600 mx-auto" />
                          : <Square className="h-4 w-4 text-slate-300 mx-auto" />}
                      </td>
                      <td className="px-4 py-2 font-mono text-sky-700 font-semibold">{inv.num}</td>
                      <td className="px-4 py-2 text-slate-600 num-latin font-mono text-xs">{inv.date}</td>
                      <td className="px-4 py-2 text-slate-900">{inv.customer}</td>
                      <td className="px-4 py-2 text-slate-600 text-xs">{inv.branch}</td>
                      <td className="px-4 py-2 text-end num-latin font-mono text-xs text-slate-700">{inv.items}</td>
                      <td className="px-4 py-2 text-end num-latin font-mono font-semibold text-slate-900">
                        {inv.amount.toLocaleString('en-US')}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_BADGE[inv.color]}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-end" onClick={(e) => e.stopPropagation()}>
                        <button className="h-7 w-7 grid place-items-center rounded hover:bg-slate-200">
                          <MoreHorizontal className="h-4 w-4 text-slate-500" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <footer className="bg-white border-t border-slate-200 px-5 py-2 flex items-center justify-between text-xs text-slate-600 shrink-0">
            <div>
              عرض <span className="font-semibold num-latin">1-25</span> من <span className="font-semibold num-latin">250</span> فاتورة
            </div>
            <div className="flex items-center gap-1">
              <button className="h-7 w-7 grid place-items-center rounded border border-slate-300 hover:bg-slate-50">
                <ChevronsRight className="h-3.5 w-3.5" />
              </button>
              <button className="h-7 w-7 grid place-items-center rounded border border-slate-300 hover:bg-slate-50">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              {[1, 2, 3, '...', 10].map((p, i) => (
                <button
                  key={i}
                  className={`h-7 min-w-7 px-2 rounded text-xs num-latin
                    ${p === 1 ? 'bg-sky-600 text-white font-semibold' : 'border border-slate-300 hover:bg-slate-50'}`}
                >
                  {p}
                </button>
              ))}
              <button className="h-7 w-7 grid place-items-center rounded border border-slate-300 hover:bg-slate-50">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button className="h-7 w-7 grid place-items-center rounded border border-slate-300 hover:bg-slate-50">
                <ChevronsLeft className="h-3.5 w-3.5" />
              </button>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

function FilterPill({ label, value }: { label: string; value: string }) {
  return (
    <button className="h-8 px-3 rounded bg-white border border-slate-300 hover:border-sky-400 text-xs flex items-center gap-1.5">
      <span className="text-slate-500">{label}:</span>
      <span className="font-semibold text-slate-900">{value}</span>
      <ChevronDown className="h-3 w-3 text-slate-400" />
    </button>
  );
}
