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
}): Promise<{ id: string; number: string; total: number; status: string; trackUrl: string }> {
  return api(`/public/orders`, { method: 'POST', body: JSON.stringify(order) });
}

// ─── Order + auth helpers (appended for M15 storefront) ──────────────────────

export async function getOrder(id: string) {
  return api(`/sales/orders/${id}`);
}

export async function getMyOrders() {
  return api(`/sales/orders?mine=1`);
}

export async function requestOtp(phone: string) {
  return api(`/auth/otp/request`, {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export async function verifyOtp(phone: string, code: string) {
  return api(`/auth/otp/verify`, {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  });
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
