import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/sales',
  '/pos',
  '/inventory',
  '/purchases',
  '/finance',
  '/hr',
  '/crm',
  '/reports',
  '/settings',
  '/profile',
  '/super-admin',
  '/delivery',
  '/assets',
  '/job-orders',
  '/marketing',
  '/autopilot',
];

const TOKEN_COOKIE = 'al-ruya.token';

/**
 * T66 — paths that must remain reachable even when the company's
 * license is expired/suspended/missing. /license-required itself,
 * /login, and /forgot-password live here so a user can always sign in
 * and discover WHY they are blocked.
 */
const LICENSE_BYPASS_PREFIXES = [
  '/license-required',
  '/login',
  '/forgot-password',
];

/**
 * Statuses that grant entitlement. Anything else (`expired`,
 * `suspended`, `cancelled`, or `null`/missing) forces a redirect to
 * /license-required. This mirrors the API's LicenseGuard semantics.
 */
const ENTITLED_STATUSES = new Set(['active', 'trial', 'grace']);

/**
 * Internal API URL for server-to-server calls from middleware.
 * Priority: API_INTERNAL_URL (Docker-internal) > API_BASE_URL > fallback.
 * NEVER use NEXT_PUBLIC_API_URL here — it includes '/api' suffix and
 * goes through the public internet, causing double-/api and latency.
 */
const INTERNAL_API =
  process.env.API_INTERNAL_URL ??
  process.env.API_BASE_URL ??
  'http://localhost:3000';

interface LicenseSnapshot {
  status: string | null;
  validUntil: string | null;
  graceUntil: string | null;
}

/**
 * Fetch the licensing snapshot from the API using the user's bearer
 * token. Fails-OPEN on any error — a transient network blip must NOT
 * lock every user out of the app. The API's global LicenseGuard
 * remains the authoritative enforcement layer; this middleware only
 * exists so users see a dedicated page instead of a stack of 403s.
 */
async function fetchLicenseStatus(
  token: string,
): Promise<LicenseSnapshot | undefined> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${INTERNAL_API}/api/v1/licensing/me/features`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return undefined;
    return (await res.json()) as LicenseSnapshot;
  } catch {
    return undefined;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    LICENSE_BYPASS_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(p + '/'),
    )
  ) {
    return NextResponse.next();
  }

  const protectedMatch = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
  if (!protectedMatch) return NextResponse.next();

  const cookieToken = req.cookies.get(TOKEN_COOKIE)?.value;
  const authHeader = req.headers.get('authorization');
  const headerToken =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;
  const token = cookieToken ?? headerToken;

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // T66 — license enforcement layer (defense in depth).
  //
  // I059 — Fail-open on null status (greenfield installs have no Subscription
  // row yet; the API's LicenseGuard already short-circuits via
  // LICENSE_GUARD_DISABLED=1, so the web middleware must mirror that contract
  // or every protected route 307s to /license-required and the system is
  // unusable until an admin manually seeds a plan). Only EXPLICIT non-entitled
  // statuses (expired/suspended/cancelled) trigger the redirect now.
  const snapshot = await fetchLicenseStatus(token);
  if (
    snapshot &&
    snapshot.status &&
    !ENTITLED_STATUSES.has(snapshot.status)
  ) {
    const url = req.nextUrl.clone();
    url.pathname = '/license-required';
    url.searchParams.set('reason', snapshot.status);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/sales/:path*',
    '/pos/:path*',
    '/inventory/:path*',
    '/purchases/:path*',
    '/finance/:path*',
    '/hr/:path*',
    '/crm/:path*',
    '/reports/:path*',
    '/settings/:path*',
    '/profile/:path*',
    '/super-admin/:path*',
    '/delivery/:path*',
    '/assets/:path*',
    '/job-orders/:path*',
    '/marketing/:path*',
    '/autopilot/:path*',
  ],
};
