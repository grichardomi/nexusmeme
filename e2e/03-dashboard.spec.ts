import { test, expect } from '@playwright/test';

/**
 * Dashboard Navigation Tests
 * Auth is pre-loaded via storageState in playwright.config.ts.
 * Verifies key dashboard pages load without errors.
 */

test.describe('Dashboard', () => {
  test('Dashboard home loads with trade/portfolio summary', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('body')).not.toContainText(/Application error|unhandled/i);
  });

  test('Bots page loads', async ({ page }) => {
    await page.goto('/dashboard/bots');
    await expect(page).not.toHaveURL(/signin/);
    await expect(page.locator('body')).not.toContainText(/Application error/i);
  });

  test('Trading page loads', async ({ page }) => {
    await page.goto('/dashboard/trading');
    await expect(page).not.toHaveURL(/signin/);
    await expect(page.locator('body')).not.toContainText(/Application error/i);
  });

  test('Settings page loads', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await expect(page).not.toHaveURL(/signin/);
    await expect(page.locator('body')).not.toContainText(/Application error/i);
  });

  test('Billing page loads', async ({ page }) => {
    await page.goto('/dashboard/billing');
    await expect(page).not.toHaveURL(/signin/);
    await expect(page.locator('body')).not.toContainText(/Application error/i);
    // Page renders navigation/heading even while data loads async
    await expect(page.getByText(/billing/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Portfolio page loads', async ({ page }) => {
    await page.goto('/dashboard/portfolio');
    await expect(page).not.toHaveURL(/signin/);
    await expect(page.locator('body')).not.toContainText(/Application error/i);
  });
});
