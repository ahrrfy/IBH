import Link from 'next/link';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { listCategories, type PublicCategoryNode } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  let categories: PublicCategoryNode[] = [];
  let loadError: string | null = null;

  try {
    categories = await listCategories();
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'تعذر تحميل الأقسام';
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 text-right">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">جميع الأقسام</h1>

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
            {loadError}
          </div>
        )}

        {!loadError && categories.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <div className="text-5xl mb-4">📦</div>
            <p>لا توجد أقسام متاحة حالياً</p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/categories/${c.id}`}
              className="bg-white rounded-lg shadow-sm hover:shadow-md border border-gray-100 p-4 flex flex-col items-center text-center transition"
            >
              <div className="w-16 h-16 rounded-full bg-sky-50 flex items-center justify-center text-2xl mb-2">
                🏷️
              </div>
              <span className="text-sm font-medium text-gray-900">{c.nameAr}</span>
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
