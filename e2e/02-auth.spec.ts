import { test, expect } from '@playwright/test';

/**
 * Authentication Flow Tests
 * These tests explicitly test the login UI so they clear the default storageState.
 */

// All auth tests start without a session (override default storageState)
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication', () => {
  test('Unauthenticated user is redirected to signin', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/signin/);
  });

  test('Invalid credentials shows error', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.locator('input[name="email"]').fill('wrong@example.com');
    await page.locator('input[name="password"]').fill('WrongPass123!');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/signin/);
    const errorText = page.getByText(/invalid|incorrect|wrong|failed|error/i);
    await expect(errorText).toBeVisible({ timeout: 8_000 });
  });

  test('Password reset page is accessible', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await expect(page.getByRole('button', { name: /reset|send/i })).toBeVisible();
  });
});
