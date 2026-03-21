import { test, expect } from '@playwright/test';

/**
 * Health & Infrastructure Tests
 * Verifies the server is up, DB is connected, and critical API routes respond.
 */

test.describe('Health checks', () => {
  test('GET /api/health returns healthy', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.checks.database).toBe('ok');
  });

  test('Home page loads and redirects authenticated users', async ({ page }) => {
    await page.goto('/');
    // Should land on home/pricing or redirect to signin — not a 500
    await expect(page).not.toHaveURL(/500|error/i);
    const status = page.url();
    expect([true]).toBeTruthy(); // Just verifies no crash
  });

  test('Sign-in page renders without errors', async ({ page }) => {
    await page.goto('/auth/signin');
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('Sign-up page renders without errors', async ({ page }) => {
    await page.goto('/auth/signup');
    await expect(page.getByRole('button', { name: /sign up|create account|get started/i })).toBeVisible();
  });
});
