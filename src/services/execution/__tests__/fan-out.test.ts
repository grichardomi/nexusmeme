import { executionFanOut } from '../fan-out';
import type { TradeDecision } from '@/types/market';

jest.mock('@/lib/db');
jest.mock('@/services/regime/gatekeeper');

import { query, transaction } from '@/lib/db';
import { regimeGatekeeper } from '@/services/regime/gatekeeper';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockTransaction = transaction as jest.MockedFunction<typeof transaction>;
const mockGatekeeper = regimeGatekeeper as jest.Mocked<typeof regimeGatekeeper>;

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

  it('should return empty array when regime blocks execution', async () => {
    mockGatekeeper.shouldAllowExecution.mockResolvedValueOnce(false);

    const plans = await executionFanOut.fanOutTradeDecision(mockTradeDecision);

    expect(plans).toEqual([]);
    expect(mockGatekeeper.shouldAllowExecution).toHaveBeenCalledWith(mockTradeDecision.pair);
  });

  it('should create execution plans for active bots', async () => {
    mockGatekeeper.shouldAllowExecution.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce([
      {
        id: 'bot-1',
        user_id: 'user-1',
        exchange: 'kraken',
        enabled_pairs: ['BTC/USD', 'ETH/USD'],
        config: {},
      },
      {
        id: 'bot-2',
        user_id: 'user-2',
        exchange: 'binance',
        enabled_pairs: ['BTC/USD'],
        config: {},
      },
    ]);

    const plans = await executionFanOut.fanOutTradeDecision(mockTradeDecision);

    expect(plans.length).toBe(2);
    expect(plans[0].userId).toBe('user-1');
    expect(plans[1].userId).toBe('user-2');
    expect(plans[0].pair).toBe('BTC/USD');
  });

  it('should return empty array when no active bots found', async () => {
    mockGatekeeper.shouldAllowExecution.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce([]);

    const plans = await executionFanOut.fanOutTradeDecision(mockTradeDecision);

    expect(plans).toEqual([]);
  });

  it('should skip bots that dont trade the pair', async () => {
    mockGatekeeper.shouldAllowExecution.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce([
      {
        id: 'bot-1',
        user_id: 'user-1',
        exchange: 'kraken',
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
