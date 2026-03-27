/// <reference types="node" />

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

  /* Direct USDC Payment (Base Network) */
  USDC_PAYMENT_ENABLED: z.string().transform(v => v === 'true').default('false'),
  USDC_WALLET_ADDRESS: z.string().optional().transform(v => v?.trim() || undefined),
  USDC_CONTRACT_ADDRESS: z.string().optional().transform(v => v?.trim() || undefined),
  USDC_CHAIN_ID: z.string().transform(Number).default('8453'), // Base mainnet
  ALCHEMY_API_KEY: z.string().optional().transform(v => v?.trim() || undefined),
  ALCHEMY_WEBHOOK_SIGNING_KEY: z.string().optional().transform(v => v?.trim() || undefined),
  USDC_REQUIRED_CONFIRMATIONS: z.string().transform(Number).default('3'),
  // WalletConnect project ID — optional; WalletConnect button hidden if unset
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().optional(),
  // Set to 'true' in local dev to skip real on-chain verification
  NEXT_PUBLIC_USDC_PAYMENT_MOCK: z.string().transform(v => v === 'true').default('false'),

  /* Lemon Squeezy - Card/PayPal payments for performance fees */

  /* Exchange APIs */
  BINANCE_API_BASE_URL: z.string().url().default('https://api.binance.com'),
  // Public market data URL — use api.binance.us when running from US IPs (avoids 451 geo-block)
  // On Railway (non-US server), defaults to api.binance.com
  BINANCE_MARKET_DATA_URL: z.string().url().default('https://api.binance.com'),
  // Comma-separated list of active exchanges. Add a name here only when its adapter is ready.
  SUPPORTED_EXCHANGES: z.string().default('binance'),

  /* Exchange Trading Fees - Used as fallback when actual fees unavailable */
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
  LLM_PROVIDER: z.enum(['openai', 'claude']).default('claude'),
  ANTHROPIC_API_KEY: z.string().optional(),

  /* Paper Trading Mode - Simulate orders without hitting exchange API */
  BINANCE_BOT_PAPER_TRADING: z.string().transform(val => val === 'true').default('false'),

  /* Creeping Uptrend Mode - Catches slow steady trends in low-volume conditions */
  CREEPING_UPTREND_ENABLED: z.string().transform(val => val === 'true').default('false'),
  CREEPING_UPTREND_MIN_MOMENTUM: z.string().transform(Number).default('0.003'), // 0.3% instead of 0.5% (decimal form for momentum threshold in risk stages 2+)
  CREEPING_UPTREND_WEAK_REGIME_CONFIDENCE: z.string().transform(Number).default('68'), // Weak regime confidence boost
  CREEPING_UPTREND_VOLUME_RATIO_MIN: z.string().transform(Number).default('1.0'), // Require above-average volume — no volume = no real buying pressure
  CREEPING_UPTREND_PRICE_TOP_THRESHOLD: z.string().transform(Number).default('0.99'), // Allow trades 1% from high
  CREEPING_UPTREND_PULLBACK_THRESHOLD: z.string().transform(Number).default('0.95'), // Block if >5% pullback from recent high
  // Health gate bypass for creeping uptrend (percentage form, matching health gate momentum values)
  // Requires BOTH 1h and 4h momentum positive = sustained directional drift, not a momentary tick
  CREEPING_UPTREND_GATE_MIN_1H: z.string().transform(Number).default('0.80'),  // 0.80% min 1h momentum — must cover fee round-trip (0.3%) with margin
  CREEPING_UPTREND_GATE_MIN_4H: z.string().transform(Number).default('0.40'),  // 0.40% min 4h momentum — flat market below this has no edge after fees

  /* AI Configuration */
  AI_MIN_CONFIDENCE_THRESHOLD: z.string().transform(Number).default('70'),         // Base fallback (all regimes)
  AI_MIN_CONFIDENCE_CHOPPY: z.string().transform(Number).default('68'),            // Choppy: AI veto is the guard — allow opportunistic small-win entries
  AI_MIN_CONFIDENCE_TRANSITIONING: z.string().transform(Number).default('70'),    // Transitioning: standard bar, trend forming
  AI_MIN_CONFIDENCE_MODERATE: z.string().transform(Number).default('68'),         // Moderate trend: slightly opportunistic — trend confirmed
  AI_MIN_CONFIDENCE_STRONG: z.string().transform(Number).default('68'),           // Strong trend: raised from 62 — Claude -15 penalty (counter-trend bounces) was landing at 65 and still firing (2026-03-24)

  // Transitioning regime guardrails — block thin/weak setups even if deterministic score is high
  AI_TRANSITIONING_MIN_VOLUME_RATIO: z.string().transform(Number).default('1.0'),   // Require at least average volume
  AI_TRANSITIONING_MIN_MOMENTUM_1H: z.string().transform(Number).default('0.10'),   // Require ≥0.10% 1h momentum

  // Time/MAE guard for transitioning regime — exit early if no progress
  TRANSITIONING_TIME_GUARD_MINUTES: z.string().transform(Number).default('10'),     // Exit if not making progress after 10 minutes
  TRANSITIONING_TIME_GUARD_MIN_PROFIT_PCT: z.string().transform(Number).default('0.5'), // Require at least +0.5% by guard time

  AI_VETO_THRESHOLD: z.string().transform(Number).default('88'),               // Veto when AI gives negative adjustment AND final confidence < this (e.g. 93→-8→85 blocked, 100→-8→92 allowed)

  /* AI Confidence Boost - Hybrid AI layer for entry decisions */
  /* Deterministic 3-path gate remains primary. AI adjusts confidence ±15 as advisor. */
  /* Uses Claude Haiku — ~$0.30/month at typical call volume (buy signals only) */
  AI_CONFIDENCE_BOOST_ENABLED: z.string().transform(val => val === 'true').default('true'),
  AI_CONFIDENCE_BOOST_MAX_ADJUSTMENT: z.string().transform(Number).default('15'), // Max ±15 confidence adjustment
  AI_CONFIDENCE_BOOST_TIMEOUT_MS: z.string().transform(Number).default('5000'), // 5s timeout for AI call
  AI_CLAUDE_MIN_DETERMINISTIC: z.string().transform(Number).default('60'), // Min deterministic score before calling Claude — skip weak signals
  AI_CLAUDE_MAX_DETERMINISTIC: z.string().transform(Number).default('83'), // Max score before skipping Claude — above 83, even max -15 can't veto (84-15=69 > 68 min)

  /* Pyramiding Rules - Binance */
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
  RISK_BTC_DUMP_THRESHOLD: z.string().transform(Number).default('-0.015'),
  RISK_BTC_MIN_VOLUME_RATIO: z.string().transform(Number).default('0.1'), // Block ALL pairs when BTC volume < this (market-wide illiquidity)
  RISK_VOLUME_SPIKE_MAX: z.string().transform(Number).default('4.5'),
  RISK_SPREAD_MAX_PERCENT: z.string().transform(Number).default('0.005'),
  RISK_PRICE_TOP_THRESHOLD: z.string().transform(Number).default('0.995'),
  RISK_RSI_EXTREME_OVERBOUGHT: z.string().transform(Number).default('85'),
  RISK_RSI_OVERBOUGHT_TRENDING: z.string().transform(Number).default('92'), // RSI can stay elevated in sustained trends
  RISK_MIN_MOMENTUM_1H: z.string().transform(Number).default('1.0'), // Legacy default — superseded by RISK_MIN_MOMENTUM_1H_BINANCE
  RISK_MIN_MOMENTUM_1H_BINANCE: z.string().transform(Number).default('0.25'), // Binance: 0.25% (2× 0.10% round-trip fee)
  RISK_MIN_MOMENTUM_4H: z.string().transform(Number).default('0.5'), // 0.5% minimum (percent form)
  RISK_STRONG_MOMENTUM_OVERRIDE_PCT: z.string().transform(Number).default('2.5'), // 1h momentum % that bypasses volume floor & health-gate 4h requirement
  RISK_MAX_ADVERSE_4H_MOMENTUM: z.string().transform(Number).default('-0.5'), // Block path 1/3 entries when 4h is this negative (counter-trend protection)
  RISK_VOLUME_BREAKOUT_RATIO: z.string().transform(Number).default('1.3'),
  RISK_MIN_VOLUME_RATIO: z.string().transform(Number).default('0.50'), // Minimum volume ratio to allow entry (blocks extreme low-volume)
  RISK_PROFIT_TARGET_MINIMUM: z.string().transform(Number).default('0.008'), // 0.8% minimum — Binance costs ~0.26% × 3 = 0.78% floor
  RISK_COST_FLOOR_MULTIPLIER: z.string().transform(Number).default('3.0'), // Profit must be N× total costs (fees+spread+slippage) to enter
  RISK_EMA200_DOWNTREND_BLOCK_ENABLED: z.string().transform(val => val === 'true').default('false'), // Block entries when price < EMA200 (disable to catch reversals)

  /* Underwater Momentum Exit - Must be LOWER than entry momentum (RISK_MIN_MOMENTUM_1H) */
  UNDERWATER_MOMENTUM_THRESHOLD: z.string().transform(Number).default('0.003'), // 0.3% - only exit if momentum collapses
  /* Minimum loss depth before momentum failure exit fires (prevents exiting on spread noise) */
  UNDERWATER_MOMENTUM_MIN_LOSS_PCT: z.string().transform(Number).default('0.001'), // 0.1% - don't exit at -0.02% (noise)
  /* Minimum time before underwater exits can trigger (parity with /nexus) */
  UNDERWATER_EXIT_MIN_TIME_MINUTES: z.string().transform(Number).default('15'), // 15 minutes - don't exit too early

  /* Minimum peak profit before collapse protection kicks in */
  /* Philosophy: Only protect peaks above fee round-trip + buffer; below this let time-gated early loss handle it */
  PROFIT_COLLAPSE_MIN_PEAK_PCT: z.string().transform(Number).default('0.008'), // 0.8% - above 0.2% fee round-trip + buffer
  EROSION_PEAK_MIN_PCT: z.string().transform(Number).default('0.15'), // 0.15% minimum peak — arms early; 8% threshold means exit at 0.138% gross which still clears fees

  /* Minimum peak profit before erosion cap kicks in */
  EROSION_MIN_PEAK_PCT: z.string().transform(Number).default('0.008'), // 0.8% - meaningful peak, not noise
  EROSION_MIN_PEAK_DOLLARS: z.string().transform(Number).default('0.50'), // $0.50 - small-profit dead zone (prevents bid/ask bounce exits)

  /* Underwater exit - minimum meaningful peak in dollars (/nexus port) */
  UNDERWATER_MIN_MEANINGFUL_PEAK_DOLLARS: z.string().transform(Number).default('0.50'), // $0.50 - profit collapse threshold

  /* Dollar-based Erosion — exit when peak profit drops by $X (not % of peak, which is unstable on tiny peaks) */
  EROSION_DOLLAR_THRESHOLD: z.string().transform(Number).default('0.40'), // Exit when profit falls $0.40 from peak — covers fees, ignores % math on tiny wins
  /* Peak-Relative Erosion — kept as secondary backstop for large peaks where dollar threshold is too tight */
  EROSION_PEAK_RELATIVE_THRESHOLD: z.string().transform(Number).default('0.08'), // 8% backstop for large peaks
  EROSION_PEAK_RELATIVE_MIN_HOLD_MINUTES: z.string().transform(Number).default('5'), // 5 min - fast response
  /* Profit Ratchet: tighten erosion threshold once peak reaches high-profit zone */
  EROSION_RATCHET_ACTIVATION_PCT: z.string().transform(Number).default('8.0'), // 8% of cost → ratchet arms
  EROSION_RATCHET_THRESHOLD: z.string().transform(Number).default('0.20'),     // 20% erosion when ratchet active (vs 35% standard)

  /* Regime-based Erosion Caps (VERY AGGRESSIVE - lock profits quickly) */
  /* Lower = keep more profit, close faster on pullback */
  EROSION_CAP_CHOPPY: z.string().transform(Number).default('0.05'), // 5% - exit fast in chop (keeps 95% of peak)
  EROSION_CAP_WEAK: z.string().transform(Number).default('0.05'), // 5% - exit fast in weak trends
  EROSION_CAP_MODERATE: z.string().transform(Number).default('0.08'), // 8% - balanced for moderate
  EROSION_CAP_STRONG: z.string().transform(Number).default('0.15'), // 15% - let strong trends breathe
  EROSION_CAP_EXECUTION_BUFFER: z.string().transform(Number).default('0.80'), // Exit at 80% of cap (leaves 20% buffer for fees + execution lag)
  EROSION_CAP_DEGRADED_MODE_MULTIPLIER: z.string().transform(Number).default('3.0'), // 3x more conservative in degraded mode (prevents false exits)
  EROSION_CAP_DEGRADED_MODE_MIN: z.string().transform(Number).default('0.50'), // 50% minimum erosion cap in degraded mode
  EROSION_MIN_EXIT_PROFIT_PCT: z.string().transform(Number).default('0.02'), // Require at least +0.02% P&L to exit via erosion cap (stay green)
  EROSION_MIN_PROFIT_TO_CLOSE: z.string().transform(Number).default('0.004'), // 0.4% - covers round-trip fees
  EROSION_MIN_PROFIT_FLOOR_USD: z.string().transform(Number).default('2.00'), // $2 floor to avoid fee churn
  EROSION_MIN_HOLD_SECONDS: z.string().transform(Number).default('60'), // 60 seconds - minimum hold before erosion cap can fire (prevents instant exits)


  /* Regime-based Profit Lock (AGGRESSIVE - protect small gains) */
  /* Philosophy: Lock profits early - don't let them slip away */
  PROFIT_LOCK_CHOPPY_MIN_PEAK: z.string().transform(Number).default('0.001'), // 0.1% min peak
  PROFIT_LOCK_CHOPPY_LOCK_PCT: z.string().transform(Number).default('0.60'), // Lock 60% of peak
  PROFIT_LOCK_WEAK_MIN_PEAK: z.string().transform(Number).default('0.002'), // 0.2% min peak
  PROFIT_LOCK_WEAK_LOCK_PCT: z.string().transform(Number).default('0.50'), // Lock 50% of peak
  PROFIT_LOCK_MODERATE_MIN_PEAK: z.string().transform(Number).default('0.003'), // 0.3% min peak
  PROFIT_LOCK_MODERATE_LOCK_PCT: z.string().transform(Number).default('0.40'), // Lock 40% of peak
  PROFIT_LOCK_STRONG_MIN_PEAK: z.string().transform(Number).default('0.005'), // 0.5% min peak
  PROFIT_LOCK_STRONG_LOCK_PCT: z.string().transform(Number).default('0.20'), // Lock 20% - maximize trend capture

  /* Time-Based Profit Lock - Exit at +1% after 30min if momentum is fading */
  /* Philosophy: Don't wait for full target when trend is dying - lock in sure gains */
  /* Impact: +260% improvement in weak regime expectancy (0.10% → 0.36% per trade) */
  TIME_PROFIT_LOCK_MINUTES: z.string().transform(Number).default('30'), // Min hold time before time lock can trigger
  TIME_PROFIT_LOCK_MIN_PCT: z.string().transform(Number).default('0.01'), // 1% min profit to lock (decimal: 0.01 = 1%)
  TIME_PROFIT_LOCK_MOMENTUM_THRESHOLD: z.string().transform(Number).default('0.003'), // Momentum below this = "fading" (0.3%)

  /* Entry Spread Check - Block entry when spread is too wide */
  /* Philosophy: Entering at 0.5% spread = instant -0.5% underwater */
  /* Impact: +100% improvement in weak regime expectancy (0.1% → 0.2% per trade) */
  MAX_ENTRY_SPREAD_PCT: z.string().transform(Number).default('0.003'), // 0.3% max spread to enter (blocks if wider)
  MAX_SIGNAL_DRIFT_PCT: z.string().transform(Number).default('0.003'), // 0.3% max price drift from signal to execution — stale signal guard

  /* Trailing Stop - Ratcheting profit protection */
  /* Philosophy: Once profitable, never give it all back. Trail behind peak to lock gains. */
  /* Impact: 8% more trades end profitable, reduced variance, fewer green-to-red flips */
  TRAILING_STOP_ENABLED: z.string().transform(val => val === 'true').default('true'), // Enable/disable trailing stop
  TRAILING_STOP_ACTIVATION_PCT: z.string().transform(Number).default('0.50'), // Activate at 50% of profit target
  TRAILING_STOP_DISTANCE_PCT: z.string().transform(Number).default('0.015'), // Trail 1.5% behind peak (decimal)

  /* Breakeven Protection - For micro-profits below erosion threshold */
  /* Exits when tiny profit approaches breakeven to prevent going red */
  BREAKEVEN_PROTECTION_BUFFER_PCT: z.string().transform(Number).default('0.0001'), // 0.01% - exit when profit drops below this
  BREAKEVEN_MIN_EXIT_PROFIT_PCT: z.string().transform(Number).default('0.10'), // Require +0.10% P&L to execute breakeven exit (covers fees/slip)

  /* Intrabar momentum guard (no-entry-on-red) */
  ENTRY_MIN_INTRABAR_MOMENTUM_CHOPPY: z.string().transform(Number).default('0.10'), // +0.10% min intrabar momentum for weak/choppy — filters slow drift entries without chasing
  ENTRY_MIN_INTRABAR_MOMENTUM_TRENDING: z.string().transform(Number).default('0.05'), // Require rising candle even in trending markets

  /* Early recovery gate — allows entry before 4h fully recovers to -0.1%
   * when 1h is already rising strongly AND 4h downtrend is shallow (not a crash)
   * Logic: pass if (4h > -0.1%) OR (earlyRecovery AND 1h >= min AND 4h >= floor AND intrabar > 0) */
  ENTRY_BLOCK_4H_MOMENTUM_THRESHOLD: z.string().transform(Number).default('-0.5'), // unused legacy — kept for compat
  HEALTH_GATE_EARLY_RECOVERY_ENABLED: z.string().transform(val => val === 'true').default('true'),
  HEALTH_GATE_EARLY_RECOVERY_1H_MIN: z.string().transform(Number).default('0.5'),  // 1h must be at least +0.5% — real recovery, not noise
  HEALTH_GATE_EARLY_RECOVERY_4H_FLOOR: z.string().transform(Number).default('-0.5'), // don't enter if 4h worse than -0.5% (crash protection)

  /* Green-to-Red Protection - Safeguards against entry noise */
  /* Only triggers if peak was meaningful OR trade has been open long enough */
  GREEN_TO_RED_MIN_PEAK_PCT: z.string().transform(Number).default('0.0002'), // 0.02% - min peak to protect immediately
  GREEN_TO_RED_MIN_HOLD_MINUTES: z.string().transform(Number).default('2'), // 2 min - min hold time before protection kicks in

  /* Stale flat trade exit - prevents trades from running indefinitely with ~0% P&L */
  STALE_FLAT_TRADE_HOURS: z.string().transform(Number).default('6'), // Exit if flat for 6+ hours
  STALE_FLAT_TRADE_BAND_PCT: z.string().transform(Number).default('0.5'), // "Flat" = within +/-0.5%

  /* Pyramid Profit Triggers & Sizing - Universal (exchange-independent trading strategy) */
  PYRAMID_L1_TRIGGER_PCT: z.string().transform(Number).default('0.045'), // 4.5% profit to trigger L1
  PYRAMID_L2_TRIGGER_PCT: z.string().transform(Number).default('0.080'), // 8.0% profit to trigger L2
  PYRAMID_ADD_SIZE_PCT_L1: z.string().transform(Number).default('0.35'),  // Add 35% of base position at L1
  PYRAMID_ADD_SIZE_PCT_L2: z.string().transform(Number).default('0.50'),  // Add 50% of base position at L2

  /* Position sizing by regime */
  REGIME_SIZE_STRONG: z.string().transform(Number).default('1.5'),        // 150% — confirmed strong momentum
  REGIME_SIZE_MODERATE: z.string().transform(Number).default('1.0'),      // 100% — moderate momentum
  REGIME_SIZE_WEAK: z.string().transform(Number).default('0.75'),         // 75% — weak momentum
  REGIME_SIZE_TRANSITIONING: z.string().transform(Number).default('0.5'), // 50% — trend forming slowly
  REGIME_SIZE_CHOPPY: z.string().transform(Number).default('0.5'),        // 50% — 4h negative, minimal exposure
  DEFAULT_STOP_LOSS_PCT: z.string().transform(Number).default('0.05'),    // 5% default stop loss

  /* Regime-Based Profit Targets - TRADING not investing. Book fast, re-enter. */
  PROFIT_TARGET_CHOPPY: z.string().transform(Number).default('0.005'),       // 0.5% - scalp and move on
  PROFIT_TARGET_TRANSITIONING: z.string().transform(Number).default('0.008'), // 0.8% - early trend, conservative
  PROFIT_TARGET_WEAK: z.string().transform(Number).default('0.015'),          // 1.5% - weak/creeping trend, book before move fades
  PROFIT_TARGET_MODERATE: z.string().transform(Number).default('0.02'),       // 2% - developing trend
  PROFIT_TARGET_STRONG: z.string().transform(Number).default('0.08'),         // 8% - strong trend (not 20% - that's investing)

  /* Max Hold Time Per Regime - agile trading, no overnight drift */
  MAX_HOLD_MINUTES_CHOPPY: z.string().transform(Number).default('45'),        // 45 min max in choppy
  MAX_HOLD_MINUTES_WEAK: z.string().transform(Number).default('90'),          // 1.5 hours
  MAX_HOLD_MINUTES_MODERATE: z.string().transform(Number).default('180'),     // 3 hours
  MAX_HOLD_MINUTES_STRONG: z.string().transform(Number).default('360'),       // 6 hours

  /* Stale Flat Exit - hovering at zero is dead capital, free it */
  STALE_FLAT_MINUTES: z.string().transform(Number).default('20'),             // 20 min flat = exit (was 45 — cut dead capital faster)
  STALE_FLAT_BAND_PCT: z.string().transform(Number).default('0.001'),         // ±0.1% counts as flat

  /* Early Loss Time-Based Thresholds - REGIME-AWARE */
  /* Philosophy: Adapt to market conditions - tight in chop, loose in trends */

  /* CHOPPY REGIME (ADX < 25) - Tight thresholds for quick exits */
  EARLY_LOSS_CHOPPY_MINUTE_1_5: z.string().transform(Number).default('-0.01'),      // -1.0%
  EARLY_LOSS_CHOPPY_MINUTE_15_30: z.string().transform(Number).default('-0.008'),   // -0.8%
  EARLY_LOSS_CHOPPY_HOUR_1_3: z.string().transform(Number).default('-0.006'),       // -0.6%
  EARLY_LOSS_CHOPPY_HOUR_4_PLUS: z.string().transform(Number).default('-0.004'),    // -0.4%
  EARLY_LOSS_CHOPPY_DAILY: z.string().transform(Number).default('-0.003'),          // -0.3%

  /* TRENDING REGIME (ADX >= 25) - Loose thresholds to allow pullbacks */
  EARLY_LOSS_TRENDING_MINUTE_1_5: z.string().transform(Number).default('-0.015'),   // -1.5%
  EARLY_LOSS_TRENDING_MINUTE_15_30: z.string().transform(Number).default('-0.025'), // -2.5%
  EARLY_LOSS_TRENDING_HOUR_1_3: z.string().transform(Number).default('-0.035'),     // -3.5%
  EARLY_LOSS_TRENDING_HOUR_4_PLUS: z.string().transform(Number).default('-0.045'),  // -4.5%
  EARLY_LOSS_TRENDING_DAILY: z.string().transform(Number).default('-0.055'),        // -5.5%

  /* Legacy fallback thresholds (use choppy values for safety) */
  EARLY_LOSS_MINUTE_1_5: z.string().transform(Number).default('-0.01'),
  EARLY_LOSS_MINUTE_15_30: z.string().transform(Number).default('-0.008'),
  EARLY_LOSS_HOUR_1_3: z.string().transform(Number).default('-0.006'),
  EARLY_LOSS_HOUR_4_PLUS: z.string().transform(Number).default('-0.004'),
  EARLY_LOSS_DAILY: z.string().transform(Number).default('-0.003'),

  /* Stale Underwater Exit - catches slow bleeds that early loss misses */
  /* If trade was NEVER profitable and stays negative past this age → exit */
  STALE_UNDERWATER_MINUTES: z.string().transform(Number).default('30'), // Exit after 30 min underwater with zero peak
  STALE_UNDERWATER_MIN_LOSS_PCT: z.string().transform(Number).default('-0.003'), // Only exit if loss > -0.3% (avoids spread noise)

  /* Momentum Thesis Invalidation - exit early when entry signal has decayed */
  ENTRY_THESIS_INVALIDATION_ENABLED: z.string().transform(v => v === 'true').default('true'),
  ENTRY_THESIS_INVALIDATION_MIN_AGE_MINUTES: z.string().transform(Number).default('10'), // Don't fire in first 10 min (entry noise)
  ENTRY_THESIS_INVALIDATION_LOSS_PCT: z.string().transform(Number).default('-0.002'), // Must be ≥ -0.2% underwater
  THESIS_INVALIDATION_BLOCK_MINUTES: z.string().transform(Number).default('45'), // Block re-entry after thesis invalidation

  /* BTC Dump Exit - exit underwater trades immediately when BTC is panic-selling */
  BTC_DUMP_MOM1H_THRESHOLD: z.string().transform(Number).default('-0.5'),   // BTC 1h momentum below this = dump (-0.5%)
  BTC_DUMP_VOLUME_MIN: z.string().transform(Number).default('2.5'),          // BTC volume ratio above this = panic (2.5x avg)
  BTC_DUMP_MIN_TRADE_AGE_MINUTES: z.string().transform(Number).default('2'), // Ignore trades younger than this (entry noise)

  /* Support System */
  SUPPORT_ADMIN_EMAIL: z.string().email().optional().transform(v => v?.trim() || undefined),
  INTERNAL_API_KEY: z.string().optional().transform(v => v?.trim() || undefined),

  /* Encryption */
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters'),

  /* Live Trading Requirements */
  LIVE_TRADING_MIN_BALANCE_USD: z.string().transform(Number).default('1000'),  // Minimum total account value (USD-equiv) for live trading
  LIVE_TRADING_MIN_USDT_USD: z.string().transform(Number).default('100'),     // Minimum USDT/stablecoin to actually place first trade

  /* Performance Fees */
  // EMERGENCY FALLBACK ONLY — do NOT set this in Railway env to configure the fee rate.
  // The authoritative fee rate is managed by the admin at /admin/fees and stored in
  // billing_settings.performance_fee_rate (DB). This env var is only used when the DB
  // is unreachable (outage). Changing this has no effect in normal operation.
  PERFORMANCE_FEE_RATE: z.string().transform(Number).default('0.06'),
  PERFORMANCE_FEE_MIN_INVOICE_USD: z.string().transform(Number).default('1.00'), // Don't bill under $1
  FLAT_FEE_USDC: z.string().transform(Number).default('0'), // Monthly flat fee in USDC (0 = disabled; admin sets via /admin/fees)
  BILLING_GRACE_PERIOD_DAYS: z.string().transform(Number).default('7'),   // Day 7: first dunning reminder
  DUNNING_WARNING_DAYS: z.string().transform(Number).default('10'),        // Day 10: final warning email
  BILLING_SUSPENSION_DAYS: z.string().transform(Number).default('21'),    // Day 21: bots suspended (extended for global users)
  CRON_SECRET: z.string().min(1).default('build-phase-placeholder'),       // Shared secret to authenticate cron calls

  /* USDC Invoice & Payment Configuration */
  USDC_INVOICE_EXPIRY_DAYS: z.string().transform(Number).default('30'),   // Must exceed BILLING_SUSPENSION_DAYS so invoices remain payable through the full dunning window
  USDC_PAYMENT_REF_LENGTH: z.string().transform(Number).default('8'),     // Length of payment reference suffix
  USDC_PAYMENT_REF_RETRIES: z.string().transform(Number).default('5'),    // Max attempts to generate unique reference
  USDC_MICRO_OFFSET_MAX: z.string().transform(Number).default('999'),     // Max micro-offset raw units for unique amounts

  /* Trial Configuration */
  TRIAL_DURATION_DAYS: z.string().transform(Number).default('10'),        // Length of free trial in days
  TRIAL_MAX_CAPITAL: z.string().transform(Number).default('10000'),       // Max paper capital for live_trial users

  /* Email Queue Configuration */
  EMAIL_MAX_RETRIES: z.string().transform(Number).default('3'),           // Max delivery attempts before marking failed
  EMAIL_JOB_PRIORITY: z.string().transform(Number).default('7'),          // Job queue priority for email jobs
  EMAIL_BATCH_SIZE: z.string().transform(Number).default('100'),          // Max emails processed per queue flush
  EMAIL_TRADE_ALERTS_DEFAULT: z.string().transform(val => val === 'true').default('false'), // Default opt-in for trade alert emails (false = opt-in required)

  /* Default Bot - Auto-created during onboarding so users see activity immediately */
  DEFAULT_BOT_EXCHANGE: z.string().default('binance'),
  DEFAULT_BOT_PAIRS: z.string().default('BTC/USDT,ETH/USDT'),  // Comma-separated
  DEFAULT_BOT_CAPITAL: z.string().transform(Number).default('0'), // 0 = unlimited simulated capital

  /* Capital Preservation - 3-Layer Automated Downtrend Protection */
  CP_BTC_TREND_GATE_ENABLED: z.string().transform(val => val === 'true').default('false'),
  CP_BTC_MOMENTUM_BEAR_4H: z.string().transform(Number).default('-2'), // 4h BTC momentum <= -2% → 25% size
  CP_BTC_MOMENTUM_WEAK_1H: z.string().transform(Number).default('-0.5'), // 1h BTC momentum <= -0.5% → 50% size
  CP_DRAWDOWN_ENABLED: z.string().transform(val => val === 'true').default('true'),
  CP_DRAWDOWN_REDUCE_PCT: z.string().transform(Number).default('5'), // 5% rolling loss → reduce size (no pause)
  CP_DRAWDOWN_FLOOR_PCT: z.string().transform(Number).default('10'), // 10% rolling loss → floor size (no pause)
  CP_DRAWDOWN_CRITICAL_PCT: z.string().transform(Number).default('15'), // 15% drawdown from peak → floor size (no pause)
  CP_DRAWDOWN_REDUCE_MULTIPLIER: z.string().transform(Number).default('0.5'), // Position size at reduce threshold
  CP_DRAWDOWN_FLOOR_MULTIPLIER: z.string().transform(Number).default('0.25'), // Position size at floor/critical thresholds
  CP_LOSS_STREAK_ENABLED: z.string().transform(val => val === 'true').default('true'),
  CP_LOSS_STREAK_REDUCE: z.string().transform(Number).default('3'), // 3 consecutive losses → reduced size (no pause)
  CP_LOSS_STREAK_SEVERE: z.string().transform(Number).default('5'), // 5 consecutive losses → floor size (no pause)
  CP_LOSS_STREAK_REDUCE_MULTIPLIER: z.string().transform(Number).default('0.5'), // Position size at reduce threshold
  CP_LOSS_STREAK_SEVERE_MULTIPLIER: z.string().transform(Number).default('0.25'), // Position size at severe threshold

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
    USDC_PAYMENT_ENABLED: false,
    USDC_WALLET_ADDRESS: undefined,
    USDC_CONTRACT_ADDRESS: undefined,
    USDC_CHAIN_ID: 8453,
    ALCHEMY_API_KEY: undefined,
    ALCHEMY_WEBHOOK_SIGNING_KEY: undefined,
    USDC_REQUIRED_CONFIRMATIONS: 3,
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: undefined,
    NEXT_PUBLIC_USDC_PAYMENT_MOCK: false,
    BINANCE_API_BASE_URL: 'https://api.binance.com',
    BINANCE_MARKET_DATA_URL: 'https://api.binance.com',
    SUPPORTED_EXCHANGES: 'binance',
    BINANCE_TAKER_FEE_DEFAULT: 0.001,
    TRADING_PAIRS: ['BTC/USDT', 'ETH/USDT'],
    SUPPORTED_QUOTE_CURRENCIES: ['USDT'],
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
    LLM_PROVIDER: 'claude',
    BINANCE_BOT_PAPER_TRADING: false,
    CREEPING_UPTREND_ENABLED: true,
    CREEPING_UPTREND_MIN_MOMENTUM: 0.003,
    CREEPING_UPTREND_WEAK_REGIME_CONFIDENCE: 68,
    CREEPING_UPTREND_VOLUME_RATIO_MIN: 1.0,
    CREEPING_UPTREND_PRICE_TOP_THRESHOLD: 0.99,
    CREEPING_UPTREND_GATE_MIN_1H: 0.80,
    CREEPING_UPTREND_GATE_MIN_4H: 0.40,
    CREEPING_UPTREND_PULLBACK_THRESHOLD: 0.95,
    AI_MIN_CONFIDENCE_THRESHOLD: 70,
    AI_MIN_CONFIDENCE_CHOPPY: 68,
    AI_MIN_CONFIDENCE_TRANSITIONING: 70,
    AI_MIN_CONFIDENCE_MODERATE: 68,
    AI_MIN_CONFIDENCE_STRONG: 68,
    AI_TRANSITIONING_MIN_VOLUME_RATIO: 1.0,
    AI_TRANSITIONING_MIN_MOMENTUM_1H: 0.10,
    TRANSITIONING_TIME_GUARD_MINUTES: 10,
    TRANSITIONING_TIME_GUARD_MIN_PROFIT_PCT: 0.5,
    AI_VETO_THRESHOLD: 88,
    AI_CONFIDENCE_BOOST_ENABLED: true,
    AI_CONFIDENCE_BOOST_MAX_ADJUSTMENT: 15,
    AI_CONFIDENCE_BOOST_TIMEOUT_MS: 5000,
    AI_CLAUDE_MIN_DETERMINISTIC: 60,
    AI_CLAUDE_MAX_DETERMINISTIC: 83,
    ENCRYPTION_KEY: 'build-phase-encryption-key-1234567890',
    LOG_LEVEL: 'info',
    LOG_FORMAT: 'json',
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
    RISK_BTC_DUMP_THRESHOLD: -0.015,
    RISK_BTC_MIN_VOLUME_RATIO: 0.1,
    RISK_VOLUME_SPIKE_MAX: 4.5,
    RISK_SPREAD_MAX_PERCENT: 0.005,
    RISK_PRICE_TOP_THRESHOLD: 0.995,
    RISK_RSI_EXTREME_OVERBOUGHT: 85,
    RISK_RSI_OVERBOUGHT_TRENDING: 92,
    RISK_MIN_MOMENTUM_1H: 1.0, // Legacy default
    RISK_MIN_MOMENTUM_1H_BINANCE: 0.2, // Binance: lower fee = lower threshold
    RISK_MIN_MOMENTUM_4H: 0.5, // 0.5% minimum (percent form)
    RISK_STRONG_MOMENTUM_OVERRIDE_PCT: 2.5, // bypass volume floor & health-gate 4h check when 1h move >= this %
    RISK_MAX_ADVERSE_4H_MOMENTUM: -0.5, // Block path 1/3 when 4h strongly negative
    RISK_VOLUME_BREAKOUT_RATIO: 1.3,
    RISK_MIN_VOLUME_RATIO: 0.50, // Minimum volume ratio (blocks extreme low-volume)
    RISK_PROFIT_TARGET_MINIMUM: 0.008, // 0.8% - Binance costs ~0.26% × 3 = 0.78% floor
    RISK_COST_FLOOR_MULTIPLIER: 3.0, // Profit must be 3× total costs to enter
    RISK_EMA200_DOWNTREND_BLOCK_ENABLED: false, // Allow reversal entries by default
    UNDERWATER_MOMENTUM_THRESHOLD: 0.003,
    UNDERWATER_MOMENTUM_MIN_LOSS_PCT: 0.001,
    UNDERWATER_EXIT_MIN_TIME_MINUTES: 15, // Parity with /nexus
    PROFIT_COLLAPSE_MIN_PEAK_PCT: 0.008, // 0.8% - above fee round-trip + buffer
    EROSION_PEAK_MIN_PCT: 0.35,
    EROSION_MIN_PEAK_PCT: 0.008, // 0.8% - meaningful peak, not noise
    EROSION_MIN_PEAK_DOLLARS: 0.50, // $0.50 - small-profit dead zone (prevents bid/ask bounce exits)
    UNDERWATER_MIN_MEANINGFUL_PEAK_DOLLARS: 0.50, // $0.50 - /nexus profit collapse threshold
    EROSION_DOLLAR_THRESHOLD: 0.40, // Exit when profit falls $0.40 from peak
    EROSION_PEAK_RELATIVE_THRESHOLD: 0.08, // 8% backstop for large peaks
    EROSION_PEAK_RELATIVE_MIN_HOLD_MINUTES: 5, // 5 min - fast response
    EROSION_RATCHET_ACTIVATION_PCT: 0.8,   // arms at 0.8% peak (every real trade)
    EROSION_RATCHET_THRESHOLD: 0.10,       // 10% erosion - locks 90% of peak
    EROSION_CAP_CHOPPY: 0.05, // 5% - exit fast in chop (keep 95% of peak)
    EROSION_CAP_WEAK: 0.05, // 5% - exit fast in weak trends
    EROSION_CAP_MODERATE: 0.08, // 8% - balanced for moderate trends
    EROSION_CAP_STRONG: 0.15, // 15% - let strong trends breathe
    EROSION_CAP_EXECUTION_BUFFER: 0.80, // Exit at 80% of cap (20% safety buffer)
    EROSION_CAP_DEGRADED_MODE_MULTIPLIER: 3.0, // 3x more conservative
    EROSION_CAP_DEGRADED_MODE_MIN: 0.50, // 50% minimum
    EROSION_MIN_EXIT_PROFIT_PCT: 0.02,
    EROSION_MIN_PROFIT_TO_CLOSE: 0.004, // 0.4% - covers round-trip fees
    EROSION_MIN_PROFIT_FLOOR_USD: 2.00, // $2 floor
    EROSION_MIN_HOLD_SECONDS: 60, // 60 seconds minimum hold before erosion cap
    PROFIT_LOCK_CHOPPY_MIN_PEAK: 0.001, // 0.1% min peak (AGGRESSIVE)
    PROFIT_LOCK_CHOPPY_LOCK_PCT: 0.60, // Lock 60%
    PROFIT_LOCK_WEAK_MIN_PEAK: 0.002, // 0.2% min peak
    PROFIT_LOCK_WEAK_LOCK_PCT: 0.50, // Lock 50%
    PROFIT_LOCK_MODERATE_MIN_PEAK: 0.003, // 0.3% min peak
    PROFIT_LOCK_MODERATE_LOCK_PCT: 0.40, // Lock 40%
    PROFIT_LOCK_STRONG_MIN_PEAK: 0.005, // 0.5% min peak
    PROFIT_LOCK_STRONG_LOCK_PCT: 0.30, // Lock 30%
    TIME_PROFIT_LOCK_MINUTES: 30, // 30 min hold before time lock
    TIME_PROFIT_LOCK_MIN_PCT: 0.01, // 1% min profit to lock
    TIME_PROFIT_LOCK_MOMENTUM_THRESHOLD: 0.003, // 0.3% momentum = fading
    MAX_ENTRY_SPREAD_PCT: 0.003, // 0.3% max spread for entry
    MAX_SIGNAL_DRIFT_PCT: 0.003, // 0.3% max drift from signal price to execution price
    TRAILING_STOP_ENABLED: true, // Trailing stop enabled
    TRAILING_STOP_ACTIVATION_PCT: 0.50, // Activate at 50% of target
    TRAILING_STOP_DISTANCE_PCT: 0.015, // Trail 1.5% behind peak
    BREAKEVEN_PROTECTION_BUFFER_PCT: 0.0001, // 0.01%
    BREAKEVEN_MIN_EXIT_PROFIT_PCT: 0.05,
    ENTRY_MIN_INTRABAR_MOMENTUM_CHOPPY: 0.10,
    ENTRY_MIN_INTRABAR_MOMENTUM_TRENDING: -0.1,
    ENTRY_BLOCK_4H_MOMENTUM_THRESHOLD: -0.5,
    HEALTH_GATE_EARLY_RECOVERY_ENABLED: true,
    HEALTH_GATE_EARLY_RECOVERY_1H_MIN: 0.5,
    HEALTH_GATE_EARLY_RECOVERY_4H_FLOOR: -0.5,
    GREEN_TO_RED_MIN_PEAK_PCT: 0.0002, // 0.02%
    GREEN_TO_RED_MIN_HOLD_MINUTES: 2, // 2 minutes
    STALE_FLAT_TRADE_HOURS: 6,
    STALE_FLAT_TRADE_BAND_PCT: 0.5,
    REGIME_SIZE_STRONG: 1.5,
    REGIME_SIZE_MODERATE: 1.0,
    REGIME_SIZE_WEAK: 0.75,
    REGIME_SIZE_TRANSITIONING: 0.5,
    REGIME_SIZE_CHOPPY: 0.5,
    DEFAULT_STOP_LOSS_PCT: 0.05,
    PYRAMID_L1_TRIGGER_PCT: 0.045,
    PYRAMID_L2_TRIGGER_PCT: 0.080,
    PYRAMID_ADD_SIZE_PCT_L1: 0.35,
    PYRAMID_ADD_SIZE_PCT_L2: 0.50,
    PROFIT_TARGET_CHOPPY: 0.005,        // 0.5% - scalp and move on
    PROFIT_TARGET_TRANSITIONING: 0.008, // 0.8% - early trend
    PROFIT_TARGET_WEAK: 0.015,          // 1.5% - weak/creeping trend
    PROFIT_TARGET_MODERATE: 0.02,       // 2% - developing trend
    PROFIT_TARGET_STRONG: 0.08,         // 8% - strong trend
    MAX_HOLD_MINUTES_CHOPPY: 45,
    MAX_HOLD_MINUTES_WEAK: 90,
    MAX_HOLD_MINUTES_MODERATE: 180,
    MAX_HOLD_MINUTES_STRONG: 360,
    STALE_FLAT_MINUTES: 20,
    STALE_FLAT_BAND_PCT: 0.001,
    EARLY_LOSS_CHOPPY_MINUTE_1_5: -0.01,
    EARLY_LOSS_CHOPPY_MINUTE_15_30: -0.008,
    EARLY_LOSS_CHOPPY_HOUR_1_3: -0.006,
    EARLY_LOSS_CHOPPY_HOUR_4_PLUS: -0.004,
    EARLY_LOSS_CHOPPY_DAILY: -0.003,
    EARLY_LOSS_TRENDING_MINUTE_1_5: -0.015,
    EARLY_LOSS_TRENDING_MINUTE_15_30: -0.025,
    EARLY_LOSS_TRENDING_HOUR_1_3: -0.035,
    EARLY_LOSS_TRENDING_HOUR_4_PLUS: -0.045,
    EARLY_LOSS_TRENDING_DAILY: -0.055,
    EARLY_LOSS_MINUTE_1_5: -0.01,
    EARLY_LOSS_MINUTE_15_30: -0.008,
    EARLY_LOSS_HOUR_1_3: -0.006,
    EARLY_LOSS_HOUR_4_PLUS: -0.004,
    EARLY_LOSS_DAILY: -0.003,
    STALE_UNDERWATER_MINUTES: 30,
    STALE_UNDERWATER_MIN_LOSS_PCT: -0.003,
    ENTRY_THESIS_INVALIDATION_ENABLED: true,
    ENTRY_THESIS_INVALIDATION_MIN_AGE_MINUTES: 10,
    ENTRY_THESIS_INVALIDATION_LOSS_PCT: -0.002,
    THESIS_INVALIDATION_BLOCK_MINUTES: 45,
    BTC_DUMP_MOM1H_THRESHOLD: -0.5,
    BTC_DUMP_VOLUME_MIN: 2.5,
    BTC_DUMP_MIN_TRADE_AGE_MINUTES: 2,
    LIVE_TRADING_MIN_BALANCE_USD: 1000,
    LIVE_TRADING_MIN_USDT_USD: 100,
    PERFORMANCE_FEE_RATE: 0.06,
    PERFORMANCE_FEE_MIN_INVOICE_USD: 1.00,
    FLAT_FEE_USDC: 0,
    BILLING_GRACE_PERIOD_DAYS: 7,
    DUNNING_WARNING_DAYS: 10,
    BILLING_SUSPENSION_DAYS: 21,
    CRON_SECRET: 'build-phase-placeholder',
    USDC_INVOICE_EXPIRY_DAYS: 30,
    USDC_PAYMENT_REF_LENGTH: 8,
    USDC_PAYMENT_REF_RETRIES: 5,
    USDC_MICRO_OFFSET_MAX: 999,
    TRIAL_DURATION_DAYS: 10,
    TRIAL_MAX_CAPITAL: 10000,
    DEFAULT_BOT_EXCHANGE: 'binance',
    DEFAULT_BOT_PAIRS: 'BTC/USDT,ETH/USDT',
    DEFAULT_BOT_CAPITAL: 0,
    EMAIL_MAX_RETRIES: 3,
    EMAIL_JOB_PRIORITY: 7,
    EMAIL_BATCH_SIZE: 100,
    EMAIL_TRADE_ALERTS_DEFAULT: false,
    CP_BTC_TREND_GATE_ENABLED: false,
    CP_BTC_MOMENTUM_BEAR_4H: -2,
    CP_BTC_MOMENTUM_WEAK_1H: -0.5,
    CP_DRAWDOWN_ENABLED: true,
    CP_DRAWDOWN_REDUCE_PCT: 5,
    CP_DRAWDOWN_FLOOR_PCT: 10,
    CP_DRAWDOWN_CRITICAL_PCT: 15,
    CP_DRAWDOWN_REDUCE_MULTIPLIER: 0.5,
    CP_DRAWDOWN_FLOOR_MULTIPLIER: 0.25,
    CP_LOSS_STREAK_ENABLED: true,
    CP_LOSS_STREAK_REDUCE: 3,
    CP_LOSS_STREAK_SEVERE: 5,
    CP_LOSS_STREAK_REDUCE_MULTIPLIER: 0.5,
    CP_LOSS_STREAK_SEVERE_MULTIPLIER: 0.25,
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
    // In the browser, process.env will be mostly empty; fall back to defaults to avoid runtime crashes
    if (typeof window !== 'undefined') {
      buildPhaseMode = true;
      validatedEnv = getDefaultEnvironment();
      return validatedEnv;
    }

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
      TRADING_PAIRS: ['BTC/USDT', 'ETH/USDT'],
      SUPPORTED_QUOTE_CURRENCIES: ['USDT'],
      MARKET_DATA_CACHE_TTL_MS: 15000,
      MARKET_DATA_CACHE_STALE_TTL_MS: 5000,
      REGIME_CHECK_INTERVAL_MS: 300000,
      CREEPING_UPTREND_ENABLED: false,
      CREEPING_UPTREND_MIN_MOMENTUM: 0.003,
      CREEPING_UPTREND_WEAK_REGIME_CONFIDENCE: 68,
      CREEPING_UPTREND_VOLUME_RATIO_MIN: 1.0,
      CREEPING_UPTREND_PRICE_TOP_THRESHOLD: 0.99,
      CREEPING_UPTREND_GATE_MIN_1H: 0.80,
      CREEPING_UPTREND_GATE_MIN_4H: 0.40,
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
      LIVE_TRADING_MIN_BALANCE_USD: 1000,
      LIVE_TRADING_MIN_USDT_USD: 100,
      PERFORMANCE_FEE_RATE: 0.06,
      PERFORMANCE_FEE_MIN_INVOICE_USD: 1.00,
      AI_CONFIDENCE_BOOST_ENABLED: false,
      AI_CONFIDENCE_BOOST_MAX_ADJUSTMENT: 15,
      AI_CONFIDENCE_BOOST_TIMEOUT_MS: 5000,
      AI_TRANSITIONING_MIN_VOLUME_RATIO: 1.0,
      AI_TRANSITIONING_MIN_MOMENTUM_1H: 0.10,
      TRANSITIONING_TIME_GUARD_MINUTES: 10,
      TRANSITIONING_TIME_GUARD_MIN_PROFIT_PCT: 0.5,
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
  get binancePyramiding() {
    return {
      enabled: getEnv('BINANCE_BOT_PYRAMIDING_ENABLED'),
      levels: getEnv('BINANCE_BOT_PYRAMID_LEVELS'),
      layer1: {
        triggerPct: getEnv('BINANCE_BOT_PYRAMID_L1_TRIGGER_PCT'),
        addSizePct: getEnv('BINANCE_BOT_PYRAMID_ADD_SIZE_PCT_L1'),
        confidenceMin: getEnv('BINANCE_BOT_PYRAMID_L1_CONFIDENCE_MIN'),
      },
      layer2: {
        triggerPct: getEnv('BINANCE_BOT_PYRAMID_L2_TRIGGER_PCT'),
        addSizePct: getEnv('BINANCE_BOT_PYRAMID_ADD_SIZE_PCT_L2'),
        confidenceMin: getEnv('BINANCE_BOT_PYRAMID_L2_CONFIDENCE_MIN'),
      },
      erosionCapChoppy: getEnv('BINANCE_BOT_PYRAMID_EROSION_CAP_CHOPPY'),
      erosionCapTrend: getEnv('BINANCE_BOT_PYRAMID_EROSION_CAP_TREND'),
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
  get binanceTakerFeeDefault() {
    return getEnv('BINANCE_TAKER_FEE_DEFAULT');
  },
};

/**
 * Active exchanges — parsed from SUPPORTED_EXCHANGES env var (comma-separated).
 * To add a new exchange: add its adapter, then add its name here via env.
 * Example: SUPPORTED_EXCHANGES=binance
 */
export function getSupportedExchanges(): string[] {
  const env = getEnvironmentConfig();
  return env.SUPPORTED_EXCHANGES
    .split(',')
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Get taker fee rate for a given exchange (decimal, e.g. 0.001 for 0.10%)
 * Binance is the only supported exchange.
 */
export function getExchangeTakerFee(_exchange: string): number {
  const env = getEnvironmentConfig();
  return env.BINANCE_TAKER_FEE_DEFAULT; // 0.001 (0.10%)
}

/**
 * Get maker fee rate for a given exchange (decimal)
 * Binance uses same rate for maker/taker at standard tier.
 */
export function getExchangeMakerFee(_exchange: string): number {
  const env = getEnvironmentConfig();
  return env.BINANCE_TAKER_FEE_DEFAULT; // 0.001 (0.10%)
}

/**
 * Estimate round-trip fee in percent (entry + exit)
 * Binance: 0.20%
 */
export function estimateRoundTripFeePct(_exchange: string): number {
  return getExchangeTakerFee('binance') * 2 * 100;
}

/**
 * Billing configuration
 */
export const billingConfig = {
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
  get anthropicApiKey() {
    return getEnv('ANTHROPIC_API_KEY');
  },
  get confidenceBoostEnabled() {
    return getEnv('AI_CONFIDENCE_BOOST_ENABLED');
  },
  get confidenceBoostMaxAdjustment() {
    return getEnv('AI_CONFIDENCE_BOOST_MAX_ADJUSTMENT');
  },
  get confidenceBoostTimeoutMs() {
    return getEnv('AI_CONFIDENCE_BOOST_TIMEOUT_MS');
  },
  get claudeMinDeterministic() {
    return getEnv('AI_CLAUDE_MIN_DETERMINISTIC') as number;
  },
  get claudeMaxDeterministic() {
    return getEnv('AI_CLAUDE_MAX_DETERMINISTIC') as number;
  },
  get aiVetoThreshold() {
    return getEnv('AI_VETO_THRESHOLD') as number;
  },
  get transitioningMinVolumeRatio() {
    return getEnv('AI_TRANSITIONING_MIN_VOLUME_RATIO') as number;
  },
  get transitioningMinMomentum1h() {
    return getEnv('AI_TRANSITIONING_MIN_MOMENTUM_1H') as number;
  },
  get transitioningTimeGuardMinutes() {
    return getEnv('TRANSITIONING_TIME_GUARD_MINUTES') as number;
  },
  get transitioningTimeGuardMinProfitPct() {
    return getEnv('TRANSITIONING_TIME_GUARD_MIN_PROFIT_PCT') as number;
  },
  /**
   * Per-regime minimum confidence threshold.
   * Higher conviction required in low-margin regimes (choppy),
   * lower bar allowed in confirmed strong trends.
   * Falls back to AI_MIN_CONFIDENCE_THRESHOLD for unknown regimes.
   */
  getMinConfidenceForRegime(regime: string): number {
    const env = getEnvironmentConfig();
    const r = regime.toLowerCase();
    if (r === 'choppy')         return env.AI_MIN_CONFIDENCE_CHOPPY;
    if (r === 'transitioning')  return env.AI_MIN_CONFIDENCE_TRANSITIONING;
    if (r === 'moderate')       return env.AI_MIN_CONFIDENCE_MODERATE;
    if (r === 'strong')         return env.AI_MIN_CONFIDENCE_STRONG;
    return env.AI_MIN_CONFIDENCE_THRESHOLD; // fallback for any future regime
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
