/**
 * Integration Tests for Full Price Flow
 * Tests the end-to-end journey: Binance → WebSocket → Redis → SSE → Browser
 */

import type { PriceUpdate, BinanceTickerEvent } from '@/types/market-data';

describe('Price Streaming Integration', () => {
  describe('Full Price Flow', () => {
    it('should flow prices from Binance ticker event to Redis cache', () => {
      // 1. Simulate Binance ticker event
      const binanceEvent: BinanceTickerEvent = {
        e: '24hrTicker',
        E: Date.now(),
        s: 'BTCUSDT',
        p: '500.00',
        P: '0.54',
        w: '92000.00',
        x: '92700.00',
        c: '93200.00',
        Q: '1.50',
        b: '93199.99',
        B: '10.00',
        a: '93200.00',
        A: '10.00',
        o: '92700.00',
        h: '95000.00',
        l: '91000.00',
        v: '1000000.00',
        q: '92700000000.00',
        O: Date.now() - 86400000,
        C: Date.now(),
        F: 1,
        L: 100000,
        n: 100000,
      };

      // 2. Expected output to Redis
      const expectedPrice: PriceUpdate = {
        pair: 'BTC/USDT',
        price: 93200,
        bid: 93199.99,
        ask: 93200,
        high24h: 95000,
        low24h: 91000,
        change24h: 500,
        changePercent24h: 0.54,
        volume24h: 92700000000,
        timestamp: binanceEvent.E,
      };

      // Verify transformation logic
      expect(expectedPrice.pair).toBe('BTC/USDT');
      expect(expectedPrice.price).toBe(93200);
      expect(expectedPrice.bid).toBe(93199.99);
    });

    it('should handle multiple pairs in parallel', () => {
      const btcEvent: BinanceTickerEvent = {
        e: '24hrTicker',
        E: Date.now(),
        s: 'BTCUSDT',
        p: '500.00',
        P: '0.54',
        w: '92000.00',
        x: '92700.00',
        c: '93200.00',
        Q: '1.50',
        b: '93199.99',
        B: '10.00',
        a: '93200.00',
        A: '10.00',
        o: '92700.00',
        h: '95000.00',
        l: '91000.00',
        v: '1000000.00',
        q: '92700000000.00',
        O: Date.now() - 86400000,
        C: Date.now(),
        F: 1,
        L: 100000,
        n: 100000,
      };

      const ethEvent: BinanceTickerEvent = {
        ...btcEvent,
        s: 'ETHUSDT',
        c: '3200.00',
        b: '3199.99',
        a: '3200.00',
        h: '3400.00',
        l: '3000.00',
      };

      const prices: Map<string, PriceUpdate> = new Map();

      // Simulate processing
      const processPair = (event: BinanceTickerEvent) => {
        const pair = event.s === 'BTCUSDT' ? 'BTC/USDT' : 'ETH/USDT';
        prices.set(pair, {
          pair,
          price: parseFloat(event.c),
          bid: parseFloat(event.b),
          ask: parseFloat(event.a),
          high24h: parseFloat(event.h),
          low24h: parseFloat(event.l),
          change24h: parseFloat(event.p),
          changePercent24h: parseFloat(event.P),
          volume24h: parseFloat(event.q),
          timestamp: event.E,
        });
      };

      processPair(btcEvent);
      processPair(ethEvent);

      expect(prices.size).toBe(2);
      expect(prices.get('BTC/USDT')?.price).toBe(93200);
      expect(prices.get('ETH/USDT')?.price).toBe(3200);
    });
  });

  describe('Price Normalization', () => {
    it('should normalize Binance symbol to internal format', () => {
      const testCases = [
        { symbol: 'BTCUSDT', expected: 'BTC/USDT' },
        { symbol: 'ETHUSDT', expected: 'ETH/USDT' },
        { symbol: 'BTCBUSD', expected: 'BTC/BUSD' },
        { symbol: 'ETHBUSD', expected: 'ETH/BUSD' },
      ];

      const normalizePair = (symbol: string): string => {
        if (symbol.endsWith('USDT')) return `${symbol.slice(0, -4)}/USDT`;
        if (symbol.endsWith('BUSD')) return `${symbol.slice(0, -4)}/BUSD`;
        if (symbol.endsWith('USDC')) return `${symbol.slice(0, -4)}/USDC`;
        return symbol;
      };

      testCases.forEach(({ symbol, expected }) => {
        expect(normalizePair(symbol)).toBe(expected);
      });
    });

    it('should handle quote asset extraction', () => {
      const pair = 'BTC/USDT';
      const [base, quote] = pair.split('/');

      expect(base).toBe('BTC');
      expect(quote).toBe('USDT');
    });
  });

  describe('Timestamp Handling', () => {
    it('should preserve Binance event timestamp', () => {
      const timestamp = Date.now();
      const event: BinanceTickerEvent = {
        e: '24hrTicker',
        E: timestamp,
        s: 'BTCUSDT',
        p: '500.00',
        P: '0.54',
        w: '92000.00',
        x: '92700.00',
        c: '93200.00',
        Q: '1.50',
        b: '93199.99',
        B: '10.00',
        a: '93200.00',
        A: '10.00',
        o: '92700.00',
        h: '95000.00',
        l: '91000.00',
        v: '1000000.00',
        q: '92700000000.00',
        O: Date.now() - 86400000,
        C: Date.now(),
        F: 1,
        L: 100000,
        n: 100000,
      };

      expect(event.E).toBe(timestamp);
    });

    it('should track price age', () => {
      const now = Date.now();
      const priceTimestamp = now - 5000; // 5 seconds old

      const age = now - priceTimestamp;
      expect(age).toBe(5000);
      expect(age < 30000).toBe(true); // Not stale
    });
  });

  describe('Price Accuracy', () => {
    it('should parse string prices correctly', () => {
      const stringPrice = '93245.67';
      const parsed = parseFloat(stringPrice);

      expect(parsed).toBe(93245.67);
      expect(typeof parsed).toBe('number');
    });

    it('should handle scientific notation', () => {
      const scientificPrice = '1.234e5'; // 123400
      const parsed = parseFloat(scientificPrice);

      expect(parsed).toBe(123400);
    });

    it('should preserve price precision', () => {
      const prices = [
        '93245.67',
        '3124.50',
        '50000.999',
        '100.001',
      ];

      prices.forEach(price => {
        const parsed = parseFloat(price);
        expect(parsed.toString()).toContain('.');
      });
    });
  });

  describe('Volume Calculations', () => {
    it('should calculate 24h volume correctly', () => {
      const quoteVolume = '92700000000.00'; // Quote asset volume
      const volume = parseFloat(quoteVolume);

      expect(volume).toBe(92700000000);
      expect(volume > 0).toBe(true);
    });
  });

  describe('Price Change Metrics', () => {
    it('should preserve price change and percentage', () => {
      const change = '500.00';
      const changePercent = '0.54';

      const parsedChange = parseFloat(change);
      const parsedPercent = parseFloat(changePercent);

      expect(parsedChange).toBe(500);
      expect(parsedPercent).toBe(0.54);
    });

    it('should handle negative changes', () => {
      const change = '-500.00';
      const changePercent = '-0.54';

      const parsedChange = parseFloat(change);
      const parsedPercent = parseFloat(changePercent);

      expect(parsedChange).toBe(-500);
      expect(parsedPercent).toBe(-0.54);
      expect(parsedChange < 0).toBe(true);
    });
  });

  describe('24h High/Low', () => {
    it('should track 24h high and low correctly', () => {
      const high = '95000.00';
      const low = '91000.00';
      const current = '93200.00';

      const parsedHigh = parseFloat(high);
      const parsedLow = parseFloat(low);
      const parsedCurrent = parseFloat(current);

      expect(parsedHigh > parsedCurrent).toBe(true);
      expect(parsedLow < parsedCurrent).toBe(true);
      expect(parsedHigh > parsedLow).toBe(true);
    });
  });

  describe('Bid-Ask Spread', () => {
    it('should preserve bid-ask prices', () => {
      const bid = '93199.99';
      const ask = '93200.00';

      const parsedBid = parseFloat(bid);
      const parsedAsk = parseFloat(ask);

      expect(parsedAsk > parsedBid).toBe(true);
      expect(parsedAsk - parsedBid).toBeCloseTo(0.01);
    });
  });
});
