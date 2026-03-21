import { Page } from '@playwright/test';

export const TEST_USER = {
  email: process.env.E2E_TEST_EMAIL || 'e2e-test@nexusmeme.com',
  password: process.env.E2E_TEST_PASSWORD || 'E2eTestPass123!',
};

export const ADMIN_USER = {
  email: process.env.E2E_ADMIN_EMAIL || 'e2e-admin@nexusmeme.com',
  password: process.env.E2E_ADMIN_PASSWORD || 'E2eAdminPass123!',
};

/**
 * Sign in via the UI and wait for dashboard redirect.
 * Only needed in tests that override the default storageState
 * (e.g., to test sign-in UI itself, or to sign in as a different user).
 * Most tests get auth automatically via playwright.config.ts storageState.
 */
export async function signIn(page: Page, email = TEST_USER.email, password = TEST_USER.password) {
  await page.goto('/auth/signin');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

/**
 * Sign out via the API signout page.
 */
export async function signOut(page: Page) {
  await page.goto('/api/auth/signout');
  const confirmBtn = page.getByRole('button', { name: /sign out/i });
  if (await confirmBtn.isVisible()) {
    await confirmBtn.click();
  }
  await page.waitForURL(/\/auth\/signin|\//, { timeout: 10_000 });
}
