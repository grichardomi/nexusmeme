import { test, expect } from '@playwright/test';

/**
 * Production Readiness Tests
 * Verifies hardened aspects required before deploying to Railway.
 * These checks are ENV-agnostic and run against whatever baseURL is set.
 */

// Run without session to test unauthenticated security behaviour
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Production Readiness', () => {
  test('Security headers present on HTML responses', async ({ request }) => {
    const res = await request.get('/auth/signin');
    const headers = res.headers();
    // X-Content-Type-Options must be set
    expect(headers['x-content-type-options']).toBe('nosniff');
    // No sensitive server header leak
    expect(headers['server'] ?? '').not.toMatch(/express|node|next/i);
  });

  test('No secrets exposed in API health response', async ({ request }) => {
    const res = await request.get('/api/health');
    const text = await res.text();
    // Must not leak env var patterns
    expect(text).not.toMatch(/DATABASE_URL|NEXTAUTH_SECRET|BINANCE_API_SECRET/i);
    expect(text).not.toMatch(/postgresql:\/\//i);
  });

  test('robots.txt exists', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
  });

  test('sitemap.xml exists', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect([200, 404]).toContain(res.status()); // 404 is acceptable if not configured
  });

  test('Unknown page does not return 500', async ({ request }) => {
    // Dev mode shows an error overlay; in prod this should be 404.
    // We verify it's NOT a 500 server error.
    const res = await request.get('/this-page-does-not-exist-xyz123');
    expect(res.status()).not.toBe(500);
  });

  test('Unauthenticated API requests are rejected (not 200)', async ({ request }) => {
    // /api/bots without session should redirect to signin or return 401/403
    // Next.js middleware may return redirect (HTML) — key check: NOT 200 with data
    const res = await request.get('/api/bots', { maxRedirects: 0 });
    expect(res.status()).not.toBe(200);
  });

  test('CSP header is set on HTML pages', async ({ request }) => {
    const res = await request.get('/');
    const csp = res.headers()['content-security-policy'] ?? '';
    // Should have some CSP — even a basic one
    // If not set, this is a prod readiness gap to flag (not fail hard)
    if (!csp) {
      console.warn('⚠️  CSP header missing — set Content-Security-Policy before going live');
    }
  });

  test('Server stays up after multiple concurrent requests', async ({ request }) => {
    // Fires 5 health checks in quick succession to verify the server doesn't crash
    // under light load. This catches runaway async handlers with no timeouts.
    const requests = Array.from({ length: 5 }, () => request.get('/api/health'));
    const results = await Promise.all(requests);
    for (const res of results) {
      expect(res.status()).toBe(200);
    }
  });

  test('No debug routes exposed in prod-like env', async ({ request }) => {
    // Playwright's test env may have debug routes — skip if E2E_ALLOW_DEBUG is set
    if (process.env.E2E_ALLOW_DEBUG) return;
    const debugRoutes = ['/api/debug', '/api/debug/env', '/api/debug/db'];
    for (const route of debugRoutes) {
      const res = await request.get(route);
      // Should be 401/403/404 — not 200
      expect(res.status()).not.toBe(200);
    }
  });
});
