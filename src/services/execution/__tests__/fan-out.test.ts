import { executionFanOut } from '../fan-out';
import type { TradeDecision } from '@/types/market';

jest.mock('@/config/environment', () => ({
  getEnv: (key: string) => ({
    TRIAL_MAX_CAPITAL: 1000,
    MARKET_DATA_CACHE_TTL_MS: 10000,
    MARKET_DATA_CACHE_STALE_TTL_MS: 30000,
    REGIME_CHECK_INTERVAL_MS: 60000,
    DISABLE_EXTERNAL_MARKET_REGIME: false,
  }[key] ?? 0),
  marketDataConfig: {
    cacheTtlMs: 10000,
    staleTtlMs: 30000,
    regimeCheckIntervalMs: 60000,
    disableExternalRegime: false,
  },
  getEnvironmentConfig: () => ({
    TRIAL_MAX_CAPITAL: 1000,
    BINANCE_API_BASE_URL: 'https://api.binance.us',
    RISK_STRONG_MOMENTUM_OVERRIDE_PCT: 2.5,
    REGIME_SIZE_STRONG: 1.5,
    REGIME_SIZE_MODERATE: 0.75,
    REGIME_SIZE_WEAK: 0.75,
    REGIME_SIZE_TRANSITIONING: 0.5,
    REGIME_SIZE_CHOPPY: 0.5,
    PYRAMID_L1_MIN_ADX: 35,
    PYRAMID_L2_MIN_ADX: 40,
    PYRAMID_L1_AI_CONFIDENCE: 85,
    PYRAMID_L2_AI_CONFIDENCE: 90,
    PYRAMID_L1_SIZE_MULTIPLIER: 0.5,
    PYRAMID_L2_SIZE_MULTIPLIER: 0.3,
    CAPITAL_PRESERVATION_LAYER2_5PCT_MULTIPLIER: 0.5,
    CAPITAL_PRESERVATION_LAYER2_10PCT_MULTIPLIER: 0,
    CAPITAL_PRESERVATION_LAYER2_15PCT_MULTIPLIER: 0,
    CAPITAL_PRESERVATION_LAYER3_3STREAK_MULTIPLIER: 0.5,
    CAPITAL_PRESERVATION_LAYER3_5STREAK_MULTIPLIER: 0.25,
    CAPITAL_PRESERVATION_LAYER3_7STREAK_MULTIPLIER: 0,
    MAX_POSITION_SIZE_PCT: 0.95,
    MIN_ORDER_SIZE_USDT: 10,
    BINANCE_TAKER_FEE_DEFAULT: 0.001,
    DEFAULT_STOP_LOSS_PCT: 0.02,
  }),
}));

jest.mock('@/lib/db');
jest.mock('@/services/risk/capital-preservation', () => ({
  capitalPreservation: {
    evaluateBot: jest.fn().mockResolvedValue({ allowTrading: true, sizeMultiplier: 1.0, reason: 'healthy' }),
  },
}));
jest.mock('@/services/billing/fee-rate', () => ({
  getExchangeFeeRates: jest.fn().mockResolvedValue({ maker: 0.001, taker: 0.001 }),
  getCachedTakerFee: jest.fn().mockResolvedValue(0.001),
}));
jest.mock('@/services/exchanges/singleton', () => ({
  getExchangeAdapter: jest.fn().mockReturnValue({
    getMinOrderSize: jest.fn().mockResolvedValue(10),
    getTicker: jest.fn().mockResolvedValue({ bid: 44900, ask: 45100, last: 45000, volume: 1000, timestamp: Date.now() }),
  }),
}));
jest.mock('@/services/email/triggers', () => ({
  sendTradeAlertEmail: jest.fn(),
  sendLowBalanceEmail: jest.fn(),
}));
jest.mock('@/lib/crypto', () => ({
  decrypt: jest.fn().mockReturnValue('decrypted-key'),
}));

import { query, transaction } from '@/lib/db';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockTransaction = transaction as jest.MockedFunction<typeof transaction>;

describe('ExecutionFanOut', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockTradeDecision: TradeDecision = {
    pair: 'BTC/USD',
    side: 'buy',
    price: 45000,
    amount: 0.1,
    reason: 'Test trade',
    timestamp: new Date(),
    signalConfidence: 80, // 0-100: AI's trade confidence
    regime: {
      type: 'strong',
      confidence: 0.8,
      reason: 'Strong uptrend (ADX >= 35)',
      timestamp: new Date(),
    },
  };

  it('should return empty array when no bots are active', async () => {
    mockQuery.mockResolvedValueOnce([]);

    const plans = await executionFanOut.fanOutTradeDecision(mockTradeDecision);

    expect(plans).toEqual([]);
  });

  it('should create execution plans for active bots', async () => {
    // Mock 1: getActiveBotsForPair
    mockQuery.mockResolvedValueOnce([
      {
        id: 'bot-1',
        user_id: 'user-1',
        exchange: 'binance',
        enabled_pairs: ['BTC/USD', 'ETH/USD'],
        config: { initialCapital: 1000 },
      },
      {
        id: 'bot-2',
        user_id: 'user-2',
        exchange: 'binance',
        enabled_pairs: ['BTC/USD'],
        config: { initialCapital: 1000 },
      },
    ]);
    // Both bots run in parallel — use mockImplementation to handle any query order.
    // Returns subscription data when the query looks like a subscription check,
    // otherwise returns [] (no open positions, no closed trades, etc.)
    mockQuery.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('plan_tier')) {
        return Promise.resolve([{ plan_tier: 'performance_fees' }]);
      }
      return Promise.resolve([]);
    });

    const plans = await executionFanOut.fanOutTradeDecision(mockTradeDecision);

    expect(plans.length).toBe(2);
    // Order not guaranteed with parallel execution — check by userId set
    const userIds = plans.map(p => p.userId).sort();
    expect(userIds).toEqual(['user-1', 'user-2']);
    expect(plans[0].pair).toBe('BTC/USD');
  });

  it('should return empty array when no active bots found', async () => {

    mockQuery.mockResolvedValueOnce([]);

    const plans = await executionFanOut.fanOutTradeDecision(mockTradeDecision);

    expect(plans).toEqual([]);
  });

  it('should skip bots that dont trade the pair', async () => {

    mockQuery.mockResolvedValueOnce([
      {
        id: 'bot-1',
        user_id: 'user-1',
        exchange: 'binance',
        enabled_pairs: ['ETH/USD'], // Doesn't trade BTC
        config: {},
      },
    ]);

    const plans = await executionFanOut.fanOutTradeDecision(mockTradeDecision);

    expect(plans).toEqual([]);
  });

  it('should queue execution plans', async () => {
    const mockExecutionFn = jest.fn();
    mockTransaction.mockImplementation(async callback => callback({
      query: mockExecutionFn,
    } as any));

    const plans = [
      {
        userId: 'user-1',
        botInstanceId: 'bot-1',
        pair: 'BTC/USD',
        side: 'buy' as const,
        amount: 0.1,
        price: 45000,
        reason: 'Test',
        timestamp: new Date(),
      },
    ];

    await executionFanOut.queueExecutionPlans(plans);

    expect(mockTransaction).toHaveBeenCalled();
    expect(mockExecutionFn).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO job_queue'),
      expect.any(Array)
    );
  });

  it('should handle queue errors gracefully', async () => {
    mockTransaction.mockRejectedValueOnce(new Error('Database error'));

    const plans = [
      {
        userId: 'user-1',
        botInstanceId: 'bot-1',
        pair: 'BTC/USD',
        side: 'buy' as const,
        amount: 0.1,
        price: 45000,
        reason: 'Test',
        timestamp: new Date(),
      },
    ];

    await expect(executionFanOut.queueExecutionPlans(plans)).rejects.toThrow();
  });
});
