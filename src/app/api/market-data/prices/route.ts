/**
 * REST endpoint for pair prices
 * GET /api/market-data/prices?pairs=BTC/USD,ETH/USD
 *
 * ARCHITECTURE (Single Cache Authority):
 * - All caching delegated to marketDataAggregator (single source of truth)
 * - Aggregator has in-process cache (10s TTL) + Redis fallback
 * - Background fetcher keeps prices warm every 4 seconds
 * - No duplicate memory caches - aggregator is the authority
 * - Returns "temporarily unavailable" if cache is cold
 * - All users share single aggregator (no per-user rate limits)
 * - Infinitely scalable via shared cache
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { marketDataAggregator } from '@/services/market-data/aggregator';
import type { MarketData } from '@/types/market';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const pairsParam = request.nextUrl.searchParams.get('pairs');

    if (!pairsParam) {
      return NextResponse.json(
        { error: 'Missing pairs parameter' },
        { status: 400 }
      );
    }

    const pairs = pairsParam.split(',').map(p => p.trim()).filter(p => p);

    if (pairs.length === 0) {
      return NextResponse.json(
        { error: 'No valid pairs provided' },
        { status: 400 }
      );
    }

    // Single cache authority: aggregator handles all caching logic
    // (in-process cache with TTL + Redis fallback)
    const priceData = await marketDataAggregator.getMarketData(pairs);

    // For pairs not in the cache (e.g. ETH/USD when only ETH/USDT is tracked),
    // fall back to the USDT equivalent — USD ≈ USDT on Binance US (1:1 peg).
    const missingPairs = pairs.filter(p => !priceData.has(p));
    if (missingPairs.length > 0) {
      const usdtFallbacks = missingPairs
        .filter(p => p.endsWith('/USD'))
        .map(p => p.replace('/USD', '/USDT'));
      if (usdtFallbacks.length > 0) {
        const fallbackData = await marketDataAggregator.getMarketData(usdtFallbacks);
        for (const missing of missingPairs.filter(p => p.endsWith('/USD'))) {
          const equiv = missing.replace('/USD', '/USDT');
          const data = fallbackData.get(equiv);
          if (data) {
            priceData.set(missing, data);
          }
        }
      }
    }

    // If no data available, return 503 (cache cold)
    if (priceData.size === 0) {
      return NextResponse.json(
        {
          error: 'Price data temporarily unavailable',
          message: 'Cache is still being populated. Please try again shortly.',
          unavailablePairs: pairs,
        },
        { status: 503 }
      );
    }

    // Convert Map to object for JSON response
    const response: Record<string, MarketData> = {};
    for (const [pair, data] of priceData.entries()) {
      response[pair] = data;
    }

    return NextResponse.json(response, {
      headers: {
        // Disable browser/proxy caching; freshness is controlled by server-side aggregator cache
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    logger.error('Price endpoint error', error instanceof Error ? error : null);
    return NextResponse.json(
      {
        error: 'Failed to fetch prices',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
