/**
 * Job Queue Types
 * Defines job schemas and execution patterns
 */

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';

export type JobType =
  | 'execute_trade'
  | 'validate_connection'
  | 'sync_market_data'
  | 'sync_market_regime'
  | 'rebalance_portfolio'
  | 'send_email'
  | 'process_webhook'
  | 'cleanup_old_trades'
  | 'suspend_bot'
  | 'resume_bot'
  | 'pyramid_add_order';

export interface BaseJob {
  id: string;
  type: JobType;
  status: JobStatus;
  priority: number; // 1-10, higher = more urgent
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  error: string | null;
  retries: number;
  maxRetries: number;
}

/**
 * Trade Execution Job
 */
export interface TradeExecutionJob extends BaseJob {
  type: 'execute_trade';
  data: {
    userId: string;
    botInstanceId: string;
    pair: string;
    side: 'buy' | 'sell';
    amount: number;
    price: number;
    reason: string;
  };
}

/**
 * API Connection Validation Job
 */
export interface ValidateConnectionJob extends BaseJob {
  type: 'validate_connection';
  data: {
    userId: string;
    exchange: string;
    botInstanceId: string;
  };
}

/**
 * Market Data Sync Job
 */
export interface SyncMarketDataJob extends BaseJob {
  type: 'sync_market_data';
  data: {
    pairs: string[];
  };
}

/**
 * Market Regime Detection Job
 */
export interface SyncMarketRegimeJob extends BaseJob {
  type: 'sync_market_regime';
  data: {
    pairs: string[];
  };
}

/**
 * Portfolio Rebalancing Job
 */
export interface RebalancePortfolioJob extends BaseJob {
  type: 'rebalance_portfolio';
  data: {
    userId: string;
    botInstanceId: string;
  };
}

/**
 * Email Sending Job
 */
export interface SendEmailJob extends BaseJob {
  type: 'send_email';
  data: {
    to: string;
    subject: string;
    template: string;
    variables: Record<string, any>;
  };
}

/**
 * Webhook Processing Job
 */
export interface ProcessWebhookJob extends BaseJob {
  type: 'process_webhook';
  data: {
    source: string;
    payload: Record<string, any>;
  };
}

/**
 * Cleanup Old Trades Job
 */
export interface CleanupOldTradesJob extends BaseJob {
  type: 'cleanup_old_trades';
  data: {
    daysOld: number;
  };
}

/**
 * Bot Suspension Job
 */
export interface SuspendBotJob extends BaseJob {
  type: 'suspend_bot';
  data: {
    userId: string;
    botInstanceId: string;
    delaySeconds?: number;
  };
}

/**
 * Bot Resumption Job
 */
export interface ResumeBotJob extends BaseJob {
  type: 'resume_bot';
  data: {
    userId: string;
    botInstanceId: string;
  };
}

/**
 * Pyramid Add Order Job
 * Executes incremental buys at L1 (4.5%) and L2 (8%) profit levels
 */
export interface PyramidAddOrderJob extends BaseJob {
  type: 'pyramid_add_order';
  data: {
    userId: string;
    botInstanceId: string;
    tradeId: string;
    pair: string;
    level: 1 | 2; // L1 at 4.5%, L2 at 8%
    quantity: number; // Amount to buy (35% or 50% of original)
    currentPrice: number; // Current market price for the buy
    triggerProfitPct: number; // 0.045 or 0.08
  };
}

export type Job =
  | TradeExecutionJob
  | ValidateConnectionJob
  | SyncMarketDataJob
  | SyncMarketRegimeJob
  | RebalancePortfolioJob
  | SendEmailJob
  | ProcessWebhookJob
  | CleanupOldTradesJob
  | SuspendBotJob
  | ResumeBotJob
  | PyramidAddOrderJob;

/**
 * Job Result
 */
export interface JobResult {
  jobId: string;
  success: boolean;
  data?: any;
  error?: string;
  duration: number; // milliseconds
}
