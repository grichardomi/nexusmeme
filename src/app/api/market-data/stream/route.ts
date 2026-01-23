/**
 * Server-Sent Events (SSE) endpoint for real-time price streaming
 * GET /api/market-data/stream?pairs=BTC/USD,ETH/USD
 *
 * RATE LIMITING STRATEGY:
 * - No per-connection rate limit (browser's EventSource handles backpressure)
 * - Connection pooling via broadcaster (1 WebSocket → N SSE)
 * - Message debouncing on client (usePriceStream)
 * - No per-user polling (shared Redis cache for fallback)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getPriceBroadcaster } from '@/services/market-data/price-broadcaster';
import type { PriceUpdate } from '@/types/market-data';

export const runtime = 'nodejs';

/**
 * Active connection tracking for monitoring
 */
let activeConnections = 0;
const MAX_CONNECTIONS = 10000; // Adjust based on Railway resources

function trackConnection(add: boolean): number {
  activeConnections += add ? 1 : -1;
  if (activeConnections % 100 === 0 || activeConnections % 100 === 1) {
    logger.info('Active SSE connections', { count: activeConnections, maxConnections: MAX_CONNECTIONS });
  }
  return activeConnections;
}

/**
 * Parse pairs from query parameter
 */
function parsePairs(searchParams: URLSearchParams): string[] {
  const pairsParam = searchParams.get('pairs');
  if (!pairsParam) {
    return [];
  }
  return pairsParam.split(',').map(p => p.trim()).filter(p => p.length > 0);
}

/**
 * Validate pairs are in expected format (e.g., BTC/USD)
 */
function validatePairs(pairs: string[]): boolean {
  const pairRegex = /^[A-Z]{2,10}\/[A-Z]{3,10}$/;
  return pairs.every(pair => pairRegex.test(pair));
}

/**
 * GET /api/market-data/stream
 * Stream real-time prices for requested trading pairs
 *
 * Query params:
 *   - pairs: Comma-separated list of trading pairs (e.g., BTC/USD,ETH/USD)
 *
 * Response: Server-Sent Events stream
 * Each event contains: data: {"pair":"BTC/USD","price":93245.67,...}\n\n
 */
export async function GET(request: NextRequest): Promise<Response> {
  let connectionCount = 0;

  try {
    const searchParams = request.nextUrl.searchParams;
    const pairs = parsePairs(searchParams);

    if (pairs.length === 0) {
      logger.warn('SSE endpoint called without pairs');
      return NextResponse.json(
        { error: 'pairs parameter is required' },
        { status: 400 }
      );
    }

    if (!validatePairs(pairs)) {
      logger.warn('SSE endpoint called with invalid pairs format', { pairs });
      return NextResponse.json(
        { error: 'Invalid pairs format. Expected format: BTC/USD' },
        { status: 400 }
      );
    }

    // Check connection limit
    connectionCount = trackConnection(true);
    if (connectionCount > MAX_CONNECTIONS) {
      trackConnection(false);
      logger.warn('SSE connection rejected - max connections reached', {
        current: connectionCount,
        max: MAX_CONNECTIONS,
      });
      return NextResponse.json(
        { error: 'Service temporarily at capacity. Please try again in a moment.' },
        { status: 503 } // Service Unavailable
      );
    }

    logger.info('SSE connection established', { pairs, activeConnections: connectionCount });

    // Get broadcaster singleton
    const broadcaster = getPriceBroadcaster();

    // Initialize broadcaster with pairs if not already done
    await broadcaster.initialize(pairs);

    // Create streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const unsubscribers: (() => void)[] = [];

        /**
         * Send SSE message to client
         */
        const sendMessage = (update: PriceUpdate) => {
          try {
            const sseMessage = `data: ${JSON.stringify(update)}\n\n`;
            controller.enqueue(encoder.encode(sseMessage));
          } catch (error) {
            logger.error('Failed to send SSE message', error instanceof Error ? error : null);
          }
        };

        /**
         * Send fallback cached price to client
         */
        const sendCachedPrice = async (pair: string) => {
          try {
            const cached = await broadcaster.getCachedPrice(pair);
            if (cached) {
              sendMessage(cached);
              logger.debug('Sent cached price', { pair });
            }
          } catch (error) {
            logger.error('Failed to send cached price', error instanceof Error ? error : null, { pair });
          }
        };

        try {
          // Subscribe to price updates for each requested pair
          for (const pair of pairs) {
            const unsubscribe = broadcaster.subscribe(pair, sendMessage);
            unsubscribers.push(unsubscribe);

            // Also send cached price immediately if available
            await sendCachedPrice(pair);
          }

          // Send initial connection message
          const connectionMsg = `data: ${JSON.stringify({
            type: 'connected',
            pairs,
            timestamp: Date.now(),
          })}\n\n`;
          controller.enqueue(encoder.encode(connectionMsg));

          logger.debug('SSE subscriptions established', { pairs, count: pairs.length });

          // Keep connection alive - client will handle reconnection on disconnect
          // The connection stays open as long as the client hasn't closed it
          request.signal.addEventListener('abort', () => {
            logger.info('SSE client disconnected', { pairs, activeConnections: trackConnection(false) });
            cleanup();
          });
        } catch (error) {
          logger.error('Error setting up SSE stream', error instanceof Error ? error : null);
          trackConnection(false);
          cleanup();
          controller.close();
        }

        /**
         * Cleanup subscriptions
         */
        function cleanup(): void {
          unsubscribers.forEach(unsubscribe => {
            try {
              unsubscribe();
            } catch (error) {
              logger.error('Error unsubscribing from price updates', error instanceof Error ? error : null);
            }
          });
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable Nginx buffering for faster delivery
      },
    });
  } catch (error) {
    logger.error('SSE endpoint error', error instanceof Error ? error : null);
    if (connectionCount > 0) {
      trackConnection(false);
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
