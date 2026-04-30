import Link from 'next/link';
import {
  ShoppingCart, CreditCard, Package, ShoppingBag, Landmark,
  Users, Handshake, BarChart3, Building2, Hammer, Megaphone,
  ArrowLeft, Banknote, MapPin, ShieldCheck, FileSpreadsheet,
  Calculator, Clock, Sparkles, Check, Store, Factory, HardHat,
  Mail, Phone, ChevronLeft, Lock, Monitor, Wifi, TrendingUp,
  UserPlus, Settings, Rocket,
} from 'lucide-react';

/* ────────────────────────────────────────────────────────────────────────── */

const modules = [
  { label: 'المبيعات',        desc: 'الفواتير والطلبات وعروض الأسعار',    icon: ShoppingCart, accent: 'sky' },
  { label: 'نقطة البيع',      desc: 'الورديات والإيصالات والصندوق',        icon: CreditCard,   accent: 'emerald' },
  { label: 'المخزون',         desc: 'المنتجات والمستودعات والحركات',      icon: Package,      accent: 'amber' },
  { label: 'المشتريات',       desc: 'الموردون وأوامر الشراء والاستلام',   icon: ShoppingBag,  accent: 'violet' },
  { label: 'المالية',         desc: 'القيود وميزان المراجعة والتقارير',   icon: Landmark,     accent: 'rose' },
  { label: 'الأصول الثابتة',  desc: 'الأصول والإهلاك والصيانة',           icon: Building2,    accent: 'teal' },
  { label: 'الموارد البشرية', desc: 'الموظفون والرواتب والإجازات',        icon: Users,        accent: 'cyan' },
  { label: 'طلبات التصنيع',   desc: 'BOM والمراحل والتسليم',              icon: Hammer,       accent: 'orange' },
  { label: 'العملاء',         desc: 'العملاء المحتملون والأنشطة',         icon: Handshake,    accent: 'indigo' },
  { label: 'التسويق',         desc: 'العروض والحملات والقنوات',           icon: Megaphone,    accent: 'pink' },
  { label: 'التقارير',        desc: '17 تقريراً جاهزاً للعرض والتصدير',   icon: BarChart3,    accent: 'yellow' },
];

const ACCENTS: Record<string, { bg: string; text: string }> = {
  sky:     { bg: 'bg-sky-50',     text: 'text-sky-700' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-700' },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-700' },
  teal:    { bg: 'bg-teal-50',    text: 'text-teal-700' },
  cyan:    { bg: 'bg-cyan-50',    text: 'text-cyan-700' },
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-700' },
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-700' },
  pink:    { bg: 'bg-pink-50',    text: 'text-pink-700' },
  yellow:  { bg: 'bg-yellow-50',  text: 'text-yellow-700' },
};

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface">
      <StickyNav />
      <HeroSection />
      <TrustBar />
      <ProblemSection />
      <ModulesShowcase />
      <WhyAlRuya />
      <HowItWorks />
      <StatsSection />
      <IndustriesSection />
      <CtaBanner />
      <Footer />
    </div>
  );
}

/* ─── 1. Sticky Navigation ─────────────────────────────────────────────── */

function StickyNav() {
  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-line/50">
      <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 text-white text-lg font-bold shadow-soft">
            ر
          </div>
          <span className="text-lg font-bold text-ink-strong">الرؤية العربية</span>
        </div>

        <div className="hidden md:flex items-center gap-6 text-sm text-ink-muted">
          <a href="#features" className="hover:text-brand-700 transition-colors">الوحدات</a>
          <a href="#why" className="hover:text-brand-700 transition-colors">المميزات</a>
          <a href="#how" className="hover:text-brand-700 transition-colors">كيف يعمل</a>
          <a href="#contact" className="hover:text-brand-700 transition-colors">تواصل معنا</a>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/login" className="btn-ghost btn-sm hidden sm:inline-flex">
            تسجيل الدخول
          </Link>
          <Link href="/login" className="btn-primary btn-sm shadow-lifted">
            ابدأ الآن
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* ─── 2. Hero Section ──────────────────────────────────────────────────── */

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-slate-950 via-brand-900 to-brand-800">
      {/* Dot pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative mx-auto max-w-7xl px-6 py-24 lg:py-32">
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-4 py-1.5 text-sm text-white/80 mb-8 backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-brand-300" />
            نظام ERP متكامل مصمّم للسوق العراقي
          </div>

          <h1 className="text-display-sm lg:text-display-lg text-white leading-tight mb-6">
            نظامك المتكامل لإدارة{' '}
            <span className="text-brand-300">أعمالك في العراق</span>
          </h1>

          <p className="text-lg lg:text-xl text-white/70 leading-relaxed max-w-3xl mx-auto mb-10">
            من المبيعات إلى المحاسبة، من المخزون إلى الموارد البشرية — كل شيء
            في منصة واحدة بالدينار العراقي والدولار الأمريكي
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-brand-800 font-semibold px-8 h-14 text-base shadow-lifted hover:bg-brand-50 transition-all duration-200 hover:shadow-panel"
            >
              ابدأ تجربتك المجانية
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/30 text-white font-medium px-8 h-14 text-base hover:bg-white/10 transition-all duration-200 backdrop-blur-sm"
            >
              استكشف الوحدات
              <ChevronLeft className="h-5 w-5" />
            </a>
          </div>

          <div className="flex items-center justify-center gap-6 text-sm text-white/60">
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-emerald-400" />
              بدون بطاقة ائتمان
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-emerald-400" />
              إعداد في 5 دقائق
            </span>
            <span className="flex items-center gap-1.5 hidden sm:flex">
              <Check className="h-4 w-4 text-emerald-400" />
              دعم عربي كامل
            </span>
          </div>
        </div>

        {/* Dashboard Preview Mock */}
        <div className="mt-16 max-w-4xl mx-auto animate-float">
          <div className="rounded-2xl bg-white/[0.08] backdrop-blur-md border border-white/[0.15] p-4 shadow-panel">
            {/* Window chrome */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-400/60" />
                <div className="h-3 w-3 rounded-full bg-yellow-400/60" />
                <div className="h-3 w-3 rounded-full bg-green-400/60" />
              </div>
              <div className="flex-1 mx-8">
                <div className="h-6 rounded-md bg-white/10 max-w-xs mx-auto" />
              </div>
            </div>

            {/* Mock KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'مبيعات اليوم', value: '٤,٢٥٠,٠٠٠', color: 'bg-emerald-400/20 text-emerald-300' },
                { label: 'الطلبات النشطة', value: '٢٨', color: 'bg-sky-400/20 text-sky-300' },
                { label: 'ذمم مدينة', value: '١٢,٨٠٠,٠٠٠', color: 'bg-amber-400/20 text-amber-300' },
                { label: 'تنبيهات المخزون', value: '٣', color: 'bg-rose-400/20 text-rose-300' },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-lg bg-white/[0.06] border border-white/10 p-3">
                  <div className="text-[11px] text-white/50">{kpi.label}</div>
                  <div className={`mt-1 text-lg font-bold ${kpi.color.split(' ')[1]}`}>{kpi.value}</div>
                </div>
              ))}
            </div>

            {/* Mock table */}
            <div className="rounded-lg bg-white/[0.04] border border-white/10 overflow-hidden">
              <div className="grid grid-cols-4 gap-4 px-4 py-2 text-[11px] text-white/40 border-b border-white/10">
                <span>رقم الفاتورة</span>
                <span>العميل</span>
                <span>المبلغ</span>
                <span>الحالة</span>
              </div>
              {[
                { id: 'INV-001', client: 'شركة النور', amount: '٢,٥٠٠,٠٠٠ د.ع', status: 'مكتملة', statusColor: 'bg-emerald-400/20 text-emerald-300' },
                { id: 'INV-002', client: 'مؤسسة الرافدين', amount: '$1,200', status: 'قيد التنفيذ', statusColor: 'bg-amber-400/20 text-amber-300' },
                { id: 'INV-003', client: 'معمل الأمل', amount: '٧٥٠,٠٠٠ د.ع', status: 'جديدة', statusColor: 'bg-sky-400/20 text-sky-300' },
              ].map((row) => (
                <div key={row.id} className="grid grid-cols-4 gap-4 px-4 py-2.5 text-[11px] text-white/60 border-b border-white/[0.05] last:border-0">
                  <span className="num-latin">{row.id}</span>
                  <span>{row.client}</span>
                  <span className="num-latin">{row.amount}</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] w-fit ${row.statusColor}`}>
                    {row.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── 3. Trust Bar ─────────────────────────────────────────────────────── */

function TrustBar() {
  const items = [
    { icon: Lock, label: 'تشفير كامل للبيانات' },
    { icon: MapPin, label: 'مصمّم للسوق العراقي' },
    { icon: Monitor, label: 'سحابي + سطح مكتب' },
    { icon: Wifi, label: 'يعمل بدون إنترنت' },
  ];

  return (
    <section className="relative -mt-6 z-10">
      <div className="mx-auto max-w-5xl px-6">
        <div className="rounded-2xl bg-white shadow-lifted border border-line/50 px-6 py-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-0 lg:divide-x lg:divide-line divide-x-reverse">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center justify-center gap-3 px-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-semibold text-ink-strong">{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── 4. Problem Section ───────────────────────────────────────────────── */

function ProblemSection() {
  const problems = [
    {
      icon: FileSpreadsheet,
      title: 'بيانات متناثرة بلا رابط',
      desc: 'جداول Excel على أكثر من جهاز، ودفاتر يدوية، وWhatsApp للتنسيق — لا مصدر واحد للحقيقة ولا رؤية شاملة لأعمالك.',
    },
    {
      icon: Calculator,
      title: 'فوضى الدينار والدولار',
      desc: 'حسابات يومية بعملتين بدون ربط تلقائي — أخطاء في أسعار الصرف وتقارير مالية غير دقيقة تكلّفك أموالاً حقيقية.',
    },
    {
      icon: Clock,
      title: 'قرارات بالحدس لا بالأرقام',
      desc: 'تحتاج أياماً لتعرف وضعك المالي الحقيقي — بينما منافسوك يتخذون قراراتهم بضغطة زر.',
    },
  ];

  return (
    <section className="bg-surface-subtle py-20 lg:py-24 mt-12">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-14">
          <h2 className="text-display-sm text-ink-strong mb-3">
            التحديات التي تواجه الشركات العراقية يومياً
          </h2>
          <p className="text-ink-muted text-lg max-w-2xl mx-auto">
            هل تعاني من واحدة أو أكثر من هذه المشاكل؟ لست وحدك.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {problems.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="card-padded text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-50 text-danger-600">
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-bold text-ink-strong mb-2">{p.title}</h3>
                <p className="text-sm text-ink-muted leading-relaxed">{p.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── 5. Modules Showcase ──────────────────────────────────────────────── */

function ModulesShowcase() {
  return (
    <section id="features" className="py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-14">
          <div className="badge-brand mb-4 mx-auto">منظومة متكاملة</div>
          <h2 className="text-display-sm text-ink-strong mb-3">
            كل ما تحتاجه في مكان واحد
          </h2>
          <p className="text-ink-muted text-lg max-w-2xl mx-auto">
            ١١ وحدة مترابطة تعمل معاً بسلاسة — من نقطة البيع إلى القوائم المالية
          </p>
        </div>

        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {modules.map((m) => {
            const Icon = m.icon;
            const a = ACCENTS[m.accent];
            return (
              <div
                key={m.label}
                className="card-padded hover:shadow-lifted transition-shadow duration-200"
              >
                <div className={`mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl ${a.bg} ${a.text}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-ink-strong text-base">{m.label}</h3>
                <p className="mt-1 text-xs text-ink-muted leading-relaxed">{m.desc}</p>
              </div>
            );
          })}

          {/* Coming soon card */}
          <div className="rounded-xl border-2 border-dashed border-line-strong p-5 flex flex-col items-center justify-center text-center">
            <Sparkles className="h-8 w-8 text-ink-subtle mb-2" />
            <span className="text-sm font-semibold text-ink-muted">وحدات قادمة</span>
            <span className="text-xs text-ink-subtle mt-1">المزيد في الطريق...</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── 6. Why Al-Ruya ───────────────────────────────────────────────────── */

function WhyAlRuya() {
  const features = [
    {
      icon: Banknote,
      title: 'دعم الدينار والدولار',
      desc: 'تعامل بالدينار العراقي والدولار الأمريكي في نفس الفاتورة مع تحويل تلقائي.',
      points: [
        'فاتورة واحدة بعملتين مختلفتين',
        'أسعار صرف يومية قابلة للتحديث',
        'تقارير مالية بكل عملة على حدة أو مجمّعة',
      ],
    },
    {
      icon: MapPin,
      title: 'مصمّم خصيصاً للعراق',
      desc: 'واجهة عربية كاملة مع مراعاة خصوصيات السوق العراقي والبنية التحتية المحلية.',
      points: [
        'واجهة عربية RTL بالكامل بدون ترجمة آلية',
        'يتحمّل انقطاع الكهرباء والإنترنت',
        'تطبيق سطح مكتب يعمل offline',
      ],
    },
    {
      icon: ShieldCheck,
      title: 'أمان متعدد الطبقات',
      desc: 'حماية بيانات شركتك بأعلى معايير الأمان المستخدمة في الأنظمة البنكية.',
      points: [
        'تحقق بخطوتين (MFA) لكل مستخدم',
        'صلاحيات 7 مستويات لكل وحدة ولكل فرع',
        'سجل تدقيق كامل غير قابل للحذف أو التعديل',
      ],
    },
    {
      icon: BarChart3,
      title: 'تقارير فورية بضغطة زر',
      desc: 'اعرف وضع شركتك المالي والتشغيلي في أي لحظة بدون انتظار.',
      points: [
        '17+ تقرير جاهز يغطي كل جوانب العمل',
        'تصدير فوري إلى Excel و PDF',
        'لوحة مؤشرات تنفيذية حيّة تتحدث لحظياً',
      ],
    },
  ];

  return (
    <section id="why" className="bg-surface-subtle py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-14">
          <h2 className="text-display-sm text-ink-strong mb-3">
            لماذا الرؤية العربية؟
          </h2>
          <p className="text-ink-muted text-lg max-w-2xl mx-auto">
            ليس مجرد نظام ERP آخر — بل منصة بُنيت من الصفر لتناسب طريقة عملك
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="card-padded p-7">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-700">
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold text-ink-strong mb-2">{f.title}</h3>
                <p className="text-sm text-ink-muted leading-relaxed mb-4">{f.desc}</p>
                <ul className="space-y-2">
                  {f.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-ink">
                      <Check className="h-4 w-4 mt-0.5 shrink-0 text-success-600" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── 7. How It Works ──────────────────────────────────────────────────── */

function HowItWorks() {
  const steps = [
    {
      num: '١',
      icon: UserPlus,
      title: 'سجّل حسابك',
      desc: 'أنشئ حساب شركتك في دقائق معدودة — بدون تعقيد ولا بطاقة ائتمان.',
    },
    {
      num: '٢',
      icon: Settings,
      title: 'أعدّ بياناتك',
      desc: 'أضف منتجاتك وعملاءك وموردّيك — مع إعدادات ذكية تناسب أغلب الحالات.',
    },
    {
      num: '٣',
      icon: Rocket,
      title: 'ابدأ العمل',
      desc: 'أصدر فاتورتك الأولى وتابع أعمالك بكفاءة من أي مكان.',
    },
  ];

  return (
    <section id="how" className="py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-14">
          <h2 className="text-display-sm text-ink-strong mb-3">
            ابدأ في ثلاث خطوات بسيطة
          </h2>
          <p className="text-ink-muted text-lg max-w-2xl mx-auto">
            لا تحتاج فريقاً تقنياً ولا أسابيع إعداد — ابدأ اليوم
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3 relative">
          {/* Connecting line (desktop only) */}
          <div className="hidden md:block absolute top-12 left-[16.6%] right-[16.6%] h-0.5 border-t-2 border-dashed border-brand-200" />

          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.num} className="text-center relative">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand-700 text-white text-xl font-bold shadow-lifted relative z-10">
                  {s.num}
                </div>
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-ink-strong mb-2">{s.title}</h3>
                <p className="text-sm text-ink-muted leading-relaxed max-w-xs mx-auto">{s.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── 8. Stats Section ─────────────────────────────────────────────────── */

function StatsSection() {
  const stats = [
    { value: '11', label: 'وحدة متكاملة', sub: 'تغطي كل جوانب العمل' },
    { value: '17+', label: 'تقرير جاهز', sub: 'مالي وتشغيلي ومخزني' },
    { value: '2', label: 'عملة مدعومة', sub: 'IQD + USD' },
    { value: '24/7', label: 'دعم فني', sub: 'فريق عربي متخصص' },
  ];

  return (
    <section className="bg-gradient-to-r from-brand-900 to-slate-900 py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-6 grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl bg-white/[0.08] backdrop-blur-sm border border-white/[0.12] p-6 text-center"
            >
              <div className="text-4xl font-extrabold text-white num-latin mb-1">{s.value}</div>
              <div className="text-base font-semibold text-white/90 mb-1">{s.label}</div>
              <div className="text-xs text-white/50">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── 9. Industries Section ────────────────────────────────────────────── */

function IndustriesSection() {
  const industries = [
    {
      icon: Store,
      title: 'تجارة التجزئة والجملة',
      desc: 'نقطة بيع سريعة مع إدارة مخزون متعدد المستودعات وتوصيل.',
      badges: ['نقطة البيع', 'المخزون', 'المبيعات', 'التوصيل'],
    },
    {
      icon: Factory,
      title: 'التصنيع والإنتاج',
      desc: 'قوائم مواد (BOM) ومراحل تصنيع وحساب تكلفة المنتج التلقائي.',
      badges: ['طلبات التصنيع', 'المخزون', 'المشتريات', 'التكلفة'],
    },
    {
      icon: HardHat,
      title: 'المقاولات والخدمات',
      desc: 'إدارة الموظفين والرواتب مع تتبع مالي دقيق وعلاقات عملاء.',
      badges: ['الموارد البشرية', 'المالية', 'العملاء', 'التقارير'],
    },
  ];

  return (
    <section className="bg-surface-subtle py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-14">
          <h2 className="text-display-sm text-ink-strong mb-3">
            مصمّم لكل أنواع الأعمال
          </h2>
          <p className="text-ink-muted text-lg max-w-2xl mx-auto">
            مهما كان نوع نشاطك التجاري، الرؤية العربية تتكيّف مع احتياجاتك
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {industries.map((ind) => {
            const Icon = ind.icon;
            return (
              <div key={ind.title} className="card-padded p-7">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-bold text-ink-strong mb-2">{ind.title}</h3>
                <p className="text-sm text-ink-muted leading-relaxed mb-4">{ind.desc}</p>
                <div className="flex flex-wrap gap-2">
                  {ind.badges.map((b) => (
                    <span key={b} className="badge-brand">{b}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── 10. CTA Banner ───────────────────────────────────────────────────── */

function CtaBanner() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 px-8 py-16 text-center">
          {/* Background pattern */}
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          />

          <div className="relative">
            <h2 className="text-display-sm lg:text-display-md text-white mb-4">
              جاهز لتحويل طريقة إدارة أعمالك؟
            </h2>
            <p className="text-lg text-white/70 max-w-2xl mx-auto mb-8">
              انضمّ للشركات العراقية التي اختارت الرؤية العربية لتنظيم عملياتها وزيادة أرباحها
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-brand-800 font-semibold px-8 h-14 text-base shadow-lifted hover:bg-brand-50 transition-all duration-200 hover:shadow-panel"
            >
              ابدأ تجربتك المجانية الآن
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center justify-center gap-6 text-sm text-white/50 mt-6">
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-300" />
                إعداد سريع
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-300" />
                دعم عربي
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-300" />
                بدون التزام
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── 11. Footer ───────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer id="contact" className="bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Company */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 text-white text-lg font-bold">
                ر
              </div>
              <div>
                <div className="font-bold text-lg">الرؤية العربية</div>
                <div className="text-xs text-white/50">Al-Ruya ERP</div>
              </div>
            </div>
            <p className="text-sm text-white/60 leading-relaxed">
              نظام تخطيط موارد مؤسسي متكامل مصمّم خصيصاً للشركات العراقية.
              ملكية كاملة بدون اشتراكات خارجية.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-semibold text-white/90 mb-4">المنتج</h4>
            <ul className="space-y-2.5 text-sm text-white/50">
              <li><a href="#features" className="hover:text-white transition-colors">الوحدات</a></li>
              <li><a href="#why" className="hover:text-white transition-colors">المميزات</a></li>
              <li><a href="#how" className="hover:text-white transition-colors">كيف يعمل</a></li>
            </ul>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-white/90 mb-4">روابط سريعة</h4>
            <ul className="space-y-2.5 text-sm text-white/50">
              <li>
                <Link href="/login" className="hover:text-white transition-colors">
                  تسجيل الدخول
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-white transition-colors">
                  إنشاء حساب جديد
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-white/90 mb-4">تواصل معنا</h4>
            <ul className="space-y-3 text-sm text-white/50">
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-brand-400" />
                <span dir="ltr" className="num-latin">info@ibherp.cloud</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-brand-400" />
                <span dir="ltr" className="num-latin">+964 770 000 0000</span>
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-brand-400" />
                <span>بغداد، العراق</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-white/40">
            &copy; {new Date().getFullYear()} الرؤية العربية للتجارة &middot; جميع الحقوق محفوظة
          </p>
          <p className="text-xs text-white/30">
            صُنع بعناية في العراق
          </p>
        </div>
      </div>
    </footer>
  );
}
