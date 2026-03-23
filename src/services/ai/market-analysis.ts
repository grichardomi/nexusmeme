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

  // Volume ratio: current candle volume vs 20-candle average
  const recentVolumes = volumes.slice(-20);
  const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
  const volumeRatio = avgVolume > 0 ? volumes[volumes.length - 1] / avgVolume : 1;

  // Recent high/low: actual candle highs/lows (not closes)
  const recentCandles = candles.slice(-20);
  const recentHigh = Math.max(...recentCandles.map((c) => c.high));
  const recentLow = Math.min(...recentCandles.map((c) => c.low));

  const adxResult = calculateADX(candles);

  return {
    adx: adxResult.value,
    adxSlope: adxResult.slope,
    momentum1h,
    momentum4h,
    volumeRatio,
    recentHigh,
    recentLow,
  };
}

/**
 * ADX calculation result with slope for regime transition detection
 */
interface ADXResult {
  value: number;  // Current ADX value (0-100)
  slope: number;  // Rate of change per candle (positive = strengthening trend)
}

function calculateADX(candles: OHLCCandle[], period = 14): ADXResult {
  // Need at least period * 2 candles for proper ADX calculation
  if (candles.length < period * 2) {
    console.warn(`⚠️ [ADX FALLBACK] Insufficient candles: ${candles.length} < ${period * 2} required - returning ADX=15`);
    return { value: 15, slope: 0 };
  }

  const trueRanges: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];

  // Calculate True Range and Directional Movements
  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];

    // True Range = max(High-Low, |High-Close[i-1]|, |Low-Close[i-1]|)
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
    trueRanges.push(tr);

    // Directional movements
    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;

    let plusDM = 0;
    let minusDM = 0;

    if (upMove > downMove && upMove > 0) {
      plusDM = upMove;
    }
    if (downMove > upMove && downMove > 0) {
      minusDM = downMove;
    }

    plusDMs.push(plusDM);
    minusDMs.push(minusDM);
  }

  // Use Wilder's smoothing (standard ADX calculation - matches /nexus)
  // Initial sums for first period
  let smoothedTR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedPlusDM = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedMinusDM = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);

  const dxValues: number[] = [];

  for (let i = period; i < trueRanges.length; i++) {
    // Wilder's smoothing: smoothed = prev - (prev/period) + current
    smoothedTR = smoothedTR - (smoothedTR / period) + trueRanges[i];
    smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDMs[i];
    smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDMs[i];

    // Calculate +DI and -DI
    const plusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
    const minusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;

    // Calculate DX
    const diDiff = Math.abs(plusDI - minusDI);
    const diSum = plusDI + minusDI;
    const dx = diSum === 0 ? 0 : (diDiff / diSum) * 100;
    dxValues.push(dx);
  }

  if (dxValues.length === 0) {
    console.warn(`⚠️ [ADX FALLBACK] No DX values calculated from ${trueRanges.length} true ranges - returning ADX=15`);
    return { value: 15, slope: 0 };
  }

  // ADX is the smoothed average of DX values (use last 'period' values)
  // Apply Wilder's smoothing to DX to get ADX
  // Track recent ADX values for slope calculation
  const adxHistory: number[] = [];
  let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  adxHistory.push(adx);

  for (let i = period; i < dxValues.length; i++) {
    adx = ((adx * (period - 1)) + dxValues[i]) / period;
    adxHistory.push(adx);
  }

  // Validate result - return LOW value if NaN or invalid (to block entries)
  if (!isFinite(adx)) {
    return { value: 15, slope: 0 };
  }

  // Calculate slope: rate of change over last 3 ADX snapshots
  // slope = (ADX now - ADX 3 candles ago) / 3
  const slopeWindow = 3;
  let slope = 0;
  if (adxHistory.length >= slopeWindow + 1) {
    const current = adxHistory[adxHistory.length - 1];
    const previous = adxHistory[adxHistory.length - 1 - slopeWindow];
    slope = (current - previous) / slopeWindow;
  }

  const clampedAdx = Math.min(100, Math.max(0, adx));
  return { value: clampedAdx, slope };
}

/**
 * Detect market regime from indicators and price action
 * MATCHES NEXUS: Uses ADX-based regime classification (choppy/weak/moderate/strong)
 */
export function detectMarketRegime(
  _candles: OHLCCandle[],
  indicators: TechnicalIndicators
): MarketRegimeAnalysis {
  // CRITICAL: Use ADX-based regime classification (matching Nexus)
  // Handle NaN case - default to moderate if ADX is invalid
  const adx = isFinite(indicators.adx) ? indicators.adx : 25;
  const adxSlope = indicators.adxSlope ?? 0;

  // DEBUG: Log ADX value and slope being used for regime detection
  console.log(`\n🔍 [REGIME DEBUG] ADX value for regime: ${adx} (raw indicators.adx: ${indicators.adx}) | slope: ${adxSlope.toFixed(2)}/candle`);

  // Use env vars for all thresholds (no hard-coded values)
  const env = getEnvironmentConfig();
  const transitionZoneMin = env.ADX_TRANSITION_ZONE_MIN;         // 15
  const minAdxForEntry = env.RISK_MIN_ADX_FOR_ENTRY;             // 20
  const slopeRisingThreshold = env.ADX_SLOPE_RISING_THRESHOLD;   // +2.0/candle

  let regime: MarketRegime;
  if (adx < transitionZoneMin) {
    // Deep chop — slope can't save this, always block
    regime = 'choppy';
  } else if (adx < minAdxForEntry && adxSlope >= slopeRisingThreshold) {
    // TRANSITION ZONE: ADX in transition range but rising fast
    // Trend is forming — allow entry at reduced size instead of blocking
    regime = 'transitioning';
  } else if (adx < minAdxForEntry) {
    regime = 'choppy';
  } else if (adx < env.ADX_WEAK_MAX) {
    regime = 'weak';
  } else if (adx < env.ADX_MODERATE_MAX) {
    regime = 'moderate';
  } else {
    regime = 'strong';
  }

  console.log(`🔍 [REGIME DEBUG] Regime determined: ${regime} (ADX: ${adx}, slope: ${adxSlope.toFixed(2)})`);


  // /nexus PARITY: Simple momentum-first approach
  // No reversal logic, no complex regime scoring - just flat 70% when momentum positive
  const momentum1h = indicators.momentum1h ?? 0;
  const momentum4h = indicators.momentum4h ?? 0;

  // /nexus uses 0.5% threshold (catches 0.68% entries)
  const momentum1hPositive = momentum1h > 0.005; // 0.5% minimum
  const momentum4hPositive = momentum4h > 0;
  const bothMomentumPositive = momentum1hPositive && momentum4hPositive;

  const isBullish = momentum1hPositive;
  const trendScore = momentum1h;

  // /nexus FLAT 70% CONFIDENCE: No regime variations
  // "Despite low volume, the positive momentum suggests early stage recovery"
  let confidence = 0;

  if (momentum1h > 0.005) {
    // /nexus: Flat 70% confidence when momentum positive
    confidence = 70;
    // Penalise when 4h trend is strongly adverse — 1h bounce in a downtrend is not a real signal
    const env = getEnvironmentConfig();
    if (momentum4h < env.RISK_MAX_ADVERSE_4H_MOMENTUM) {
      confidence = 45; // Drop below entry threshold: counter-trend bounce, not a valid setup
    }
  } else {
    // Below threshold
    confidence = 45;
  }

  // Volatility analysis
  const volatilityPercent = 0; // ATR removed — volatility no longer used in confidence

  const alignment4h = bothMomentumPositive ? '4h also positive ✓' : '4h negative';

  const regimeLabel = regime === 'strong' ? 'Strong' : regime === 'moderate' ? 'Moderate' : regime === 'weak' ? 'Weak' : regime === 'transitioning' ? 'Transitioning' : 'Choppy';
  const slopeLabel = adxSlope >= 2.0 ? '↑ rising fast' : adxSlope >= 0.5 ? '↑ rising' : adxSlope <= -2.0 ? '↓ falling fast' : adxSlope <= -0.5 ? '↓ falling' : '→ flat';

  const analysis = `
Market is in ${regime} regime (ADX-based with slope awareness).
ADX: ${isFinite(indicators.adx) ? indicators.adx.toFixed(2) : 'N/A'} (${regimeLabel} trend) | Slope: ${adxSlope.toFixed(2)}/candle (${slopeLabel})
Momentum: 1h=${momentum1h.toFixed(3)}% | 4h=${momentum4h.toFixed(3)}% | ${alignment4h}
Trend Direction: ${isBullish ? 'BULLISH' : 'BEARISH'} (1h momentum ${momentum1h > 0 ? 'positive' : 'negative'})
Volatility: ${volatilityPercent.toFixed(2)}%
AI Confidence for ${isBullish ? 'BUY' : 'HOLD'}: ${confidence.toFixed(0)}% (/nexus parity: momentum-first)
  `.trim();

  return {
    regime,
    confidence: Math.min(100, Math.max(0, confidence)),
    volatility: Math.min(100, volatilityPercent * 1000),
    trend: Math.min(100, Math.max(-100, trendScore)),
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
