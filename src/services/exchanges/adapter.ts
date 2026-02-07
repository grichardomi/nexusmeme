import type { ApiKeys, Order, Balance, Ticker, OrderResult } from '@/types/exchange';
import { ALLOWED_BASE_ASSETS } from '@/config/environment';

/**
 * Exchange Adapter Interface
 * All exchange implementations must conform to this interface
 * Pluggable: easily add new exchanges by implementing this interface
 */
export interface ExchangeAdapter {
  /**
   * Connect to exchange and validate API keys
   */
  connect(keys: ApiKeys): Promise<void>;

  /**
   * Validate connection is still active
   */
  validateConnection(): Promise<boolean>;

  /**
   * Place a buy or sell order
   */
  placeOrder(order: { pair: string; side: 'buy' | 'sell'; amount: number; price: number; timeInForce?: string; postOnly?: boolean }): Promise<OrderResult>;

  /**
   * Cancel an open order
   */
  cancelOrder(orderId: string, pair: string): Promise<void>;

  /**
   * Get order details
   */
  getOrder(orderId: string, pair: string): Promise<Order | null>;

  /**
   * Get all open orders for a pair
   */
  listOpenOrders(pair: string): Promise<Order[]>;

  /**
   * Get account balance for an asset
   */
  getBalance(asset: string): Promise<Balance | null>;

  /**
   * Get all account balances
   */
  getBalances(): Promise<Balance[]>;

  /**
   * Get current ticker data for a pair
   */
  getTicker(pair: string): Promise<Ticker>;

  /**
   * Get OHLCV (candlestick) data
   */
  getOHLCV(pair: string, timeframe: string, limit?: number): Promise<any[]>;

  /**
   * Get list of supported trading pairs
   */
  getSupportedPairs(): Promise<string[]>;

  /**
   * Get minimum order size for a pair
   */
  getMinOrderSize(pair: string): Promise<number>;

  /**
   * Get fee structure
   */
  getFees(): Promise<{ maker: number; taker: number }>;

  /**
   * Get exchange name
   */
  getName(): string;

  /**
   * Get exchange status (is it operational?)
   */
  getStatus(): Promise<boolean>;
}

/**
 * Base implementation with common utilities
 */
export abstract class BaseExchangeAdapter implements ExchangeAdapter {
  protected keys: ApiKeys | null = null;
  protected isConnected = false;

  abstract connect(keys: ApiKeys): Promise<void>;
  abstract validateConnection(): Promise<boolean>;
  abstract placeOrder(order: { pair: string; side: 'buy' | 'sell'; amount: number; price: number; timeInForce?: string; postOnly?: boolean }): Promise<OrderResult>;
  abstract cancelOrder(orderId: string, pair: string): Promise<void>;
  abstract getOrder(orderId: string, pair: string): Promise<Order | null>;
  abstract listOpenOrders(pair: string): Promise<Order[]>;
  abstract getBalance(asset: string): Promise<Balance | null>;
  abstract getBalances(): Promise<Balance[]>;
  abstract getTicker(pair: string): Promise<Ticker>;
  abstract getOHLCV(pair: string, timeframe: string, limit?: number): Promise<any[]>;
  abstract getSupportedPairs(): Promise<string[]>;
  abstract getMinOrderSize(pair: string): Promise<number>;
  abstract getFees(): Promise<{ maker: number; taker: number }>;
  abstract getName(): string;
  abstract getStatus(): Promise<boolean>;

  /**
   * Validate that keys are set
   */
  protected validateKeys(): void {
    if (!this.keys) {
      throw new Error('API keys not set. Call connect() first.');
    }
  }

  /**
   * Validate pair format (must contain /, valid base asset (BTC/ETH only), and valid quote currency)
   * PROFITABILITY CONSTRAINT: Only BTC and ETH pairs are allowed to maintain /nexus profitability
   */
  protected validatePair(pair: string): void {
    const validQuotes = ['USD', 'USDT', 'USDC', 'BUSD'];
    const [baseAsset, quote] = pair.split('/');

    // Check quote currency
    if (!quote || !validQuotes.includes(quote)) {
      throw new Error(
        `Invalid pair: ${pair}. Quote currency must be one of: ${validQuotes.join(', ')}`
      );
    }

    // PROFITABILITY: Check base asset is BTC or ETH only
    if (!baseAsset || !ALLOWED_BASE_ASSETS.includes(baseAsset as any)) {
      throw new Error(
        `Invalid pair: ${pair}. Only ${ALLOWED_BASE_ASSETS.join('/')} pairs are supported for profitability. Base asset must be: ${ALLOWED_BASE_ASSETS.join(', ')}`
      );
    }
  }

  /**
   * Validate amount is positive
   */
  protected validateAmount(amount: number): void {
    if (amount <= 0) {
      throw new Error(`Invalid amount: ${amount}. Must be greater than 0.`);
    }
  }
}
