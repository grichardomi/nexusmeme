/**
 * GET /api/billing/trial-days
 * Returns the configured free trial duration in days.
 * Public — no authentication required (used by landing page, signup, help).
 * Source of truth: billing_settings.trial_duration_days (admin-managed at /admin/fees)
 * Fallback: TRIAL_DURATION_DAYS env var → hardcoded 10
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getEnvironmentConfig } from '@/config/environment';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await query(
      "SELECT value FROM billing_settings WHERE key = 'trial_duration_days'",
      []
    );
    if (result[0]) {
      const days = parseInt(String(result[0].value), 10);
      return NextResponse.json({ days });
    }
  } catch {
    console.warn('[trial-days] WARNING: DB unavailable — using TRIAL_DURATION_DAYS env fallback.');
  }

  const env = getEnvironmentConfig();
  return NextResponse.json({ days: env.TRIAL_DURATION_DAYS });
}
