'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCartStore } from '@/lib/cart-store';
import { formatIqd } from '@/lib/format';

export interface ProductCardProps {
  id: string;
  nameAr: string;
  price: number;
  imageUrl?: string | null;
  defaultVariantId?: string;
}

export function ProductCard({ id, nameAr, price, imageUrl, defaultVariantId }: ProductCardProps) {
  const add = useCartStore((s) => s.add);

  function onAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    add({
      variantId: defaultVariantId ?? id,
      productId: id,
      name: nameAr,
      price,
      qty: 1,
      image: imageUrl ?? undefined,
    });
  }

  return (
    <Link
      href={`/products/${id}`}
      className="group block bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden border border-gray-100"
    >
      <div className="relative aspect-square bg-gray-100">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={nameAr}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-4xl">
            🛍️
          </div>
        )}
      </div>

      <div className="p-3 text-right">
        <h3 className="text-sm font-medium text-gray-900 line-clamp-2 min-h-[2.5rem]">
          {nameAr}
        </h3>
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onAdd}
            className="text-xs bg-sky-700 hover:bg-sky-800 text-white px-3 py-1.5 rounded-md font-medium transition-colors"
          >
            أضف للسلة
          </button>
          <span className="text-sky-700 font-bold text-sm">{formatIqd(price)}</span>
        </div>
      </div>
    </Link>
  );
}
