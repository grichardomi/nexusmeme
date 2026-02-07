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

  // Calculate momentum (percentage change over periods)
  // CRITICAL: Assumes 15m candles for /nexus parity!
  // With 15m candles: 4 candles = 1h, 16 candles = 4h
  const momentum1h = candles.length >= 4
    ? ((closes[closes.length - 1] - closes[closes.length - 4]) / closes[closes.length - 4]) * 100
    : 0;

  const momentum4h = candles.length >= 16
    ? ((closes[closes.length - 1] - closes[closes.length - 16]) / closes[closes.length - 16]) * 100
    : 0;

  // Calculate volume ratio (current vs average)
  const recentVolumes = volumes.slice(-20);
  const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
  const currentVolume = volumes[volumes.length - 1];
  const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;

  // Calculate recent high and low (using actual high/low prices, not just closes)
  // CRITICAL: Must use candle high/low, not close prices - matches nexus behavior
  const recentCandles = candles.slice(-20);
  const recentHighs = recentCandles.map((c) => c.high);
  const recentLows = recentCandles.map((c) => c.low);
  const recentHigh = Math.max(...recentHighs);
  const recentLow = Math.min(...recentLows);

  // Calculate EMA200 (200-period exponential moving average)
  const ema200 = candles.length >= 200
    ? calculateEMA(closes, 200)
    : calculateEMA(closes, Math.min(closes.length, 50)); // Fallback to shorter period

  return {
    rsi: calculateRSI(closes),
    macd: calculateMACD(closes),
    bollingerBands: calculateBollingerBands(closes),
    movingAverages: calculateMovingAverages(closes),
    atr: calculateATR(candles),
    obv: calculateOBV(closes, volumes),
    adx: calculateADX(candles),
    momentum1h,
    momentum4h,
    volumeRatio,
    ema200,
    recentHigh,
    recentLow,
  };
}

/**
 * Calculate RSI (Relative Strength Index)
 */
function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) {
    return 50; // Neutral if not enough data
  }

  let gains = 0;
  let losses = 0;

  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
function calculateMACD(
  closes: number[]
): { value: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);

  const macdLine = ema12 - ema26;
  const signalLine = calculateEMA([macdLine], 9);
  const histogram = macdLine - signalLine;

  return {
    value: macdLine,
    signal: signalLine,
    histogram,
  };
}

/**
 * Calculate Bollinger Bands
 */
function calculateBollingerBands(
  closes: number[],
  period = 20,
  stdDev = 2
): { upper: number; middle: number; lower: number } {
  const recentCloses = closes.slice(-period);
  const middle = recentCloses.reduce((a, b) => a + b, 0) / period;

  const variance =
    recentCloses.reduce((sum, close) => sum + Math.pow(close - middle, 2), 0) /
    period;
  const std = Math.sqrt(variance);

  return {
    upper: middle + stdDev * std,
    middle,
    lower: middle - stdDev * std,
  };
}

/**
 * Calculate Moving Averages
 */
function calculateMovingAverages(closes: number[]): {
  sma20: number;
  sma50: number;
  ema12: number;
  ema26: number;
} {
  return {
    sma20: calculateSMA(closes, 20),
    sma50: calculateSMA(closes, 50),
    ema12: calculateEMA(closes, 12),
    ema26: calculateEMA(closes, 26),
  };
}

/**
 * Calculate SMA (Simple Moving Average)
 */
function calculateSMA(closes: number[], period: number): number {
  const recent = closes.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

/**
 * Calculate EMA (Exponential Moving Average)
 */
function calculateEMA(closes: number[], period: number): number {
  const multiplier = 2 / (period + 1);
  let ema = closes[0];

  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * multiplier + ema * (1 - multiplier);
  }

  return ema;
}

/**
 * Calculate ATR (Average True Range)
 */
function calculateATR(
  candles: OHLCCandle[],
  period = 14
): number {
  const trueRanges: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];

    const tr1 = current.high - current.low;
    const tr2 = Math.abs(current.high - prev.close);
    const tr3 = Math.abs(current.low - prev.close);

    trueRanges.push(Math.max(tr1, tr2, tr3));
  }

  const recentTR = trueRanges.slice(-period);
  return recentTR.reduce((a, b) => a + b, 0) / period;
}

/**
 * Calculate OBV (On-Balance Volume)
 */
function calculateOBV(closes: number[], volumes: number[]): number {
  let obv = 0;

  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) {
      obv += volumes[i];
    } else if (closes[i] < closes[i - 1]) {
      obv -= volumes[i];
    }
  }

  return obv;
}

/**
 * Calculate ADX (Average Directional Index)
 * CRITICAL: Must match Nexus's calculation exactly for regime parity
 * Uses proper True Range + DI smoothing (not simplified version)
 */
function calculateADX(candles: OHLCCandle[], period = 14): number {
  // Need at least period * 2 candles for proper ADX calculation
  if (candles.length < period * 2) {
    console.warn(`⚠️ [ADX FALLBACK] Insufficient candles: ${candles.length} < ${period * 2} required - returning ADX=15`);
    return 15; // Return LOW value to block entries when insufficient data
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
    return 15; // Return LOW value to block entries
  }

  // ADX is the smoothed average of DX values (use last 'period' values)
  // Apply Wilder's smoothing to DX to get ADX
  let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxValues.length; i++) {
    adx = ((adx * (period - 1)) + dxValues[i]) / period;
  }

  // Validate result - return LOW value if NaN or invalid (to block entries)
  if (!isFinite(adx)) {
    return 15; // Low ADX blocks entries via Health Gate
  }

  return Math.min(100, Math.max(0, adx));
}

/**
 * Detect market regime from indicators and price action
 * MATCHES NEXUS: Uses ADX-based regime classification (choppy/weak/moderate/strong)
 */
export function detectMarketRegime(
  candles: OHLCCandle[],
  indicators: TechnicalIndicators
): MarketRegimeAnalysis {
  const closes = candles.map((c) => c.close);
  const currentPrice = closes[closes.length - 1];

  // CRITICAL: Use ADX-based regime classification (matching Nexus)
  // Handle NaN case - default to moderate if ADX is invalid
  const adx = isFinite(indicators.adx) ? indicators.adx : 25;

  // DEBUG: Log ADX value being used for regime detection
  console.log(`\n🔍 [REGIME DEBUG] ADX value for regime: ${adx} (raw indicators.adx: ${indicators.adx})`);

  let regime: MarketRegime;
  if (adx < 20) {
    regime = 'choppy';
  } else if (adx < 30) {
    regime = 'weak';
  } else if (adx < 35) {
    regime = 'moderate';
  } else {
    regime = 'strong';
  }

  console.log(`🔍 [REGIME DEBUG] Regime determined: ${regime} (ADX: ${adx})`);


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
  } else {
    // Below threshold
    confidence = 45;
  }

  // Volatility analysis
  const volatilityFactor = Math.min(indicators.atr / currentPrice, 0.05);
  const volatilityPercent = volatilityFactor * 100;

  // Excessive volatility reduces confidence (but doesn't change regime classification)
  if (volatilityPercent > 3) {
    confidence = Math.max(35, confidence - 15); // Stronger penalty for high volatility
  }

  const alignment4h = bothMomentumPositive ? '4h also positive ✓' : '4h negative';

  const analysis = `
Market is in ${regime} regime (ADX-based, matching /nexus).
ADX: ${isFinite(indicators.adx) ? indicators.adx.toFixed(2) : 'N/A'} (${regime === 'strong' ? 'Strong' : regime === 'moderate' ? 'Moderate' : regime === 'weak' ? 'Weak' : 'Choppy'} trend)
Momentum: 1h=${momentum1h.toFixed(3)}% | 4h=${momentum4h.toFixed(3)}% | ${alignment4h}
Trend Direction: ${isBullish ? 'BULLISH' : 'BEARISH'} (1h momentum ${momentum1h > 0 ? 'positive' : 'negative'})
RSI: ${indicators.rsi.toFixed(2)} | ATR: ${volatilityPercent.toFixed(2)}%
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
 * Generate price targets based on technical analysis
 */
export function generatePriceTargets(
  candles: OHLCCandle[],
  indicators: TechnicalIndicators
): { support: number[]; resistance: number[] } {
  const closes = candles.map((c) => c.close);
  const currentPrice = closes[closes.length - 1];

  const bb = indicators.bollingerBands;
  const atr = indicators.atr;

  // Support levels
  const support = [
    bb.lower,
    currentPrice - atr,
    currentPrice - atr * 2,
  ].filter((s) => s > 0);

  // Resistance levels
  const resistance = [
    bb.upper,
    currentPrice + atr,
    currentPrice + atr * 2,
  ];

  return {
    support: support.sort((a, b) => b - a),
    resistance: resistance.sort((a, b) => a - b),
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
