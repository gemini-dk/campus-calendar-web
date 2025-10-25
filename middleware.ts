import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const TARGET_DOMAIN = 'campus-calendar.jp';
const IGNORED_SUBDOMAINS = new Set(['', 'www']);

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const [hostname] = host.split(':');

  if (!hostname.endsWith(TARGET_DOMAIN)) {
    return NextResponse.next();
  }

  const segments = hostname.split('.');

  if (segments.length <= 2) {
    return NextResponse.next();
  }

  const subdomain = segments.slice(0, segments.length - 2).join('.');

  if (IGNORED_SUBDOMAINS.has(subdomain)) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;

  if (pathname === '/calendars' || pathname === '/calendars/') {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/calendars/${subdomain}`;

    return NextResponse.rewrite(rewriteUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/calendars', '/calendars/'],
};
