'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { useCartStore } from '@/lib/cart-store';
import { formatIqd } from '@/lib/format';

interface Variant {
  id: string;
  color?: string | null;
  size?: string | null;
  price?: number | null;
  stock?: number | null;
}

interface Props {
  id: string;
  nameAr: string;
  descriptionAr: string;
  price: number;
  images: string[];
  variants: Variant[];
}

export function ProductDetailClient({ id, nameAr, descriptionAr, price, images, variants }: Props) {
  const add = useCartStore((s) => s.add);

  const colors = useMemo(
    () => Array.from(new Set(variants.map((v) => v.color).filter(Boolean))) as string[],
    [variants],
  );
  const sizes = useMemo(
    () => Array.from(new Set(variants.map((v) => v.size).filter(Boolean))) as string[],
    [variants],
  );

  const [imgIdx, setImgIdx] = useState(0);
  const [color, setColor] = useState<string | undefined>(colors[0]);
  const [size, setSize] = useState<string | undefined>(sizes[0]);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const selectedVariant = useMemo(() => {
    if (variants.length === 0) return null;
    return (
      variants.find(
        (v) =>
          (!color || v.color === color) &&
          (!size || v.size === size),
      ) ?? variants[0]
    );
  }, [variants, color, size]);

  const effectivePrice = selectedVariant?.price ?? price;
  const stock = selectedVariant?.stock ?? null;
  const outOfStock = stock !== null && stock <= 0;

  const mainImage = images[imgIdx];

  function handleAdd() {
    add({
      variantId: selectedVariant?.id ?? id,
      productId: id,
      name: nameAr,
      price: effectivePrice,
      qty,
      image: mainImage,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  }

  return (
    <div className="grid md:grid-cols-2 gap-8">
      {/* Gallery */}
      <div>
        <div className="relative aspect-square rounded-lg bg-gray-100 overflow-hidden">
          {mainImage ? (
            <Image src={mainImage} alt={nameAr} fill sizes="(max-width:768px) 100vw, 50vw" className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-6xl">🛍️</div>
          )}
        </div>
        {images.length > 1 && (
          <div className="mt-3 grid grid-cols-5 gap-2">
            {images.map((src, i) => (
              <button
                key={src + i}
                type="button"
                onClick={() => setImgIdx(i)}
                aria-label={`صورة ${i + 1}`}
                className={`relative aspect-square rounded-md overflow-hidden border ${
                  i === imgIdx ? 'border-sky-700 ring-2 ring-sky-200' : 'border-gray-200'
                }`}
              >
                <Image src={src} alt="" fill sizes="80px" className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{nameAr}</h1>
        <div className="mt-3 text-2xl font-bold text-sky-700">{formatIqd(effectivePrice)}</div>

        {stock !== null && (
          <p className={`mt-2 text-sm ${outOfStock ? 'text-red-600' : 'text-green-700'}`}>
            {outOfStock ? 'غير متوفر حالياً' : `متوفر (${stock})`}
          </p>
        )}

        {colors.length > 0 && (
          <div className="mt-5">
            <div className="text-sm font-semibold text-gray-700 mb-2">اللون</div>
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`px-3 py-1.5 text-sm rounded-md border transition ${
                    color === c
                      ? 'border-sky-700 bg-sky-50 text-sky-700 font-semibold'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {sizes.length > 0 && (
          <div className="mt-5">
            <div className="text-sm font-semibold text-gray-700 mb-2">المقاس</div>
            <div className="flex flex-wrap gap-2">
              {sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  className={`px-3 py-1.5 text-sm rounded-md border transition ${
                    size === s
                      ? 'border-sky-700 bg-sky-50 text-sky-700 font-semibold'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5">
          <div className="text-sm font-semibold text-gray-700 mb-2">الكمية</div>
          <div className="inline-flex items-center border border-gray-300 rounded-md">
            <button
              type="button"
              onClick={() => setQty((q) => q + 1)}
              className="px-3 py-2 text-gray-600 hover:bg-gray-50"
              aria-label="زيادة"
            >
              +
            </button>
            <span className="px-4 py-2 text-sm font-medium">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="px-3 py-2 text-gray-600 hover:bg-gray-50"
              aria-label="إنقاص"
            >
              −
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={handleAdd}
            disabled={outOfStock}
            className="flex-1 md:flex-none bg-sky-700 hover:bg-sky-800 disabled:bg-gray-400 text-white font-semibold px-6 py-3 rounded-lg shadow-sm transition"
          >
            أضف للسلة
          </button>
          {added && (
            <span className="text-sm text-green-700 font-medium">تمت الإضافة ✓</span>
          )}
        </div>

        {descriptionAr && (
          <div className="mt-8 border-t border-gray-200 pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">الوصف</h2>
            <p className="text-gray-700 leading-7 whitespace-pre-line">{descriptionAr}</p>
          </div>
        )}
      </div>
    </div>
  );
}
