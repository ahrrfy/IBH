'use client';

import { useState } from 'react';
import {
  Search, Barcode, User, ShoppingCart, Trash2, Minus, Plus,
  CreditCard, Banknote, Smartphone, Receipt, Pause, X,
  Coffee, Cookie, Apple, Beef, Fish, Wheat, Milk, Sandwich,
  Pizza, Cake, IceCream, Soup,
} from 'lucide-react';

type Category = { key: string; label: string; icon: any; color: string; count: number };
type Product = { id: string; name: string; price: number; cat: string; icon: any; color: string };
type CartLine = { id: string; name: string; qty: number; price: number };

const CATEGORIES: Category[] = [
  { key: 'all',      label: 'الكل',         icon: ShoppingCart, color: 'slate',   count: 124 },
  { key: 'beverages',label: 'مشروبات',      icon: Coffee,       color: 'amber',   count: 18 },
  { key: 'snacks',   label: 'وجبات خفيفة',  icon: Cookie,       color: 'orange',  count: 22 },
  { key: 'fruits',   label: 'خضار وفواكه', icon: Apple,        color: 'emerald', count: 15 },
  { key: 'meat',     label: 'لحوم',         icon: Beef,         color: 'rose',    count: 12 },
  { key: 'fish',     label: 'أسماك',        icon: Fish,         color: 'sky',     count: 8 },
  { key: 'bakery',   label: 'مخبوزات',      icon: Wheat,        color: 'yellow',  count: 14 },
  { key: 'dairy',    label: 'ألبان',        icon: Milk,         color: 'cyan',    count: 11 },
  { key: 'meals',    label: 'وجبات',        icon: Sandwich,     color: 'violet',  count: 9 },
  { key: 'pizza',    label: 'بيتزا',        icon: Pizza,        color: 'red',     count: 6 },
  { key: 'desserts', label: 'حلويات',       icon: Cake,         color: 'pink',    count: 7 },
  { key: 'icecream', label: 'مثلجات',       icon: IceCream,     color: 'teal',    count: 5 },
];

const PRODUCTS: Product[] = [
  { id: 'P001', name: 'شاي كرك',           price: 1500,  cat: 'beverages', icon: Coffee,    color: 'amber' },
  { id: 'P002', name: 'قهوة عربية',         price: 2500,  cat: 'beverages', icon: Coffee,    color: 'amber' },
  { id: 'P003', name: 'كولا',                price: 1000,  cat: 'beverages', icon: Coffee,    color: 'rose' },
  { id: 'P004', name: 'بسكويت أوريو',       price: 750,   cat: 'snacks',    icon: Cookie,    color: 'orange' },
  { id: 'P005', name: 'تفاح أحمر (كغم)',    price: 3000,  cat: 'fruits',    icon: Apple,     color: 'emerald' },
  { id: 'P006', name: 'موز (كغم)',          price: 2500,  cat: 'fruits',    icon: Apple,     color: 'yellow' },
  { id: 'P007', name: 'لحم بقري (كغم)',     price: 18000, cat: 'meat',      icon: Beef,      color: 'rose' },
  { id: 'P008', name: 'دجاج (كغم)',          price: 6500,  cat: 'meat',      icon: Beef,      color: 'orange' },
  { id: 'P009', name: 'سمك مشط (كغم)',      price: 12000, cat: 'fish',      icon: Fish,      color: 'sky' },
  { id: 'P010', name: 'خبز عربي',           price: 500,   cat: 'bakery',    icon: Wheat,     color: 'yellow' },
  { id: 'P011', name: 'صمون',                price: 250,   cat: 'bakery',    icon: Wheat,     color: 'amber' },
  { id: 'P012', name: 'حليب طازج (لتر)',    price: 1500,  cat: 'dairy',     icon: Milk,      color: 'cyan' },
  { id: 'P013', name: 'لبن (كغم)',           price: 2000,  cat: 'dairy',     icon: Milk,      color: 'sky' },
  { id: 'P014', name: 'ساندويتش شاورما',    price: 4500,  cat: 'meals',     icon: Sandwich,  color: 'violet' },
  { id: 'P015', name: 'برغر دجاج',           price: 5500,  cat: 'meals',     icon: Sandwich,  color: 'orange' },
  { id: 'P016', name: 'بيتزا مارغريتا',     price: 12000, cat: 'pizza',     icon: Pizza,     color: 'red' },
  { id: 'P017', name: 'بيتزا خضار',          price: 11000, cat: 'pizza',     icon: Pizza,     color: 'emerald' },
  { id: 'P018', name: 'كنافة',                price: 5000,  cat: 'desserts',  icon: Cake,      color: 'pink' },
  { id: 'P019', name: 'بقلاوة',               price: 4000,  cat: 'desserts',  icon: Cake,      color: 'amber' },
  { id: 'P020', name: 'آيس كريم فانيلا',    price: 2500,  cat: 'icecream',  icon: IceCream,  color: 'teal' },
  { id: 'P021', name: 'شوربة عدس',          price: 3000,  cat: 'meals',     icon: Soup,      color: 'amber' },
  { id: 'P022', name: 'عصير برتقال',        price: 2000,  cat: 'beverages', icon: Coffee,    color: 'orange' },
  { id: 'P023', name: 'ماء معدني',           price: 500,   cat: 'beverages', icon: Coffee,    color: 'sky' },
  { id: 'P024', name: 'شيبس',                price: 1000,  cat: 'snacks',    icon: Cookie,    color: 'yellow' },
];

const ACCENTS: Record<string, string> = {
  slate:   'bg-slate-100   text-slate-700',
  amber:   'bg-amber-100   text-amber-700',
  orange:  'bg-orange-100  text-orange-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  rose:    'bg-rose-100    text-rose-700',
  sky:     'bg-sky-100     text-sky-700',
  yellow:  'bg-yellow-100  text-yellow-700',
  cyan:    'bg-cyan-100    text-cyan-700',
  violet:  'bg-violet-100  text-violet-700',
  red:     'bg-red-100     text-red-700',
  pink:    'bg-pink-100    text-pink-700',
  teal:    'bg-teal-100    text-teal-700',
};

export default function PosPreview() {
  const [cat, setCat] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([
    { id: 'P001', name: 'شاي كرك',          qty: 2, price: 1500 },
    { id: 'P004', name: 'بسكويت أوريو',     qty: 3, price: 750 },
    { id: 'P014', name: 'ساندويتش شاورما',  qty: 1, price: 4500 },
  ]);

  const visible = PRODUCTS.filter((p) =>
    (cat === 'all' || p.cat === cat) &&
    (!search || p.name.includes(search) || p.id.includes(search))
  );

  const subtotal = cart.reduce((s, l) => s + l.qty * l.price, 0);
  const tax = 0; // Iraq has no VAT mostly
  const total = subtotal + tax;

  function addItem(p: Product) {
    setCart((c) => {
      const ex = c.find((l) => l.id === p.id);
      return ex
        ? c.map((l) => l.id === p.id ? { ...l, qty: l.qty + 1 } : l)
        : [...c, { id: p.id, name: p.name, qty: 1, price: p.price }];
    });
  }
  function decItem(id: string) { setCart((c) => c.flatMap((l) => l.id !== id ? [l] : l.qty > 1 ? [{ ...l, qty: l.qty - 1 }] : [])); }
  function incItem(id: string) { setCart((c) => c.map((l) => l.id === id ? { ...l, qty: l.qty + 1 } : l)); }
  function delItem(id: string) { setCart((c) => c.filter((l) => l.id !== id)); }

  return (
    <div className="h-[calc(100vh-2.75rem)] bg-slate-100 flex flex-col" dir="rtl">

      {/* Topbar — minimal POS chrome */}
      <header className="h-12 bg-white border-b border-slate-200 flex items-center px-3 gap-3">
        <div className="h-8 w-8 rounded bg-sky-700 text-white grid place-items-center font-bold text-sm shadow">ر</div>
        <div className="leading-tight">
          <div className="text-sm font-bold text-slate-900">نقطة البيع</div>
          <div className="text-[10px] text-slate-500">وردية #24 · بدأت 08:00</div>
        </div>
        <div className="h-6 w-px bg-slate-200" />
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="badge-success">مفتوحة</span>
          <span>الكاشير: <strong>أحمد علي</strong></span>
        </div>
        <div className="flex-1" />
        <button className="btn btn-secondary btn-sm">
          <Pause className="h-3.5 w-3.5" />
          إيقاف مؤقت
        </button>
        <button className="btn btn-danger btn-sm">
          <X className="h-3.5 w-3.5" />
          إغلاق الوردية
        </button>
      </header>

      {/* Body: products grid (left, 2/3) + cart (right, 1/3) */}
      <div className="flex-1 flex overflow-hidden">

        {/* PRODUCTS PANEL */}
        <section className="flex-1 flex flex-col bg-white border-l border-slate-200 overflow-hidden">

          {/* Search + barcode */}
          <div className="p-3 border-b border-slate-200 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن منتج بالاسم أو SKU..."
                className="h-10 w-full rounded-lg bg-slate-100 border border-transparent pr-10 pl-3 text-sm focus:outline-none focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              />
            </div>
            <button className="h-10 px-4 rounded-lg bg-slate-900 text-white flex items-center gap-2 text-sm hover:bg-slate-800">
              <Barcode className="h-4 w-4" />
              مسح باركود (F2)
            </button>
            <button className="h-10 px-3 rounded-lg bg-emerald-600 text-white flex items-center gap-2 text-sm hover:bg-emerald-700">
              <User className="h-4 w-4" />
              عميل (F4)
            </button>
          </div>

          {/* Categories tabs */}
          <div className="px-3 py-2 border-b border-slate-200 overflow-x-auto">
            <div className="flex items-center gap-2 min-w-fit">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const active = c.key === cat;
                return (
                  <button
                    key={c.key}
                    onClick={() => setCat(c.key)}
                    className={`h-9 px-3 flex items-center gap-2 rounded-lg text-sm whitespace-nowrap transition
                      ${active
                        ? 'bg-sky-600 text-white shadow font-semibold'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{c.label}</span>
                    <span className={`text-[10px] ${active ? 'bg-sky-700' : 'bg-white'} px-1.5 rounded`}>
                      {c.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Products grid */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {visible.map((p) => {
                const Icon = p.icon;
                const c = ACCENTS[p.color];
                return (
                  <button
                    key={p.id}
                    onClick={() => addItem(p)}
                    className="aspect-square rounded-lg border border-slate-200 bg-white p-3 flex flex-col items-center justify-between hover:shadow-lifted hover:-translate-y-0.5 hover:border-sky-300 transition-all active:scale-95"
                  >
                    <div className={`h-12 w-12 rounded-lg ${c} grid place-items-center`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="text-center w-full">
                      <div className="text-xs font-semibold text-slate-900 truncate">{p.name}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 num-latin font-mono">{p.id}</div>
                      <div className="mt-1 text-sm font-bold text-sky-700 num-latin">{p.price.toLocaleString()}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* CART PANEL */}
        <section className="w-96 flex flex-col bg-slate-50">
          {/* Cart header */}
          <div className="p-3 border-b border-slate-200 bg-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-slate-700" />
                <h2 className="font-bold text-slate-900">السلة</h2>
                <span className="badge-brand">{cart.length} صنف</span>
              </div>
              <button
                onClick={() => setCart([])}
                className="text-xs text-rose-600 hover:underline flex items-center gap-1"
              >
                <Trash2 className="h-3 w-3" />
                إفراغ
              </button>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-amber-700" />
              <span className="text-amber-900 flex-1">العميل: <strong>عميل نقدي</strong></span>
              <button className="text-amber-700 hover:underline font-semibold">تغيير</button>
            </div>
          </div>

          {/* Cart lines */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cart.length === 0 && (
              <div className="text-center text-sm text-slate-500 py-12">السلة فارغة</div>
            )}
            {cart.map((l) => (
              <div key={l.id} className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">{l.name}</div>
                    <div className="text-[11px] text-slate-500 num-latin">{l.id} · {l.price.toLocaleString()} د.ع</div>
                  </div>
                  <button onClick={() => delItem(l.id)} className="h-6 w-6 grid place-items-center text-rose-500 hover:bg-rose-50 rounded">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 bg-slate-100 rounded">
                    <button onClick={() => decItem(l.id)} className="h-7 w-7 grid place-items-center hover:bg-slate-200 rounded-r">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="px-2 font-bold text-sm num-latin min-w-[2rem] text-center">{l.qty}</span>
                    <button onClick={() => incItem(l.id)} className="h-7 w-7 grid place-items-center hover:bg-slate-200 rounded-l">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="text-sm font-bold text-slate-900 num-latin">
                    {(l.qty * l.price).toLocaleString()} د.ع
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="p-3 border-t border-slate-200 bg-white space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>المجموع الفرعي</span>
              <span className="num-latin font-mono">{subtotal.toLocaleString()} د.ع</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>الضريبة</span>
              <span className="num-latin font-mono">{tax.toLocaleString()} د.ع</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>الخصم</span>
              <span className="num-latin font-mono">0 د.ع</span>
            </div>
            <div className="border-t border-slate-200 pt-2 flex justify-between text-base font-bold">
              <span>الإجمالي</span>
              <span className="text-sky-700 text-xl num-latin font-mono">{total.toLocaleString()} د.ع</span>
            </div>
          </div>

          {/* Pay buttons */}
          <div className="p-3 border-t border-slate-200 bg-white grid grid-cols-3 gap-2">
            <button className="h-12 rounded-lg bg-emerald-600 text-white flex flex-col items-center justify-center gap-0.5 hover:bg-emerald-700 shadow">
              <Banknote className="h-5 w-5" />
              <span className="text-[11px] font-semibold">نقدي F9</span>
            </button>
            <button className="h-12 rounded-lg bg-sky-600 text-white flex flex-col items-center justify-center gap-0.5 hover:bg-sky-700 shadow">
              <CreditCard className="h-5 w-5" />
              <span className="text-[11px] font-semibold">شبكة F10</span>
            </button>
            <button className="h-12 rounded-lg bg-violet-600 text-white flex flex-col items-center justify-center gap-0.5 hover:bg-violet-700 shadow">
              <Smartphone className="h-5 w-5" />
              <span className="text-[11px] font-semibold">محفظة</span>
            </button>
          </div>

          <button className="m-3 mt-0 h-14 rounded-xl bg-slate-900 text-white text-lg font-bold flex items-center justify-center gap-2 hover:bg-slate-800 shadow-lifted">
            <Receipt className="h-5 w-5" />
            إتمام البيع وطباعة (F12)
          </button>
        </section>
      </div>
    </div>
  );
}
