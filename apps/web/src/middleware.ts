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
];

const TOKEN_COOKIE = 'al-ruya.token';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const protectedMatch = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
  if (!protectedMatch) return NextResponse.next();

  const hasToken =
    Boolean(req.cookies.get(TOKEN_COOKIE)?.value) ||
    Boolean(req.headers.get('authorization'));

  if (!hasToken) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
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
  ],
};
