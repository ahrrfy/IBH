/**
 * API client for storefront → backend communication.
 * All calls go through Next.js server actions or route handlers to keep
 * API_BASE_URL server-side only.
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

interface ApiOptions extends RequestInit {
  token?: string;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { token, headers, ...rest } = opts;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body?.error?.code ?? 'API_ERROR', body?.error?.messageAr ?? 'حدث خطأ', res.status);
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(public code: string, public messageAr: string, public status: number) {
    super(messageAr);
    this.name = 'ApiError';
  }
}

// ─── Storefront-specific endpoints (T54 — public, unauthenticated) ───────────
// All catalog + order endpoints live under /public/* and are tenant-scoped on
// the backend via STOREFRONT_COMPANY_ID.

export interface PublicProductListItem {
  id: string;
  slug: string;
  sku: string;
  name: string;
  nameEn?: string | null;
  priceIqd: number;
  imageUrl: string | null;
  images: string[];
  tags: string[];
  categoryId: string;
}

export interface PublicProductList {
  items: PublicProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface PublicProductVariant {
  id: string;
  sku: string;
  attributeValues: Record<string, string>;
  imageUrl: string | null;
  stock: number;
}

export interface PublicProductDetail {
  id: string;
  slug: string;
  sku: string;
  name: string;
  nameEn?: string | null;
  description?: string | null;
  priceIqd: number;
  images: string[];
  tags: string[];
  category: { id: string; nameAr: string; nameEn: string | null } | null;
  variants: PublicProductVariant[];
  totalStock: number;
  inStock: boolean;
}

export interface PublicCategoryNode {
  id: string;
  nameAr: string;
  nameEn: string | null;
  parentId: string | null;
  level: number;
  imageUrl: string | null;
}

export async function listProducts(
  params: { page?: number; pageSize?: number; categoryId?: string; search?: string; minPrice?: number; maxPrice?: number } = {},
): Promise<PublicProductList> {
  const qs = new URLSearchParams();
  if (params.page)       qs.set('page',       String(params.page));
  if (params.pageSize)   qs.set('pageSize',   String(params.pageSize));
  if (params.categoryId) qs.set('categoryId', params.categoryId);
  if (params.search)     qs.set('search',     params.search);
  if (params.minPrice != null) qs.set('minPrice', String(params.minPrice));
  if (params.maxPrice != null) qs.set('maxPrice', String(params.maxPrice));
  return api<PublicProductList>(`/public/products?${qs.toString()}`);
}

export async function getProduct(slug: string): Promise<PublicProductDetail> {
  return api<PublicProductDetail>(`/public/products/${encodeURIComponent(slug)}`);
}

export async function listCategories(): Promise<PublicCategoryNode[]> {
  return api<PublicCategoryNode[]>(`/public/categories/tree`);
}

export async function calculateCart(lines: Array<{ variantId: string; qty: number }>) {
  return api<{
    lines: Array<{ variantId: string; qty: number; name: string; image: string | null; unitPriceIqd: number; lineTotalIqd: number; available: boolean }>;
    subtotal: number;
    tax: number;
    total: number;
  }>(`/public/cart/calculate`, { method: 'POST', body: JSON.stringify({ lines }) });
}

export async function createOrder(order: {
  customerPhone:   string;
  customerName:    string;
  whatsapp?:       string;
  city:            string;
  deliveryAddress: string;
  notes?:          string;
  lines: Array<{ variantId: string; qty: number }>;
  paymentMethod: string;
}): Promise<{
  id:          string;
  number:      string;
  total:       number;
  status:      string;
  trackUrl:    string;
  // T55 — set when the order is online-channel and the lifecycle hook ran.
  trackingId?: string;
  paymentUrl?: string;
  qr?:         string;
}> {
  return api(`/public/orders`, { method: 'POST', body: JSON.stringify(order) });
}

// ─── T55 — Public order tracking by opaque trackingId ─────────────────────────
export interface PublicOrderStatus {
  orderNumber:    string;
  status:         string;
  paymentStatus:  string | null;
  paymentMethod:  string | null;
  totalIqd:       number;
  orderDate:      string;
  deliveryStatus: string | null;
  deliveryCity:   string | null;
  eta:            string | null;
  dispatchedAt:   string | null;
  deliveredAt:    string | null;
  waybill:        string | null;
}

export async function getPublicOrderStatus(trackingId: string) {
  return api<PublicOrderStatus>(`/public/orders/${encodeURIComponent(trackingId)}/status`);
}

// ─── Customer-portal helpers (T56) ────────────────────────────────────────────
// All portal endpoints live under /public/portal/* and require a customer JWT
// issued by /public/auth/verify-otp. The token is sent as a Bearer.

export async function requestOtp(phone: string) {
  return api<{ ok: true; devCode?: string }>(`/public/auth/request-otp`, {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export async function verifyOtp(phone: string, code: string) {
  return api<{ token: string; customer: { id: string; phone: string; nameAr: string } }>(
    `/public/auth/verify-otp`,
    { method: 'POST', body: JSON.stringify({ phone, code }) },
  );
}

export interface PortalCustomer {
  id: string;
  nameAr: string;
  nameEn: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  loyaltyPoints: number;
  loyaltyTier: string | null;
}

export async function getMe(token: string) {
  return api<PortalCustomer>(`/public/portal/me`, { token });
}

export async function updateMe(
  token: string,
  body: { nameAr?: string; email?: string; address?: string; city?: string },
) {
  return api<PortalCustomer>(`/public/portal/me`, {
    token,
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export interface PortalOrderListItem {
  id: string;
  number: string;
  status: string;
  createdAt: string;
  total: number;
  paymentStatus: string | null;
  paymentMethod: string | null;
  trackingId: string | null;
}

export async function getMyOrders(token: string, page = 1, pageSize = 20) {
  return api<{
    items: PortalOrderListItem[];
    total: number;
    page: number;
    pageSize: number;
    pages: number;
  }>(`/public/portal/orders?page=${page}&pageSize=${pageSize}`, { token });
}

export interface PortalOrderDetail {
  id: string;
  number: string;
  status: string;
  createdAt: string;
  total: number;
  subtotal: number;
  shipping: number;
  tax: number;
  paymentMethod: string | null;
  paymentStatus: string | null;
  trackingId: string | null;
  lines: Array<{ id: string; variantId: string; nameAr: string; qty: number; price: number; lineTotal: number }>;
  delivery: {
    status: string;
    deliveryCity: string | null;
    plannedDate: string | null;
    dispatchedAt: string | null;
    deliveredAt: string | null;
    externalWaybillNo: string | null;
  } | null;
}

export async function getMyOrder(token: string, id: string) {
  return api<PortalOrderDetail>(`/public/portal/orders/${encodeURIComponent(id)}`, { token });
}

export interface PortalLoyalty {
  points: number;
  tier: string | null;
  history: Array<{ id: string; number: string; date: string; earned: number; used: number; total: number }>;
}

export async function getMyLoyalty(token: string) {
  return api<PortalLoyalty>(`/public/portal/loyalty`, { token });
}

// Legacy helper kept for compatibility with components that still call it
// without auth (storefront tracking pages). Server-side order detail is
// authenticated; for the public flow, use getPublicOrderStatus().
export async function getOrder(id: string) {
  return api(`/public/portal/orders/${encodeURIComponent(id)}`);
}

// ─── Public delivery tracking (no auth) ───────────────────────────────────────

export interface PublicTracking {
  number: string;
  status:
    | 'pending_dispatch'
    | 'assigned'
    | 'in_transit'
    | 'delivered'
    | 'failed'
    | 'returned'
    | 'cancelled';
  deliveryCity: string | null;
  plannedDate: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  failureReason: string | null;
  externalWaybillNo: string | null;
  deliveryCompany: { nameAr: string; phone: string | null; whatsapp: string | null } | null;
  statusLogs: Array<{
    fromStatus: string | null;
    toStatus: string;
    changedAt: string;
    notes: string | null;
  }>;
}

export async function getPublicTracking(waybill: string) {
  return api<PublicTracking>(`/delivery/public/track/${encodeURIComponent(waybill)}`);
}
