'use client';

import { useState } from 'react';
import {
  Search, Plus, Save, Printer, Send, X, Trash2,
  ChevronLeft, Home, Settings, FileText, ShoppingCart,
  CreditCard, Package, ShoppingBag, Landmark, Building2,
  Users, Hammer, Handshake, Megaphone, BarChart3, User,
  Calendar, Hash, Calculator, Percent, FileCheck,
  AlertCircle, Info, PackagePlus, Filter, Check,
  CheckSquare, Square, Tag, Boxes,
} from 'lucide-react';

// Mock product catalog for the bulk picker
const CATALOG_CATEGORIES = [
  { key: 'all',         label: 'الكل',          color: 'slate' },
  { key: 'electronics', label: 'إلكترونيات',    color: 'sky' },
  { key: 'office',      label: 'مستلزمات مكتب', color: 'amber' },
  { key: 'furniture',   label: 'أثاث',           color: 'violet' },
  { key: 'consumables', label: 'مستهلكات',       color: 'emerald' },
];

const CATALOG = [
  { sku: 'LP-DELL-XPS13', name: 'لابتوب Dell XPS 13',         price: 1850000, cat: 'electronics', stock: 12 },
  { sku: 'LP-HP-EB840',   name: 'لابتوب HP EliteBook 840',    price: 1650000, cat: 'electronics', stock: 8 },
  { sku: 'MS-LOG-MX3',    name: 'ماوس لاسلكي Logitech MX3',   price: 95000,   cat: 'electronics', stock: 45 },
  { sku: 'KB-MECH-RGB',   name: 'كيبورد ميكانيكي RGB',        price: 320000,  cat: 'electronics', stock: 22 },
  { sku: 'MN-LG-27',      name: 'شاشة LG 27" 4K',             price: 850000,  cat: 'electronics', stock: 6 },
  { sku: 'PR-EPSON-L3250',name: 'طابعة Epson L3250',          price: 380000,  cat: 'electronics', stock: 14 },
  { sku: 'PA-A4',         name: 'ورق A4 (رزمة 500)',          price: 12000,   cat: 'office',      stock: 320 },
  { sku: 'PA-A3',         name: 'ورق A3 (رزمة 500)',          price: 24000,   cat: 'office',      stock: 80 },
  { sku: 'PEN-BIC-50',    name: 'أقلام Bic (علبة 50)',        price: 18000,   cat: 'office',      stock: 65 },
  { sku: 'STP-STD',       name: 'كباسة مكتبية',                price: 8000,    cat: 'office',      stock: 40 },
  { sku: 'FLD-200',       name: 'مجلدات أرشيف',                price: 5500,    cat: 'office',      stock: 150 },
  { sku: 'CHR-EXEC',      name: 'كرسي مكتب تنفيذي',            price: 450000,  cat: 'furniture',   stock: 9 },
  { sku: 'DSK-180',       name: 'مكتب 180 سم',                 price: 320000,  cat: 'furniture',   stock: 11 },
  { sku: 'CAB-FILE-4',    name: 'خزانة ملفات 4 أدراج',        price: 280000,  cat: 'furniture',   stock: 7 },
  { sku: 'INK-EPSON-664', name: 'حبر Epson 664',               price: 22000,   cat: 'consumables', stock: 95 },
  { sku: 'TON-HP-105A',   name: 'تونر HP 105A',                price: 145000,  cat: 'consumables', stock: 18 },
  { sku: 'CLN-SPRAY',     name: 'بخاخ تنظيف شاشات',           price: 6500,    cat: 'consumables', stock: 60 },
  { sku: 'GLV-NTRL-100',  name: 'قفازات نتريل (100)',         price: 28000,   cat: 'consumables', stock: 35 },
];

const APPS = [
  { key: 'sales',     icon: ShoppingCart, color: 'sky',     active: true },
  { key: 'pos',       icon: CreditCard,   color: 'emerald' },
  { key: 'inventory', icon: Package,      color: 'amber' },
  { key: 'purchases', icon: ShoppingBag,  color: 'violet' },
  { key: 'finance',   icon: Landmark,     color: 'rose' },
  { key: 'assets',    icon: Building2,    color: 'teal' },
  { key: 'hr',        icon: Users,        color: 'cyan' },
  { key: 'jobs',      icon: Hammer,       color: 'orange' },
  { key: 'crm',       icon: Handshake,    color: 'indigo' },
  { key: 'marketing', icon: Megaphone,    color: 'pink' },
  { key: 'reports',   icon: BarChart3,    color: 'yellow' },
];

type Line = { id: number; product: string; sku: string; qty: number; price: number; discount: number };

export default function InvoiceFormPreview() {
  const [lines, setLines] = useState<Line[]>([
    { id: 1, product: 'لابتوب Dell XPS 13', sku: 'LP-DELL-XPS13', qty: 2, price: 1850000, discount: 0 },
    { id: 2, product: 'ماوس لاسلكي Logitech',sku: 'MS-LOG-MX3',   qty: 5, price: 95000,   discount: 5 },
    { id: 3, product: 'كيبورد ميكانيكي',     sku: 'KB-MECH-RGB',   qty: 3, price: 320000,  discount: 0 },
  ]);
  const [bulkOpen, setBulkOpen] = useState(false);

  function bulkAdd(items: { sku: string; name: string; price: number; qty: number }[]) {
    setLines((prev) => {
      const next = [...prev];
      for (const it of items) {
        const existing = next.find((l) => l.sku === it.sku);
        if (existing) {
          existing.qty += it.qty;
        } else {
          next.push({
            id: Date.now() + Math.random(),
            product: it.name, sku: it.sku, qty: it.qty, price: it.price, discount: 0,
          });
        }
      }
      return next;
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const totalDiscount = lines.reduce((s, l) => s + (l.qty * l.price * l.discount / 100), 0);
  const afterDiscount = subtotal - totalDiscount;
  const tax = 0;
  const total = afterDiscount + tax;

  function addLine() {
    setLines([...lines, { id: Date.now(), product: '', sku: '', qty: 1, price: 0, discount: 0 }]);
  }
  function updateLine(id: number, patch: Partial<Line>) {
    setLines(lines.map(l => l.id === id ? { ...l, ...patch } : l));
  }
  function delLine(id: number) {
    setLines(lines.filter(l => l.id !== id));
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
          <span className="text-slate-600">الفواتير</span>
          <ChevronLeft className="h-3 w-3 text-slate-300" />
          <span className="font-semibold text-slate-900">جديدة</span>
        </nav>
        <div className="flex-1" />
        <span className="badge-warning text-xs">مسودّة · لم تُحفظ</span>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">

        {/* Activity bar */}
        <aside className="w-14 bg-slate-900 flex flex-col items-center py-2 gap-1 shrink-0">
          {APPS.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.key}
                className={`relative h-10 w-10 grid place-items-center rounded-lg transition
                  ${a.active ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                <Icon className="h-5 w-5" />
                {a.active && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-white rounded-l" />}
              </button>
            );
          })}
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Form header — sticky */}
          <div className="bg-white border-b border-slate-200 px-5 py-3 shrink-0">
            <div className="flex items-end justify-between mb-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900">فاتورة جديدة</h1>
                <p className="text-xs text-slate-500 mt-0.5">رقم تلقائي عند الحفظ</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-secondary btn-sm">
                  <X className="h-3.5 w-3.5" />
                  إلغاء
                </button>
                <button className="btn btn-secondary btn-sm">
                  <Save className="h-3.5 w-3.5" />
                  حفظ كمسودّة
                </button>
                <button className="btn btn-primary btn-sm">
                  <FileCheck className="h-3.5 w-3.5" />
                  حفظ وترحيل
                </button>
              </div>
            </div>
          </div>

          {/* Form content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {/* Header section */}
            <section className="bg-white rounded-lg border border-slate-200 shadow-sm">
              <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-600" />
                <h2 className="text-sm font-semibold text-slate-700">بيانات الفاتورة</h2>
              </div>
              <div className="p-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="label">
                    <span className="flex items-center gap-1">
                      رقم الفاتورة
                      <Info className="h-3 w-3 text-slate-400" />
                    </span>
                  </label>
                  <input className="input num-latin" defaultValue="INV-2402" disabled />
                </div>
                <div>
                  <label className="label">التاريخ <span className="text-rose-500">*</span></label>
                  <div className="relative">
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input type="date" className="input pr-9 num-latin" defaultValue="2026-04-25" />
                  </div>
                </div>
                <div>
                  <label className="label">العميل <span className="text-rose-500">*</span></label>
                  <div className="relative">
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <select className="input pr-9">
                      <option>شركة الميسرة</option>
                      <option>مؤسسة بغداد</option>
                      <option>+ عميل جديد</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">طريقة الدفع</label>
                  <select className="input">
                    <option>آجل — 30 يوم</option>
                    <option>نقدي</option>
                    <option>بطاقة (ماستر/فيزا)</option>
                  </select>
                </div>
                <div>
                  <label className="label">الفرع</label>
                  <select className="input">
                    <option>بغداد الرئيسي</option>
                    <option>أربيل</option>
                  </select>
                </div>
                <div>
                  <label className="label">المستودع</label>
                  <select className="input">
                    <option>المستودع الرئيسي - بغداد</option>
                    <option>رف المبيعات - بغداد</option>
                  </select>
                </div>
                <div>
                  <label className="label">العملة</label>
                  <select className="input">
                    <option>د.ع — IQD</option>
                    <option>$ — USD</option>
                  </select>
                </div>
                <div>
                  <label className="label">المرجع الخارجي</label>
                  <input className="input" placeholder="PO #, ref, ..." />
                </div>
              </div>
            </section>

            {/* Line items section */}
            <section className="bg-white rounded-lg border border-slate-200 shadow-sm">
              <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-slate-600" />
                  <h2 className="text-sm font-semibold text-slate-700">البنود</h2>
                  <span className="badge-neutral text-[10px]">{lines.length} صنف</span>
                </div>
                <button
                  onClick={() => setBulkOpen(true)}
                  className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700 shadow-soft"
                >
                  <PackagePlus className="h-3.5 w-3.5" />
                  إضافة متعددة
                </button>
                <button onClick={addLine} className="btn btn-primary btn-sm">
                  <Plus className="h-3.5 w-3.5" />
                  بند جديد
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50/60 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="w-10 px-3 py-2 text-center text-xs font-semibold">#</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold">المنتج</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold w-32">SKU</th>
                    <th className="px-3 py-2 text-end text-xs font-semibold w-24">الكمية</th>
                    <th className="px-3 py-2 text-end text-xs font-semibold w-32">السعر (د.ع)</th>
                    <th className="px-3 py-2 text-end text-xs font-semibold w-24">خصم %</th>
                    <th className="px-3 py-2 text-end text-xs font-semibold w-32">الإجمالي</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => (
                    <tr key={l.id} className="border-b border-slate-100 hover:bg-sky-50/30">
                      <td className="text-center text-xs text-slate-500 num-latin">{idx + 1}</td>
                      <td className="p-1">
                        <input
                          value={l.product}
                          onChange={(e) => updateLine(l.id, { product: e.target.value })}
                          placeholder="ابحث عن منتج..."
                          className="h-8 w-full rounded border border-transparent hover:border-slate-300 focus:border-sky-400 focus:bg-white focus:ring-1 focus:ring-sky-200 px-2 text-sm"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          value={l.sku}
                          onChange={(e) => updateLine(l.id, { sku: e.target.value })}
                          className="h-8 w-full rounded border border-transparent hover:border-slate-300 focus:border-sky-400 focus:bg-white px-2 text-sm font-mono num-latin text-xs"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="text" inputMode="decimal" dir="ltr"
                          value={l.qty}
                          onChange={(e) => updateLine(l.id, { qty: Number(e.target.value) })}
                          className="h-8 w-full rounded border border-transparent hover:border-slate-300 focus:border-sky-400 focus:bg-white px-2 text-sm text-end num-latin font-mono"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="text" inputMode="decimal" dir="ltr"
                          value={l.price}
                          onChange={(e) => updateLine(l.id, { price: Number(e.target.value) })}
                          className="h-8 w-full rounded border border-transparent hover:border-slate-300 focus:border-sky-400 focus:bg-white px-2 text-sm text-end num-latin font-mono"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="text" inputMode="decimal" dir="ltr"
                          value={l.discount}
                          onChange={(e) => updateLine(l.id, { discount: Number(e.target.value) })}
                          className="h-8 w-full rounded border border-transparent hover:border-slate-300 focus:border-sky-400 focus:bg-white px-2 text-sm text-end num-latin font-mono"
                        />
                      </td>
                      <td className="px-3 text-end font-bold text-slate-900 num-latin font-mono text-sm">
                        {((l.qty * l.price) * (1 - l.discount / 100)).toLocaleString('en-US')}
                      </td>
                      <td className="text-center">
                        <button onClick={() => delLine(l.id)} className="h-7 w-7 grid place-items-center text-rose-500 hover:bg-rose-50 rounded mx-auto">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* Totals + Notes (2 columns) */}
            <div className="grid lg:grid-cols-2 gap-4">

              <section className="bg-white rounded-lg border border-slate-200 shadow-sm">
                <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-600" />
                  <h2 className="text-sm font-semibold text-slate-700">ملاحظات</h2>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <label className="label">شروط الدفع</label>
                    <textarea
                      className="input h-20 resize-none"
                      placeholder="مثلاً: الدفع خلال 30 يوماً من تاريخ التسليم"
                    />
                  </div>
                  <div>
                    <label className="label">ملاحظات داخلية</label>
                    <textarea className="input h-16 resize-none" placeholder="ملاحظات لا تظهر للعميل" />
                  </div>
                </div>
              </section>

              <section className="bg-white rounded-lg border border-slate-200 shadow-sm">
                <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-slate-600" />
                  <h2 className="text-sm font-semibold text-slate-700">الإجماليات</h2>
                </div>
                <div className="p-4 space-y-2">
                  <Total label="المجموع الفرعي" value={subtotal} />
                  <Total label={`الخصم (${((totalDiscount / subtotal) * 100 || 0).toFixed(1)}%)`} value={-totalDiscount} negative />
                  <Total label="بعد الخصم" value={afterDiscount} />
                  <Total label="الضريبة (0%)" value={tax} muted />
                  <div className="border-t-2 border-slate-200 pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-base font-bold text-slate-900">الإجمالي النهائي</span>
                      <span className="text-2xl font-bold text-sky-700 num-latin font-mono">
                        {total.toLocaleString('en-US')} د.ع
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Validation hints */}
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
              <div className="text-xs text-amber-900">
                <strong>قبل الحفظ:</strong> تأكّد أن العميل والتاريخ والبنود مكتملة.
                النظام سيُنشئ تلقائياً قيد محاسبي مرتبط بالفاتورة عند الترحيل.
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ─── Bulk Add Modal ─────────────────────────────────────────────── */}
      {bulkOpen && (
        <BulkAddModal
          onClose={() => setBulkOpen(false)}
          onConfirm={(items) => { bulkAdd(items); setBulkOpen(false); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BulkAddModal — multi-product picker with search, category filter, qty
// ─────────────────────────────────────────────────────────────────────────
function BulkAddModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (items: { sku: string; name: string; price: number; qty: number }[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const [picks, setPicks] = useState<Record<string, number>>({}); // sku → qty (0 = unselected)

  const visible = CATALOG.filter((p) =>
    (cat === 'all' || p.cat === cat) &&
    (!search || p.name.includes(search) || p.sku.toLowerCase().includes(search.toLowerCase()))
  );

  const selectedCount = Object.values(picks).filter(q => q > 0).length;
  const totalQty = Object.values(picks).reduce((s, q) => s + q, 0);
  const totalAmount = Object.entries(picks).reduce((s, [sku, q]) => {
    const p = CATALOG.find((x) => x.sku === sku);
    return s + (p ? p.price * q : 0);
  }, 0);

  function togglePick(sku: string) {
    setPicks((p) => ({ ...p, [sku]: p[sku] > 0 ? 0 : 1 }));
  }
  function setQty(sku: string, qty: number) {
    setPicks((p) => ({ ...p, [sku]: Math.max(0, qty) }));
  }
  function selectAllVisible() {
    const next = { ...picks };
    visible.forEach((p) => { if (!next[p.sku]) next[p.sku] = 1; });
    setPicks(next);
  }
  function clearAll() { setPicks({}); }

  function confirm() {
    const items = Object.entries(picks)
      .filter(([, q]) => q > 0)
      .map(([sku, qty]) => {
        const p = CATALOG.find((x) => x.sku === sku)!;
        return { sku, name: p.name, price: p.price, qty };
      });
    onConfirm(items);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm grid place-items-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-100 text-emerald-700 grid place-items-center">
            <Boxes className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-900">إضافة منتجات متعددة</h2>
            <p className="text-xs text-slate-500">اختر منتجات متفرقة أو من قسم محدد، حدّد الكمية، ثم أضفها دفعة واحدة</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 grid place-items-center rounded hover:bg-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search + categories */}
        <div className="px-6 py-3 border-b border-slate-200 space-y-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو SKU..."
              autoFocus
              className="h-10 w-full rounded-lg bg-slate-100 border border-transparent pr-10 pl-3 text-sm focus:outline-none focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 ml-1">القسم:</span>
            {CATALOG_CATEGORIES.map((c) => {
              const active = c.key === cat;
              const itemCount = c.key === 'all'
                ? CATALOG.length
                : CATALOG.filter((p) => p.cat === c.key).length;
              return (
                <button
                  key={c.key}
                  onClick={() => setCat(c.key)}
                  className={`h-8 px-3 rounded-full text-xs flex items-center gap-1.5 transition border
                    ${active
                      ? 'bg-sky-600 text-white border-sky-600 shadow-soft'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                >
                  <Tag className="h-3 w-3" />
                  {c.label}
                  <span className={`text-[10px] num-latin font-mono ${active ? 'bg-sky-700' : 'bg-slate-100'} px-1.5 rounded`}>
                    {itemCount}
                  </span>
                </button>
              );
            })}
            <div className="flex-1" />
            <button onClick={selectAllVisible} className="text-xs text-sky-700 hover:underline">
              تحديد كل المعروض
            </button>
            <button onClick={clearAll} className="text-xs text-rose-600 hover:underline">
              مسح التحديد
            </button>
          </div>
        </div>

        {/* Product table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-700 border-b-2 border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="w-10 px-3 py-2.5 text-center text-[11px] font-bold">✓</th>
                <th className="px-3 py-2.5 text-start text-[11px] font-bold">المنتج</th>
                <th className="w-32 px-3 py-2.5 text-start text-[11px] font-bold">SKU</th>
                <th className="w-24 px-3 py-2.5 text-end text-[11px] font-bold">السعر</th>
                <th className="w-20 px-3 py-2.5 text-end text-[11px] font-bold">المخزون</th>
                <th className="w-32 px-3 py-2.5 text-center text-[11px] font-bold">الكمية</th>
                <th className="w-28 px-3 py-2.5 text-end text-[11px] font-bold">إجمالي السطر</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const qty = picks[p.sku] ?? 0;
                const isPicked = qty > 0;
                return (
                  <tr
                    key={p.sku}
                    className={`border-b border-slate-100 transition cursor-pointer
                      ${isPicked ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                    onClick={() => togglePick(p.sku)}
                  >
                    <td className="px-3 py-2 text-center">
                      {isPicked
                        ? <CheckSquare className="h-4 w-4 text-emerald-600 mx-auto" />
                        : <Square className="h-4 w-4 text-slate-400 mx-auto" />}
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-900">{p.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600 num-latin">{p.sku}</td>
                    <td className="px-3 py-2 text-end font-mono num-latin text-sm">
                      {p.price.toLocaleString('en-US')}
                    </td>
                    <td className="px-3 py-2 text-end font-mono num-latin text-xs text-slate-600">
                      {p.stock}
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      {isPicked ? (
                        <div className="flex items-center justify-center gap-1 bg-white rounded border border-slate-200">
                          <button
                            onClick={() => setQty(p.sku, qty - 1)}
                            className="h-7 w-7 grid place-items-center hover:bg-slate-100 rounded-r"
                          >−</button>
                          <input
                            type="text" inputMode="numeric" dir="ltr"
                            value={qty}
                            onChange={(e) => setQty(p.sku, Number(e.target.value) || 0)}
                            className="h-7 w-12 bg-transparent text-center text-sm font-bold num-latin font-mono focus:outline-none"
                          />
                          <button
                            onClick={() => setQty(p.sku, qty + 1)}
                            className="h-7 w-7 grid place-items-center hover:bg-slate-100 rounded-l"
                          >+</button>
                        </div>
                      ) : (
                        <div className="text-center text-xs text-slate-400">—</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-end font-bold num-latin font-mono text-sm text-slate-900">
                      {qty > 0 ? (qty * p.price).toLocaleString('en-US') : '—'}
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    لا توجد منتجات تطابق البحث
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center gap-4">
          <div className="text-sm">
            <div className="text-slate-600">
              <strong className="text-slate-900 num-latin font-mono">{selectedCount}</strong> منتج محدّد ·
              إجمالي الكميات: <strong className="text-slate-900 num-latin font-mono">{totalQty}</strong>
            </div>
            <div className="text-emerald-700 font-semibold mt-0.5">
              قيمة الإضافة: <span className="num-latin font-mono">{totalAmount.toLocaleString('en-US')}</span> د.ع
            </div>
          </div>
          <div className="flex-1" />
          <button onClick={onClose} className="btn btn-secondary btn-sm">
            <X className="h-3.5 w-3.5" />
            إلغاء
          </button>
          <button
            onClick={confirm}
            disabled={selectedCount === 0}
            className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 shadow-soft"
          >
            <Check className="h-3.5 w-3.5" />
            إضافة المحدّد ({selectedCount})
          </button>
        </div>
      </div>
    </div>
  );
}

function Total({ label, value, negative, muted }: { label: string; value: number; negative?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between items-center text-sm ${muted ? 'text-slate-400' : 'text-slate-700'}`}>
      <span>{label}</span>
      <span className={`num-latin font-mono ${negative ? 'text-rose-600' : ''}`}>
        {value.toLocaleString('en-US')} د.ع
      </span>
    </div>
  );
}
