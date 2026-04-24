'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect } from 'react';
import { useCartStore } from '@/lib/cart-store';
import { formatIqd } from '@/lib/format';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CartDrawer({ open, onClose }: Props) {
  const items = useCartStore((s) => s.items);
  const remove = useCartStore((s) => s.remove);
  const updateQty = useCartStore((s) => s.updateQty);
  const total = useCartStore((s) => s.items.reduce((sum, i) => sum + i.price * i.qty, 0));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden={!open}
        className={`fixed inset-0 bg-black/40 z-50 transition-opacity ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer — slides from visual right in RTL */}
      <aside
        role="dialog"
        aria-label="سلة التسوق"
        className={`fixed top-0 right-0 h-full w-full sm:w-96 bg-white z-50 shadow-xl flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between px-4 h-14 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">سلة التسوق</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="p-2 rounded-md hover:bg-gray-100 text-gray-600"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <div className="text-5xl mb-4">🛒</div>
              <p className="text-sm">سلة التسوق فارغة</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {items.map((it) => (
                <li key={it.variantId} className="p-4 flex gap-3">
                  <div className="relative w-16 h-16 rounded-md bg-gray-100 overflow-hidden shrink-0">
                    {it.image ? (
                      <Image src={it.image} alt={it.name} fill sizes="64px" className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl">🛍️</div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 text-right">
                    <h3 className="text-sm font-medium text-gray-900 line-clamp-2">{it.name}</h3>
                    <p className="text-sky-700 font-semibold text-sm mt-1">
                      {formatIqd(it.price)}
                    </p>
                    <div className="mt-2 flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => remove(it.variantId)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        حذف
                      </button>
                      <div className="inline-flex items-center border border-gray-300 rounded-md">
                        <button
                          type="button"
                          onClick={() => updateQty(it.variantId, it.qty + 1)}
                          className="px-2 py-1 text-gray-600 hover:bg-gray-50"
                          aria-label="زيادة"
                        >
                          +
                        </button>
                        <span className="px-3 text-sm">{it.qty}</span>
                        <button
                          type="button"
                          onClick={() => updateQty(it.variantId, Math.max(0, it.qty - 1))}
                          className="px-2 py-1 text-gray-600 hover:bg-gray-50"
                          aria-label="إنقاص"
                        >
                          −
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <footer className="border-t border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">المجموع</span>
              <span className="text-sky-700 font-bold text-lg">{formatIqd(total)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/cart"
                onClick={onClose}
                className="text-center border border-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50"
              >
                عرض السلة
              </Link>
              <Link
                href="/checkout"
                onClick={onClose}
                className="text-center bg-sky-700 hover:bg-sky-800 text-white rounded-lg py-2 text-sm font-semibold"
              >
                إتمام الشراء
              </Link>
            </div>
          </footer>
        )}
      </aside>
    </>
  );
}
