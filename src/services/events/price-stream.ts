/**
 * Price Stream Service
 * Continuously fetches market prices and broadcasts via PostgreSQL NOTIFY
 * Single source of truth for all price updates (zero cost, uses existing PostgreSQL)
 */

import { logger } from '@/lib/logger';
import { pgNotifyManager } from './pg-notify-manager';
import { marketDataAggregator } from '@/services/market-data/aggregator';
import { query } from '@/lib/db';

const PRICE_CHANNEL = 'price_updates';
const FETCH_INTERVAL_MS = 5000; // 5 seconds (fast enough for trading)

interface PriceUpdate {
  pair: string;
  price: number;
  bid?: number;
  ask?: number;
  spread?: number;
  timestamp: number;
}

class PriceStreamService {
  private isRunning = false;
  private fetchTimer: NodeJS.Timeout | null = null;
  private activePairs = new Set<string>();

  /**
   * Start the price stream service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('PriceStream: Already running');
      return;
    }

    this.isRunning = true;
    logger.info('🚀 PriceStream: Starting...');

    // Connect to PostgreSQL
    await pgNotifyManager.connect();

    // Load active pairs from database
    await this.refreshActivePairs();

    // Start continuous price fetching
    logger.info(`PriceStream: Fetching prices every ${FETCH_INTERVAL_MS}ms`);
    await this.fetchAndBroadcast(); // Run immediately
    this.fetchTimer = setInterval(() => {
      this.fetchAndBroadcast().catch((err) => {
        logger.error('PriceStream: Fetch error', err);
      });
    }, FETCH_INTERVAL_MS);

    logger.info('✅ PriceStream: Running');
  }

  /**
   * Stop the price stream service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info('🛑 PriceStream: Stopping...');
    this.isRunning = false;

    if (this.fetchTimer) {
      clearInterval(this.fetchTimer);
      this.fetchTimer = null;
    }

    logger.info('✅ PriceStream: Stopped');
  }

  /**
   * Refresh list of active pairs from database
   * Queries all running bots to determine which pairs need price updates
   */
  private async refreshActivePairs(): Promise<void> {
    try {
      const result = await query<{ pair: string }>(
        `SELECT DISTINCT UNNEST(enabled_pairs) as pair
         FROM bot_instances
         WHERE status = 'running'`
      );

      this.activePairs.clear();
      result.forEach(row => {
        if (row.pair) {
          this.activePairs.add(row.pair);
        }
      });

      logger.info('PriceStream: Active pairs refreshed', {
        pairs: Array.from(this.activePairs),
        count: this.activePairs.size,
      });
    } catch (error) {
      logger.error('PriceStream: Failed to refresh active pairs', error instanceof Error ? error : null);
    }
  }

  /**
   * Fetch prices for all active pairs and broadcast via PostgreSQL NOTIFY
   */
  private async fetchAndBroadcast(): Promise<void> {
    // Refresh active pairs every 10 fetch cycles (50 seconds)
    // This catches new bots without restarting the service
    if (Math.random() < 0.1) {
      await this.refreshActivePairs();
    }

    if (this.activePairs.size === 0) {
      logger.debug('PriceStream: No active pairs to fetch');
      return;
    }

    const pairs = Array.from(this.activePairs);

    try {
      // Fetch prices for all active pairs (uses cache internally)
      const priceData = await marketDataAggregator.getMarketData(pairs);

      // Broadcast each price update via PostgreSQL NOTIFY
      for (const [pair, data] of priceData.entries()) {
        if (!data || data.price <= 0) {
          logger.warn(`PriceStream: Invalid price for ${pair}`, { data });
          continue;
        }

        const update: PriceUpdate = {
          pair,
          price: data.price,
          bid: (data as any).ticker?.bid,
          ask: (data as any).ticker?.ask,
          spread: (data as any).ticker?.bid && (data as any).ticker?.ask
            ? (data as any).ticker.ask - (data as any).ticker.bid
            : undefined,
          timestamp: Date.now(),
        };

        // Publish to PostgreSQL NOTIFY with pair-specific channel
        // Sanitize pair name for PostgreSQL channel (no special chars)
        const channelName = `${PRICE_CHANNEL}_${pair.replace('/', '_')}`;
        await pgNotifyManager.publish(channelName, update);

        logger.debug(`PriceStream: Broadcast ${pair} @ $${data.price.toFixed(2)}`);
      }

      logger.debug('PriceStream: Broadcast complete', {
        pairs: pairs.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('PriceStream: Fetch and broadcast failed', error instanceof Error ? error : null);
    }
  }

  /**
   * Get current active pairs
   */
  getActivePairs(): string[] {
    return Array.from(this.activePairs);
  }

  /**
   * Check if service is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

// Singleton instance
export const priceStreamService = new PriceStreamService();
