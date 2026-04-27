import { redirect } from 'next/navigation';

/**
 * Legacy `/orders/:id` path — now lives under the protected portal at
 * `/account/orders/:id` (T56). Public order tracking continues via the
 * trackingId-based `/track/order/:trackingId` route.
 */
export default async function LegacyOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/account/orders/${id}`);
}
