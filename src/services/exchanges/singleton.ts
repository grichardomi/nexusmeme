import { BinanceAdapter } from './binance';
import { KrakenAdapter } from './kraken';
import { BaseExchangeAdapter } from './adapter';
import type { ApiKeys } from '@/types/exchange';
import { logger } from '@/lib/logger';

/**
 * Singleton Exchange Adapters
 * Maintains single instance per exchange to preserve circuit breaker state
 * across all requests and instances
 *
 * Problem: Creating new adapter per request resets circuit breaker
 * Solution: Singleton pattern - one adapter instance per exchange
 */

class AdapterRegistry {
  private adapters = new Map<string, BaseExchangeAdapter>();

  /**
   * Get or create singleton adapter for exchange
   */
  getAdapter(exchange: string): BaseExchangeAdapter {
    const key = exchange.toLowerCase();

    if (!this.adapters.has(key)) {
      let adapter: BaseExchangeAdapter;

      switch (key) {
        case 'binance':
          adapter = new BinanceAdapter();
          logger.info('Creating singleton Binance adapter');
          break;
        case 'kraken':
          adapter = new KrakenAdapter();
          logger.info('Creating singleton Kraken adapter');
          break;
        default:
          throw new Error(`Unknown exchange: ${exchange}`);
      }

      this.adapters.set(key, adapter);
    }

    return this.adapters.get(key)!;
  }

  /**
   * Connect adapter with user's API keys
   * Circuit breaker state is preserved across connections
   */
  async connectAdapter(exchange: string, keys: ApiKeys): Promise<BaseExchangeAdapter> {
    const adapter = this.getAdapter(exchange);
    await adapter.connect(keys);
    return adapter;
  }

  /**
   * Get adapter without connecting (for read-only operations)
   */
  getConnectedAdapter(exchange: string): BaseExchangeAdapter {
    return this.getAdapter(exchange);
  }

  /**
   * Reset specific adapter (for testing/emergency only)
   */
  resetAdapter(exchange: string): void {
    const key = exchange.toLowerCase();
    this.adapters.delete(key);
    logger.warn('Adapter reset', { exchange });
  }

  /**
   * Get registry stats for monitoring
   */
  getStats() {
    const stats: Record<string, any> = {};

    for (const [key, adapter] of this.adapters) {
      stats[key] = {
        exchange: key,
        connected: (adapter as any).isConnected || false,
      };
    }

    return stats;
  }
}

// Singleton instance
export const adapterRegistry = new AdapterRegistry();

/**
 * Backward-compatible factory function
 * Returns singleton adapter instead of creating new instance
 */
export function getExchangeAdapter(exchange: string): BaseExchangeAdapter {
  return adapterRegistry.getAdapter(exchange);
}
