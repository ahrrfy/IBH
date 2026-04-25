'use client';

/**
 * POS Preview v2 — REDESIGNED
 * User feedback: products on side (compact), cart as the MAIN large table
 * with full columns, more info and controls.
 *
 * Layout (RTL):
 *   ┌─ Topbar ──────────────────────────────┐
 *   │                                  Cart (main, ~70%) | Products (side, ~30%) │
 *   │                                                                              │
 *   └──────────────────────────────────────────────────────────────────────────┘
 *   Bottom bar: payment buttons + complete sale
 */

import { useState, useEffect, useRef } from 'react';
import {
  Search, Barcode, User, ShoppingCart, Trash2, Minus, Plus,
  CreditCard, Banknote, Smartphone, Receipt, Pause, X,
  Coffee, Cookie, Apple, Beef, Fish, Wheat, Milk, Sandwich,
  Pizza, Cake, IceCream, Soup, Edit3, Save, FileText,
  Tag, Percent, Hash, Package, Calculator, AlertCircle,
  Star, ChevronDown, Zap, Clock, Keyboard, Calculator as Calc,
  CheckCircle2,
} from 'lucide-react';

type Category = { key: string; label: string; icon: any; count: number };
type Product  = { id: string; name: string; price: number; cat: string; icon: any; color: string; unit: string };
type CartLine = {
  id: string;
  productId: string;
  name: string;
  sku: string;
  qty: number;
  unit: string;
  price: number;
  discountPct: number;
  note?: string;
};

const CATEGORIES: Category[] = [
  { key: 'all',      label: 'الكل',         icon: ShoppingCart, count: 124 },
  { key: 'beverages',label: 'مشروبات',      icon: Coffee,       count: 18 },
  { key: 'snacks',   label: 'وجبات خفيفة',  icon: Cookie,       count: 22 },
  { key: 'fruits',   label: 'فواكه',        icon: Apple,        count: 15 },
  { key: 'meat',     label: 'لحوم',         icon: Beef,         count: 12 },
  { key: 'fish',     label: 'أسماك',        icon: Fish,         count: 8 },
  { key: 'bakery',   label: 'مخبوزات',      icon: Wheat,        count: 14 },
  { key: 'dairy',    label: 'ألبان',        icon: Milk,         count: 11 },
  { key: 'meals',    label: 'وجبات',        icon: Sandwich,     count: 9 },
  { key: 'pizza',    label: 'بيتزا',        icon: Pizza,        count: 6 },
  { key: 'desserts', label: 'حلويات',       icon: Cake,         count: 7 },
];

const PRODUCTS: Product[] = [
  { id: 'P001', name: 'شاي كرك',          price: 1500,  unit: 'كوب', cat: 'beverages', icon: Coffee,    color: 'amber' },
  { id: 'P002', name: 'قهوة عربية',        price: 2500,  unit: 'كوب', cat: 'beverages', icon: Coffee,    color: 'amber' },
  { id: 'P003', name: 'كولا',              price: 1000,  unit: 'علبة',cat: 'beverages', icon: Coffee,    color: 'rose' },
  { id: 'P004', name: 'بسكويت أوريو',      price: 750,   unit: 'حبة', cat: 'snacks',    icon: Cookie,    color: 'orange' },
  { id: 'P005', name: 'تفاح أحمر',         price: 3000,  unit: 'كغم', cat: 'fruits',    icon: Apple,     color: 'emerald' },
  { id: 'P006', name: 'موز',                price: 2500,  unit: 'كغم', cat: 'fruits',    icon: Apple,     color: 'yellow' },
  { id: 'P007', name: 'لحم بقري',          price: 18000, unit: 'كغم', cat: 'meat',      icon: Beef,      color: 'rose' },
  { id: 'P008', name: 'دجاج',               price: 6500,  unit: 'كغم', cat: 'meat',      icon: Beef,      color: 'orange' },
  { id: 'P009', name: 'سمك مشط',           price: 12000, unit: 'كغم', cat: 'fish',      icon: Fish,      color: 'sky' },
  { id: 'P010', name: 'خبز عربي',          price: 500,   unit: 'حبة', cat: 'bakery',    icon: Wheat,     color: 'yellow' },
  { id: 'P011', name: 'صمون',               price: 250,   unit: 'حبة', cat: 'bakery',    icon: Wheat,     color: 'amber' },
  { id: 'P012', name: 'حليب طازج',         price: 1500,  unit: 'لتر', cat: 'dairy',     icon: Milk,      color: 'cyan' },
  { id: 'P013', name: 'لبن',                price: 2000,  unit: 'كغم', cat: 'dairy',     icon: Milk,      color: 'sky' },
  { id: 'P014', name: 'ساندويتش شاورما',   price: 4500,  unit: 'حبة', cat: 'meals',     icon: Sandwich,  color: 'violet' },
  { id: 'P015', name: 'برغر دجاج',          price: 5500,  unit: 'حبة', cat: 'meals',     icon: Sandwich,  color: 'orange' },
  { id: 'P016', name: 'بيتزا مارغريتا',    price: 12000, unit: 'حبة', cat: 'pizza',     icon: Pizza,     color: 'red' },
  { id: 'P017', name: 'بيتزا خضار',         price: 11000, unit: 'حبة', cat: 'pizza',     icon: Pizza,     color: 'emerald' },
  { id: 'P018', name: 'كنافة',              price: 5000,  unit: 'قطعة',cat: 'desserts',  icon: Cake,      color: 'pink' },
  { id: 'P019', name: 'بقلاوة',             price: 4000,  unit: 'قطعة',cat: 'desserts',  icon: Cake,      color: 'amber' },
  { id: 'P020', name: 'آيس كريم فانيلا',   price: 2500,  unit: 'كأس', cat: 'desserts',  icon: IceCream,  color: 'teal' },
  { id: 'P021', name: 'شوربة عدس',          price: 3000,  unit: 'صحن',cat: 'meals',     icon: Soup,      color: 'amber' },
  { id: 'P022', name: 'عصير برتقال',        price: 2000,  unit: 'كوب', cat: 'beverages', icon: Coffee,    color: 'orange' },
  { id: 'P023', name: 'ماء معدني',          price: 500,   unit: 'قارورة', cat: 'beverages',icon: Coffee, color: 'sky' },
  { id: 'P024', name: 'شيبس',                price: 1000,  unit: 'كيس', cat: 'snacks',   icon: Cookie,    color: 'yellow' },
];

const ACCENTS: Record<string, { tile: string; ic: string }> = {
  amber:   { tile: 'bg-amber-50',   ic: 'bg-amber-500' },
  orange:  { tile: 'bg-orange-50',  ic: 'bg-orange-500' },
  emerald: { tile: 'bg-emerald-50', ic: 'bg-emerald-500' },
  rose:    { tile: 'bg-rose-50',    ic: 'bg-rose-500' },
  sky:     { tile: 'bg-sky-50',     ic: 'bg-sky-500' },
  yellow:  { tile: 'bg-yellow-50',  ic: 'bg-yellow-500' },
  cyan:    { tile: 'bg-cyan-50',    ic: 'bg-cyan-500' },
  violet:  { tile: 'bg-violet-50',  ic: 'bg-violet-500' },
  red:     { tile: 'bg-red-50',     ic: 'bg-red-500' },
  pink:    { tile: 'bg-pink-50',    ic: 'bg-pink-500' },
  teal:    { tile: 'bg-teal-50',    ic: 'bg-teal-500' },
};

export default function PosPreview() {
  const [cat, setCat] = useState('all');
  const [search, setSearch] = useState('');
  const [globalDiscountPct, setGlobalDiscountPct] = useState(0);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [qtyMultiplier, setQtyMultiplier] = useState(1); // type "5*" then click product → adds 5
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [recentlyAdded, setRecentlyAdded] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Auto-focus search on mount + after every barcode entry
  useEffect(() => { searchRef.current?.focus(); }, []);

  // ── Keyboard shortcuts (F-keys + numpad multiplier)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Detect "5*" pattern → quantity multiplier
      if (e.key === '*' && /^\d+$/.test(search)) {
        e.preventDefault();
        setQtyMultiplier(Number(search));
        setSearch('');
        return;
      }
      // F-keys
      if (e.key === 'F2')  { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'F4')  { e.preventDefault(); /* open customer picker */ }
      if (e.key === 'F9')  { e.preventDefault(); /* cash */ }
      if (e.key === 'F10') { e.preventDefault(); /* card */ }
      if (e.key === 'F11') { e.preventDefault(); /* wallet */ }
      if (e.key === 'F12') { e.preventDefault(); /* complete sale */ }
      if (e.key === 'Escape') { setSelectedRow(null); setQtyMultiplier(1); }
      if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); setShowShortcuts(s => !s); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [search]);
  const [cart, setCart] = useState<CartLine[]>([
    { id: 'L1', productId: 'P001', name: 'شاي كرك',           sku: 'P001', qty: 2, unit: 'كوب', price: 1500,  discountPct: 0,  note: '' },
    { id: 'L2', productId: 'P004', name: 'بسكويت أوريو',      sku: 'P004', qty: 3, unit: 'حبة', price: 750,   discountPct: 5,  note: '' },
    { id: 'L3', productId: 'P014', name: 'ساندويتش شاورما',   sku: 'P014', qty: 1, unit: 'حبة', price: 4500,  discountPct: 0,  note: 'بدون بصل' },
    { id: 'L4', productId: 'P008', name: 'دجاج',               sku: 'P008', qty: 2, unit: 'كغم', price: 6500,  discountPct: 0,  note: '' },
    { id: 'L5', productId: 'P012', name: 'حليب طازج',         sku: 'P012', qty: 4, unit: 'لتر', price: 1500,  discountPct: 10, note: '' },
  ]);

  const visible = PRODUCTS.filter((p) =>
    (cat === 'all' || p.cat === cat) &&
    (!search || p.name.includes(search) || p.id.includes(search))
  );

  const lineTotal = (l: CartLine) => l.qty * l.price * (1 - l.discountPct / 100);
  const subtotal = cart.reduce((s, l) => s + lineTotal(l), 0);
  const lineDiscounts = cart.reduce((s, l) => s + l.qty * l.price * (l.discountPct / 100), 0);
  const globalDiscount = subtotal * (globalDiscountPct / 100);
  const afterDiscount = subtotal - globalDiscount;
  const tax = 0;
  const total = afterDiscount + tax;

  function addItem(p: Product) {
    const addQty = qtyMultiplier;
    setCart((c) => {
      const ex = c.find((l) => l.productId === p.id);
      return ex
        ? c.map((l) => l.productId === p.id ? { ...l, qty: l.qty + addQty } : l)
        : [...c, { id: `L${Date.now()}`, productId: p.id, name: p.name, sku: p.id, qty: addQty, unit: p.unit, price: p.price, discountPct: 0, note: '' }];
    });
    setRecentlyAdded(p.id);
    setQtyMultiplier(1);
    setSearch('');
    setTimeout(() => setRecentlyAdded(null), 800);
    searchRef.current?.focus();
  }
  function updateLine(id: string, patch: Partial<CartLine>) {
    setCart((c) => c.map((l) => l.id === id ? { ...l, ...patch } : l));
  }
  function delLine(id: string) {
    setCart((c) => c.filter((l) => l.id !== id));
    if (selectedRow === id) setSelectedRow(null);
  }

  return (
    <div className="h-[calc(100vh-2.75rem)] bg-slate-100 flex flex-col" dir="rtl">

      {/* ─── Topbar ───────────────────────────────────────────────────── */}
      <header className="h-12 bg-white border-b border-slate-200 flex items-center px-3 gap-3">
        <div className="h-8 w-8 rounded bg-sky-700 text-white grid place-items-center font-bold text-sm shadow">ر</div>
        <div className="leading-tight">
          <div className="text-sm font-bold text-slate-900">نقطة البيع</div>
          <div className="text-[10px] text-slate-500">وردية #24 · بدأت 08:00</div>
        </div>
        <div className="h-6 w-px bg-slate-200" />
        <span className="badge-success text-xs">مفتوحة</span>
        <span className="text-xs text-slate-600">الكاشير: <strong>أحمد علي</strong></span>
        <div className="flex-1" />
        <span className="text-xs text-slate-500">آخر بيع: قبل 3 دقائق</span>
        <button className="btn btn-secondary btn-sm">
          <Pause className="h-3.5 w-3.5" />
          إيقاف مؤقت
        </button>
        <button className="btn btn-danger btn-sm">
          <X className="h-3.5 w-3.5" />
          إغلاق الوردية
        </button>
      </header>

      {/* ─── Body: Cart (main, 70%) | Products (side, 30%) ──────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ═══════════════════════════════════════════════════════════════
            CART AREA (MAIN — large, RTL = appears on RIGHT)
            ═══════════════════════════════════════════════════════════════ */}
        <section className="flex-1 flex flex-col overflow-hidden bg-white">

          {/* Cart header — customer + actions */}
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/50 flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <div className="h-8 px-3 bg-amber-50 border border-amber-200 rounded flex items-center gap-2 text-xs">
                <User className="h-3.5 w-3.5 text-amber-700" />
                <span className="text-amber-900">العميل: <strong>عميل نقدي</strong></span>
                <button className="text-amber-700 hover:underline font-semibold">تغيير</button>
              </div>
              <div className="h-8 px-3 bg-slate-100 rounded flex items-center gap-2 text-xs text-slate-700">
                <Hash className="h-3.5 w-3.5" />
                إيصال #<span className="num-latin font-mono">R-2401</span>
              </div>
              <div className="h-8 px-3 bg-slate-100 rounded flex items-center gap-2 text-xs text-slate-700">
                <Tag className="h-3.5 w-3.5" />
                <span>قائمة الأسعار:</span>
                <select className="bg-transparent text-xs font-semibold focus:outline-none">
                  <option>التجزئة</option>
                  <option>الجملة</option>
                  <option>VIP</option>
                </select>
              </div>
            </div>
            <button className="btn btn-secondary btn-sm">
              <Save className="h-3.5 w-3.5" />
              حفظ كمسودّة
            </button>
            <button
              onClick={() => setCart([])}
              className="btn btn-sm bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
              إفراغ السلة
            </button>
          </div>

          {/* Cart Table — main feature */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-700 border-b-2 border-slate-300 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="w-10 px-2 py-2 text-center text-[11px] font-bold">#</th>
                  <th className="w-12 px-2 py-2"></th>
                  <th className="px-3 py-2 text-start text-[11px] font-bold">المنتج</th>
                  <th className="w-20 px-3 py-2 text-start text-[11px] font-bold">SKU</th>
                  <th className="w-16 px-3 py-2 text-center text-[11px] font-bold">الوحدة</th>
                  <th className="w-32 px-3 py-2 text-center text-[11px] font-bold">الكمية</th>
                  <th className="w-28 px-3 py-2 text-end text-[11px] font-bold">السعر</th>
                  <th className="w-20 px-3 py-2 text-end text-[11px] font-bold">خصم %</th>
                  <th className="w-28 px-3 py-2 text-end text-[11px] font-bold">قيمة الخصم</th>
                  <th className="w-32 px-3 py-2 text-end text-[11px] font-bold">الإجمالي</th>
                  <th className="w-24 px-2 py-2 text-center text-[11px] font-bold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((l, idx) => {
                  const product = PRODUCTS.find((p) => p.id === l.productId);
                  const Icon = product?.icon || Package;
                  const c = ACCENTS[product?.color || 'sky'];
                  const lineTot = lineTotal(l);
                  const discAmt = l.qty * l.price * (l.discountPct / 100);
                  const isSel = selectedRow === l.id;
                  return (
                    <tr
                      key={l.id}
                      onClick={() => setSelectedRow(isSel ? null : l.id)}
                      className={`border-b border-slate-100 transition-colors cursor-pointer
                        ${isSel ? 'bg-sky-50' : 'hover:bg-slate-50'}`}
                    >
                      <td className="px-2 py-2 text-center text-xs text-slate-500 num-latin font-mono">{idx + 1}</td>
                      <td className="px-2 py-2">
                        <div className={`h-9 w-9 rounded-lg ${c.tile} grid place-items-center mx-auto`}>
                          <div className={`h-7 w-7 rounded ${c.ic} grid place-items-center text-white`}>
                            <Icon className="h-4 w-4" />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-900">{l.name}</div>
                        {l.note && (
                          <div className="text-[11px] text-amber-700 mt-0.5 flex items-center gap-1">
                            <Edit3 className="h-3 w-3" /> {l.note}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600 num-latin">{l.sku}</td>
                      <td className="px-3 py-2 text-center text-xs text-slate-600">{l.unit}</td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1 bg-slate-100 rounded">
                          <button
                            onClick={() => updateLine(l.id, { qty: Math.max(1, l.qty - 1) })}
                            className="h-7 w-7 grid place-items-center hover:bg-slate-200 rounded-r"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <input
                            type="text" inputMode="decimal" dir="ltr"
                            value={l.qty}
                            onChange={(e) => updateLine(l.id, { qty: Math.max(1, Number(e.target.value)) })}
                            className="h-7 w-12 bg-transparent text-center text-sm font-bold num-latin font-mono focus:outline-none"
                          />
                          <button
                            onClick={() => updateLine(l.id, { qty: l.qty + 1 })}
                            className="h-7 w-7 grid place-items-center hover:bg-slate-200 rounded-l"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-end" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text" inputMode="decimal" dir="ltr"
                          value={l.price}
                          onChange={(e) => updateLine(l.id, { price: Number(e.target.value) })}
                          className="h-7 w-full text-end font-mono num-latin text-sm bg-transparent border border-transparent hover:border-slate-200 focus:border-sky-400 focus:bg-white rounded px-2 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2 text-end" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text" inputMode="decimal" dir="ltr"
                          value={l.discountPct}
                          onChange={(e) => updateLine(l.id, { discountPct: Math.max(0, Math.min(100, Number(e.target.value))) })}
                          className="h-7 w-full text-end font-mono num-latin text-sm bg-transparent border border-transparent hover:border-slate-200 focus:border-sky-400 focus:bg-white rounded px-2 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2 text-end text-sm text-rose-600 num-latin font-mono">
                        {discAmt > 0 ? `-${discAmt.toLocaleString('en-US')}` : '0'}
                      </td>
                      <td className="px-3 py-2 text-end font-bold text-slate-900 num-latin font-mono">
                        {lineTot.toLocaleString('en-US')}
                      </td>
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            title="ملاحظة"
                            className="h-7 w-7 grid place-items-center text-slate-500 hover:bg-amber-100 hover:text-amber-700 rounded"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            title="خصم خاص"
                            className="h-7 w-7 grid place-items-center text-slate-500 hover:bg-violet-100 hover:text-violet-700 rounded"
                          >
                            <Percent className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => delLine(l.id)}
                            title="حذف"
                            className="h-7 w-7 grid place-items-center text-slate-500 hover:bg-rose-100 hover:text-rose-700 rounded"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {cart.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-slate-500">
                      <ShoppingCart className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                      <div>السلة فارغة — اختر منتجاً من الجانب</div>
                    </td>
                  </tr>
                )}
              </tbody>
              {cart.length > 0 && (
                <tfoot className="bg-slate-50 border-t-2 border-slate-300 sticky bottom-0">
                  <tr className="font-semibold text-slate-700 text-sm">
                    <td colSpan={5} className="px-3 py-2 text-start">
                      <span className="text-xs text-slate-600">الإجمالي:</span>
                      <span className="mr-2 num-latin font-mono">{cart.length} صنف · {cart.reduce((s, l) => s + l.qty, 0)} قطعة</span>
                    </td>
                    <td colSpan={3} className="px-3 py-2 text-end">
                      مجموع الخصومات على البنود:
                    </td>
                    <td className="px-3 py-2 text-end text-rose-600 num-latin font-mono">-{lineDiscounts.toLocaleString('en-US')}</td>
                    <td className="px-3 py-2 text-end text-base num-latin font-mono">{subtotal.toLocaleString('en-US')}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Quick add line + global discount */}
          <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center gap-3">
            <button className="btn btn-secondary btn-sm">
              <Plus className="h-3.5 w-3.5" />
              بند يدوي
            </button>
            <button
              onClick={() => alert('سيُفتح مودال اختيار متعدد بالقسم — موجود في فاتورة جديدة الآن')}
              className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700 shadow-soft"
            >
              <Package className="h-3.5 w-3.5" />
              إضافة متعددة
            </button>
            <button className="btn btn-secondary btn-sm">
              <FileText className="h-3.5 w-3.5" />
              ملاحظة عامة
            </button>
            <div className="flex-1" />
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <span className="text-slate-500">خصم عام %:</span>
              <input
                type="text" inputMode="decimal" dir="ltr"
                value={globalDiscountPct}
                onChange={(e) => setGlobalDiscountPct(Math.max(0, Math.min(100, Number(e.target.value))))}
                className="h-7 w-16 rounded border border-slate-300 px-2 text-end text-sm font-mono num-latin focus:outline-none focus:border-sky-400"
              />
            </label>
          </div>

          {/* Totals + payment bar */}
          <div className="bg-white border-t border-slate-200 grid grid-cols-12 gap-0">

            {/* Totals (8 cols) */}
            <div className="col-span-8 px-5 py-3 grid grid-cols-4 gap-3 border-l border-slate-200">
              <TotBlock label="المجموع الفرعي" value={subtotal} />
              <TotBlock label={`خصم عام (${globalDiscountPct}%)`} value={-globalDiscount} negative />
              <TotBlock label="الضريبة" value={tax} muted />
              <TotBlock label="الإجمالي النهائي" value={total} big highlight />
            </div>

            {/* Payment buttons (4 cols) */}
            <div className="col-span-4 p-3 grid grid-cols-3 gap-2">
              <PayBtn icon={Banknote}   color="emerald" label="نقدي"   shortcut="F9" />
              <PayBtn icon={CreditCard} color="sky"     label="بطاقة"  shortcut="F10" />
              <PayBtn icon={Smartphone} color="violet"  label="محفظة"  shortcut="F11" />
            </div>
          </div>

          {/* Complete sale */}
          <div className="px-4 pb-3 bg-white">
            <button className="w-full h-14 rounded-xl bg-gradient-to-l from-slate-900 to-slate-800 text-white text-lg font-bold flex items-center justify-center gap-2 hover:from-black hover:to-slate-900 shadow-lifted">
              <Receipt className="h-5 w-5" />
              إتمام البيع وطباعة الإيصال (F12)
            </button>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            PRODUCTS PANEL (SIDE — compact, RTL = appears on LEFT)
            ═══════════════════════════════════════════════════════════════ */}
        <aside className="w-80 xl:w-96 flex flex-col bg-slate-50 border-r border-slate-200">

          {/* Search + smart entry */}
          <div className="p-3 bg-white border-b border-slate-200 space-y-2">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={qtyMultiplier > 1 ? `سيُضاف ×${qtyMultiplier} — اختر منتج` : 'ابحث / امسح باركود / اكتب 5*'}
                autoFocus
                className={`h-10 w-full rounded-lg pr-10 pl-16 text-sm focus:outline-none transition
                  ${qtyMultiplier > 1
                    ? 'bg-amber-50 border-2 border-amber-400 ring-2 ring-amber-200'
                    : 'bg-slate-100 border border-transparent focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100'}`}
              />
              <kbd className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">F2</kbd>
              {qtyMultiplier > 1 && (
                <div className="absolute -bottom-5 right-3 text-[10px] text-amber-700 font-semibold flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  وضع الضرب نشط: ×{qtyMultiplier} — اختر منتجاً
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5 mt-1">
              {[2, 3, 5, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setQtyMultiplier(n)}
                  className={`h-7 rounded text-[11px] font-bold transition num-latin
                    ${qtyMultiplier === n
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-amber-100'}`}
                >
                  ×{n}
                </button>
              ))}
              <button
                onClick={() => setShowShortcuts(true)}
                className="col-span-2 h-7 rounded text-[11px] bg-slate-900 text-white hover:bg-slate-800 flex items-center justify-center gap-1"
              >
                <Keyboard className="h-3 w-3" />
                اختصارات (Ctrl+/)
              </button>
            </div>
          </div>

          {/* Categories */}
          <div className="px-2 py-2 border-b border-slate-200 bg-white overflow-x-auto">
            <div className="flex flex-wrap gap-1">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const active = c.key === cat;
                return (
                  <button
                    key={c.key}
                    onClick={() => setCat(c.key)}
                    className={`h-7 px-2 flex items-center gap-1 rounded text-[11px] whitespace-nowrap transition
                      ${active
                        ? 'bg-sky-600 text-white font-semibold'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                  >
                    <Icon className="h-3 w-3" />
                    <span>{c.label}</span>
                    <span className={`text-[9px] ${active ? 'bg-sky-700' : 'bg-white'} px-1 rounded num-latin`}>{c.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Products grid (compact, side panel) */}
          <div className="flex-1 overflow-y-auto p-2">
            <div className="grid grid-cols-2 gap-2">
              {visible.map((p) => {
                const Icon = p.icon;
                const c = ACCENTS[p.color];
                return (
                  <button
                    key={p.id}
                    onClick={() => addItem(p)}
                    className={`relative rounded-lg border p-2 flex flex-col items-center gap-1.5 transition active:scale-95
                      ${recentlyAdded === p.id
                        ? 'bg-emerald-50 border-emerald-400 shadow-lg ring-2 ring-emerald-200 scale-105'
                        : 'bg-white border-slate-200 hover:shadow-md hover:border-sky-300'}`}
                  >
                    {recentlyAdded === p.id && (
                      <div className="absolute top-1 left-1 h-5 w-5 rounded-full bg-emerald-500 grid place-items-center text-white animate-pulse-soft">
                        <CheckCircle2 className="h-3 w-3" />
                      </div>
                    )}
                    <div className={`h-10 w-10 rounded ${c.tile} grid place-items-center`}>
                      <div className={`h-8 w-8 rounded ${c.ic} grid place-items-center text-white`}>
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="text-[11px] font-semibold text-slate-900 text-center line-clamp-1 w-full">{p.name}</div>
                    <div className="text-[10px] text-slate-500 num-latin font-mono">{p.id}</div>
                    <div className="text-xs font-bold text-sky-700 num-latin">{p.price.toLocaleString('en-US')}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick stats (bottom of products panel) */}
          <div className="p-3 border-t border-slate-200 bg-white text-[11px] text-slate-600 space-y-1">
            <div className="flex justify-between">
              <span>عدد المنتجات المعروضة:</span>
              <span className="font-mono num-latin font-bold text-slate-900">{visible.length}</span>
            </div>
            <div className="flex justify-between">
              <span>إيرادات اليوم:</span>
              <span className="font-mono num-latin font-bold text-emerald-700">3,250,000 د.ع</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function TotBlock({ label, value, negative, muted, big, highlight }: { label: string; value: number; negative?: boolean; muted?: boolean; big?: boolean; highlight?: boolean }) {
  return (
    <div className={`${highlight ? 'bg-sky-50 border border-sky-200 rounded-lg px-3 py-1.5' : ''}`}>
      <div className={`text-[10px] uppercase tracking-wide ${highlight ? 'text-sky-700 font-semibold' : 'text-slate-500'}`}>
        {label}
      </div>
      <div className={`mt-0.5 font-mono num-latin ${big ? 'text-xl font-bold text-sky-700' : 'text-base font-semibold'} ${negative ? 'text-rose-600' : muted ? 'text-slate-400' : 'text-slate-900'}`}>
        {value.toLocaleString('en-US')} <span className="text-xs font-normal text-slate-500">د.ع</span>
      </div>
    </div>
  );
}

function PayBtn({ icon: Icon, color, label, shortcut }: { icon: any; color: 'emerald' | 'sky' | 'violet'; label: string; shortcut: string }) {
  const map = {
    emerald: 'bg-emerald-600 hover:bg-emerald-700',
    sky:     'bg-sky-600 hover:bg-sky-700',
    violet:  'bg-violet-600 hover:bg-violet-700',
  };
  return (
    <button className={`h-full rounded-lg ${map[color]} text-white flex flex-col items-center justify-center gap-0.5 shadow-soft hover:shadow-lifted transition`}>
      <Icon className="h-5 w-5" />
      <span className="text-xs font-bold">{label}</span>
      <kbd className="text-[9px] bg-white/20 px-1.5 rounded font-mono">{shortcut}</kbd>
    </button>
  );
}
