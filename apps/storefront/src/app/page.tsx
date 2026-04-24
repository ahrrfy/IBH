import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="bg-gradient-to-b from-sky-700 to-sky-900 text-white">
        <div className="mx-auto max-w-7xl px-6 py-20 text-center">
          <h1 className="text-5xl font-bold mb-4">الرؤية العربية</h1>
          <p className="text-xl opacity-90 mb-8">تسوّق بأمان · توصيل سريع · دفع مرن</p>
          <Link
            href="/categories"
            className="inline-block bg-amber-500 text-white px-8 py-3 rounded-lg font-semibold hover:bg-amber-600 transition"
          >
            تصفَّح المنتجات
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-7xl px-6 grid md:grid-cols-4 gap-8 text-center">
          <Feature icon="🚚" title="توصيل لكل العراق" desc="بغداد · أربيل · البصرة · الموصل" />
          <Feature icon="💳" title="دفع متعدد" desc="Zain Cash · FastPay · Qi · COD" />
          <Feature icon="↩️" title="إرجاع سهل" desc="14 يوم بدون أسئلة" />
          <Feature icon="🔒" title="دفع آمن" desc="SSL 256-bit · بياناتك محمية" />
        </div>
      </section>

      {/* Categories Grid Placeholder */}
      <section className="py-16 bg-gray-50">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-3xl font-bold mb-8 text-center">فئاتنا</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6">
            {['قرطاسية', 'طباعة مخصصة', 'هدايا', 'إلكترونيات'].map((name) => (
              <Link
                key={name}
                href={`/categories/${encodeURIComponent(name)}`}
                className="block bg-white rounded-lg shadow hover:shadow-lg transition p-6 text-center"
              >
                <div className="text-4xl mb-3">📦</div>
                <div className="font-semibold text-lg">{name}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300 py-8 text-center">
        <p>© 2026 شركة الرؤية العربية للتجارة — العراق</p>
      </footer>
    </main>
  );
}

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div>
      <div className="text-5xl mb-3">{icon}</div>
      <h3 className="font-bold text-lg mb-2">{title}</h3>
      <p className="text-gray-600 text-sm">{desc}</p>
    </div>
  );
}
