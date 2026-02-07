import { BaseExchangeAdapter } from './adapter';
import { logger, logApiCall } from '@/lib/logger';
import type { ApiKeys, Order, Balance, Ticker, OrderResult } from '@/types/exchange';
import { marketDataAggregator } from '@/services/market-data/aggregator';
import { createHmac } from 'crypto';
import { withRetry, CircuitBreaker } from '@/lib/resilience';
import { binanceRateLimiter } from '@/lib/distributed-rate-limiter';
import { getEnvironmentConfig } from '@/config/environment';

/**
 * Binance Exchange Adapter
 * Implements ExchangeAdapter interface for Binance API
 *
 * Supports: BTC, ETH, SOL, etc. with USDT, BUSD quote
 * Rate limits: 1200 requests per minute (20 per second)
 */
export class BinanceAdapter extends BaseExchangeAdapter {
  private baseUrl = `${getEnvironmentConfig().BINANCE_API_BASE_URL}/api`;
  // Circuit breaker: open after 5 failures, close after 3 successes, reset after 60s
  private circuitBreaker = new CircuitBreaker(5, 3, 60000);
  // Rate limiter is distributed (Redis-backed) - shared across all instances
  // Accessed via binanceRateLimiter singleton

  getName(): string {
    return 'binance';
  }

  /**
   * Normalize pair to Binance symbol format
   * BTC/USD → BTCUSDT, ETH/USD → ETHUSDT, BTC/USDT → BTCUSDT
   * Binance only has USDT pairs — USD must be converted to USDT
   */
  private normalizeSymbol(pair: string): string {
    const [base, quote] = pair.split('/');
    const binanceQuote = quote === 'USD' ? 'USDT' : quote;
    return `${base}${binanceQuote}`;
  }

  async connect(keys: ApiKeys): Promise<void> {
    this.keys = keys;
    logger.info('Connecting to Binance', { exchange: 'binance' });

    // Validate connection with minimal API call
    const valid = await this.validateConnection();
    if (!valid) {
      throw new Error('Failed to validate Binance API keys');
    }

    this.isConnected = true;
    logger.info('Connected to Binance');
  }

  async validateConnection(): Promise<boolean> {
    try {
      this.validateKeys();

      // Make minimal API call to verify keys work
      const balances = await this.getBalances();
      logger.info('Binance connection validated', { balanceCount: balances.length });
      return balances.length > 0;
    } catch (error) {
      logger.error('Binance connection validation failed', error instanceof Error ? error : null);
      return false;
    }
  }

  private async getPublicSymbolPrice(symbol: string): Promise<number | null> {
    try {
      const url = `${this.baseUrl}/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const p = parseFloat(data.price);
      return Number.isFinite(p) && p > 0 ? p : null;
    } catch {
      return null;
    }
  }

  // getFees implemented later in file (avoid duplication)

  async placeOrder(
    order: { pair: string; side: 'buy' | 'sell'; amount: number; price: number; timeInForce?: string; postOnly?: boolean }
  ): Promise<OrderResult> {
    this.validateKeys();
    this.validatePair(order.pair);
    this.validateAmount(order.amount);

    const env = getEnvironmentConfig();
    const startTime = Date.now();

    // PAPER TRADING MODE - Simulate order without hitting exchange API
    if (env.BINANCE_BOT_PAPER_TRADING) {
      const paperOrderId = `PAPER-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const estimatedFee = order.amount * order.price * 0.001; // ~0.1% taker fee

      logger.info('📝 PAPER TRADE: Simulating Binance order (not sent to exchange)', {
        orderId: paperOrderId,
        pair: order.pair,
        side: order.side,
        amount: order.amount,
        price: order.price,
        estimatedFee: estimatedFee.toFixed(4),
        mode: 'PAPER_TRADING',
      });

      return {
        orderId: paperOrderId,
        pair: order.pair,
        side: order.side,
        amount: order.amount,
        price: order.price,
        avgPrice: order.price, // Paper trade fills at requested price
        timestamp: new Date(),
        status: 'filled', // Paper trades are instantly "filled"
        fee: estimatedFee,
      };
    }

    try {
      logger.info('Placing Binance order', {
        pair: order.pair,
        side: order.side,
        amount: order.amount,
        price: order.price,
      });

      // Use circuit breaker + retry with exponential backoff
      // Don't retry on some errors (e.g., insufficient balance)
      const result = await this.circuitBreaker.execute(async () => {
        return await withRetry(
          async () => {
            // Convert pair format: BTC/USDT -> BTCUSDT
            const symbol = this.normalizeSymbol(order.pair);

            // Build order parameters
            const params: any = {
              symbol,
              side: order.side.toUpperCase(),
              type: 'LIMIT',
              timeInForce: order.timeInForce || 'GTC', // Allow IOC for exits
              quantity: order.amount.toFixed(8),
              price: order.price.toFixed(2),
              recvWindow: 5000, // 5 second validity window
            };

            // Make signed POST request to Binance
            return await this.privateRequest('/v3/order', params, 'POST');
          },
          {
            maxRetries: 2,
            baseDelay: 100,
            maxDelay: 1000,
            // Don't retry on validation/balance errors
            retryableErrors: (error) => {
              const message = error instanceof Error ? error.message : String(error);
              // Binance error codes that should NOT be retried
              if (message.includes('-2010')) return false; // NEW_ORDER_REJECTED (balance)
              if (message.includes('-1013')) return false; // Invalid quantity/price
              if (message.includes('Invalid')) return false; // Validation error
              // Retry network/transient errors
              return true;
            },
          }
        );
      });

      const duration = Date.now() - startTime;
      logApiCall('binance', 'place_order', 'POST', duration, 200);

      logger.info('Binance order placed successfully', {
        orderId: result.orderId,
        pair: order.pair,
        status: result.status,
      });

      // Query the order to get fee and fill price information (if available in response)
      let fee: number | undefined;
      let avgPrice: number | undefined;
      try {
        // Check if fills are included in the place order response
        if (result.fills && Array.isArray(result.fills)) {
          // Sum commission from all fills
          let totalCost = 0;
          let totalQty = 0;
          const totalCommission = result.fills.reduce((sum: number, fill: any) => {
            const price = parseFloat(fill.price || fill.p || '0');
            const qty = parseFloat(fill.qty || fill.quantity || fill.q || '0');
            if (price > 0 && qty > 0) {
              totalCost += price * qty;
              totalQty += qty;
            }
            return sum + (parseFloat(fill.commission) || 0);
          }, 0);
          if (totalQty > 0 && totalCost > 0) {
            avgPrice = totalCost / totalQty;
          }
          // Capture fee asset and convert to quote if needed
          const commissionAsset = result.fills[0]?.commissionAsset || result.fills[0]?.c || undefined;
          if (totalCommission > 0) {
            fee = totalCommission;
            try {
              const [, quote] = order.pair.split('/');
              let feeQuote = totalCommission;
              if (commissionAsset && commissionAsset !== quote) {
                // Try exchange-native price first (e.g., BNBUSDT)
                const symbol = `${commissionAsset}${quote}`;
                const exPrice = await this.getPublicSymbolPrice(symbol);
                if (exPrice && exPrice > 0) {
                  feeQuote = totalCommission * exPrice;
                } else {
                  // Fallback to aggregator if available
                  const pairForFee = `${commissionAsset}/${quote}`;
                  const md = await marketDataAggregator.getMarketData([pairForFee]);
                  const ticker = md.get(pairForFee);
                  if (ticker && ticker.price > 0) {
                    feeQuote = totalCommission * ticker.price;
                  }
                }
              }
              // Attach metadata to result
              (result as any).feeAsset = commissionAsset;
              (result as any).feeQuote = feeQuote;
              // Derive maker flag if all fills share isMaker
              const allMaker = result.fills.every((f: any) => f.isMaker === true);
              const allTaker = result.fills.every((f: any) => f.isMaker === false);
              if (allMaker || allTaker) {
                (result as any).isMaker = allMaker;
              }
              logger.debug('Captured Binance fees with normalization', {
                orderId: result.orderId,
                fee,
                feeAsset: commissionAsset,
                feeQuote: (result as any).feeQuote,
                isMaker: (result as any).isMaker,
              });
            } catch (convErr) {
              logger.warn('Fee normalization failed (Binance fills)', {
                orderId: result.orderId,
                error: convErr instanceof Error ? convErr.message : String(convErr),
              });
            }
          }
        }

        // If no fills in response, query the order to get commission details
        if (fee === undefined || avgPrice === undefined) {
          const orderData = await this.circuitBreaker.execute(async () => {
            return await withRetry(
              async () => {
                const symbol = this.normalizeSymbol(order.pair);
                const params = {
                  symbol,
                  orderId: result.orderId,
                  recvWindow: 5000,
                };
                return await this.privateRequest('/v3/order', params, 'GET');
              },
              {
                maxRetries: 1,
                baseDelay: 50,
                maxDelay: 500,
              }
            );
          });

          if (orderData?.fills && Array.isArray(orderData.fills)) {
            let totalCost = 0;
            let totalQty = 0;
            const totalCommission = orderData.fills.reduce((sum: number, fill: any) => {
              const price = parseFloat(fill.price || fill.p || '0');
              const qty = parseFloat(fill.qty || fill.quantity || fill.q || '0');
              if (price > 0 && qty > 0) {
                totalCost += price * qty;
                totalQty += qty;
              }
              return sum + (parseFloat(fill.commission) || 0);
            }, 0);
            if (totalQty > 0 && totalCost > 0) {
              avgPrice = totalCost / totalQty;
            }
            if (totalCommission > 0) {
              fee = totalCommission;
              try {
                const commissionAsset = orderData.fills[0]?.commissionAsset || orderData.fills[0]?.c || undefined;
                const [, quote] = order.pair.split('/');
                let feeQuote = totalCommission;
                if (commissionAsset && commissionAsset !== quote) {
                  const symbol = `${commissionAsset}${quote}`;
                  const exPrice = await this.getPublicSymbolPrice(symbol);
                  if (exPrice && exPrice > 0) {
                    feeQuote = totalCommission * exPrice;
                  } else {
                    const pairForFee = `${commissionAsset}/${quote}`;
                    const md = await marketDataAggregator.getMarketData([pairForFee]);
                    const ticker = md.get(pairForFee);
                    if (ticker && ticker.price > 0) {
                      feeQuote = totalCommission * ticker.price;
                    }
                  }
                }
                (orderData as any).feeAsset = commissionAsset;
                (orderData as any).feeQuote = feeQuote;
                const allMaker = orderData.fills.every((f: any) => f.isMaker === true);
                const allTaker = orderData.fills.every((f: any) => f.isMaker === false);
                if (allMaker || allTaker) {
                  (orderData as any).isMaker = allMaker;
                }
                logger.debug('Captured Binance fees from query with normalization', {
                  orderId: result.orderId,
                  fee,
                  feeAsset: (orderData as any).feeAsset,
                  feeQuote: (orderData as any).feeQuote,
                  isMaker: (orderData as any).isMaker,
                });
              } catch (convErr) {
                logger.warn('Fee normalization failed (Binance query)', {
                  orderId: result.orderId,
                  error: convErr instanceof Error ? convErr.message : String(convErr),
                });
              }
            }
          }

          // Fallback to cummulative quote quantity if no fills array is present
          if ((avgPrice === undefined || Number.isNaN(avgPrice)) && orderData) {
            const executedQty = parseFloat(orderData.executedQty || '0');
            const quoteQty = parseFloat(orderData.cummulativeQuoteQty || '0');
            if (executedQty > 0 && quoteQty > 0) {
              avgPrice = quoteQty / executedQty;
            }
          }
        }
      } catch (feeError) {
        logger.warn('Failed to query Binance order fees', {
          orderId: result.orderId,
          error: feeError instanceof Error ? feeError.message : String(feeError),
        });
        // Continue without fee data - will fall back to default calculation
      }

      const orderResult: OrderResult = {
        orderId: result.orderId,
        pair: order.pair,
        side: order.side,
        amount: order.amount,
        price: order.price,
        avgPrice,
        timestamp: new Date(result.transactTime || Date.now()),
        status: result.status.toLowerCase(),
        fee,
      } as OrderResult;
      // Attach normalized fee fields if available
      const feeAssetFromResp = (result as any).feeAsset ?? undefined;
      const feeQuoteFromResp = (result as any).feeQuote ?? undefined;
      const isMakerFromResp = (result as any).isMaker ?? undefined;
      if (feeAssetFromResp) (orderResult as any).feeAsset = feeAssetFromResp;
      if (feeQuoteFromResp !== undefined) (orderResult as any).feeQuote = feeQuoteFromResp;
      if (isMakerFromResp !== undefined) (orderResult as any).isMaker = isMakerFromResp;
      return orderResult;
    } catch (error) {
      logger.error('Failed to place Binance order', error instanceof Error ? error : null, {
        pair: order.pair,
      });
      throw error;
    }
  }

  async cancelOrder(orderId: string, pair: string): Promise<void> {
    this.validateKeys();
    this.validatePair(pair);

    const startTime = Date.now();

    try {
      logger.info('Cancelling Binance order', { orderId, pair });

      // Convert pair format: BTC/USDT -> BTCUSDT
      const symbol = this.normalizeSymbol(pair);

      // Use circuit breaker + retry for resilience
      // Don't retry on validation errors (order not found, already cancelled)
      await this.circuitBreaker.execute(async () => {
        return await withRetry(
          async () => {
            // Build cancel parameters - Binance requires either orderId or origClientOrderId
            const params = {
              symbol,
              orderId: parseInt(orderId), // Binance expects numeric orderId
              recvWindow: 5000,
            };

            // Make signed DELETE request to Binance
            return await this.privateRequest('/v3/order', params, 'DELETE');
          },
          {
            maxRetries: 1,
            baseDelay: 100,
            maxDelay: 1000,
            // Don't retry on validation/not-found errors
            retryableErrors: (error) => {
              const message = error instanceof Error ? error.message : String(error);
              // Binance error codes that should NOT be retried
              if (message.includes('-2011')) return false; // CANCEL_REJECTED (order not found)
              if (message.includes('-2013')) return false; // UNKNOWN_ORDER
              if (message.includes('Invalid')) return false; // Validation error
              // Retry network/transient errors
              return true;
            },
          }
        );
      });

      const duration = Date.now() - startTime;
      logApiCall('binance', 'cancel_order', 'DELETE', duration, 200);

      logger.info('Binance order cancelled successfully', { orderId, pair });
    } catch (error) {
      logger.error('Failed to cancel Binance order', error instanceof Error ? error : null, {
        orderId,
        pair,
      });
      throw error;
    }
  }

  async getOrder(orderId: string, pair: string): Promise<Order | null> {
    this.validateKeys();
    this.validatePair(pair);

    const startTime = Date.now();

    try {
      logger.info('Fetching Binance order', { orderId, pair });

      const symbol = this.normalizeSymbol(pair);

      // Use circuit breaker + retry for resilience
      const data = await this.circuitBreaker.execute(async () => {
        return await withRetry(
          async () => {
            const params = {
              symbol,
              orderId: parseInt(orderId), // Binance expects numeric orderId
              recvWindow: 5000,
            };

            return await this.privateRequest('/v3/order', params, 'GET');
          },
          {
            maxRetries: 2,
            baseDelay: 100,
            maxDelay: 1000,
          }
        );
      });

      const duration = Date.now() - startTime;
      logApiCall('binance', 'get_order', 'GET', duration, 200);

      // Map Binance order response to Order interface
      const order: Order = {
        id: data.orderId.toString(),
        pair,
        side: data.side.toLowerCase(),
        amount: parseFloat(data.origQty),
        price: parseFloat(data.price),
        status: data.status.toLowerCase(),
        timestamp: new Date(data.transactTime),
      };

      return order;
    } catch (error) {
      logger.error('Failed to get Binance order', error instanceof Error ? error : null, {
        orderId,
        pair,
      });
      throw error;
    }
  }

  async listOpenOrders(pair: string): Promise<Order[]> {
    this.validateKeys();
    this.validatePair(pair);

    const startTime = Date.now();

    try {
      logger.info('Listing Binance open orders', { pair });

      const symbol = this.normalizeSymbol(pair);

      // Use circuit breaker + retry for resilience
      const data = await this.circuitBreaker.execute(async () => {
        return await withRetry(
          async () => {
            const params = {
              symbol,
              recvWindow: 5000,
            };

            return await this.privateRequest('/v3/openOrders', params, 'GET');
          },
          {
            maxRetries: 2,
            baseDelay: 100,
            maxDelay: 1000,
          }
        );
      });

      const duration = Date.now() - startTime;
      logApiCall('binance', 'list_open_orders', 'GET', duration, 200);

      // Map Binance orders to Order interface
      const orders: Order[] = data.map((orderData: any) => ({
        id: orderData.orderId.toString(),
        pair,
        side: orderData.side.toLowerCase(),
        amount: parseFloat(orderData.origQty),
        price: parseFloat(orderData.price),
        status: orderData.status.toLowerCase(),
        timestamp: new Date(orderData.transactTime),
      }));

      logger.info('Binance open orders listed', { pair, count: orders.length });

      return orders;
    } catch (error) {
      logger.error('Failed to list Binance orders', error instanceof Error ? error : null, {
        pair,
      });
      throw error;
    }
  }

  async getBalance(asset: string): Promise<Balance | null> {
    this.validateKeys();

    try {
      logger.info('Fetching Binance balance for asset', { asset });

      // Use circuit breaker + retry for resilience
      const data = await this.circuitBreaker.execute(async () => {
        return await withRetry(
          async () => {
            const allBalances = await this.privateRequest('/v3/account', {});
            return allBalances;
          },
          {
            maxRetries: 2,
            baseDelay: 200,
            maxDelay: 2000,
          }
        );
      });

      // Find the specific asset balance
      const balance = data.balances.find((b: any) => b.asset === asset);

      if (!balance) {
        logger.warn('Asset balance not found', { asset });
        return null;
      }

      return {
        asset: balance.asset,
        free: parseFloat(balance.free),
        locked: parseFloat(balance.locked),
        total: parseFloat(balance.free) + parseFloat(balance.locked),
      };
    } catch (error) {
      logger.error('Failed to get Binance balance', error instanceof Error ? error : null, {
        asset,
      });
      throw error;
    }
  }

  async getBalances(): Promise<Balance[]> {
    this.validateKeys();

    const startTime = Date.now();

    try {
      logger.info('Fetching Binance balances');

      // Use circuit breaker + retry with exponential backoff
      const data = await this.circuitBreaker.execute(async () => {
        return await withRetry(
          async () => {
            return await this.privateRequest('/v3/account', {});
          },
          {
            maxRetries: 2,
            baseDelay: 200,
            maxDelay: 2000,
          }
        );
      });

      const duration = Date.now() - startTime;
      logApiCall('binance', 'get_balances', 'GET', duration, 200);

      // Filter out zero balances and map to Balance type
      return data.balances
        .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
        .map((b: any) => ({
          asset: b.asset,
          free: parseFloat(b.free),
          locked: parseFloat(b.locked),
          total: parseFloat(b.free) + parseFloat(b.locked),
        }));
    } catch (error) {
      logger.error('Failed to get Binance balances', error instanceof Error ? error : null);
      throw error;
    }
  }

  async getTicker(pair: string): Promise<Ticker> {
    this.validatePair(pair);

    const startTime = Date.now();

    try {
      // Use circuit breaker + retry with exponential backoff
      const ticker = await this.circuitBreaker.execute(async () => {
        return await withRetry(
          async () => {
            // Convert pair to Binance format (e.g., BTC/USDT -> BTCUSDT)
            const symbol = this.normalizeSymbol(pair);

            const data = await this.publicRequest(`/v3/ticker/24hr?symbol=${symbol}`);

            // Binance /v3/ticker/24hr returns comprehensive market data
            // API docs: https://binance-docs.github.io/apidocs/spot/en/#24hr-ticker-price-change-statistics
            const parsedTicker: Ticker = {
              pair,
              bid: parseFloat(data.bidPrice),
              ask: parseFloat(data.askPrice),
              last: parseFloat(data.lastPrice),
              volume: parseFloat(data.volume),
              timestamp: new Date(),
              // Include 24h statistics from Binance response
              priceChange: parseFloat(data.priceChange), // Absolute change in price
              priceChangePercent: parseFloat(data.priceChangePercent), // % change
              highPrice: parseFloat(data.highPrice), // 24h high
              lowPrice: parseFloat(data.lowPrice), // 24h low
              openPrice: parseFloat(data.openPrice), // Opening price
            };

            return parsedTicker;
          },
          {
            maxRetries: 3,
            baseDelay: 100,
            maxDelay: 2000,
          }
        );
      });

      const duration = Date.now() - startTime;
      logApiCall('binance', 'get_ticker', 'GET', duration, 200);

      return ticker;
    } catch (error) {
      logger.error('Failed to get Binance ticker', error instanceof Error ? error : null, {
        pair,
      });
      throw error;
    }
  }

  async getOHLCV(pair: string, timeframe: string, limit = 100): Promise<any[]> {
    this.validatePair(pair);

    const startTime = Date.now();

    try {
      // Convert pair to Binance format (e.g., BTC/USDT -> BTCUSDT)
      const symbol = this.normalizeSymbol(pair);

      // Map standard timeframes to Binance interval format
      const intervalMap: Record<string, string> = {
        '1m': '1m',
        '5m': '5m',
        '15m': '15m',
        '1h': '1h',
        '4h': '4h',
        '1d': '1d',
      };

      const interval = intervalMap[timeframe] || '1h';

      logger.info('Fetching Binance OHLCV', { pair, symbol, interval, limit });

      const data = await this.publicRequest(
        `/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
      );

      const duration = Date.now() - startTime;
      logApiCall('binance', 'get_ohlcv', 'GET', duration, 200);

      // Binance returns [time, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyVolume, takerBuyQuoteVolume, ignore]
      return data.map((candle: any) => ({
        timestamp: new Date(candle[0]),
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
      }));
    } catch (error) {
      logger.error('Failed to get Binance OHLCV', error instanceof Error ? error : null, {
        pair,
      });
      throw error;
    }
  }

  async getSupportedPairs(): Promise<string[]> {
    const startTime = Date.now();

    try {
      logger.info('Fetching Binance supported pairs');

      // Use circuit breaker + retry for resilience
      const data = await this.circuitBreaker.execute(async () => {
        return await withRetry(
          async () => {
            return await this.publicRequest('/v3/exchangeInfo');
          },
          {
            maxRetries: 2,
            baseDelay: 100,
            maxDelay: 2000,
          }
        );
      });

      const duration = Date.now() - startTime;
      logApiCall('binance', 'get_exchange_info', 'GET', duration, 200);

      // Filter for major USDT pairs only (consistent format with slash)
      const pairs = data.symbols
        .filter((symbol: any) =>
          symbol.quoteAsset === 'USDT' &&
          symbol.status === 'TRADING' &&
          ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK'].includes(symbol.baseAsset)
        )
        .map((symbol: any) => `${symbol.baseAsset}/${symbol.quoteAsset}`)
        .slice(0, 20);

      logger.info('Binance supported pairs fetched', { count: pairs.length });

      return pairs;
    } catch (error) {
      logger.error('Failed to get Binance supported pairs', error instanceof Error ? error : null);
      // Return major pairs as fallback (consistent format with slash)
      return ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT', 'DOGE/USDT'];
    }
  }

  async getMinOrderSize(pair: string): Promise<number> {
    this.validatePair(pair);

    try {
      logger.info('Fetching min order size for pair', { pair });

      const symbol = this.normalizeSymbol(pair);

      // Use circuit breaker + retry for resilience
      const data = await this.circuitBreaker.execute(async () => {
        return await withRetry(
          async () => {
            const exchangeInfo = await this.publicRequest('/v3/exchangeInfo');
            const symbolInfo = exchangeInfo.symbols.find((s: any) => s.symbol === symbol);
            return symbolInfo;
          },
          {
            maxRetries: 1,
            baseDelay: 100,
            maxDelay: 1000,
          }
        );
      });

      if (!data) {
        logger.warn('Symbol info not found, using default min order size', { pair });
        return 10; // $10 minimum by default
      }

      // Find NOTIONAL filter which specifies minimum order value
      const notionalFilter = data.filters.find((f: any) => f.filterType === 'NOTIONAL');

      if (notionalFilter && notionalFilter.minNotional) {
        const minSize = parseFloat(notionalFilter.minNotional);
        logger.info('Min order size fetched', { pair, minSize });
        return minSize;
      }

      return 10; // $10 minimum by default
    } catch (error) {
      logger.error('Failed to get Binance min order size', error instanceof Error ? error : null, {
        pair,
      });
      throw error;
    }
  }

  async getFees(): Promise<{ maker: number; taker: number }> {
    this.validateKeys();

    try {
      logger.info('Fetching Binance trading fees');

      // Use circuit breaker + retry for resilience
      const data = await this.circuitBreaker.execute(async () => {
        return await withRetry(
          async () => {
            // /v3/account returns commission info for user tier
            const account = await this.privateRequest('/v3/account', {});
            return {
              makerCommission: account.makerCommission / 10000, // Binance returns in basis points
              takerCommission: account.takerCommission / 10000,
            };
          },
          {
            maxRetries: 1,
            baseDelay: 200,
            maxDelay: 1000,
          }
        );
      });

      logger.info('Binance fees fetched', {
        maker: data.makerCommission,
        taker: data.takerCommission,
      });

      return {
        maker: data.makerCommission,
        taker: data.takerCommission,
      };
    } catch (error) {
      logger.error('Failed to get Binance fees, using defaults', error instanceof Error ? error : null);
      // Default Binance VIP0 fees if API fails
      return { maker: 0.001, taker: 0.001 };
    }
  }

  async getStatus(): Promise<boolean> {
    try {
      const response = await this.publicRequest('/v3/ping');
      return response !== null;
    } catch {
      return false;
    }
  }

  /**
   * Make public (unauthenticated) request to Binance API
   * Uses distributed rate limiter to coordinate across all instances
   */
  private async publicRequest(path: string): Promise<any> {
    try {
      // Use distributed rate limiter (shared across web/worker instances)
      await binanceRateLimiter.acquire(1);

      const response = await fetch(`${this.baseUrl}${path}`);
      if (!response.ok) {
        throw new Error(`Binance API error: ${response.statusText}`);
      }
      return response.json();
    } catch (error) {
      logger.error('Binance public request failed', error instanceof Error ? error : null, {
        path,
      });
      throw error;
    }
  }

  // Removed unused public SAPI helper

  /**
   * Make private (authenticated) request to Binance API with HMAC-SHA256 signing
   * Supports GET, POST, and DELETE methods
   * Uses distributed rate limiter to coordinate across all instances
   */
  private async privateRequest(
    path: string,
    params: Record<string, any>,
    method: 'GET' | 'POST' | 'DELETE' = 'GET'
  ): Promise<any> {
    this.validateKeys();

    try {
      if (!this.keys) {
        throw new Error('API keys not configured');
      }

      // Use distributed rate limiter (shared across web/worker instances)
      await binanceRateLimiter.acquire(1);

      // 1. Add timestamp
      params.timestamp = Date.now();

      // 2. Create query string
      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');

      // 3. Sign with HMAC-SHA256
      const signature = createHmac('sha256', this.keys.secretKey)
        .update(queryString)
        .digest('hex');

      // 4. Build URL and body based on method
      let url = this.baseUrl + path;
      let body: string | undefined;

      if (method === 'GET') {
        url += `?${queryString}&signature=${signature}`;
      } else {
        // For POST/DELETE, signature goes in query string
        url += `?signature=${signature}`;
        body = queryString;
      }

      // 5. Add X-MBX-APIKEY header and make request
      const response = await fetch(url, {
        method,
        headers: {
          'X-MBX-APIKEY': this.keys.publicKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });

      // Handle Binance-specific error responses
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Binance API error: ${response.status}`;

        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = `Binance API error: ${errorJson.code} ${errorJson.msg}`;
        } catch {
          errorMessage = `${errorMessage} ${errorText}`;
        }

        throw new Error(errorMessage);
      }

      logger.info('Binance private request successful', { path, method });
      return response.json();
    } catch (error) {
      logger.error('Binance private request failed', error instanceof Error ? error : null, {
        path,
        method,
      });
      throw error;
    }
  }
}
