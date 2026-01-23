import { KrakenAdapter } from './kraken';
import { BinanceAdapter } from './binance';
import type { ExchangeAdapter } from './adapter';
import { logger } from '@/lib/logger';

/**
 * Exchange Adapter Factory
 * Creates appropriate adapter instance based on exchange name
 * Pluggable: add new exchanges by registering them here
 */
export class ExchangeAdapterFactory {
  private static adapters: Map<string, new () => ExchangeAdapter> = new Map<
    string,
    new () => ExchangeAdapter
  >([
    ['kraken', KrakenAdapter as new () => ExchangeAdapter],
    ['binance', BinanceAdapter as new () => ExchangeAdapter],
  ]);

  /**
   * Create adapter instance for exchange
   */
  static create(exchange: string): ExchangeAdapter {
    const AdapterClass = this.adapters.get(exchange.toLowerCase());

    if (!AdapterClass) {
      const supported = Array.from(this.adapters.keys()).join(', ');
      throw new Error(
        `Unsupported exchange: ${exchange}. Supported exchanges: ${supported}`
      );
    }

    logger.info('Creating exchange adapter', { exchange });
    return new AdapterClass();
  }

  /**
   * Register custom adapter
   */
  static register(exchange: string, AdapterClass: new () => ExchangeAdapter): void {
    logger.info('Registering custom exchange adapter', { exchange });
    this.adapters.set(exchange.toLowerCase(), AdapterClass);
  }

  /**
   * Get list of supported exchanges
   */
  static getSupportedExchanges(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Check if exchange is supported
   */
  static isSupported(exchange: string): boolean {
    return this.adapters.has(exchange.toLowerCase());
  }
}

// Export singleton methods as functions for convenience
export function createExchangeAdapter(exchange: string): ExchangeAdapter {
  return ExchangeAdapterFactory.create(exchange);
}

export function getSupportedExchanges(): string[] {
  return ExchangeAdapterFactory.getSupportedExchanges();
}

export function isExchangeSupported(exchange: string): boolean {
  return ExchangeAdapterFactory.isSupported(exchange);
}
