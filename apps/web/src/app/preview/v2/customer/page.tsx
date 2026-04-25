'use client';

import { useState } from 'react';
import {
  Home, ChevronLeft, Edit, Printer, Send, Trash2, Star,
  Phone, Mail, MapPin, Building2, CreditCard, Calendar,
  TrendingUp, ShoppingCart, FileText, MessageSquare,
  ShoppingBag, Package, Landmark, Users, Hammer, Handshake,
  Megaphone, BarChart3, MoreHorizontal, ChevronDown, Plus,
} from 'lucide-react';

const APPS = [
  { key: 'sales',     icon: ShoppingCart, color: 'sky' },
  { key: 'pos',       icon: CreditCard,   color: 'emerald' },
  { key: 'inventory', icon: Package,      color: 'amber' },
  { key: 'purchases', icon: ShoppingBag,  color: 'violet' },
  { key: 'finance',   icon: Landmark,     color: 'rose' },
  { key: 'assets',    icon: Building2,    color: 'teal' },
  { key: 'hr',        icon: Users,        color: 'cyan',     active: true },
  { key: 'jobs',      icon: Hammer,       color: 'orange' },
  { key: 'crm',       icon: Handshake,    color: 'indigo' },
  { key: 'marketing', icon: Megaphone,    color: 'pink' },
  { key: 'reports',   icon: BarChart3,    color: 'yellow' },
];

const TABS = [
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'invoices', label: 'الفواتير', count: 28 },
  { key: 'payments', label: 'المدفوعات', count: 12 },
  { key: 'returns',  label: 'المرتجعات', count: 2 },
  { key: 'docs',     label: 'المستندات' },
  { key: 'activity', label: 'النشاط' },
  { key: 'notes',    label: 'الملاحظات' },
];

export default function CustomerDetailPreview() {
  const [tab, setTab] = useState('overview');

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
          <span className="text-slate-600">العملاء</span>
          <ChevronLeft className="h-3 w-3 text-slate-300" />
          <span className="font-semibold text-slate-900">شركة الميسرة</span>
        </nav>
        <div className="flex-1" />
        <button className="btn btn-secondary btn-sm">
          <Edit className="h-3.5 w-3.5" />
          تعديل
        </button>
        <button className="btn btn-secondary btn-sm">
          <Printer className="h-3.5 w-3.5" />
          طباعة
        </button>
        <button className="btn btn-primary btn-sm">
          <Plus className="h-3.5 w-3.5" />
          فاتورة جديدة
        </button>
        <button className="h-8 w-8 grid place-items-center rounded hover:bg-slate-100">
          <MoreHorizontal className="h-4 w-4 text-slate-600" />
        </button>
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
        <main className="flex-1 overflow-y-auto">

          {/* Customer header card */}
          <div className="bg-gradient-to-l from-sky-700 to-sky-600 text-white px-6 py-5">
            <div className="flex items-start gap-5">
              <div className="h-20 w-20 rounded-2xl bg-white/15 backdrop-blur grid place-items-center text-4xl font-bold shadow-lifted ring-4 ring-white/20">
                م
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold">شركة الميسرة للتجارة العامة</h1>
                  <span className="badge bg-yellow-400/20 text-yellow-100 border border-yellow-400/30">
                    <Star className="h-3 w-3 fill-yellow-300 text-yellow-300" />
                    عميل ذهبي
                  </span>
                </div>
                <div className="text-sm text-sky-100 flex items-center gap-4 flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" />
                    رقم العميل: <span className="font-mono num-latin font-semibold">CUST-0024</span>
                  </span>
                  <span>·</span>
                  <span>تاريخ الانضمام: <span className="num-latin">2024-03-15</span></span>
                  <span>·</span>
                  <span>المسؤول: <strong>أحمد علي</strong></span>
                </div>
              </div>
              <div className="text-end">
                <div className="text-xs text-sky-200">الرصيد الحالي</div>
                <div className="text-3xl font-bold num-latin font-mono mt-1">2,450,000</div>
                <div className="text-xs text-sky-100 mt-0.5">د.ع · حد الائتمان: <span className="num-latin">5,000,000</span></div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white border-b border-slate-200 px-5 flex items-center overflow-x-auto sticky top-0 z-10 shadow-sm">
            {TABS.map((t) => {
              const active = t.key === tab;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`h-11 px-4 flex items-center gap-2 text-sm whitespace-nowrap border-b-2 transition
                    ${active
                      ? 'border-sky-600 text-sky-700 font-semibold'
                      : 'border-transparent text-slate-600 hover:text-slate-900'}`}
                >
                  {t.label}
                  {t.count !== undefined && (
                    <span className={`text-[10px] px-1.5 rounded num-latin font-mono ${active ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'}`}>
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content — Overview */}
          {tab === 'overview' && (
            <div className="p-5 grid lg:grid-cols-3 gap-4">

              {/* Left: Contact & Details */}
              <div className="lg:col-span-1 space-y-4">

                <Card title="معلومات الاتصال">
                  <Field icon={Phone}    label="الهاتف"     value="+964 770 123 4567" copy />
                  <Field icon={Phone}    label="هاتف ثاني"  value="+964 750 555 1234" />
                  <Field icon={Mail}     label="البريد"     value="info@maysara-trade.iq" copy />
                  <Field icon={MessageSquare} label="واتساب" value="+964 770 123 4567" />
                  <Field icon={MapPin}   label="العنوان"    value="بغداد - الكرادة - شارع الرواد - مجمّع الخالدية" />
                </Card>

                <Card title="المعلومات الضريبية">
                  <Field label="الرقم الضريبي" value="IQ-7842156" mono />
                  <Field label="نوع التعامل" value="تاجر جملة" />
                  <Field label="فئة العميل" value="ذهبي" />
                  <Field label="شروط الدفع" value="آجل 30 يوم" />
                </Card>

                <Card title="إحصائيات سريعة">
                  <Field label="مجموع المشتريات" value="48,500,000 د.ع" highlight />
                  <Field label="عدد الفواتير" value="28" />
                  <Field label="متوسط الفاتورة" value="1,732,000 د.ع" />
                  <Field label="آخر شراء" value="منذ 5 أيام" />
                </Card>
              </div>

              {/* Right: KPIs + Recent activity */}
              <div className="lg:col-span-2 space-y-4">

                {/* KPIs */}
                <div className="grid grid-cols-3 gap-3">
                  <KpiBox icon={ShoppingCart} color="sky"     label="مبيعات هذا الشهر" value="3,250,000" trend="+12%" />
                  <KpiBox icon={CreditCard}   color="emerald" label="مدفوعات الشهر"    value="1,800,000" trend="+5%" />
                  <KpiBox icon={TrendingUp}   color="amber"   label="متأخرات"          value="650,000"   trend="عاجل" />
                </div>

                {/* Recent invoices */}
                <Card title="آخر الفواتير" action="عرض الكل ←">
                  <div className="-m-5">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-2 text-start text-xs font-semibold">الرقم</th>
                          <th className="px-4 py-2 text-start text-xs font-semibold">التاريخ</th>
                          <th className="px-4 py-2 text-end text-xs font-semibold">المبلغ</th>
                          <th className="px-4 py-2 text-start text-xs font-semibold">الحالة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { num: 'INV-2401', date: '2026-04-25', amt: 1250000, st: 'مرحَّلة', c: 'success' },
                          { num: 'INV-2389', date: '2026-04-20', amt: 850000,  st: 'مدفوعة', c: 'info' },
                          { num: 'INV-2376', date: '2026-04-15', amt: 1750000, st: 'مرحَّلة', c: 'success' },
                          { num: 'INV-2362', date: '2026-04-08', amt: 320000,  st: 'مرتجعة', c: 'warning' },
                        ].map((r) => (
                          <tr key={r.num} className="border-b border-slate-100 hover:bg-slate-50 last:border-0">
                            <td className="px-4 py-2.5 font-mono text-sky-700 font-semibold num-latin">{r.num}</td>
                            <td className="px-4 py-2.5 num-latin text-slate-600 text-xs font-mono">{r.date}</td>
                            <td className="px-4 py-2.5 text-end num-latin font-mono font-semibold">{r.amt.toLocaleString()}</td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs border ${r.c === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : r.c === 'info' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                {r.st}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* Activity timeline */}
                <Card title="النشاط الأخير">
                  <div className="space-y-3">
                    {[
                      { t: 'فاتورة جديدة', d: 'INV-2401 — مبلغ 1,250,000 د.ع', time: 'قبل ساعتين',     icon: FileText, color: 'sky' },
                      { t: 'دفعة مستلمة',  d: '850,000 د.ع نقداً',              time: 'قبل 5 أيام',    icon: CreditCard, color: 'emerald' },
                      { t: 'مكالمة',       d: 'متابعة طلب جديد — أحمد',        time: 'قبل أسبوع',     icon: Phone, color: 'amber' },
                      { t: 'بريد إلكتروني',d: 'إرسال عرض سعر',                 time: 'قبل 10 أيام',   icon: Mail, color: 'violet' },
                    ].map((a, i) => {
                      const Icon = a.icon;
                      return (
                        <div key={i} className="flex gap-3">
                          <div className={`h-8 w-8 rounded-full grid place-items-center shrink-0 ${a.color === 'sky' ? 'bg-sky-100 text-sky-700' : a.color === 'emerald' ? 'bg-emerald-100 text-emerald-700' : a.color === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700'}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 pb-3 border-b border-slate-100 last:border-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-slate-900">{a.t}</span>
                              <span className="text-xs text-slate-500">{a.time}</span>
                            </div>
                            <div className="text-xs text-slate-600 mt-0.5">{a.d}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {tab !== 'overview' && (
            <div className="p-12 text-center text-slate-500">
              <div className="text-lg mb-2">📋 محتوى التبويب: {TABS.find(t => t.key === tab)?.label}</div>
              <div className="text-xs">هذا تبويب مماثل في النمط — ارجع للنظرة العامة</div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-lg border border-slate-200 shadow-sm">
      <div className="px-5 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {action && <button className="text-xs text-sky-700 hover:underline">{action}</button>}
      </div>
      <div className="p-5 space-y-3">{children}</div>
    </section>
  );
}

function Field({ icon: Icon, label, value, copy, mono, highlight }: { icon?: any; label: string; value: string; copy?: boolean; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      {Icon && <Icon className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-500">{label}</div>
        <div className={`text-sm mt-0.5 truncate ${highlight ? 'font-bold text-slate-900' : 'text-slate-800'} ${mono ? 'font-mono num-latin' : ''}`}>
          {value}
        </div>
      </div>
      {copy && <button className="text-xs text-sky-600 hover:underline shrink-0">نسخ</button>}
    </div>
  );
}

function KpiBox({ icon: Icon, color, label, value, trend }: { icon: any; color: string; label: string; value: string; trend: string }) {
  const map: Record<string, string> = {
    sky:     'bg-sky-50 text-sky-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber:   'bg-amber-50 text-amber-700',
  };
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
      <div className={`h-8 w-8 rounded ${map[color]} grid place-items-center mb-2`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-900 num-latin font-mono mt-0.5">{value}</div>
      <div className="text-[10px] text-slate-500 mt-1">د.ع · {trend}</div>
    </div>
  );
}
