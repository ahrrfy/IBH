import Link from 'next/link';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { ProductCard } from '@/components/product-card';
import { listProducts, listCategories } from '@/lib/api';

interface Product {
  id: string;
  nameAr: string;
  price: number;
  imageUrl?: string | null;
  defaultVariantId?: string;
}

interface Category {
  id: string;
  nameAr: string;
}

interface ListResp {
  items: Product[];
  total: number;
  page: number;
  pages: number;
}

export const dynamic = 'force-dynamic';

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  let resp: ListResp = { items: [], total: 0, page: 1, pages: 1 };
  let category: Category | null = null;
  let loadError: string | null = null;

  try {
    const [list, cats] = await Promise.all([
      listProducts({ categoryId: id, page }) as Promise<ListResp>,
      listCategories() as Promise<Category[] | { items: Category[] }>,
    ]);
    resp = list;
    const catsArr = Array.isArray(cats) ? cats : cats.items ?? [];
    category = catsArr.find((c) => c.id === id) ?? null;
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'تعذر تحميل المنتجات';
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 text-right">
        <nav className="text-sm text-gray-500 mb-4">
          <Link href="/" className="hover:text-sky-700">الرئيسية</Link>
          <span className="mx-2">/</span>
          <Link href="/categories" className="hover:text-sky-700">الأقسام</Link>
          {category && (
            <>
              <span className="mx-2">/</span>
              <span className="text-gray-900">{category.nameAr}</span>
            </>
          )}
        </nav>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {category?.nameAr ?? 'منتجات القسم'}
        </h1>

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
            {loadError}
          </div>
        )}

        {!loadError && resp.items.length === 0 && (
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
              nameAr={p.nameAr}
              price={p.price}
              imageUrl={p.imageUrl}
              defaultVariantId={p.defaultVariantId}
            />
          ))}
        </div>

        {resp.pages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            {page > 1 && (
              <Link
                href={`/categories/${id}?page=${page - 1}`}
                className="px-4 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50"
              >
                السابق
              </Link>
            )}
            <span className="text-sm text-gray-600">
              صفحة {page} من {resp.pages}
            </span>
            {page < resp.pages && (
              <Link
                href={`/categories/${id}?page=${page + 1}`}
                className="px-4 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50"
              >
                التالي
              </Link>
            )}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
