import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

/**
 * Edge middleware — protects all dashboard and API routes server-side.
 * Unauthenticated requests are redirected to /auth/signin before any
 * client-side code runs, closing the window where useSession() alone
 * guarded private pages.
 *
 * Internal server-to-server calls (orchestrator → trade close, cron jobs) are
 * allowed through via x-internal-secret header to avoid blocking trade execution.
 */
export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;
    const isApiRoute = pathname.startsWith('/api/');

    // Allow internal server-to-server calls (orchestrator trade closes, cron triggers)
    // These run on the server and cannot carry a user JWT session
    const internalSecret = req.headers.get('x-internal-secret');
    if (internalSecret && internalSecret === process.env.CRON_SECRET) {
      return NextResponse.next();
    }

    // Public billing endpoints — accessible without auth for landing/pricing/help pages
    if (pathname === '/api/billing/fee-rate/default' || pathname === '/api/billing/trial-days' || pathname === '/api/billing/flat-fee') {
      return NextResponse.next();
    }

    // Unauthenticated — API routes get 401 JSON, page routes redirect to signin
    if (!token) {
      if (isApiRoute) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const url = req.nextUrl.clone();
      url.pathname = '/auth/signin';
      url.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(url);
    }

    // Admin-only routes
    if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
      if (token.role !== 'admin') {
        if (isApiRoute) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        const url = req.nextUrl.clone();
        url.pathname = '/dashboard';
        return NextResponse.redirect(url);
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // Always run the middleware function above — handle auth logic there
      authorized: () => true,
    },
    pages: {
      signIn: '/auth/signin',
    },
  }
);

export const config = {
  matcher: [
    // Protected app routes
    '/dashboard/:path*',
    '/admin/:path*',
    // Protected API routes (exclude NextAuth and public auth endpoints)
    '/api/bots/:path*',
    '/api/trading/:path*',
    '/api/admin/:path*',
    '/api/billing/:path*',
    '/api/onboarding/:path*',
    '/api/email/:path*',
  ],
};
