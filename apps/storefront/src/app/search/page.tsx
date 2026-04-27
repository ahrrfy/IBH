import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { ProductCard } from '@/components/product-card';
import { listProducts, type PublicProductList } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const page = Math.max(1, Number(sp.page) || 1);

  let resp: PublicProductList = { items: [], total: 0, page: 1, pageSize: 24, pages: 1 };
  let loadError: string | null = null;

  if (q) {
    try {
      resp = await listProducts({ search: q, page });
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'تعذر البحث';
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 text-right">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">نتائج البحث</h1>
        {q ? (
          <p className="text-sm text-gray-600 mb-6">
            عن: <span className="font-semibold">{q}</span> — {resp.total} نتيجة
          </p>
        ) : (
          <p className="text-sm text-gray-600 mb-6">الرجاء إدخال كلمة للبحث</p>
        )}

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm mb-4">
            {loadError}
          </div>
        )}

        {q && !loadError && resp.items.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <div className="text-5xl mb-4">🔍</div>
            <p>لا توجد نتائج</p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {resp.items.map((p) => (
            <ProductCard
              key={p.id}
              id={p.id}
              nameAr={p.name}
              price={p.priceIqd}
              imageUrl={p.imageUrl}
            />
          ))}
        </div>

        {resp.pages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            {page > 1 && (
              <a
                href={`/search?q=${encodeURIComponent(q)}&page=${page - 1}`}
                className="px-4 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50"
              >
                السابق
              </a>
            )}
            <span className="text-sm text-gray-600">
              صفحة {page} من {resp.pages}
            </span>
            {page < resp.pages && (
              <a
                href={`/search?q=${encodeURIComponent(q)}&page=${page + 1}`}
                className="px-4 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50"
              >
                التالي
              </a>
            )}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
