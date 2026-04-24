import Link from 'next/link';

const modules = [
  { href: '/sales',     label: 'المبيعات',   icon: '🛒', color: 'bg-sky-100 text-sky-800' },
  { href: '/pos',       label: 'نقطة البيع', icon: '💳', color: 'bg-emerald-100 text-emerald-800' },
  { href: '/inventory', label: 'المخزون',    icon: '📦', color: 'bg-amber-100 text-amber-800' },
  { href: '/purchases', label: 'المشتريات',  icon: '📥', color: 'bg-purple-100 text-purple-800' },
  { href: '/finance',   label: 'المالية',    icon: '🏦', color: 'bg-rose-100 text-rose-800' },
  { href: '/hr',        label: 'الموارد',    icon: '👥', color: 'bg-teal-100 text-teal-800' },
  { href: '/crm',       label: 'العملاء',    icon: '🤝', color: 'bg-indigo-100 text-indigo-800' },
  { href: '/reports',   label: 'التقارير',   icon: '📊', color: 'bg-yellow-100 text-yellow-800' },
];

export default function DashboardHome() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-12">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">الرؤية العربية</h1>
        <p className="text-slate-600">لوحة الإدارة الرئيسية — اختر وحدة للبدء</p>
      </header>

      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-5">
        {modules.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className={`${m.color} rounded-xl p-6 shadow-sm hover:shadow-md transition text-right`}
          >
            <div className="text-4xl mb-3">{m.icon}</div>
            <div className="font-bold text-xl">{m.label}</div>
          </Link>
        ))}
      </div>

      <section className="mt-16 grid md:grid-cols-3 gap-6">
        <StatsCard label="مبيعات اليوم" value="—" hint="يتحدَّث من API" />
        <StatsCard label="الطلبات المفتوحة" value="—" hint="SalesOrder status=confirmed" />
        <StatsCard label="مخزون تحت نقطة الطلب" value="—" hint="من alerts/low-stock" />
      </section>
    </main>
  );
}

function StatsCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="text-sm text-slate-500 mb-1">{label}</div>
      <div className="text-3xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-400 mt-2">{hint}</div>
    </div>
  );
}
