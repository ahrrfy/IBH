// Typed API client for Al-Ruya ERP Admin Web
// Adds bearer token from localStorage, normalizes errors, handles 401 redirects.

export class ApiError extends Error {
  code: string;
  messageAr: string;
  status: number;
  details?: unknown;

  constructor(opts: { code: string; messageAr: string; status: number; details?: unknown }) {
    super(opts.messageAr || opts.code);
    this.name = 'ApiError';
    this.code = opts.code;
    this.messageAr = opts.messageAr;
    this.status = opts.status;
    this.details = opts.details;
  }
}

const TOKEN_KEY = 'al-ruya.token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export interface ApiRequestInit extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  skipAuth?: boolean;
}

function buildUrl(path: string, query?: ApiRequestInit['query']): string {
  const base = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export async function api<T = unknown>(path: string, opts: ApiRequestInit = {}): Promise<T> {
  const { body, query, skipAuth, headers, ...rest } = opts;
  const url = buildUrl(path, query);

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(headers as Record<string, string> | undefined),
  };

  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  if (!skipAuth) {
    const token = getToken();
    if (token) finalHeaders['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: finalHeaders,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
  } catch (err) {
    throw new ApiError({
      code: 'NETWORK_ERROR',
      messageAr: 'تعذّر الاتصال بالخادم، يرجى التحقق من الشبكة',
      status: 0,
      details: err,
    });
  }

  if (response.status === 401 && !skipAuth) {
    setToken(null);
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new ApiError({
      code: 'UNAUTHORIZED',
      messageAr: 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً',
      status: 401,
    });
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : await response.text().catch(() => null);

  if (!response.ok) {
    const errPayload = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
    throw new ApiError({
      code: (errPayload.code as string) || `HTTP_${response.status}`,
      messageAr:
        (errPayload.messageAr as string) ||
        (errPayload.message as string) ||
        'حدث خطأ أثناء معالجة الطلب',
      status: response.status,
      details: errPayload,
    });
  }

  return payload as T;
}

export const get  = <T = unknown>(path: string, query?: ApiRequestInit['query']) =>
  api<T>(path, { method: 'GET', query });

export const post = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body });

export const put  = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PUT', body });

export const del  = <T = unknown>(path: string) =>
  api<T>(path, { method: 'DELETE' });

// Auth helpers
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  branchId?: string;
  avatarUrl?: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await api<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuth: true,
  });
  if (res.token) setToken(res.token);
  return res;
}

export async function me(): Promise<AuthUser> {
  return api<AuthUser>('/auth/me', { method: 'GET' });
}

export async function logout(): Promise<void> {
  try {
    await api('/auth/logout', { method: 'POST' });
  } finally {
    setToken(null);
  }
}
