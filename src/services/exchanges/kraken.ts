import { BaseExchangeAdapter } from './adapter';
import { logger, logApiCall } from '@/lib/logger';
import type { ApiKeys, Order, Balance, Ticker, OrderResult } from '@/types/exchange';
import crypto from 'crypto';

/**
 * Kraken Exchange Adapter
 * Implements ExchangeAdapter interface for Kraken API
 *
 * Supports: BTC, ETH, SOL, etc. with USD, USDT quote
 * Rate limits: 15 requests per second (tier 2)
 */
export class KrakenAdapter extends BaseExchangeAdapter {
  private baseUrl = 'https://api.kraken.com';

  getName(): string {
    return 'kraken';
  }

  async connect(keys: ApiKeys): Promise<void> {
    this.keys = keys;
    logger.info('Connecting to Kraken', { exchange: 'kraken' });

    // Validate connection with minimal API call
    const valid = await this.validateConnection();
    if (!valid) {
      throw new Error('Failed to validate Kraken API keys');
    }

    this.isConnected = true;
    logger.info('Connected to Kraken');
  }

  async validateConnection(): Promise<boolean> {
    try {
      this.validateKeys();

      // Make minimal API call to verify keys work
      const response = await this.publicRequest('/0/public/SystemStatus');
      const status = (response as any)?.result?.status;

      logger.info('Kraken connection validated', { status });
      return status === 'online';
    } catch (error) {
      logger.error('Kraken connection validation failed', error instanceof Error ? error : null);
      return false;
    }
  }

  async placeOrder(
    order: Omit<Order, 'id' | 'status' | 'timestamp'>
  ): Promise<OrderResult> {
    this.validateKeys();
    this.validatePair(order.pair);
    this.validateAmount(order.amount);

    const startTime = Date.now();

    try {
      logger.info('Placing Kraken order', {
        pair: order.pair,
        side: order.side,
        amount: order.amount,
        price: order.price,
      });

      // Convert pair to Kraken format
      const krakenPair = this.convertToPairFormat(order.pair);

      // Prepare order parameters for Kraken AddOrder API
      // Kraken uses 'type' for buy/sell direction and 'ordertype' for limit/market
      const params: Record<string, any> = {
        pair: krakenPair,
        type: order.side, // 'buy' or 'sell' - Kraken API uses 'type' not 'side'
        ordertype: 'limit', // Limit order type
        volume: order.amount.toString(),
        price: order.price.toString(),
      };

      // Call Kraken API
      const result = await this.privateRequest('/0/private/AddOrder', params);

      logApiCall('kraken', 'place_order', 'POST', Date.now() - startTime, 200);

      // Kraken returns: { txid: [...orderIds...], descr: {...} }
      if (!result || !result.txid || result.txid.length === 0) {
        logger.warn('Kraken order placed but no order ID returned', { result });
        throw new Error('No order ID returned from Kraken API');
      }

      const orderId = result.txid[0]; // First order ID

      // Query the order to get fee information
      let fee: number | undefined;
      try {
        const queryResult = await this.privateRequest('/0/private/QueryOrders', {
          txid: orderId,
        });

        if (queryResult && queryResult[orderId]) {
          const orderData = queryResult[orderId];
          fee = parseFloat(orderData.fee) || undefined;
          logger.debug('Captured Kraken order fee', { orderId, fee });
        }
      } catch (feeError) {
        logger.warn('Failed to query order fee from Kraken', {
          orderId,
          error: feeError instanceof Error ? feeError.message : String(feeError),
        });
        // Continue without fee data - will fall back to default calculation
      }

      return {
        orderId,
        pair: order.pair,
        side: order.side,
        amount: order.amount,
        price: order.price,
        timestamp: new Date(),
        status: 'pending',
        fee,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const status = (error as any)?.status || 500;
      logApiCall('kraken', 'place_order', 'POST', duration, status);

      logger.error('Failed to place Kraken order', error instanceof Error ? error : null, {
        pair: order.pair,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async cancelOrder(orderId: string, pair: string): Promise<void> {
    this.validateKeys();

    const startTime = Date.now();

    try {
      logger.info('Cancelling Kraken order', { orderId, pair });

      const result = await this.privateRequest('/0/private/CancelOrder', {
        txid: orderId,
      });

      logApiCall('kraken', 'cancel_order', 'POST', Date.now() - startTime, 200);

      logger.info('Kraken order cancelled successfully', {
        orderId,
        result,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      const status = (error as any)?.status || 500;
      logApiCall('kraken', 'cancel_order', 'POST', duration, status);

      logger.error('Failed to cancel Kraken order', error instanceof Error ? error : null, {
        orderId,
      });
      throw error;
    }
  }

  async getOrder(orderId: string, pair: string): Promise<Order | null> {
    this.validateKeys();

    try {
      const result = await this.privateRequest('/0/private/QueryOrders', {
        txid: orderId,
      });

      if (!result || !result[orderId]) {
        logger.debug('Order not found', { orderId });
        return null;
      }

      const orderData = result[orderId];

      // Map Kraken order status to our Order interface
      const statusMap: Record<string, 'open' | 'closed' | 'cancelled'> = {
        'pending': 'open',
        'open': 'open',
        'closed': 'closed',
        'canceled': 'cancelled',
        'cancelled': 'cancelled',
        'expired': 'cancelled',
      };

      return {
        id: orderId,
        pair,
        side: orderData.descr?.side === 'buy' ? 'buy' : 'sell',
        amount: parseFloat(orderData.vol) || 0,
        price: parseFloat(orderData.descr?.price) || 0,
        status: statusMap[orderData.status] || 'open',
        timestamp: new Date(orderData.opentm * 1000),
        fee: parseFloat(orderData.fee) || undefined,
      };
    } catch (error) {
      logger.error('Failed to get Kraken order', error instanceof Error ? error : null, {
        orderId,
      });
      throw error;
    }
  }

  async listOpenOrders(pair: string): Promise<Order[]> {
    this.validateKeys();

    try {
      logger.info('Listing Kraken open orders', { pair });

      const krakenPair = this.convertToPairFormat(pair);
      const result = await this.privateRequest('/0/private/OpenOrders', {});

      if (!result || !result.open) {
        logger.debug('No open orders found');
        return [];
      }

      const orders: Order[] = [];

      for (const [orderId, orderData] of Object.entries(result.open)) {
        const orderInfo = orderData as Record<string, any>;

        // Filter by pair if specified
        if (orderInfo.descr?.pair !== krakenPair) {
          continue;
        }

        orders.push({
          id: orderId,
          pair,
          side: orderInfo.descr?.side === 'buy' ? 'buy' : 'sell',
          amount: parseFloat(orderInfo.vol) || 0,
          price: parseFloat(orderInfo.descr?.price) || 0,
          status: 'open',
          timestamp: new Date(orderInfo.opentm * 1000),
          fee: parseFloat(orderInfo.fee) || undefined,
        });
      }

      logger.info('Found open orders', { pair, count: orders.length });
      return orders;
    } catch (error) {
      logger.error('Failed to list Kraken orders', error instanceof Error ? error : null, {
        pair,
      });
      throw error;
    }
  }

  async getBalance(asset: string): Promise<Balance | null> {
    this.validateKeys();

    try {
      // Get all balances and find the one we need
      const balances = await this.getBalances();
      const balance = balances.find(b => b.asset.toUpperCase() === asset.toUpperCase());
      return balance || null;
    } catch (error) {
      logger.error('Failed to get Kraken balance', error instanceof Error ? error : null, {
        asset,
      });
      throw error;
    }
  }

  async getBalances(): Promise<Balance[]> {
    this.validateKeys();

    try {
      logger.info('Fetching Kraken balances');

      const result = await this.privateRequest('/0/private/Balance', {});

      if (!result) {
        logger.warn('No balance data returned from Kraken');
        return [];
      }

      const balances: Balance[] = [];

      // Map Kraken asset names to standard symbols
      const assetMap: Record<string, string> = {
        'XXBT': 'BTC',
        'XBT': 'BTC',
        'XETH': 'ETH',
        'ETH': 'ETH',
        'ZEUR': 'EUR',
        'EUR': 'EUR',
        'ZUSD': 'USD',
        'USD': 'USD',
        'USDT': 'USDT',
        'SOL': 'SOL',
        'XRPL': 'XRP',
        'XRP': 'XRP',
      };

      for (const [krakenAsset, balanceValue] of Object.entries(result)) {
        const standardAsset = assetMap[krakenAsset] || krakenAsset;
        const total = parseFloat(balanceValue as string) || 0;

        // Kraken balance endpoint returns total balance only
        // For locked/free, we need to query open orders separately
        if (total > 0) {
          balances.push({
            asset: standardAsset,
            free: total, // Simplified - Kraken doesn't separate free/locked in Balance endpoint
            locked: 0,
            total,
          });
        }
      }

      logger.info('Fetched Kraken balances', { count: balances.length });
      return balances;
    } catch (error) {
      logger.error('Failed to get Kraken balances', error instanceof Error ? error : null);
      throw error;
    }
  }

  async getTicker(pair: string): Promise<Ticker> {
    this.validatePair(pair);

    const startTime = Date.now();

    try {
      const krakenPair = this.convertToPairFormat(pair);

      const result = await this.publicRequest('Ticker', {
        pair: krakenPair,
      });

      logApiCall('kraken', 'get_ticker', 'GET', Date.now() - startTime, 200);

      // Kraken returns: { PAIR: { a: [ask, wholeLotAsk, askVolume], b: [bid, ...], c: [last, volume], ... } }
      const tickerData = result[krakenPair];

      if (!tickerData) {
        logger.warn('No ticker data for pair', { pair, krakenPair });
        throw new Error(`No data for pair ${pair}`);
      }

      // Extract values from Kraken response
      const ask = parseFloat(tickerData.a?.[0]) || 0;
      const bid = parseFloat(tickerData.b?.[0]) || 0;
      const last = parseFloat(tickerData.c?.[0]) || 0;
      const volume = parseFloat(tickerData.v?.[1]) || 0; // 24h volume

      const ticker: Ticker = {
        pair,
        bid,
        ask,
        last,
        volume,
        timestamp: new Date(),
      };

      logger.debug('Fetched ticker', { pair, bid, ask, last });
      return ticker;
    } catch (error) {
      const duration = Date.now() - startTime;
      logApiCall('kraken', 'get_ticker', 'GET', duration, 500);

      logger.error('Failed to get Kraken ticker', error instanceof Error ? error : null, {
        pair,
      });
      throw error;
    }
  }

  async getOHLCV(pair: string, timeframe: string, limit = 100): Promise<any[]> {
    this.validatePair(pair);

    try {
      logger.info('Fetching Kraken OHLCV', { pair, timeframe, limit });

      // Convert standard pair format to Kraken format
      const krakenPair = this.convertToPairFormat(pair);
      logger.debug('Converted pair to Kraken format', { original: pair, kraken: krakenPair });

      // Map timeframe to Kraken interval (in minutes)
      const intervalMap: Record<string, number> = {
        '1m': 1, '5m': 5, '15m': 15, '30m': 30,
        '1h': 60, '4h': 240,
        '1d': 1440, '1w': 10080, '15d': 21600
      };
      const interval = intervalMap[timeframe] || 60;

      // Use the new publicRequest signature: endpoint + params
      const data = await this.publicRequest('OHLC', {
        pair: krakenPair,
        interval: interval.toString(),
      });

      logger.info('Kraken OHLC response received', { pair, krakenPair, responseKeys: Object.keys(data).slice(0, 5) });

      // Find the candlestick data in response
      // Kraken returns: { result: { PAIR: [...candles...], last: 123456 }, error: [] }
      if (!data.result || typeof data.result !== 'object') {
        logger.warn('Invalid Kraken response structure', { pair, krakenPair, hasResult: !!data.result });
        return [];
      }

      // Look for candle data under the pair key in result
      let candles: any[] = [];
      if (Array.isArray(data.result[krakenPair])) {
        candles = data.result[krakenPair];
        logger.info('Found candles in result', { key: krakenPair, count: candles.length });
      } else {
        // Fallback: search for first array in result (might be under a different key)
        for (const key of Object.keys(data.result)) {
          if (Array.isArray(data.result[key]) && key !== 'last') {
            candles = data.result[key];
            logger.info('Found candles in result', { key, count: candles.length });
            break;
          }
        }
      }

      if (candles.length === 0) {
        logger.warn('No candle data found in Kraken response', { pair, krakenPair, resultKeys: Object.keys(data.result || {}) });
        return [];
      }

      // Remove the last incomplete candle and limit to requested amount
      return candles
        .slice(0, -1) // Remove last incomplete candle
        .slice(0, limit)
        .map((candle: any[]) => ({
          timestamp: Number(candle[0]) * 1000,
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[6]),
        }));
    } catch (error) {
      logger.error('Failed to get Kraken OHLCV', error instanceof Error ? error : null, {
        pair,
      });
      return [];
    }
  }

  /**
   * Convert standard pair format to Kraken format
   * BTC/USD -> XXBTZUSD, ETH/USD -> XETHZUSD, BTC/USDT -> XXBTUSDT
   */
  private convertToPairFormat(pair: string): string {
    const [base, quote] = pair.split('/');

    // Map common base symbols to Kraken prefixes
    const baseMap: Record<string, string> = {
      'BTC': 'XXBT',  // Bitcoin
      'ETH': 'XETH',  // Ethereum
      'SOL': 'SOL',
      'XRP': 'XXRP',
      'ADA': 'ADA',
      'DOT': 'DOT',
      'LTC': 'XLTC',  // Litecoin
      'BCH': 'XBCH',  // Bitcoin Cash
      'XMR': 'XXMR',  // Monero
      'ZEC': 'XZEC',  // Zcash
    };

    // Map common quote symbols to Kraken suffixes
    const quoteMap: Record<string, string> = {
      'USD': 'ZUSD',
      'EUR': 'ZEUR',
      'USDT': 'USDT',
      'USDC': 'USDC',
    };

    const krakenBase = baseMap[base] || base;
    const krakenQuote = quoteMap[quote] || quote;

    return `${krakenBase}${krakenQuote}`;
  }

  /**
   * Convert Kraken format back to standard format
   * XXBTZUSD -> BTC/USD, XETHZUSD -> ETH/USD, XXBTUSDT -> BTC/USDT
   */
  private mapFromKrakenFormat(krakenBase: string, krakenQuote: string): string | null {
    // Reverse map from Kraken format to standard
    const baseMap: Record<string, string> = {
      'XXBT': 'BTC',
      'XBT': 'BTC',
      'XETH': 'ETH',
      'ETH': 'ETH',
      'SOL': 'SOL',
      'XXRP': 'XRP',
      'XRP': 'XRP',
      'ADA': 'ADA',
      'DOT': 'DOT',
      'XLTC': 'LTC',
      'LTC': 'LTC',
      'XBCH': 'BCH',
      'BCH': 'BCH',
      'XXMR': 'XMR',
      'XMR': 'XMR',
      'XZEC': 'ZEC',
      'ZEC': 'ZEC',
    };

    const quoteMap: Record<string, string> = {
      'ZUSD': 'USD',
      'USD': 'USD',
      'ZEUR': 'EUR',
      'EUR': 'EUR',
      'USDT': 'USDT',
      'USDC': 'USDC',
    };

    const base = baseMap[krakenBase];
    const quote = quoteMap[krakenQuote];

    if (base && quote) {
      return `${base}/${quote}`;
    }

    return null;
  }

  async getSupportedPairs(): Promise<string[]> {
    try {
      logger.info('Fetching Kraken supported pairs');

      const result = await this.publicRequest('AssetPairs', {});

      if (!result) {
        logger.warn('No supported pairs returned from Kraken');
        return [];
      }

      const pairs: string[] = [];

      // Filter for major trading pairs (BTC, ETH, SOL, etc. with USD/USDT)
      const supportedBases = ['XXBT', 'XBT', 'XETH', 'ETH', 'SOL', 'XRPL', 'ADA'];
      const supportedQuotes = ['ZUSD', 'USDT', 'ZEUR'];

      for (const [_pairKey, pairData] of Object.entries(result)) {
        const pair = pairData as Record<string, any>;

        // Check if base and quote match our criteria
        const base = pair.base;
        const quote = pair.quote;

        if (supportedBases.includes(base) && supportedQuotes.includes(quote)) {
          // Map back to standard format
          const standardPair = this.mapFromKrakenFormat(base, quote);
          if (standardPair && !pairs.includes(standardPair)) {
            pairs.push(standardPair);
          }
        }
      }

      logger.info('Fetched supported pairs', { count: pairs.length });
      return pairs.length > 0 ? pairs : ['BTC/USD', 'ETH/USD', 'BTC/USDT', 'ETH/USDT'];
    } catch (error) {
      logger.error('Failed to get Kraken supported pairs', error instanceof Error ? error : null);
      // Return fallback pairs if API fails
      return ['BTC/USD', 'ETH/USD', 'BTC/USDT', 'ETH/USDT'];
    }
  }

  async getMinOrderSize(pair: string): Promise<number> {
    this.validatePair(pair);

    try {
      const krakenPair = this.convertToPairFormat(pair);

      const result = await this.publicRequest('AssetPairs', {});

      if (!result || !result[krakenPair]) {
        logger.warn('No pair info found for min order size', { pair, krakenPair });
        return 10; // Default fallback
      }

      const pairInfo = result[krakenPair];
      const minOrderValue = parseFloat(pairInfo.ordermin) || 10;

      logger.debug('Got min order size', { pair, minOrderValue });
      return minOrderValue;
    } catch (error) {
      logger.error('Failed to get Kraken min order size', error instanceof Error ? error : null, {
        pair,
      });
      // Return sensible default on error
      return 10;
    }
  }

  async getFees(): Promise<{ maker: number; taker: number }> {
    try {
      const result = await this.privateRequest('/0/private/TradeVolume', {});

      if (result && result.fees) {
        // Kraken returns fees as percentage (e.g., 0.26 for 0.26%)
        // Convert to decimal form (0.26% = 0.0026)
        const fees = result.fees as Record<string, any>;

        // Get the first pair's fees as representative
        for (const [_pair, feeInfo] of Object.entries(fees)) {
          const fee = feeInfo as Record<string, any>;
          return {
            maker: parseFloat(fee.maker) / 100 || 0.0016,
            taker: parseFloat(fee.taker) / 100 || 0.0026,
          };
        }
      }

      // Default Kraken fees if API doesn't return anything
      return { maker: 0.0016, taker: 0.0026 };
    } catch (error) {
      logger.error('Failed to get Kraken fees', error instanceof Error ? error : null);
      // Return default fees on error
      return { maker: 0.0016, taker: 0.0026 };
    }
  }

  async getStatus(): Promise<boolean> {
    try {
      const response = await this.publicRequest('/0/public/SystemStatus');
      const status = (response as any)?.result?.status;
      return status === 'online';
    } catch {
      return false;
    }
  }

  /**
   * Make public (unauthenticated) request to Kraken API
   * Supports both legacy path-only calls and new endpoint+params calls
   */
  private async publicRequest(pathOrEndpoint: string, params?: Record<string, string>): Promise<any> {
    try {
      let url: string;

      if (params) {
        // New signature: endpoint + params as separate arguments
        const urlObj = new URL(`${this.baseUrl}/0/public/${pathOrEndpoint}`);
        Object.entries(params).forEach(([key, value]) => {
          urlObj.searchParams.append(key, value);
        });
        url = urlObj.toString();
      } else {
        // Legacy signature: full path including /0/public/
        url = `${this.baseUrl}${pathOrEndpoint}`;
      }

      logger.debug('Kraken API request', { url: url.replace(/api\.kraken\.com/, 'api.kraken.com') });

      const response = await fetch(url);
      if (!response.ok) {
        logger.error('Kraken API error response', null, { status: response.status, statusText: response.statusText });
        throw new Error(`Kraken API error: ${response.statusText}`);
      }
      const data = await response.json();
      logger.debug('Kraken API response received', { endpoint: pathOrEndpoint, hasError: data.error && data.error.length > 0 });

      if (data.error && data.error.length > 0) {
        logger.error('Kraken API returned error', null, { errors: data.error });
        return {};
      }

      return data;
    } catch (error) {
      logger.error('Kraken public request failed', error instanceof Error ? error : null, {
        endpoint: pathOrEndpoint,
      });
      return {};
    }
  }

  /**
   * Make private (authenticated) request to Kraken API
   * Implements HMAC-SHA512 signing per Kraken API specification
   */
  private async privateRequest(path: string, params: Record<string, any> = {}): Promise<any> {
    this.validateKeys();

    try {
      // 1. Add nonce to params (milliseconds as integer)
      const nonce = Date.now().toString();
      const requestParams = { ...params, nonce };

      // 2. Create request body (URL-encoded)
      const body = new URLSearchParams(requestParams).toString();

      // 3. Prepare signing data
      // Kraken requires: HMAC-SHA512(path + SHA256(nonce + body), base64_secret)
      const secret = Buffer.from(this.keys!.secretKey, 'base64');
      const message = nonce + body;
      const messageHash = crypto.createHash('sha256').update(message).digest();
      const pathBuffer = Buffer.from(path, 'utf-8');
      const signMessage = Buffer.concat([pathBuffer, messageHash]);

      // 4. Sign with HMAC-SHA512
      const signature = crypto
        .createHmac('sha512', secret)
        .update(signMessage)
        .digest('base64');

      // 5. Make request
      const url = `${this.baseUrl}${path}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'API-Key': this.keys!.publicKey,
          'API-Sign': signature,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Kraken private API error response', null, {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          path,
        });
        throw new Error(`Kraken API error: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();

      // Check for Kraken-specific errors
      if (data.error && Array.isArray(data.error) && data.error.length > 0) {
        logger.error('Kraken API returned error', null, {
          errors: data.error,
          path,
        });
        const errorMsg = data.error.join('; ');
        const error = new Error(`Kraken API error: ${errorMsg}`);
        // Mark as retryable for transient errors
        (error as any).retryable = errorMsg.includes('rate limit') || errorMsg.includes('timeout');
        throw error;
      }

      logger.debug('Kraken private request succeeded', { path, hasResult: !!data.result });
      return data.result || data;
    } catch (error) {
      logger.error('Kraken private request failed', error instanceof Error ? error : null, {
        path,
      });
      throw error;
    }
  }
}
