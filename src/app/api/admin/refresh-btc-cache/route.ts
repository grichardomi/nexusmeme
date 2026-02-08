/**
 * Admin API: Force refresh BTC EMA cache
 * Use when EMA data appears stale or after market volatility
 *
 * POST /api/admin/refresh-btc-cache
 */

import { NextResponse } from 'next/server';
import { capitalPreservation } from '@/services/risk/capital-preservation';

export async function POST() {
  try {
    // Clear the cache
    capitalPreservation.clearBtcCache();

    // Force a fresh check which will recalculate EMAs
    const result = await capitalPreservation.checkBtcTrendGate();

    return NextResponse.json({
      success: true,
      message: 'BTC cache cleared and refreshed',
      data: {
        allowTrading: result.allowTrading,
        sizeMultiplier: result.sizeMultiplier,
        reason: result.reason
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
