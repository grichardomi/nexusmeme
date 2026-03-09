import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

/**
 * Edge middleware — protects all dashboard and API routes server-side.
 * Unauthenticated requests are redirected to /auth/signin before any
 * client-side code runs, closing the window where useSession() alone
 * guarded private pages.
 */
export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;
    const isApiRoute = pathname.startsWith('/api/');

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
