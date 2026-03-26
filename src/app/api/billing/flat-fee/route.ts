/**
 * GET /api/billing/flat-fee
 * Returns the configured monthly flat fee in USDC.
 * Public — no authentication required (used by landing page, FAQ, pricing).
 * Source of truth: billing_settings.flat_fee_usdc (admin-managed at /admin/fees)
 * Fallback: FLAT_FEE_USDC env var → 0 (disabled)
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getEnvironmentConfig } from '@/config/environment';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await query(
      "SELECT value FROM billing_settings WHERE key = 'flat_fee_usdc'",
      []
    );
    if (result[0]) {
      const flatFeeUsdc = parseFloat(String(result[0].value));
      return NextResponse.json({ flatFeeUsdc });
    }
  } catch {
    console.warn('[flat-fee] WARNING: DB unavailable — using FLAT_FEE_USDC env fallback.');
  }

  const env = getEnvironmentConfig();
  return NextResponse.json({ flatFeeUsdc: env.FLAT_FEE_USDC });
}
