'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { customerLogout, getCustomerToken } from '@/lib/customer-auth';

const NAV = [
  { href: '/account', labelAr: 'الملف الشخصي' },
  { href: '/account/orders', labelAr: 'طلباتي' },
  { href: '/account/loyalty', labelAr: 'نقاط الولاء' },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getCustomerToken();
    if (!token) {
      const next = encodeURIComponent(pathname || '/account');
      router.replace(`/account/login?next=${next}`);
      return;
    }
    setReady(true);
  }, [pathname, router]);

  // Login page is mounted under /account but excluded from the protected shell.
  if (pathname?.startsWith('/account/login')) {
    return <>{children}</>;
  }

  function onLogout() {
    customerLogout();
    router.push('/');
  }

  if (!ready) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-5xl px-4 py-10">
          <div className="h-40 bg-gray-100 rounded-lg animate-pulse" />
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-8 text-right">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">حسابي</h1>
          <button
            type="button"
            onClick={onLogout}
            className="text-sm text-red-600 hover:underline"
          >
            تسجيل الخروج
          </button>
        </div>

        <nav className="flex gap-2 mb-6 overflow-x-auto" aria-label="حسابي">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${
                  active
                    ? 'bg-sky-700 text-white'
                    : 'bg-white border border-gray-200 text-gray-700 hover:border-sky-500'
                }`}
              >
                {item.labelAr}
              </Link>
            );
          })}
        </nav>

        {children}
      </main>
      <Footer />
    </>
  );
}
