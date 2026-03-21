import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

/**
 * Playwright E2E Test Configuration
 * Tests run against local dev server.
 * Uses dev DB (ballast) — never touches production (switchback).
 *
 * Usage:
 *   pnpm seed:e2e          → create E2E test users in dev DB (run once)
 *   pnpm e2e               → run all tests (starts dev server if needed)
 *   pnpm e2e:ui            → interactive UI mode
 *   E2E_BASE_URL=http://localhost:3001 pnpm e2e  → target specific port
 *
 * Auth strategy: global-setup authenticates once and saves cookies to
 * e2e/.auth/{user,admin}.json — reused by all tests to avoid rate limits.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false, // Sequential — shared test DB, no race conditions
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],
  use: {
    baseURL: BASE_URL,
    storageState: 'e2e/.auth/user.json', // Default: authenticated as regular user
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
