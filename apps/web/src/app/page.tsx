import Link from 'next/link';
import {
  ShoppingCart, CreditCard, Package, ShoppingBag, Landmark,
  Users, Handshake, BarChart3, Building2, Hammer, Megaphone,
  ArrowLeft,
} from 'lucide-react';

const modules = [
  { href: '/sales/invoices',         label: 'المبيعات',       desc: 'الفواتير والطلبات وعروض الأسعار',     icon: ShoppingCart, accent: 'sky' },
  { href: '/pos/shifts',             label: 'نقطة البيع',     desc: 'الورديات والإيصالات والصندوق',         icon: CreditCard,   accent: 'emerald' },
  { href: '/inventory/stock',        label: 'المخزون',        desc: 'المنتجات والمستودعات والحركات',       icon: Package,      accent: 'amber' },
  { href: '/purchases/orders',       label: 'المشتريات',      desc: 'الموردون وأوامر الشراء والاستلام',    icon: ShoppingBag,  accent: 'violet' },
  { href: '/finance/journal-entries',label: 'المالية',        desc: 'القيود وميزان المراجعة والتقارير',    icon: Landmark,     accent: 'rose' },
  { href: '/assets',                 label: 'الأصول الثابتة', desc: 'الأصول والإهلاك والصيانة',             icon: Building2,    accent: 'teal' },
  { href: '/hr/employees',           label: 'الموارد البشرية',desc: 'الموظفون والرواتب والإجازات',          icon: Users,        accent: 'cyan' },
  { href: '/job-orders',             label: 'طلبات التصنيع',  desc: 'BOM والمراحل والتسليم',                icon: Hammer,       accent: 'orange' },
  { href: '/crm/leads',              label: 'العملاء',        desc: 'العملاء المحتملون والأنشطة',           icon: Handshake,    accent: 'indigo' },
  { href: '/marketing/promotions',   label: 'التسويق',        desc: 'العروض والحملات والقنوات',             icon: Megaphone,    accent: 'pink' },
  { href: '/reports',                label: 'التقارير',       desc: '17 تقريراً جاهزاً للعرض والتصدير',     icon: BarChart3,    accent: 'yellow' },
];

const ACCENTS: Record<string, { bg: string; text: string; border: string }> = {
  sky:     { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200/60' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200/60' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200/60' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200/60' },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200/60' },
  teal:    { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200/60' },
  cyan:    { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200/60' },
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200/60' },
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200/60' },
  pink:    { bg: 'bg-pink-50',    text: 'text-pink-700',    border: 'border-pink-200/60' },
  yellow:  { bg: 'bg-yellow-50',  text: 'text-yellow-700',  border: 'border-yellow-200/60' },
};

export default function DashboardHome() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      {/* ─── Hero ────────────────────────────────────────────────────────── */}
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-700 text-white text-2xl font-bold shadow-lifted">
              ر
            </div>
            <div>
              <h1 className="text-3xl font-bold text-ink-strong">الرؤية العربية</h1>
              <p className="text-sm text-ink-muted">نظام تخطيط الموارد المؤسسي · العراق</p>
            </div>
          </div>
        </div>
        <Link href="/login" className="btn-primary">
          الدخول إلى لوحة الإدارة
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </header>

      {/* ─── KPI Strip (live data later) ──────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-10">
        <Kpi label="مبيعات اليوم" value="—"   hint="من /api/v1/dashboards/executive" />
        <Kpi label="الطلبات المفتوحة" value="—" hint="SalesOrder قيد التنفيذ" />
        <Kpi label="ذمم مدينة" value="—"      hint="إجمالي الذمم النشطة" />
        <Kpi label="مخزون تحت نقطة الطلب" value="—" hint="تنبيهات إعادة الطلب" />
      </section>

      {/* ─── Modules grid ─────────────────────────────────────────────────── */}
      <section>
        <div className="section-header">
          <div>
            <h2 className="section-title">الوحدات</h2>
            <p className="section-subtitle">انقر على وحدة للوصول إلى شاشاتها</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {modules.map((m) => {
            const Icon = m.icon;
            const a = ACCENTS[m.accent];
            return (
              <Link
                key={m.href}
                href={m.href}
                className={`group relative card-padded hover:shadow-lifted transition-all duration-200 hover:-translate-y-0.5`}
              >
                <div className={`mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg ${a.bg} ${a.text}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-ink-strong text-base">{m.label}</h3>
                <p className="mt-1 text-xs text-ink-muted leading-relaxed">{m.desc}</p>
                <div className="absolute top-5 left-5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowLeft className="h-4 w-4 text-ink-subtle" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────────────────────────── */}
      <footer className="mt-16 border-t border-line pt-6 text-center text-xs text-ink-subtle">
        © {new Date().getFullYear()} الرؤية العربية للتجارة · جميع الحقوق محفوظة
      </footer>
    </main>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value num-latin">{value}</div>
      <div className="stat-hint">{hint}</div>
    </div>
  );
}
