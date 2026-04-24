'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useCartStore } from '@/lib/cart-store';
import { CartDrawer } from './cart-drawer';
import { isLoggedIn } from '@/lib/auth';

export function Header() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [mounted, setMounted] = useState(false);

  const count = useCartStore((s) => s.items.reduce((sum, i) => sum + i.qty, 0));

  useEffect(() => {
    setMounted(true);
    setLoggedIn(isLoggedIn());
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    router.push(`/search?q=${encodeURIComponent(term)}`);
  }

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 h-16 flex items-center gap-4">
          {/* Logo – right side in RTL */}
          <Link
            href="/"
            className="text-2xl font-bold text-sky-700 shrink-0"
            aria-label="الرؤيا"
          >
            الرؤيا
          </Link>

          {/* Search */}
          <form onSubmit={onSubmit} className="flex-1 max-w-xl mx-4">
            <div className="relative">
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ابحث عن منتج…"
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 pr-10 text-right text-sm focus:outline-none focus:border-sky-600 focus:bg-white"
              />
              <button
                type="submit"
                aria-label="بحث"
                className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-sky-700"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
            </div>
          </form>

          <nav className="flex items-center gap-3 shrink-0">
            <Link
              href="/categories"
              className="hidden md:inline text-sm text-gray-700 hover:text-sky-700"
            >
              الأقسام
            </Link>

            {mounted && loggedIn ? (
              <Link
                href="/account"
                className="text-sm text-gray-700 hover:text-sky-700"
              >
                حسابي
              </Link>
            ) : (
              <Link
                href="/login"
                className="text-sm text-gray-700 hover:text-sky-700"
              >
                تسجيل الدخول
              </Link>
            )}

            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="السلة"
              className="relative p-2 rounded-lg hover:bg-gray-100"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              {mounted && count > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-xs rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center font-semibold">
                  {count}
                </span>
              )}
            </button>
          </nav>
        </div>
      </header>

      <CartDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
