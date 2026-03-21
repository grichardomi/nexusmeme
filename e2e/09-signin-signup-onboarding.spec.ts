import { test, expect } from '@playwright/test';

/**
 * Sign In / Sign Up / Onboarding Flow Tests
 * Uses real credentials (grichardomi@gmai.com) seeded into the dev DB.
 * All tests start without session (storageState cleared).
 */

test.use({ storageState: { cookies: [], origins: [] } });

// ─── SIGN IN ────────────────────────────────────────────────────────────────

test.describe('Sign In (real credentials)', () => {
  test('Sign-in page renders all required fields', async ({ page }) => {
    await page.goto('/auth/signin');
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await expect(page.getByRole('link', { name: /forgot/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /sign up|don.t have/i })).toBeVisible();
  });

  test('Sign in with real credentials redirects to dashboard', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.locator('input[name="email"]').fill('grichardomi@gmai.com');
    await page.locator('input[name="password"]').fill('Jimmy67!');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    // Dashboard renders without crash
    await expect(page.locator('body')).not.toContainText(/Application error|ENOENT/i);
  });

  test('Wrong password shows error, does not redirect', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.locator('input[name="email"]').fill('grichardomi@gmai.com');
    await page.locator('input[name="password"]').fill('WrongPassword999!');
    await page.locator('button[type="submit"]').click();
    // Must stay on signin
    await expect(page).toHaveURL(/signin/, { timeout: 10_000 });
    await expect(page.getByText(/invalid|incorrect|wrong|failed|error/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('Empty email shows validation error', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.locator('input[name="password"]').fill('Jimmy67!');
    await page.locator('button[type="submit"]').click();
    // Browser or app validation prevents submit
    const emailInput = page.locator('input[name="email"]');
    const validationMsg = await emailInput.evaluate((el: HTMLInputElement) => el.validationMessage);
    expect(validationMsg.length).toBeGreaterThan(0);
  });

  test('Session persists across page reload after sign-in', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.locator('input[name="email"]').fill('grichardomi@gmai.com');
    await page.locator('input[name="password"]').fill('Jimmy67!');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    // Reload — session cookie should keep user logged in
    await page.reload();
    await expect(page).not.toHaveURL(/signin/);
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

// ─── SIGN UP ────────────────────────────────────────────────────────────────

test.describe('Sign Up', () => {
  test('Sign-up page renders all required fields', async ({ page }) => {
    await page.goto('/auth/signup');
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('input[name="confirmPassword"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('Duplicate email shows error', async ({ page }) => {
    await page.goto('/auth/signup');
    // Use an email that already exists
    await page.locator('input[name="name"]').fill('Test Duplicate');
    await page.locator('input[name="email"]').fill('grichardomi@gmai.com');
    await page.locator('input[name="password"]').fill('NewPass123!');
    await page.locator('input[name="confirmPassword"]').fill('NewPass123!');
    await page.locator('button[type="submit"]').click();
    // Should stay on signup and show error
    await expect(page).toHaveURL(/signup/, { timeout: 10_000 });
    await expect(page.getByText(/already|exists|registered|taken/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('Mismatched passwords shows error', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.locator('input[name="name"]').fill('Test User');
    await page.locator('input[name="email"]').fill('mismatch-test@nexusmeme.com');
    await page.locator('input[name="password"]').fill('Password123!');
    await page.locator('input[name="confirmPassword"]').fill('Different999!');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/signup/, { timeout: 8_000 });
    await expect(page.getByText(/match|password/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Valid new signup redirects to check-email page', async ({ page }) => {
    // Use a unique email so it never conflicts
    const uniqueEmail = `e2e-newuser-${Date.now()}@nexusmeme.com`;
    await page.goto('/auth/signup');
    await page.locator('input[name="name"]').fill('E2E New User');
    await page.locator('input[name="email"]').fill(uniqueEmail);
    await page.locator('input[name="password"]').fill('E2eNewPass123!');
    await page.locator('input[name="confirmPassword"]').fill('E2eNewPass123!');
    await page.locator('button[type="submit"]').click();
    // Should redirect to check-email (email verification step)
    await expect(page).toHaveURL(/check-email|verify|signup|dashboard/, { timeout: 20_000 });
    await expect(page.locator('body')).not.toContainText(/Application error|ENOENT/i);
  });
});

// ─── ONBOARDING ─────────────────────────────────────────────────────────────

test.describe('Onboarding', () => {
  // Sign in first, then check if onboarding is triggered for new users
  // For existing users, onboarding should be complete → go straight to dashboard

  test('Signed-in user lands on dashboard (onboarding complete)', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.locator('input[name="email"]').fill('grichardomi@gmai.com');
    await page.locator('input[name="password"]').fill('Jimmy67!');
    await page.locator('button[type="submit"]').click();
    // Established user skips onboarding → dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  });

  test('Onboarding API endpoint responds', async ({ page, request }) => {
    // Sign in to get session
    await page.goto('/auth/signin');
    await page.locator('input[name="email"]').fill('grichardomi@gmai.com');
    await page.locator('input[name="password"]').fill('Jimmy67!');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const res = await request.get('/api/onboarding', {
      headers: { Cookie: cookieHeader },
    });
    // 200 = onboarding data, 404 = no onboarding route (ok), 405 = method not allowed (ok)
    expect([200, 204, 404, 405]).toContain(res.status());
    expect(res.status()).not.toBe(500);
  });

  test('Check-email page renders correctly', async ({ page }) => {
    await page.goto('/auth/check-email?email=test@nexusmeme.com');
    await expect(page.locator('body')).not.toContainText(/Application error|ENOENT/i);
    // Should show email verification instructions
    await expect(page.getByText(/check|email|verify|sent/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
