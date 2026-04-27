import Link from 'next/link';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { ProductCard } from '@/components/product-card';
import {
  listProducts,
  listCategories,
  type PublicProductList,
  type PublicCategoryNode,
} from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Public products listing — main catalog browsing page (T54).
 * Filters: category sidebar + search + price range, pagination.
 */
export default async function ProductsListPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    categoryId?: string;
    q?: string;
    minPrice?: string;
    maxPrice?: string;
    sort?: string;
  }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const categoryId = sp.categoryId;
  const search = (sp.q ?? '').trim() || undefined;
  const minPrice = sp.minPrice ? Number(sp.minPrice) : undefined;
  const maxPrice = sp.maxPrice ? Number(sp.maxPrice) : undefined;

  let products: PublicProductList = { items: [], total: 0, page: 1, pageSize: 24, pages: 1 };
  let categories: PublicCategoryNode[] = [];
  let loadError: string | null = null;

  try {
    const [list, cats] = await Promise.all([
      listProducts({ page, categoryId, search, minPrice, maxPrice }),
      listCategories(),
    ]);
    products = list;
    categories = cats;
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'تعذر تحميل المنتجات';
  }

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      page:       String(page),
      categoryId,
      q:          search,
      minPrice:   minPrice != null ? String(minPrice) : undefined,
      maxPrice:   maxPrice != null ? String(maxPrice) : undefined,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
    return `/products?${qs.toString()}`;
  };

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 text-right">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">جميع المنتجات</h1>

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm mb-6">
            {loadError}
          </div>
        )}

        <div className="grid lg:grid-cols-[260px_1fr] gap-6">
          {/* Sidebar */}
          <aside className="bg-white rounded-lg border border-gray-100 p-4 h-fit">
            <h2 className="font-semibold text-gray-900 mb-3 text-sm">الأقسام</h2>
            <ul className="space-y-1">
              <li>
                <Link
                  href={buildHref({ categoryId: undefined, page: '1' })}
                  className={`block text-sm px-2 py-1.5 rounded ${!categoryId ? 'bg-sky-50 text-sky-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  كل الأقسام
                </Link>
              </li>
              {categories.filter((c) => c.level === 0).map((c) => (
                <li key={c.id}>
                  <Link
                    href={buildHref({ categoryId: c.id, page: '1' })}
                    className={`block text-sm px-2 py-1.5 rounded ${categoryId === c.id ? 'bg-sky-50 text-sky-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    {c.nameAr}
                  </Link>
                </li>
              ))}
            </ul>

            <form action="/products" className="mt-5 pt-4 border-t border-gray-100 space-y-2">
              {categoryId && <input type="hidden" name="categoryId" value={categoryId} />}
              <label className="block text-xs text-gray-600">السعر من</label>
              <input
                type="number"
                name="minPrice"
                defaultValue={minPrice ?? ''}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              />
              <label className="block text-xs text-gray-600">السعر إلى</label>
              <input
                type="number"
                name="maxPrice"
                defaultValue={maxPrice ?? ''}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              />
              <button
                type="submit"
                className="w-full bg-sky-700 hover:bg-sky-800 text-white py-1.5 rounded-md text-sm font-medium"
              >
                تطبيق
              </button>
            </form>
          </aside>

          {/* Grid */}
          <section>
            <p className="text-sm text-gray-600 mb-4">{products.total} منتج</p>

            {!loadError && products.items.length === 0 && (
              <div className="text-center py-16 text-gray-500">
                <div className="text-5xl mb-4">🔍</div>
                <p>لا توجد منتجات</p>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.items.map((p) => (
                <ProductCard key={p.id} id={p.id} nameAr={p.name} price={p.priceIqd} imageUrl={p.imageUrl} />
              ))}
            </div>

            {products.pages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                {page > 1 && (
                  <Link href={buildHref({ page: String(page - 1) })} className="px-4 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50">
                    السابق
                  </Link>
                )}
                <span className="text-sm text-gray-600">صفحة {page} من {products.pages}</span>
                {page < products.pages && (
                  <Link href={buildHref({ page: String(page + 1) })} className="px-4 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50">
                    التالي
                  </Link>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
