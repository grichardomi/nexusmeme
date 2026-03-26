#!/usr/bin/env node

/**
 * Email Queue Processor Script
 * Processes pending emails via the production email pipeline (Mailgun/Resend).
 *
 * Usage:
 *   export $(grep -v '^#' .env.local | grep -v '^\s*$' | xargs -d '\n') && node scripts/process-emails.js
 *
 * Or directly with tsx (env already loaded):
 *   pnpm tsx scripts/run-email-queue.ts
 */

const { execSync } = require('child_process');
const path = require('path');

const tsScript = path.join(__dirname, 'run-email-queue.ts');
const root = path.join(__dirname, '..');

try {
  execSync(`pnpm tsx --tsconfig tsconfig.json ${tsScript}`, {
    stdio: 'inherit',
    env: process.env,
    cwd: root,
  });
} catch {
  process.exit(1);
}
