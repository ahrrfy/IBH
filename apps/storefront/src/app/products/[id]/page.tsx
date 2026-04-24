import { notFound } from 'next/navigation';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { getProduct } from '@/lib/api';
import { ProductDetailClient } from './product-detail-client';

interface Variant {
  id: string;
  color?: string | null;
  size?: string | null;
  price?: number | null;
  stock?: number | null;
}

interface Product {
  id: string;
  nameAr: string;
  descriptionAr?: string | null;
  price: number;
  images?: string[];
  imageUrl?: string | null;
  variants?: Variant[];
}

export const dynamic = 'force-dynamic';

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let product: Product | null = null;
  try {
    product = (await getProduct(id)) as Product;
  } catch {
    notFound();
  }

  if (!product) notFound();

  const images =
    product.images && product.images.length > 0
      ? product.images
      : product.imageUrl
        ? [product.imageUrl]
        : [];

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 text-right">
        <ProductDetailClient
          id={product.id}
          nameAr={product.nameAr}
          descriptionAr={product.descriptionAr ?? ''}
          price={product.price}
          images={images}
          variants={product.variants ?? []}
        />
      </main>
      <Footer />
    </>
  );
}
