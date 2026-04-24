'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4 text-right">
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 max-w-md text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">حدث خطأ غير متوقع</h1>
        <p className="text-sm text-gray-600 mb-5">
          {error.message || 'حصل خطأ أثناء تحميل الصفحة'}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={reset}
            className="bg-sky-700 hover:bg-sky-800 text-white px-5 py-2 rounded-lg text-sm font-semibold"
          >
            إعادة المحاولة
          </button>
          <Link
            href="/"
            className="border border-gray-300 hover:bg-gray-50 px-5 py-2 rounded-lg text-sm"
          >
            الرئيسية
          </Link>
        </div>
      </div>
    </main>
  );
}
