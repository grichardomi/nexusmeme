/**
 * Market Analysis Service
 * Analyzes technical indicators and market patterns
 */

import {
  OHLCCandle,
  TechnicalIndicators,
  MarketRegimeAnalysis,
  MarketRegime,
} from '@/types/ai';
import { getEnvironmentConfig } from '@/config/environment';

/**
 * Calculate technical indicators from OHLC data
 */
export function calculateTechnicalIndicators(
  candles: OHLCCandle[]
): TechnicalIndicators {
  if (candles.length < 26) {
    throw new Error('Need at least 26 candles for technical analysis');
  }

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  // Momentum: raw % price change over real time windows
  // CRITICAL: Assumes 15m candles — 4 candles = 1h, 16 candles = 4h
  const momentum1h = candles.length >= 4
    ? ((closes[closes.length - 1] - closes[closes.length - 4]) / closes[closes.length - 4]) * 100
    : 0;

  const momentum4h = candles.length >= 16
    ? ((closes[closes.length - 1] - closes[closes.length - 16]) / closes[closes.length - 16]) * 100
    : 0;

  // Volume ratio: last COMPLETED candle vs 20-candle average
  // Use volumes[-2] (last closed candle) not volumes[-1] (current live/partial candle).
  // A partial candle has only 1-2 min of volume vs a full 15min candle — always reads ~10% of average,
  // causing false "thin volume" blocks even during active markets.
  const recentVolumes = volumes.slice(-21, -1); // 20 completed candles, excluding live candle
  const avgVolume = recentVolumes.length > 0
    ? recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length
    : 0;
  const lastCompletedVolume = volumes.length >= 2 ? volumes[volumes.length - 2] : volumes[volumes.length - 1];
  const volumeRatio = avgVolume > 0 ? lastCompletedVolume / avgVolume : 1;

  // Recent high/low: actual candle highs/lows (not closes)
  const recentCandles = candles.slice(-20);
  const recentHigh = Math.max(...recentCandles.map((c) => c.high));
  const recentLow = Math.min(...recentCandles.map((c) => c.low));

  return {
    momentum1h,
    momentum4h,
    volumeRatio,
    recentHigh,
    recentLow,
  };
}

/**
 * Detect market regime from momentum (no ADX/EMA)
 * Regime drives profit targets and erosion caps — not entry gating (that's the health gate).
 */
export function detectMarketRegime(
  _candles: OHLCCandle[],
  indicators: TechnicalIndicators
): MarketRegimeAnalysis {
  const momentum1h = indicators.momentum1h ?? 0;
  const momentum4h = indicators.momentum4h ?? 0;
  const momentum2h = indicators.momentum2h ?? momentum4h;
  const env = getEnvironmentConfig();
  const minMom1h = env.RISK_MIN_MOMENTUM_1H_BINANCE ?? 0.5;

  // Momentum-based regime (mirrors RiskManager.getRegime — keep in sync)
  // Early recovery: 4h still negative but 2h has turned positive and 1h above entry floor.
  // Classify as 'weak' not 'choppy' — position gets more time to develop past fee drag.
  const earlyRecovery = momentum4h <= 0 && momentum2h > 0 && momentum1h >= minMom1h;
  let regime: MarketRegime;
  if (momentum4h <= 0 && !earlyRecovery) {
    regime = 'choppy';
  } else if (momentum1h >= 1.0 && momentum4h >= 0.8) {
    regime = 'strong';
  } else if (momentum1h >= 0.4 && momentum4h >= 0.2) {
    regime = 'moderate';
  } else if (momentum1h >= 0.2 || earlyRecovery) {
    regime = 'weak';
  } else {
    regime = 'transitioning';
  }

  const isBullish = momentum1h > 0;
  const bothPositive = momentum1h > 0 && momentum4h > 0;

  let confidence = 0;
  if (momentum1h > 0.005) {
    confidence = 70;
    if (momentum4h < env.RISK_MAX_ADVERSE_4H_MOMENTUM) {
      confidence = 45; // Counter-trend bounce — not a valid setup
    }
  } else {
    confidence = 45;
  }

  const analysis = `
Market regime: ${regime} (momentum-based).
Momentum: 1h=${momentum1h.toFixed(3)}% | 4h=${momentum4h.toFixed(3)}% | ${bothPositive ? '4h positive' : '4h negative'}
Direction: ${isBullish ? 'BULLISH' : 'BEARISH'}
Confidence: ${confidence}%
  `.trim();

  return {
    regime,
    confidence: Math.min(100, Math.max(0, confidence)),
    volatility: 0,
    trend: Math.min(100, Math.max(-100, momentum1h)),
    analysis,
    timestamp: new Date(),
  };
}

/**
 * Generate price targets based on recent high/low
 */
export function generatePriceTargets(
  candles: OHLCCandle[],
  indicators: TechnicalIndicators
): { support: number[]; resistance: number[] } {
  const closes = candles.map((c) => c.close);
  const currentPrice = closes[closes.length - 1];
  const recentLow = indicators.recentLow ?? currentPrice * 0.98;
  const recentHigh = indicators.recentHigh ?? currentPrice * 1.02;

  return {
    support: [recentLow, currentPrice * 0.99].sort((a, b) => b - a),
    resistance: [recentHigh, currentPrice * 1.01].sort((a, b) => a - b),
  };
}

/**
 * Calculate trend strength and direction
 */
export function analyzeTrend(candles: OHLCCandle[]): {
  strength: number;
  direction: 'up' | 'down' | 'neutral';
  duration: number;
} {
  const closes = candles.map((c) => c.close);
  const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const ma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
  const currentPrice = closes[closes.length - 1];

  let strength = 0;
  let direction: 'up' | 'down' | 'neutral' = 'neutral';

  if (currentPrice > ma20 && ma20 > ma50) {
    direction = 'up';
    strength = ((currentPrice - ma50) / ma50) * 100;
  } else if (currentPrice < ma20 && ma20 < ma50) {
    direction = 'down';
    strength = ((ma50 - currentPrice) / ma50) * 100;
  } else {
    direction = 'neutral';
    strength = 0;
  }

  return {
    strength: Math.min(100, strength),
    direction,
    duration: candles.length,
  };
}
