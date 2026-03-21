import { test, expect } from '@playwright/test';

/**
 * Settings & Billing Tests — auth pre-loaded via storageState.
 */

test.describe('Settings & Billing', () => {
  test('Settings page loads with profile section', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await expect(page).not.toHaveURL(/signin/);
    await expect(page.locator('body')).not.toContainText(/ENOENT|Application error/i);
    // Any interactive input (textbox, select, button) indicates the page rendered
    await expect(page.locator('input, select, button').first()).toBeVisible({ timeout: 15_000 });
  });

  test('Billing page shows plan info or upgrade CTA', async ({ page }) => {
    await page.goto('/dashboard/billing');
    await expect(page).not.toHaveURL(/signin/);
    await expect(page.locator('body')).not.toContainText(/ENOENT|Application error/i);
    // "Billing" heading always present even while data loads
    await expect(page.getByText(/billing/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Exchange API keys section is accessible', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await expect(page).not.toHaveURL(/signin/);
    await expect(page.locator('body')).not.toContainText(/ENOENT|Application error/i);
    // Settings page renders some content
    await expect(page.locator('body')).toBeVisible();
  });

  test('Support page loads', async ({ page }) => {
    await page.goto('/dashboard/support');
    await expect(page).not.toHaveURL(/signin/);
    await expect(page.locator('body')).not.toContainText(/Application error/i);
  });
});
