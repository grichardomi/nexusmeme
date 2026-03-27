import { marketDataAggregator } from '../aggregator';

jest.mock('@/config/environment', () => ({
  getEnvironmentConfig: () => ({
    BINANCE_MARKET_DATA_URL: 'https://api.binance.us',
    SUPPORTED_EXCHANGES: 'binance',
    MARKET_DATA_CACHE_TTL_MS: 10000,
    MARKET_DATA_CACHE_STALE_TTL_MS: 30000,
  }),
  marketDataConfig: {
    cacheTtlMs: 10000,
    staleTtlMs: 30000,
    regimeCheckIntervalMs: 60000,
    disableExternalRegime: false,
  },
}));

// Mock the Redis module
jest.mock('@/lib/redis', () => ({
  getCached: jest.fn(),
  setCached: jest.fn(),
  getCachedMultiple: jest.fn().mockResolvedValue([]),
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

// fetchTickerBinance uses global fetch directly (not the exchange adapter singleton).
// Mock it to return a realistic Binance 24hr ticker payload.
function makeBinanceTicker(symbol: string) {
  return {
    ok: true,
    json: async () => ({
      symbol,
      lastPrice: '45050.00',
      bidPrice: '45000.00',
      askPrice: '45100.00',
      volume: '1234.56',
      quoteVolume: '55000000.00',
      priceChangePercent: '1.23',
      highPrice: '46000.00',
      lowPrice: '44000.00',
      closeTime: Date.now(),
    }),
  };
}

describe('MarketDataAggregator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    marketDataAggregator.clearCache();
    // Reset fetch mock before each test
    global.fetch = jest.fn().mockImplementation((url: string) => {
      const symbol = new URL(url).searchParams.get('symbol') ?? 'BTCUSDT';
      return Promise.resolve(makeBinanceTicker(symbol));
    }) as jest.Mock;
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
