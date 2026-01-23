import { marketDataAggregator } from '../aggregator';

// Mock the Redis module
jest.mock('@/lib/redis', () => ({
  getCached: jest.fn(),
  setCached: jest.fn(),
}));

// Mock the exchange adapter
jest.mock('@/services/exchanges/singleton', () => ({
  getExchangeAdapter: jest.fn(() => ({
    getTicker: jest.fn(async (pair: string) => ({
      symbol: pair,
      bid: 45000 + Math.random() * 1000,
      ask: 45100 + Math.random() * 1000,
      last: 45050 + Math.random() * 1000,
      volume: Math.random() * 1000,
      timestamp: Date.now(),
    })),
  })),
}));

// Mock the logger
jest.mock('@/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  logApiCall: jest.fn(),
}));

describe('MarketDataAggregator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    marketDataAggregator.clearCache();
  });

  it('should fetch market data for pairs', async () => {
    const pairs = ['BTC/USD', 'ETH/USD'];
    const data = await marketDataAggregator.getMarketData(pairs);

    expect(data.size).toBe(2);
    expect(data.has('BTC/USD')).toBe(true);
    expect(data.has('ETH/USD')).toBe(true);

    const btcData = data.get('BTC/USD');
    expect(btcData?.price).toBeGreaterThan(0);
    expect(btcData?.volume).toBeGreaterThanOrEqual(0);
  });

  it('should cache market data', async () => {
    const pairs = ['BTC/USD'];
    await marketDataAggregator.getMarketData(pairs);

    const cacheAgeMs = marketDataAggregator.getCacheAgeMs();
    expect(cacheAgeMs).toBeLessThan(500); // Should be reasonably fresh
  });

  it('should return cached data when fresh', async () => {
    const pairs = ['BTC/USD'];
    const data1 = await marketDataAggregator.getMarketData(pairs);
    const price1 = data1.get('BTC/USD')?.price;

    // Get again (should be from cache)
    const data2 = await marketDataAggregator.getMarketData(pairs);
    const price2 = data2.get('BTC/USD')?.price;

    // Prices should be identical (same cached data)
    expect(price1).toBe(price2);
  });

  it('should filter cached data by requested pairs', async () => {
    const pairs = ['BTC/USD', 'ETH/USD', 'SOL/USD'];
    await marketDataAggregator.getMarketData(pairs);

    // Request only BTC
    const btcData = await marketDataAggregator.getMarketData(['BTC/USD']);
    expect(btcData.size).toBe(1);
    expect(btcData.has('BTC/USD')).toBe(true);
  });

  it('should indicate when cache is stale', async () => {
    await marketDataAggregator.getMarketData(['BTC/USD']);
    expect(marketDataAggregator.isCacheStale()).toBe(false);
  });

  it('should handle cache miss gracefully', async () => {
    expect(marketDataAggregator.getCacheAgeMs()).toBe(-1);
  });
});
