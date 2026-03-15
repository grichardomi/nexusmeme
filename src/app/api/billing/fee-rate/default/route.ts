/**
 * GET /api/billing/fee-rate/default
 * Returns the global default performance fee rate — no authentication required.
 * Used by public pages (help, landing) that need to display the current rate
 * without a user session. Returns the global billing_settings rate or env fallback.
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getEnvironmentConfig } from '@/config/environment';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settingResult = await query(
      "SELECT value FROM billing_settings WHERE key = 'performance_fee_rate'",
      []
    );
    if (settingResult[0]) {
      const env = getEnvironmentConfig();
      const rate = parseFloat(String(settingResult[0].value));
      return NextResponse.json({
        feeRate: rate,
        feePercent: +(rate * 100).toFixed(4),
        gracePeriodDays: env.BILLING_GRACE_PERIOD_DAYS,
        dunningWarningDays: env.DUNNING_WARNING_DAYS,
        suspensionDays: env.BILLING_SUSPENSION_DAYS,
      });
    }
  } catch {
    console.warn('[fee-rate/default] WARNING: DB unavailable — using PERFORMANCE_FEE_RATE env fallback. Fee may not reflect admin-configured value.');
  }

  const env = getEnvironmentConfig();
  const rate = env.PERFORMANCE_FEE_RATE;
  return NextResponse.json({
    feeRate: rate,
    feePercent: +(rate * 100).toFixed(4),
    gracePeriodDays: env.BILLING_GRACE_PERIOD_DAYS,   // Day 7: first reminder
    dunningWarningDays: env.DUNNING_WARNING_DAYS,      // Day 10: final warning
    suspensionDays: env.BILLING_SUSPENSION_DAYS,       // Day 14: bots suspended
  });
}
