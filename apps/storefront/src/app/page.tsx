import Link from 'next/link';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { ProductCard } from '@/components/product-card';
import {
  listProducts,
  listCategories,
  type PublicProductListItem,
  type PublicCategoryNode,
} from '@/lib/api';

export const dynamic = 'force-dynamic';
// Refresh featured selection every 5 min so newly-published items show up
// without a redeploy, but cache hot path for crawlers.
export const revalidate = 300;

/**
 * Storefront home — modern hero + featured categories + top products.
 * RTL-first, fully Arabic. Falls back to a minimal layout if the public
 * API is unavailable so the page never errors out for shoppers.
 */
export default async function HomePage() {
  let featured: PublicProductListItem[] = [];
  let topCategories: PublicCategoryNode[] = [];

  try {
    const [list, cats] = await Promise.all([
      listProducts({ page: 1, pageSize: 8 }),
      listCategories(),
    ]);
    featured = list.items;
    topCategories = cats.filter((c) => c.level === 0).slice(0, 6);
  } catch {
    // Silent fallback — keeps homepage online during API outage.
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gray-50">
        {/* Hero */}
        <section className="relative bg-gradient-to-bl from-sky-700 via-sky-800 to-slate-900 text-white overflow-hidden">
          <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(circle_at_30%_30%,white_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="relative mx-auto max-w-7xl px-6 py-20 md:py-28 text-center">
            <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-4">
              الرؤية العربية
            </h1>
            <p className="text-lg md:text-xl opacity-90 mb-8 max-w-2xl mx-auto">
              تسوّق بأمان · توصيل سريع لكل العراق · دفع مرن
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link
                href="/products"
                className="inline-block bg-amber-500 hover:bg-amber-600 text-white px-8 py-3 rounded-lg font-semibold shadow-lg transition"
              >
                تصفّح المنتجات
              </Link>
              <Link
                href="/categories"
                className="inline-block bg-white/10 hover:bg-white/20 backdrop-blur text-white px-8 py-3 rounded-lg font-semibold border border-white/20 transition"
              >
                عرض الأقسام
              </Link>
            </div>
          </div>
        </section>

        {/* Trust strip */}
        <section className="bg-white border-b border-gray-100">
          <div className="mx-auto max-w-7xl px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <Trust icon="🚚" title="توصيل لكل العراق" desc="بغداد · أربيل · البصرة · الموصل" />
            <Trust icon="💳" title="دفع متعدد"        desc="Zain Cash · FastPay · COD" />
            <Trust icon="↩️" title="إرجاع سهل"        desc="14 يوم بدون أسئلة" />
            <Trust icon="🔒" title="دفع آمن"          desc="SSL 256-bit · بياناتك محمية" />
          </div>
        </section>

        {/* Featured categories */}
        {topCategories.length > 0 && (
          <section className="py-14">
            <div className="mx-auto max-w-7xl px-6">
              <div className="flex items-baseline justify-between mb-6">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900">فئاتنا</h2>
                <Link href="/categories" className="text-sky-700 hover:text-sky-800 text-sm font-medium">
                  كل الأقسام ←
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                {topCategories.map((c) => (
                  <Link
                    key={c.id}
                    href={`/categories/${c.id}`}
                    className="bg-white rounded-xl shadow-sm hover:shadow-md transition p-5 text-center border border-gray-100 group"
                  >
                    <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">📦</div>
                    <div className="text-sm font-semibold text-gray-900">{c.nameAr}</div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Featured products */}
        {featured.length > 0 && (
          <section className="py-14 bg-white border-y border-gray-100">
            <div className="mx-auto max-w-7xl px-6">
              <div className="flex items-baseline justify-between mb-6">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900">المختارة لك</h2>
                <Link href="/products" className="text-sky-700 hover:text-sky-800 text-sm font-medium">
                  عرض الكل ←
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {featured.map((p) => (
                  <ProductCard
                    key={p.id}
                    id={p.id}
                    nameAr={p.name}
                    price={p.priceIqd}
                    imageUrl={p.imageUrl}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Empty state — when the API is unreachable or no products */}
        {featured.length === 0 && topCategories.length === 0 && (
          <section className="py-20">
            <div className="mx-auto max-w-2xl px-6 text-center text-gray-600">
              <div className="text-6xl mb-4">🛍️</div>
              <p className="text-lg font-semibold text-gray-900 mb-2">المتجر قيد التحضير</p>
              <p className="text-sm">سنعود قريباً بمنتجات رائعة لك.</p>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}

function Trust({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div>
      <div className="text-3xl mb-1">{icon}</div>
      <h3 className="font-bold text-sm text-gray-900">{title}</h3>
      <p className="text-gray-500 text-xs mt-1">{desc}</p>
    </div>
  );
}
