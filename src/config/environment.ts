import { z } from 'zod';

/**
 * Environment variable validation schema
 * Ensures all required variables are present and properly typed at startup
 */
const envSchema = z.object({
  /* Database */
  DATABASE_URL: z.string().url(),
  DATABASE_PUBLIC_URL: z.string().url(),

  /* Next.js */
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),

  /* Authentication */
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  /* APIs */
  OPENAI_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().optional().transform(v => v?.trim() || undefined),
  MAILGUN_API_KEY: z.string().optional().transform(v => v?.trim() || undefined),
  MAILGUN_DOMAIN: z.string().optional().transform(v => v?.trim() || undefined),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

  /* Stripe (legacy - being replaced by Coinbase Commerce) */
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_WEBHOOK_SECRET_BILLING: z.string().min(1).optional().transform(v => v?.trim() || undefined),
  STRIPE_API_VERSION: z.string().default('2025-02-24.acacia'),

  /* Coinbase Commerce - Crypto payments for performance fees */
  COINBASE_COMMERCE_API_KEY: z.string().optional().transform(v => v?.trim() || undefined),
  COINBASE_COMMERCE_WEBHOOK_SECRET: z.string().optional().transform(v => v?.trim() || undefined),
  COINBASE_COMMERCE_ENABLED: z.string().transform(val => val === 'true').default('false'),

  /* Exchange APIs */
  KRAKEN_API_BASE_URL: z.string().url().default('https://api.kraken.com'),
  BINANCE_API_BASE_URL: z.string().url().default('https://api.binance.com'),
  COINBASE_API_BASE_URL: z.string().url().default('https://api.coinbase.com'),

  /* Exchange Trading Fees - Used as fallback when actual fees unavailable */
  KRAKEN_TAKER_FEE_DEFAULT: z.string().transform(Number).default('0.0026'), // 0.26% tier 1
  BINANCE_TAKER_FEE_DEFAULT: z.string().transform(Number).default('0.001'), // 0.10% standard

  /* Trading Configuration */
  TRADING_PAIRS: z.string().transform(val => {
    try {
      return JSON.parse(val);
    } catch {
      throw new Error('TRADING_PAIRS must be valid JSON array');
    }
  }),
  SUPPORTED_QUOTE_CURRENCIES: z.string().transform(val => {
    try {
      return JSON.parse(val);
    } catch {
      throw new Error('SUPPORTED_QUOTE_CURRENCIES must be valid JSON array');
    }
  }),

  /* Market Regime */
  REGIME_CHECK_INTERVAL_MS: z.string().transform(Number).default('300000'),
  REGIME_FALLBACK_STRATEGY: z.enum(['conservative', 'moderate', 'aggressive']).default('conservative'),
  DISABLE_EXTERNAL_MARKET_REGIME: z.string().transform(val => val === 'true').default('false'),

  /* Rate Limiting & Performance */
  MAX_API_CALLS_PER_MINUTE: z.string().transform(Number).default('600'),
  MARKET_DATA_CACHE_TTL_MS: z.string().transform(Number).default('15000'),
  MARKET_DATA_CACHE_STALE_TTL_MS: z.string().transform(Number).default('5000'),

  /* Bot Configuration */
  BOT_API_PORT_START: z.string().transform(Number).default('20000'),
  BOT_API_PORT_END: z.string().transform(Number).default('39999'),

  /* Feature Flags */
  ENABLE_TRADE_ALERTS: z.string().transform(val => val === 'true').default('true'),
  ENABLE_BACKTESTING: z.string().transform(val => val === 'true').default('false'),
  LLM_PROVIDER: z.enum(['openai', 'claude']).default('openai'),

  /* Paper Trading Mode - Simulate orders without hitting exchange API */
  KRAKEN_BOT_PAPER_TRADING: z.string().transform(val => val === 'true').default('false'),
  BINANCE_BOT_PAPER_TRADING: z.string().transform(val => val === 'true').default('false'),

  /* Creeping Uptrend Mode - Catches slow steady trends in low-volume conditions */
  CREEPING_UPTREND_ENABLED: z.string().transform(val => val === 'true').default('false'),
  CREEPING_UPTREND_MIN_MOMENTUM: z.string().transform(Number).default('0.003'), // 0.3% instead of 0.5%
  CREEPING_UPTREND_WEAK_REGIME_CONFIDENCE: z.string().transform(Number).default('68'), // Weak regime confidence boost
  CREEPING_UPTREND_VOLUME_RATIO_MIN: z.string().transform(Number).default('0.5'), // Allow 50% of normal volume
  CREEPING_UPTREND_PRICE_TOP_THRESHOLD: z.string().transform(Number).default('0.99'), // Allow trades 1% from high
  CREEPING_UPTREND_PULLBACK_THRESHOLD: z.string().transform(Number).default('0.95'), // Block if >5% pullback from recent high

  /* AI Configuration */
  AI_MIN_CONFIDENCE_THRESHOLD: z.string().transform(Number).default('70'),

  /* Pyramiding Rules (from existing profitable bot - Kraken aggressive config) */
  KRAKEN_BOT_PYRAMIDING_ENABLED: z.string().transform(val => val === 'true').default('true'),
  KRAKEN_BOT_PYRAMID_LEVELS: z.string().transform(Number).default('2'),
  KRAKEN_BOT_PYRAMID_L1_TRIGGER_PCT: z.string().transform(Number).default('0.045'),
  KRAKEN_BOT_PYRAMID_L2_TRIGGER_PCT: z.string().transform(Number).default('0.080'),
  KRAKEN_BOT_PYRAMID_ADD_SIZE_PCT_L1: z.string().transform(Number).default('0.35'),
  KRAKEN_BOT_PYRAMID_ADD_SIZE_PCT_L2: z.string().transform(Number).default('0.50'),
  KRAKEN_BOT_PYRAMID_L1_CONFIDENCE_MIN: z.string().transform(Number).default('85'),
  KRAKEN_BOT_PYRAMID_L2_CONFIDENCE_MIN: z.string().transform(Number).default('90'),
  KRAKEN_BOT_PYRAMID_EROSION_CAP_CHOPPY: z.string().transform(Number).default('0.006'),
  KRAKEN_BOT_PYRAMID_EROSION_CAP_TREND: z.string().transform(Number).default('0.008'),

  /* Pyramiding Rules - Binance (matches Kraken config for parity) */
  BINANCE_BOT_PYRAMIDING_ENABLED: z.string().transform(val => val === 'true').default('true'),
  BINANCE_BOT_PYRAMID_LEVELS: z.string().transform(Number).default('2'),
  BINANCE_BOT_PYRAMID_L1_TRIGGER_PCT: z.string().transform(Number).default('0.045'),
  BINANCE_BOT_PYRAMID_L2_TRIGGER_PCT: z.string().transform(Number).default('0.080'),
  BINANCE_BOT_PYRAMID_ADD_SIZE_PCT_L1: z.string().transform(Number).default('0.35'),
  BINANCE_BOT_PYRAMID_ADD_SIZE_PCT_L2: z.string().transform(Number).default('0.50'),
  BINANCE_BOT_PYRAMID_L1_CONFIDENCE_MIN: z.string().transform(Number).default('85'),
  BINANCE_BOT_PYRAMID_L2_CONFIDENCE_MIN: z.string().transform(Number).default('90'),
  BINANCE_BOT_PYRAMID_EROSION_CAP_CHOPPY: z.string().transform(Number).default('0.006'),
  BINANCE_BOT_PYRAMID_EROSION_CAP_TREND: z.string().transform(Number).default('0.008'),

  /* Risk Management Guardrails */
  RISK_MIN_ADX_FOR_ENTRY: z.string().transform(Number).default('20'),
  RISK_BTC_DUMP_THRESHOLD: z.string().transform(Number).default('-0.015'),
  RISK_VOLUME_SPIKE_MAX: z.string().transform(Number).default('4.5'),
  RISK_SPREAD_MAX_PERCENT: z.string().transform(Number).default('0.005'),
  RISK_PRICE_TOP_THRESHOLD: z.string().transform(Number).default('0.995'),
  RISK_RSI_EXTREME_OVERBOUGHT: z.string().transform(Number).default('85'),
  RISK_MIN_MOMENTUM_1H: z.string().transform(Number).default('0.005'),
  RISK_MIN_MOMENTUM_4H: z.string().transform(Number).default('0.005'),
  RISK_VOLUME_BREAKOUT_RATIO: z.string().transform(Number).default('1.3'),
  RISK_PROFIT_TARGET_MINIMUM: z.string().transform(Number).default('0.005'),

  /* Loss Streak & Cooldown - Prevents trade churn after consecutive losses */
  RISK_MAX_LOSS_STREAK: z.string().transform(Number).default('5'), // Max consecutive losses before extended cooldown
  RISK_LOSS_COOLDOWN_HOURS: z.string().transform(Number).default('1'), // Extended cooldown after max loss streak

  /* Underwater Momentum Exit - Must be LOWER than entry momentum (RISK_MIN_MOMENTUM_1H) */
  UNDERWATER_MOMENTUM_THRESHOLD: z.string().transform(Number).default('0.003'), // 0.3% - only exit if momentum collapses
  /* Minimum loss depth before momentum failure exit fires (prevents exiting on spread noise) */
  UNDERWATER_MOMENTUM_MIN_LOSS_PCT: z.string().transform(Number).default('0.001'), // 0.1% - don't exit at -0.02% (noise)
  /* Minimum time before underwater exits can trigger (parity with /nexus) */
  UNDERWATER_EXIT_MIN_TIME_MINUTES: z.string().transform(Number).default('15'), // 15 minutes - don't exit too early

  /* Minimum peak profit before aggressive collapse protection kicks in */
  /* Minimum peak profit before collapse protection kicks in (decimal form) */
  /* Only protect meaningful profits - let small fluctuations play out */
  PROFIT_COLLAPSE_MIN_PEAK_PCT: z.string().transform(Number).default('0.01'), // 1% - only protect meaningful profits

  /* Minimum peak profit before erosion cap kicks in (decimal form) */
  /* Only protect meaningful profits - let small fluctuations play out */
  EROSION_MIN_PEAK_PCT: z.string().transform(Number).default('0.01'), // 1% - only protect meaningful profits

  /* Peak-Relative Erosion (from /nexus - catches small profits after time gate) */
  /* Secondary check: exit if profit drops X% from peak, after holding Y minutes */
  /* This catches small profits that the absolute erosion cap might miss */
  EROSION_PEAK_RELATIVE_THRESHOLD: z.string().transform(Number).default('0.40'), // 40% - exit if profit drops 40% from peak
  EROSION_PEAK_RELATIVE_MIN_HOLD_MINUTES: z.string().transform(Number).default('30'), // 30 minutes minimum hold before this check applies

  /* Regime-based Erosion Caps - How much giveback allowed before exit (as fraction of peak) */
  /* Lower = tighter protection (keep more profit), Higher = let trends run */
  EROSION_CAP_CHOPPY: z.string().transform(Number).default('0.30'), // 30% - tight for scalping in chop
  EROSION_CAP_WEAK: z.string().transform(Number).default('0.30'), // 30% - tight for weak trends
  EROSION_CAP_MODERATE: z.string().transform(Number).default('0.50'), // 50% - standard for moderate trends
  EROSION_CAP_STRONG: z.string().transform(Number).default('0.50'), // 50% - let strong trends run
  EROSION_MIN_PROFIT_TO_CLOSE: z.string().transform(Number).default('0.005'), // 0.5% - min profit to close (covers fees)

  /* Regime-based Profit Lock - Lock in minimum profit before it disappears */
  /* Philosophy: In choppy markets, lock profits fast. In strong trends, let winners run */
  /* MIN_PEAK = minimum peak % before profit lock applies (decimal form) */
  /* LOCK_PCT = fraction of peak to lock in (0.6 = lock 60% of peak profit) */
  PROFIT_LOCK_CHOPPY_MIN_PEAK: z.string().transform(Number).default('0.003'), // 0.3% min peak
  PROFIT_LOCK_CHOPPY_LOCK_PCT: z.string().transform(Number).default('0.60'), // Lock 60% of peak
  PROFIT_LOCK_WEAK_MIN_PEAK: z.string().transform(Number).default('0.004'), // 0.4% min peak
  PROFIT_LOCK_WEAK_LOCK_PCT: z.string().transform(Number).default('0.50'), // Lock 50% of peak
  PROFIT_LOCK_MODERATE_MIN_PEAK: z.string().transform(Number).default('0.005'), // 0.5% min peak
  PROFIT_LOCK_MODERATE_LOCK_PCT: z.string().transform(Number).default('0.40'), // Lock 40% of peak
  PROFIT_LOCK_STRONG_MIN_PEAK: z.string().transform(Number).default('0.008'), // 0.8% min peak
  PROFIT_LOCK_STRONG_LOCK_PCT: z.string().transform(Number).default('0.25'), // Lock only 25% (let it run!)

  /* Stale flat trade exit - prevents trades from running indefinitely with ~0% P&L */
  STALE_FLAT_TRADE_HOURS: z.string().transform(Number).default('6'), // Exit if flat for 6+ hours
  STALE_FLAT_TRADE_BAND_PCT: z.string().transform(Number).default('0.5'), // "Flat" = within +/-0.5%

  /* Pyramid ADX Requirements - Global (applies to all exchanges) */
  PYRAMID_L1_MIN_ADX: z.string().transform(Number).default('35'), // L1: Moderate trend minimum
  PYRAMID_L2_MIN_ADX: z.string().transform(Number).default('40'), // L2: Strong trend minimum

  /* Early Loss Time-Based Thresholds - Philosophy: More aggressive on young losing trades */
  EARLY_LOSS_MINUTE_1_5: z.string().transform(Number).default('-0.008'), // 1-5 min: -0.8% very aggressive (exit fast on momentum shift)
  EARLY_LOSS_MINUTE_15_30: z.string().transform(Number).default('-0.015'), // 15-30 min: -1.5% (tighter control on mid-term losses)
  EARLY_LOSS_HOUR_1_3: z.string().transform(Number).default('-0.025'), // 1-3 hours: -2.5% (protect from extended downside)
  EARLY_LOSS_HOUR_4_PLUS: z.string().transform(Number).default('-0.035'), // 4+ hours: -3.5% (allow breathing room for longer holds)
  EARLY_LOSS_DAILY: z.string().transform(Number).default('-0.045'), // 1+ days: -4.5% (very patient on daily holds)

  /* Support System */
  SUPPORT_ADMIN_EMAIL: z.string().email().optional().transform(v => v?.trim() || undefined),
  INTERNAL_API_KEY: z.string().optional().transform(v => v?.trim() || undefined),

  /* Encryption */
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters'),

  /* Performance Fees */
  PERFORMANCE_FEE_RATE: z.string().transform(Number).default('0.05'), // 5% of profits
  PERFORMANCE_FEE_MIN_INVOICE_USD: z.string().transform(Number).default('1.00'), // Don't bill under $1

  /* Logging */
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['json', 'text']).default('json'),

});

export type Environment = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables
 * Returns defaults during build phase, validates at runtime
 */
let validatedEnv: Environment | null = null;
let buildPhaseMode = false;

/**
 * Get default environment for build phase
 * Allows Next.js build to complete without all env vars
 */
function getDefaultEnvironment(): Environment {
  return {
    DATABASE_URL: 'postgresql://build-phase',
    DATABASE_PUBLIC_URL: 'postgresql://build-phase',
    NEXT_PUBLIC_APP_URL: 'https://build-phase',
    NODE_ENV: 'production',
    NEXTAUTH_URL: 'https://build-phase',
    NEXTAUTH_SECRET: 'build-phase-secret-' + '0'.repeat(32),
    GOOGLE_CLIENT_ID: 'build-phase',
    GOOGLE_CLIENT_SECRET: 'build-phase',
    OPENAI_API_KEY: 'build-phase',
    RESEND_API_KEY: undefined,
    MAILGUN_API_KEY: undefined,
    MAILGUN_DOMAIN: undefined,
    SUPPORT_ADMIN_EMAIL: undefined,
    INTERNAL_API_KEY: 'build-phase',
    UPSTASH_REDIS_REST_URL: 'https://build-phase.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'build-phase',
    STRIPE_SECRET_KEY: 'sk_test_build',
    STRIPE_PUBLISHABLE_KEY: 'pk_test_build',
    STRIPE_WEBHOOK_SECRET: 'whsec_build',
    STRIPE_WEBHOOK_SECRET_BILLING: undefined,
    STRIPE_API_VERSION: '2025-02-24.acacia',
    COINBASE_COMMERCE_API_KEY: undefined,
    COINBASE_COMMERCE_WEBHOOK_SECRET: undefined,
    COINBASE_COMMERCE_ENABLED: false,
    KRAKEN_API_BASE_URL: 'https://api.kraken.com',
    BINANCE_API_BASE_URL: 'https://api.binance.com',
    COINBASE_API_BASE_URL: 'https://api.coinbase.com',
    KRAKEN_TAKER_FEE_DEFAULT: 0.0026,
    BINANCE_TAKER_FEE_DEFAULT: 0.001,
    TRADING_PAIRS: ['BTC/USD', 'ETH/USD'],
    SUPPORTED_QUOTE_CURRENCIES: ['USD', 'USDT'],
    REGIME_CHECK_INTERVAL_MS: 300000,
    REGIME_FALLBACK_STRATEGY: 'conservative',
    DISABLE_EXTERNAL_MARKET_REGIME: false,
    MAX_API_CALLS_PER_MINUTE: 600,
    MARKET_DATA_CACHE_TTL_MS: 15000,
    MARKET_DATA_CACHE_STALE_TTL_MS: 5000,
    BOT_API_PORT_START: 20000,
    BOT_API_PORT_END: 39999,
    ENABLE_TRADE_ALERTS: true,
    ENABLE_BACKTESTING: false,
    LLM_PROVIDER: 'openai',
    KRAKEN_BOT_PAPER_TRADING: false,
    BINANCE_BOT_PAPER_TRADING: false,
    CREEPING_UPTREND_ENABLED: false,
    CREEPING_UPTREND_MIN_MOMENTUM: 0.003,
    CREEPING_UPTREND_WEAK_REGIME_CONFIDENCE: 68,
    CREEPING_UPTREND_VOLUME_RATIO_MIN: 0.5,
    CREEPING_UPTREND_PRICE_TOP_THRESHOLD: 0.99,
    CREEPING_UPTREND_PULLBACK_THRESHOLD: 0.95,
    AI_MIN_CONFIDENCE_THRESHOLD: 70,
    ENCRYPTION_KEY: 'build-phase-encryption-key-1234567890',
    LOG_LEVEL: 'info',
    LOG_FORMAT: 'json',
    KRAKEN_BOT_PYRAMIDING_ENABLED: true,
    KRAKEN_BOT_PYRAMID_LEVELS: 2,
    KRAKEN_BOT_PYRAMID_L1_TRIGGER_PCT: 0.045,
    KRAKEN_BOT_PYRAMID_L2_TRIGGER_PCT: 0.08,
    KRAKEN_BOT_PYRAMID_ADD_SIZE_PCT_L1: 0.35,
    KRAKEN_BOT_PYRAMID_ADD_SIZE_PCT_L2: 0.5,
    KRAKEN_BOT_PYRAMID_L1_CONFIDENCE_MIN: 85,
    KRAKEN_BOT_PYRAMID_L2_CONFIDENCE_MIN: 90,
    KRAKEN_BOT_PYRAMID_EROSION_CAP_CHOPPY: 0.006,
    KRAKEN_BOT_PYRAMID_EROSION_CAP_TREND: 0.008,
    BINANCE_BOT_PYRAMIDING_ENABLED: true,
    BINANCE_BOT_PYRAMID_LEVELS: 2,
    BINANCE_BOT_PYRAMID_L1_TRIGGER_PCT: 0.045,
    BINANCE_BOT_PYRAMID_L2_TRIGGER_PCT: 0.08,
    BINANCE_BOT_PYRAMID_ADD_SIZE_PCT_L1: 0.35,
    BINANCE_BOT_PYRAMID_ADD_SIZE_PCT_L2: 0.5,
    BINANCE_BOT_PYRAMID_L1_CONFIDENCE_MIN: 85,
    BINANCE_BOT_PYRAMID_L2_CONFIDENCE_MIN: 90,
    BINANCE_BOT_PYRAMID_EROSION_CAP_CHOPPY: 0.006,
    BINANCE_BOT_PYRAMID_EROSION_CAP_TREND: 0.008,
    RISK_MIN_ADX_FOR_ENTRY: 20,
    RISK_BTC_DUMP_THRESHOLD: -0.015,
    RISK_VOLUME_SPIKE_MAX: 4.5,
    RISK_SPREAD_MAX_PERCENT: 0.005,
    RISK_PRICE_TOP_THRESHOLD: 0.995,
    RISK_RSI_EXTREME_OVERBOUGHT: 85,
    RISK_MIN_MOMENTUM_1H: 0.005,
    RISK_MIN_MOMENTUM_4H: 0.005,
    RISK_VOLUME_BREAKOUT_RATIO: 1.3,
    RISK_PROFIT_TARGET_MINIMUM: 0.005,
    RISK_MAX_LOSS_STREAK: 5,
    RISK_LOSS_COOLDOWN_HOURS: 1,
    UNDERWATER_MOMENTUM_THRESHOLD: 0.003,
    UNDERWATER_MOMENTUM_MIN_LOSS_PCT: 0.001,
    UNDERWATER_EXIT_MIN_TIME_MINUTES: 15, // Parity with /nexus
    PROFIT_COLLAPSE_MIN_PEAK_PCT: 0.01, // 1% - only protect meaningful profits (was 0.5%)
    EROSION_MIN_PEAK_PCT: 0.01, // 1% - only protect meaningful profits (was 0.3%)
    EROSION_PEAK_RELATIVE_THRESHOLD: 0.40, // 40% - exit if profit drops 40% from peak
    EROSION_PEAK_RELATIVE_MIN_HOLD_MINUTES: 30, // 30 minutes minimum hold before peak-relative check
    EROSION_CAP_CHOPPY: 0.30, // 30% - tight for scalping in chop
    EROSION_CAP_WEAK: 0.30, // 30% - tight for weak trends
    EROSION_CAP_MODERATE: 0.50, // 50% - standard for moderate trends
    EROSION_CAP_STRONG: 0.50, // 50% - let strong trends run
    EROSION_MIN_PROFIT_TO_CLOSE: 0.005, // 0.5% - min profit to close via erosion (covers fees)
    PROFIT_LOCK_CHOPPY_MIN_PEAK: 0.001,
    PROFIT_LOCK_CHOPPY_LOCK_PCT: 0.60,
    PROFIT_LOCK_WEAK_MIN_PEAK: 0.0015,
    PROFIT_LOCK_WEAK_LOCK_PCT: 0.50,
    PROFIT_LOCK_MODERATE_MIN_PEAK: 0.003,
    PROFIT_LOCK_MODERATE_LOCK_PCT: 0.40,
    PROFIT_LOCK_STRONG_MIN_PEAK: 0.005,
    PROFIT_LOCK_STRONG_LOCK_PCT: 0.25,
    STALE_FLAT_TRADE_HOURS: 6,
    STALE_FLAT_TRADE_BAND_PCT: 0.5,
    PYRAMID_L1_MIN_ADX: 35,
    PYRAMID_L2_MIN_ADX: 40,
    EARLY_LOSS_MINUTE_1_5: -0.008,
    EARLY_LOSS_MINUTE_15_30: -0.015,
    EARLY_LOSS_HOUR_1_3: -0.025,
    EARLY_LOSS_HOUR_4_PLUS: -0.035,
    EARLY_LOSS_DAILY: -0.045,
    PERFORMANCE_FEE_RATE: 0.05,
    PERFORMANCE_FEE_MIN_INVOICE_USD: 1.00,
  };
}

export function getEnvironmentConfig(): Environment {
  if (validatedEnv) {
    return validatedEnv;
  }

  // If in build phase, return defaults to allow build to continue
  if (buildPhaseMode) {
    return getDefaultEnvironment();
  }

  try {
    validatedEnv = envSchema.parse(process.env);
    return validatedEnv;
  } catch (error) {
    // During build, return defaults instead of throwing
    if (process.env.__NEXT_PRIVATE_PREBUILD === 'true' || process.env.NODE_ENV === 'production') {
      if (error instanceof z.ZodError && Object.keys(process.env).length < 5) {
        // Likely in build phase - return defaults
        buildPhaseMode = true;
        return getDefaultEnvironment();
      }
    }

    // At runtime, throw the error
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment configuration:');
      error.errors.forEach(err => {
        console.error(`  ${err.path.join('.')}: ${err.message}`);
      });
      throw new Error('Environment validation failed. See errors above.');
    }
    throw error;
  }
}

/**
 * Safely access a single env variable
 * Returns undefined if not found (only for optional variables)
 * In tests, provides defaults to avoid validation errors
 */
export function getEnv<T extends keyof Environment>(key: T): Environment[T] {
  if (process.env.NODE_ENV === 'test') {
    // Provide test defaults without validation
    const testDefaults: Partial<Environment> = {
      NODE_ENV: 'test',
      LOG_LEVEL: 'info',
      LOG_FORMAT: 'json',
      TRADING_PAIRS: ['BTC/USD', 'BTC/USDT', 'ETH/USD', 'ETH/USDT'],
      SUPPORTED_QUOTE_CURRENCIES: ['USD', 'USDT', 'USDC', 'BUSD'],
      MARKET_DATA_CACHE_TTL_MS: 15000,
      MARKET_DATA_CACHE_STALE_TTL_MS: 5000,
      REGIME_CHECK_INTERVAL_MS: 300000,
      CREEPING_UPTREND_ENABLED: false,
      CREEPING_UPTREND_MIN_MOMENTUM: 0.003,
      CREEPING_UPTREND_WEAK_REGIME_CONFIDENCE: 68,
      CREEPING_UPTREND_VOLUME_RATIO_MIN: 0.5,
      CREEPING_UPTREND_PRICE_TOP_THRESHOLD: 0.99,
      KRAKEN_BOT_PYRAMIDING_ENABLED: true,
      KRAKEN_BOT_PYRAMID_LEVELS: 2,
      KRAKEN_BOT_PYRAMID_L1_TRIGGER_PCT: 0.045,
      KRAKEN_BOT_PYRAMID_L2_TRIGGER_PCT: 0.080,
      KRAKEN_BOT_PYRAMID_ADD_SIZE_PCT_L1: 0.35,
      KRAKEN_BOT_PYRAMID_ADD_SIZE_PCT_L2: 0.50,
      KRAKEN_BOT_PYRAMID_L1_CONFIDENCE_MIN: 85,
      KRAKEN_BOT_PYRAMID_L2_CONFIDENCE_MIN: 90,
      KRAKEN_BOT_PYRAMID_EROSION_CAP_CHOPPY: 0.006,
      KRAKEN_BOT_PYRAMID_EROSION_CAP_TREND: 0.008,
      BINANCE_BOT_PYRAMIDING_ENABLED: true,
      BINANCE_BOT_PYRAMID_LEVELS: 2,
      BINANCE_BOT_PYRAMID_L1_TRIGGER_PCT: 0.045,
      BINANCE_BOT_PYRAMID_L2_TRIGGER_PCT: 0.080,
      BINANCE_BOT_PYRAMID_ADD_SIZE_PCT_L1: 0.35,
      BINANCE_BOT_PYRAMID_ADD_SIZE_PCT_L2: 0.50,
      BINANCE_BOT_PYRAMID_L1_CONFIDENCE_MIN: 85,
      BINANCE_BOT_PYRAMID_L2_CONFIDENCE_MIN: 90,
      BINANCE_BOT_PYRAMID_EROSION_CAP_CHOPPY: 0.006,
      BINANCE_BOT_PYRAMID_EROSION_CAP_TREND: 0.008,
      PERFORMANCE_FEE_RATE: 0.05,
      PERFORMANCE_FEE_MIN_INVOICE_USD: 1.00,
    };
    return (testDefaults[key] ?? process.env[key]) as Environment[T];
  }

  const config = getEnvironmentConfig();
  return config[key];
}

/**
 * Profitability Constraint: BTC/ETH Only
 * /nexusmeme maintains /nexus profitability by restricting trading to BTC and ETH only
 * These assets have proven track record for consistent profitability
 */
export const ALLOWED_BASE_ASSETS = ['BTC', 'ETH'] as const;
export type AllowedBaseAsset = typeof ALLOWED_BASE_ASSETS[number];

/**
 * Validate that a pair is in the allowed list (BTC/ETH only)
 * @param pair Trading pair (e.g., 'BTC/USD', 'ETH/USDT')
 * @returns true if pair is allowed, false otherwise
 */
export function isAllowedPair(pair: string): boolean {
  const [baseAsset] = pair.split('/');
  return ALLOWED_BASE_ASSETS.includes(baseAsset as AllowedBaseAsset);
}

/**
 * Filter pairs to only those in the allowed list
 * @param pairs Array of trading pairs
 * @returns Filtered array of allowed pairs
 */
export function filterAllowedPairs(pairs: string[]): string[] {
  return pairs.filter(isAllowedPair);
}

/**
 * Trading configuration (pyramiding rules from existing profitable /nexus bot)
 */
export const tradingConfig = {
  get krakenPyramiding() {
    return {
      enabled: getEnv('KRAKEN_BOT_PYRAMIDING_ENABLED'),
      levels: getEnv('KRAKEN_BOT_PYRAMID_LEVELS'),
      layer1: {
        triggerPct: getEnv('KRAKEN_BOT_PYRAMID_L1_TRIGGER_PCT'),
        addSizePct: getEnv('KRAKEN_BOT_PYRAMID_ADD_SIZE_PCT_L1'),
        confidenceMin: getEnv('KRAKEN_BOT_PYRAMID_L1_CONFIDENCE_MIN'),
      },
      layer2: {
        triggerPct: getEnv('KRAKEN_BOT_PYRAMID_L2_TRIGGER_PCT'),
        addSizePct: getEnv('KRAKEN_BOT_PYRAMID_ADD_SIZE_PCT_L2'),
        confidenceMin: getEnv('KRAKEN_BOT_PYRAMID_L2_CONFIDENCE_MIN'),
      },
      erosionCapChoppy: getEnv('KRAKEN_BOT_PYRAMID_EROSION_CAP_CHOPPY'),
      erosionCapTrend: getEnv('KRAKEN_BOT_PYRAMID_EROSION_CAP_TREND'),
    };
  },

  /**
   * Get allowed trading pairs (BTC/ETH only for profitability)
   * Filters from TRADING_PAIRS config to enforce profitability constraint
   */
  get allowedPairs(): string[] {
    const configuredPairs = getEnv('TRADING_PAIRS') as string[];
    return filterAllowedPairs(configuredPairs);
  },

  /**
   * Validate a pair is allowed for trading
   */
  isAllowedPair,

  /**
   * Validate that all pairs in an array are allowed
   */
  validatePairs(pairs: string[]): { valid: boolean; invalid: string[] } {
    const invalid = pairs.filter(p => !isAllowedPair(p));
    return {
      valid: invalid.length === 0,
      invalid,
    };
  },
};

/**
 * Exchange trading fees configuration
 * Used as fallback when actual fees cannot be captured from order execution
 */
export const exchangeFeesConfig = {
  get krakenTakerFeeDefault() {
    return getEnv('KRAKEN_TAKER_FEE_DEFAULT');
  },
  get binanceTakerFeeDefault() {
    return getEnv('BINANCE_TAKER_FEE_DEFAULT');
  },
};

/**
 * Billing configuration
 */
export const billingConfig = {
  stripe: {
    get secretKey() {
      return getEnv('STRIPE_SECRET_KEY');
    },
    get publishableKey() {
      return getEnv('STRIPE_PUBLISHABLE_KEY');
    },
    get webhookSecret() {
      return getEnv('STRIPE_WEBHOOK_SECRET');
    },
    get webhookSecretBilling() {
      return getEnv('STRIPE_WEBHOOK_SECRET_BILLING');
    },
    get apiVersion() {
      return getEnv('STRIPE_API_VERSION');
    },
  },
  performanceFee: {
    get rate() {
      return getEnv('PERFORMANCE_FEE_RATE');
    },
    get minInvoiceUsd() {
      return getEnv('PERFORMANCE_FEE_MIN_INVOICE_USD');
    },
  },
};

/**
 * Authentication configuration
 */
export const authConfig = {
  get nextAuthSecret() {
    return getEnv('NEXTAUTH_SECRET');
  },
  get nextAuthUrl() {
    return getEnv('NEXTAUTH_URL');
  },
  oauth: {
    get googleClientId() {
      return getEnv('GOOGLE_CLIENT_ID');
    },
    get googleClientSecret() {
      return getEnv('GOOGLE_CLIENT_SECRET');
    },
  },
};

/**
 * Email configuration
 * Priority: Mailgun (PRIMARY) → Resend (FALLBACK) → Mailgun Default (Mock)
 *
 * Provider selection:
 * 1. If MAILGUN_API_KEY + MAILGUN_DOMAIN are set → Use Mailgun (PRIMARY)
 * 2. Else if RESEND_API_KEY is set → Use Resend (FALLBACK)
 * 3. Else → Default to Mailgun (mock mode for dev/test)
 *
 * Mailgun is always the default choice when available.
 */
export const emailConfig = {
  get mailgunApiKey() {
    return getEnv('MAILGUN_API_KEY');
  },
  get mailgunDomain() {
    return getEnv('MAILGUN_DOMAIN');
  },
  get resendApiKey() {
    return getEnv('RESEND_API_KEY');
  },
  /**
   * Get the primary email provider with priority:
   * Mailgun (if configured) → Resend (if configured) → Mailgun (default)
   *
   * @returns 'mailgun' or 'resend' - Mailgun is always the default choice
   */
  get primaryProvider(): 'mailgun' | 'resend' {
    const mailgunKey = process.env.MAILGUN_API_KEY;
    const mailgunDomain = process.env.MAILGUN_DOMAIN;
    const resendKey = process.env.RESEND_API_KEY;

    // Mailgun is primary - use if configured
    if (mailgunKey && mailgunDomain) {
      return 'mailgun';
    }

    // If Mailgun not configured, use Resend
    if (resendKey) {
      return 'resend';
    }

    // Default to Mailgun (primary choice, even without credentials)
    return 'mailgun';
  },
};

/**
 * AI/LLM configuration
 */
export const aiConfig = {
  get provider() {
    return getEnv('LLM_PROVIDER');
  },
  get openaiApiKey() {
    return getEnv('OPENAI_API_KEY');
  },
};

/**
 * Redis/Caching configuration
 */
export const redisConfig = {
  get url() {
    return getEnv('UPSTASH_REDIS_REST_URL');
  },
  get token() {
    return getEnv('UPSTASH_REDIS_REST_TOKEN');
  },
};

/**
 * Market data configuration
 */
export const marketDataConfig = {
  get cacheTtlMs() {
    return getEnv('MARKET_DATA_CACHE_TTL_MS');
  },
  get staleTtlMs() {
    return getEnv('MARKET_DATA_CACHE_STALE_TTL_MS');
  },
  get regimeCheckIntervalMs() {
    return getEnv('REGIME_CHECK_INTERVAL_MS');
  },
  get disableExternalRegime() {
    return getEnv('DISABLE_EXTERNAL_MARKET_REGIME');
  },
};

/**
 * Lazy environment validation - only validate when actually used
 * Skip module-level validation to allow Next.js build without all env vars
 *
 * This is necessary because:
 * 1. Next.js build phase doesn't have environment variables available
 * 2. Environment vars will be available at runtime when the app starts
 * 3. Validation happens on first call to getEnvironmentConfig() at runtime
 * 4. Test mode can still mock environment variables
 * 5. getEnvironmentConfig() returns sensible defaults during build phase
 */
// Don't validate on module load - will validate lazily on first use
// (getEnvironmentConfig will handle build vs runtime detection)