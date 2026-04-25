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
    const root = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
    // API errors are wrapped: { success: false, error: { code, messageAr, errors }, meta }
    // Some legacy paths return flat: { code, messageAr, message }
    const errObj = (root.error && typeof root.error === 'object' ? root.error : root) as Record<string, unknown>;

    // Build a useful Arabic message — include validation field details when present
    let msg =
      (errObj.messageAr as string) ||
      (errObj.message as string) ||
      `خطأ ${response.status}`;

    if (errObj.errors && typeof errObj.errors === 'object') {
      const fieldErrors = Object.entries(errObj.errors as Record<string, unknown>)
        .map(([f, m]) => `${f}: ${Array.isArray(m) ? m.join(', ') : m}`)
        .join(' · ');
      if (fieldErrors) msg = `${msg} (${fieldErrors})`;
    }

    throw new ApiError({
      code: (errObj.code as string) || `HTTP_${response.status}`,
      messageAr: msg,
      status: response.status,
      details: errObj,
    });
  }

  // Some legacy endpoints wrap success too: { success: true, data: {...} }
  // Unwrap if we see that shape, otherwise return as-is.
  if (payload && typeof payload === 'object' && (payload as any).success === true && 'data' in (payload as any)) {
    return (payload as any).data as T;
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
  name?: string;
  nameAr?: string;
  nameEn?: string;
  roles?: string[];
  role?: string;
  companyId?: string;
  branchId?: string | null;
  branchNameAr?: string | null;
  avatarUrl?: string | null;
  requires2FA?: boolean;
  isSystemOwner?: boolean;
}

export interface LoginSuccessResponse {
  accessToken: string;
  refreshToken?: string;
  token?: string;            // legacy alias
  user: AuthUser;
}

export interface MfaChallengeResponse {
  requires2FA: true;
  mfaToken: string;
  userId: string;
  hint: string;
}

export type LoginResponse = LoginSuccessResponse | MfaChallengeResponse;

// ── Persistent device ID (UUID v4 stored in localStorage) ─────────────────
const DEVICE_KEY = 'al-ruya.deviceId';

export function getDeviceId(): string {
  if (typeof window === 'undefined') return '00000000-0000-4000-8000-000000000000';
  let id = window.localStorage.getItem(DEVICE_KEY);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    id = (window.crypto?.randomUUID?.() ?? generateUuidV4());
    window.localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function generateUuidV4(): string {
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Step 1 of login. Returns either a full session OR an MFA challenge.
 * Caller checks `'requires2FA' in res` to branch.
 */
export async function login(emailOrUsername: string, password: string): Promise<LoginResponse> {
  const res = await api<LoginResponse>('/auth/login', {
    method: 'POST',
    body: {
      emailOrUsername: emailOrUsername.trim(),
      password,
      deviceId: getDeviceId(),
    },
    skipAuth: true,
  });
  if ('accessToken' in res && res.accessToken) setToken(res.accessToken);
  else if ('token' in res && (res as any).token) setToken((res as any).token);
  return res;
}

/**
 * Step 2 of login (only when MFA required).
 * Exchange mfaToken + 6-digit TOTP code for full session.
 */
export async function verifyMfaLogin(mfaToken: string, code: string): Promise<LoginSuccessResponse> {
  const res = await api<LoginSuccessResponse>('/auth/2fa/verify-login', {
    method: 'POST',
    body: { mfaToken, code },
    skipAuth: true,
  });
  if (res.accessToken) setToken(res.accessToken);
  return res;
}

// ── 2FA management (authenticated) ────────────────────────────────────────
export async function setupTotp(): Promise<{ secret: string; otpauthUrl: string; qrDataUrl: string }> {
  return api('/auth/2fa/setup', { method: 'POST' });
}

export async function confirmTotp(code: string): Promise<{ backupCodes: string[] }> {
  return api('/auth/2fa/confirm', { method: 'POST', body: { code } });
}

export async function disableTotp(password: string, code?: string): Promise<void> {
  return api('/auth/2fa/disable', { method: 'POST', body: { password, code } });
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
