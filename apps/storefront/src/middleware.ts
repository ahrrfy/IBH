import { NextRequest, NextResponse } from 'next/server';

/**
 * Protect customer-only routes. We mirror the localStorage token to a cookie
 * named `al_ruya_token` in `src/lib/auth.ts` so middleware can gate SSR.
 */

const PROTECTED_PREFIXES = ['/account', '/checkout'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const token = req.cookies.get('al_ruya_token')?.value;
  if (token) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/account/:path*', '/checkout/:path*'],
};
