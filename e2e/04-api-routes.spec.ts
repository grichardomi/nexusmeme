import { test, expect } from '@playwright/test';

/**
 * Critical API Route Tests
 * Unauthenticated tests use { storageState: undefined } to clear the default auth state.
 * Authenticated tests rely on the default storageState from playwright.config.ts.
 */

test.describe('API Routes (unauthenticated)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('GET /api/health → 200 healthy', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'healthy' });
  });

  test('GET /api/bots → 401 without session', async ({ request }) => {
    const res = await request.get('/api/bots');
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/bots/trades → 401 without session', async ({ request }) => {
    const res = await request.get('/api/bots/trades');
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('API Routes (authenticated)', () => {
  test('GET /api/bots returns bot list', async ({ page, request }) => {
    // Navigate first to ensure session cookies are set in the request context
    await page.goto('/dashboard');
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const res = await request.get('/api/bots', {
      headers: { Cookie: cookieHeader },
    });
    expect(res.status()).toBe(200);
  });

  test('GET /api/trades returns trade list', async ({ page, request }) => {
    await page.goto('/dashboard');
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const res = await request.get('/api/trades', {
      headers: { Cookie: cookieHeader },
    });
    expect([200, 204]).toContain(res.status());
  });

  test('GET /api/market-data/prices responds', async ({ page, request }) => {
    await page.goto('/dashboard');
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const res = await request.get('/api/market-data/prices', {
      headers: { Cookie: cookieHeader },
    });
    expect([200, 204, 400]).toContain(res.status());
  });
});
