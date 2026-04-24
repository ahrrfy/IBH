import Link from 'next/link';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-10">
          <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center text-green-600 mb-4">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">شكراً لك!</h1>
          <p className="text-gray-600 mb-1">تم استلام طلبك بنجاح وسنتواصل معك قريباً لتأكيد التوصيل.</p>
          {orderId && (
            <p className="text-sm text-gray-500 mt-3">
              رقم الطلب: <span className="font-mono font-semibold text-gray-900">{orderId}</span>
            </p>
          )}

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            {orderId && (
              <Link
                href={`/orders/${orderId}`}
                className="bg-sky-700 hover:bg-sky-800 text-white px-6 py-2.5 rounded-lg font-semibold"
              >
                تتبع الطلب
              </Link>
            )}
            <Link
              href="/"
              className="border border-gray-300 hover:bg-gray-50 text-gray-800 px-6 py-2.5 rounded-lg font-medium"
            >
              العودة للرئيسية
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
