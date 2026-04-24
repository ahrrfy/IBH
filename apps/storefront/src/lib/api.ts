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

// ─── Storefront-specific endpoints ────────────────────────────────────────────

export async function listProducts(params: { page?: number; categoryId?: string; search?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.page)       qs.set('page', String(params.page));
  if (params.categoryId) qs.set('categoryId', params.categoryId);
  if (params.search)     qs.set('search', params.search);
  return api(`/products?${qs.toString()}`);
}

export async function getProduct(id: string) {
  return api(`/products/${id}`);
}

export async function listCategories() {
  return api(`/products/categories`);
}

export async function lookupBarcode(code: string) {
  return api(`/products/barcode/${encodeURIComponent(code)}`);
}

export async function createOrder(order: {
  customerPhone: string;
  customerName: string;
  deliveryAddress: string;
  lines: Array<{ variantId: string; qty: number }>;
  paymentMethod: string;
}) {
  return api(`/sales/orders`, { method: 'POST', body: JSON.stringify(order) });
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
