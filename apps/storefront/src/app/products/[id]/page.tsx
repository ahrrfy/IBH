import { notFound } from 'next/navigation';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { getProduct, type PublicProductDetail } from '@/lib/api';
import { ProductDetailClient } from './product-detail-client';

export const dynamic = 'force-dynamic';
// Mild ISR-style cache: stock changes are reflected within 60s without
// hammering the public API. T54 spec: SSR with revalidate=60.
export const revalidate = 60;

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let product: PublicProductDetail | null = null;
  try {
    product = await getProduct(id);
  } catch {
    notFound();
  }

  if (!product) notFound();

  const variants = product.variants.map((v) => {
    const attrs = (v.attributeValues ?? {}) as Record<string, string>;
    return {
      id:    v.id,
      color: attrs['اللون'] ?? attrs['Color'] ?? null,
      size:  attrs['المقاس'] ?? attrs['Size']  ?? null,
      price: null,
      stock: v.stock,
    };
  });

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 text-right">
        <ProductDetailClient
          id={product.id}
          nameAr={product.name}
          descriptionAr={product.description ?? ''}
          price={product.priceIqd}
          images={product.images}
          variants={variants}
        />
      </main>
      <Footer />
    </>
  );
}
