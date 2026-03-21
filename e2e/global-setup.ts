import { chromium, FullConfig } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

/**
 * Global setup: authenticate once and save session state.
 * All tests reuse these stored cookies instead of logging in repeatedly.
 * This avoids hitting the auth rate limiter (5 req/min on /api/auth/check-credentials).
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL ?? 'http://localhost:3000';
  const browser = await chromium.launch();

  // --- Regular user session ---
  const userPage = await browser.newPage();
  await userPage.goto(`${baseURL}/auth/signin`);
  await userPage.locator('input[name="email"]').fill(process.env.E2E_TEST_EMAIL || 'e2e-test@nexusmeme.com');
  await userPage.locator('input[name="password"]').fill(process.env.E2E_TEST_PASSWORD || 'E2eTestPass123!');
  await userPage.locator('button[type="submit"]').click();
  await userPage.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await userPage.context().storageState({ path: 'e2e/.auth/user.json' });
  await userPage.close();

  // --- Admin user session ---
  const adminPage = await browser.newPage();
  await adminPage.goto(`${baseURL}/auth/signin`);
  await adminPage.locator('input[name="email"]').fill(process.env.E2E_ADMIN_EMAIL || 'e2e-admin@nexusmeme.com');
  await adminPage.locator('input[name="password"]').fill(process.env.E2E_ADMIN_PASSWORD || 'E2eAdminPass123!');
  await adminPage.locator('button[type="submit"]').click();
  await adminPage.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await adminPage.context().storageState({ path: 'e2e/.auth/admin.json' });
  await adminPage.close();

  await browser.close();
}
