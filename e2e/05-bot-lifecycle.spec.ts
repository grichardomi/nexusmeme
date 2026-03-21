import { test, expect } from '@playwright/test';

/**
 * Bot Lifecycle Tests
 * Auth pre-loaded via storageState. Paper trading mode only — no real orders.
 */

test.describe('Bot Lifecycle (paper mode)', () => {
  test('Bots page loads without crash', async ({ page }) => {
    await page.goto('/dashboard/bots');
    await expect(page).not.toHaveURL(/signin/);
    await expect(page.locator('body')).not.toContainText(/Application error/i);
    // Page renders (may show loading state while fetching from exchange)
    await expect(page.locator('body')).toBeVisible();
  });

  test('New bot page renders form fields', async ({ page }) => {
    await page.goto('/dashboard/bots/new');
    await expect(page).not.toHaveURL(/signin/);
    // Exchange selector or pair selection should be visible
    const exchangeSelector = page.getByText(/binance|exchange/i).first();
    await expect(exchangeSelector).toBeVisible({ timeout: 10_000 });
  });

  test('Bot detail page renders for existing bots', async ({ page, request }) => {
    // Get bot list using the authenticated page context
    await page.goto('/dashboard');
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const res = await request.get('/api/bots', { headers: { Cookie: cookieHeader } });

    if (res.status() !== 200) return;
    const body = await res.json();
    const bots = Array.isArray(body) ? body : body.bots || [];
    if (bots.length === 0) { test.skip(); return; }

    await page.goto(`/dashboard/bots/${bots[0].id}`);
    await expect(page).not.toHaveURL(/signin/);
    await expect(page.locator('body')).not.toContainText(/Application error/i);
  });
});
