'use client';

import { useState } from 'react';
import {
  Search, Plus, Save, Printer, Send, X, Trash2,
  ChevronLeft, Home, Settings, FileText, ShoppingCart,
  CreditCard, Package, ShoppingBag, Landmark, Building2,
  Users, Hammer, Handshake, Megaphone, BarChart3, User,
  Calendar, Hash, Calculator, Percent, FileCheck,
  AlertCircle, Info,
} from 'lucide-react';

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
