/**
 * AI Inference Service
 * Handles AI model inference for market analysis using OpenAI
 */

import { logger } from '@/lib/logger';
import { getEnv, aiConfig } from '@/config/environment';
import {
  TechnicalIndicators,
  MarketRegimeAnalysis,
  SentimentAnalysis,
  SentimentScore,
  TradeSignalAnalysis,
  TradeSignal,
  SignalStrength,
  OHLCCandle,
} from '@/types/ai';


/**
 * /nexus-style Response Cache (85%+ hit rate!)
 * Buckets similar inputs to maximize cache reuse
 */
interface CachedResponse {
  data: string;
  timestamp: number;
  ttlMs: number;
}

const responseCache = new Map<string, CachedResponse>();
const CACHE_TTL_MS = parseInt(process.env.AI_CACHE_TTL_MS || '300000', 10); // 5 min default

/**
 * Generate cache key using /nexus bucket strategy
 * Buckets: price/100, RSI/5, volume/0.5 → increases cache hits
 */
function getCacheKey(
  pair: string,
  price: number,
  indicators: TechnicalIndicators
): string {
  const priceBucket = Math.floor(price / 100) * 100;
  const rsiBucket = Math.floor(indicators.rsi / 5);
  const volumeBucket = Math.floor((indicators.volumeRatio || 1) / 0.5);
  return `${pair}:${priceBucket}:${rsiBucket}:${volumeBucket}`;
}

/**
 * Check cache for response
 */
function getFromCache(cacheKey: string): string | null {
  const cached = responseCache.get(cacheKey);
  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age > cached.ttlMs) {
    responseCache.delete(cacheKey);
    return null;
  }

  logger.debug(`💾 Cache HIT for ${cacheKey} (age: ${Math.floor(age / 1000)}s)`);
  return cached.data;
}

/**
 * Save response to cache
 */
function setCache(cacheKey: string, response: string): void {
  responseCache.set(cacheKey, {
    data: response,
    timestamp: Date.now(),
    ttlMs: CACHE_TTL_MS,
  });
}

/**
 * Call OpenAI API for market analysis
 * /nexus parity: max_tokens=300 (was 500)
 */
async function callOpenAI(
  prompt: string,
  maxTokens = 300
): Promise<string> {
  const OPENAI_API_KEY = getEnv('OPENAI_API_KEY');
  const OPENAI_BASE_URL = 'https://api.openai.com/v1';
  const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!OPENAI_API_KEY) {
    logger.error('🚫 OpenAI API key not configured - AI calls will fail');
    throw new Error('OPENAI_API_KEY not configured');
  }

  const startTime = Date.now();
  const promptPreview = prompt.slice(0, 100).replace(/\n/g, ' ');

  logger.info('🤖 OpenAI API call starting', {
    model: OPENAI_MODEL,
    maxTokens,
    promptPreview: `${promptPreview}...`,
  });

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a professional cryptocurrency trader and market analyst. Provide concise, actionable analysis.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: maxTokens,
      }),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      logger.error('🚫 OpenAI API error', null, {
        status: response.status,
        statusText: response.statusText,
        durationMs,
      });
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    logger.info('✅ OpenAI API call completed', {
      model: OPENAI_MODEL,
      durationMs,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      totalTokens: data.usage?.total_tokens,
      responsePreview: data.choices[0].message.content.slice(0, 100).replace(/\n/g, ' ') + '...',
    });

    return data.choices[0].message.content;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error('🚫 OpenAI inference error', error instanceof Error ? error : null, {
      durationMs,
      model: OPENAI_MODEL,
    });
    throw error;
  }
}

/**
 * Generate sentiment analysis using AI
 */
export async function analyzeSentimentAI(
  pair: string,
  recentNews: string[],
  marketContext: string
): Promise<SentimentAnalysis> {
  const newsText = recentNews.slice(0, 5).join('\n');

  const prompt = `
Analyze the sentiment for ${pair} based on recent market information.

Recent news/updates:
${newsText}

Market context:
${marketContext}

Provide sentiment analysis with:
1. Overall sentiment (very_positive, positive, neutral, negative, very_negative)
2. Sentiment score (-100 to 100)
3. Key factors affecting sentiment
4. Brief analysis (1-2 sentences)

Format your response as JSON:
{
  "sentiment": "positive",
  "score": 45,
  "factors": ["factor1", "factor2"],
  "analysis": "short analysis"
}
  `.trim();

  try {
    const response = await callOpenAI(prompt);
    const parsed = JSON.parse(response);

    const sentimentMap: Record<string, SentimentScore> = {
      very_positive: 'very_positive',
      positive: 'positive',
      neutral: 'neutral',
      negative: 'negative',
      very_negative: 'very_negative',
    };

    return {
      score: sentimentMap[parsed.sentiment] || 'neutral',
      value: parsed.score || 0,
      sources: {
        news: parsed.score || 0,
        social: 0,
        onchain: 0,
        institutional: 0,
      },
      momentum: 0,
      analysis: parsed.analysis || '',
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error('Sentiment analysis error', error instanceof Error ? error : null);
    // Return neutral sentiment on error
    return {
      score: 'neutral',
      value: 0,
      sources: { news: 0, social: 0, onchain: 0, institutional: 0 },
      momentum: 0,
      analysis: 'Unable to analyze sentiment at this time',
      timestamp: new Date(),
    };
  }
}

/**
 * Generate trade signals using AI and technical analysis
 * /nexus parity: Includes 85%+ cache hit rate via bucket strategy
 */
export async function generateTradeSignalAI(
  pair: string,
  currentPrice: number,
  indicators: TechnicalIndicators,
  regime: MarketRegimeAnalysis,
  sentiment: SentimentAnalysis
): Promise<TradeSignalAnalysis> {
  // /nexus parity: Check cache first (85%+ hit rate!)
  const cacheKey = getCacheKey(pair, currentPrice, indicators);
  const cachedResponse = getFromCache(cacheKey);

  if (cachedResponse) {
    // Parse cached response (complete TradeSignalAnalysis object)
    try {
      const parsed = JSON.parse(cachedResponse);
      return {
        signal: parsed.signal as TradeSignal,
        confidence: parsed.confidence,
        strength: parsed.strength as SignalStrength,
        entryPrice: parsed.entryPrice,
        stopLoss: parsed.stopLoss,
        takeProfit: parsed.takeProfit,
        riskRewardRatio: parsed.riskRewardRatio,
        factors: parsed.factors || [],
        technicalScore: parsed.technicalScore || 50,
        sentimentScore: parsed.sentimentScore || 50,
        regimeScore: parsed.regimeScore || 50,
        analysis: parsed.analysis || '',
        timestamp: new Date(parsed.timestamp),
        expiresAt: new Date(parsed.expiresAt),
      };
    } catch (e) {
      logger.warn('Failed to parse cached response', { error: e });
      // Fall through to fresh API call
    }
  }

  // --- Deterministic signal generation (no OpenAI call) ---
  const momentum1h = indicators.momentum1h || 0;
  const momentum4h = indicators.momentum4h || 0;
  const volumeRatio = indicators.volumeRatio || 1;
  const adx = indicators.adx;
  const rsi = indicators.rsi;
  const macdHistogram = indicators.macd.histogram;

  // Signal decision: Use same thresholds as risk filter's 3-path gate
  // Read from environment to match risk-manager.ts exactly
  const minMomentum1h = getEnv('RISK_MIN_MOMENTUM_1H') ?? 0.5;
  const minMomentum4h = getEnv('RISK_MIN_MOMENTUM_4H') ?? 0.15;
  const volumeBreakoutRatio = getEnv('RISK_VOLUME_BREAKOUT_RATIO') ?? 1.3;

  // 4-path gate (matches risk-manager.ts + strong trend consolidation)
  const hasStrongMomentum = momentum1h >= minMomentum1h;
  const hasBothPositive = momentum1h >= minMomentum1h && momentum4h >= minMomentum4h;
  const hasVolumeBreakout = volumeRatio >= volumeBreakoutRatio && momentum1h > 0;
  // Path 4: Strong trend consolidation — 4h momentum strong, 1h pausing (not falling), ADX strong
  const hasStrongTrendConsolidation = adx >= 35 && momentum4h >= 2.0 && momentum1h > -0.5;

  const rsiThreshold = adx >= 35 ? (getEnv('RISK_RSI_OVERBOUGHT_TRENDING') ?? 92) : 85;
  const signal: TradeSignal = ((hasStrongMomentum || hasBothPositive || hasVolumeBreakout || hasStrongTrendConsolidation) && rsi <= rsiThreshold) ? 'buy' : 'hold';

  // Confidence score: base 50, apply boosters and penalties, clamp 0-100
  let confidence = 50;
  const factors: string[] = [];

  // Boosters
  if (momentum1h > 0.5) {
    confidence += 15;
    factors.push(`momentum1h +${momentum1h.toFixed(2)}%`);
    // Additional +5 per extra 0.5% momentum, capped at +15
    const extraMomentumSteps = Math.min(3, Math.floor((momentum1h - 0.5) / 0.5));
    if (extraMomentumSteps > 0) {
      confidence += extraMomentumSteps * 5;
      factors.push(`strong momentum (+${extraMomentumSteps * 5})`);
    }
  }

  if (adx > 25) {
    confidence += 10;
    factors.push(`ADX ${adx.toFixed(1)} trending`);
  }
  if (adx > 35) {
    confidence += 5;
    factors.push(`ADX ${adx.toFixed(1)} strong trend`);
  }

  if (macdHistogram > 0) {
    confidence += 5;
    factors.push('MACD bullish');
  }

  if (volumeRatio > 1.3) {
    confidence += 5;
    factors.push(`volume ${volumeRatio.toFixed(1)}x (breakout)`);
  }

  if (rsi >= 30 && rsi <= 60) {
    confidence += 3;
    factors.push(`RSI ${rsi.toFixed(0)} healthy range`);
  }

  if (momentum4h > 0) {
    confidence += 3;
    factors.push(`4h momentum aligned +${momentum4h.toFixed(2)}%`);
  }

  // Strong 4h trend boost (path 4: consolidation at highs)
  if (momentum4h >= 2.0 && adx >= 35) {
    confidence += 15;
    factors.push(`strong 4h trend consolidation +${momentum4h.toFixed(2)}% (+15)`);
  }

  // Penalties
  if (rsi > 80) {
    // In strong trends (ADX≥35), high RSI is normal — reduce penalty
    const rsiPenalty = adx >= 35 ? 3 : 10;
    confidence -= rsiPenalty;
    factors.push(`RSI ${rsi.toFixed(0)} overbought (-${rsiPenalty})`);
  }

  if (momentum4h < -2.0) {
    confidence -= 5;
    factors.push(`4h momentum bearish ${momentum4h.toFixed(2)}% (-5)`);
  }

  if (adx < 15) {
    confidence -= 5;
    factors.push(`ADX ${adx.toFixed(1)} directionless (-5)`);
  }

  confidence = Math.min(100, Math.max(0, confidence));

  // Strength from confidence
  const strength: SignalStrength =
    confidence >= 80 ? 'strong' :
    confidence >= 65 ? 'moderate' :
    'weak';

  // Price targets (regime-based)
  const regimeProfitTargets: Record<string, number> = {
    choppy: 0.02,
    weak: 0.045,
    moderate: 0.065,
    strong: 0.12,
  };
  const regimeTarget = regimeProfitTargets[regime.regime] || 0.05;

  const entryPrice = currentPrice;
  const stopLoss = currentPrice * 0.95;
  const takeProfit = signal === 'buy'
    ? currentPrice * (1 + regimeTarget)
    : currentPrice * (1 - regimeTarget);

  const risk = Math.abs(entryPrice - stopLoss);
  const reward = Math.abs(takeProfit - entryPrice);
  const riskRewardRatio = reward > 0 ? reward / risk : 1;

  const analysis = signal === 'buy'
    ? `Buy signal: ${momentum1h.toFixed(2)}% 1h momentum, ADX ${adx.toFixed(1)}, confidence ${confidence}%`
    : `Hold: momentum1h ${momentum1h.toFixed(2)}% insufficient or RSI ${rsi.toFixed(0)} overbought`;

  const result = {
    signal,
    strength,
    confidence,
    entryPrice,
    stopLoss,
    takeProfit,
    riskRewardRatio,
    factors,
    technicalScore: rsi > 30 && rsi < 70 ? 75 : 50,
    sentimentScore: ((sentiment.value + 100) / 2) * 0.5,
    regimeScore: regime.confidence,
    analysis,
    timestamp: new Date(),
    expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
  };

  // Cache the result for future calls
  setCache(cacheKey, JSON.stringify(result));

  logger.info('Deterministic signal generated', {
    pair,
    signal,
    confidence,
    strength,
    momentum1h: momentum1h.toFixed(2),
    adx: adx.toFixed(1),
    regime: regime.regime,
  });

  return result;
}

/**
 * Predict future price movements using AI
 */
export async function predictPriceAI(
  pair: string,
  currentPrice: number,
  indicators: TechnicalIndicators,
  regime: MarketRegimeAnalysis,
  priceHistory: number[]
): Promise<{ shortTerm: number; mediumTerm: number; longTerm: number }> {
  const priceChange24h = (
    ((currentPrice - priceHistory[0]) / priceHistory[0]) *
    100
  ).toFixed(2);

  const prompt = `
Predict future price levels for ${pair}.

Current Price: $${currentPrice.toFixed(2)}
24h Change: ${priceChange24h}%
Market Regime: ${regime.regime}
RSI: ${indicators.rsi.toFixed(2)}
ADX: ${indicators.adx.toFixed(2)}

Provide price predictions for:
1. Short term (1-4 hours)
2. Medium term (1-3 days)
3. Long term (1-4 weeks)

Format as JSON with realistic price targets:
{
  "shortTerm": price_number,
  "mediumTerm": price_number,
  "longTerm": price_number,
  "reasoning": "brief explanation"
}
  `.trim();

  try {
    const response = await callOpenAI(prompt);

    // Extract JSON from response (handle markdown code fences and extra text)
    let cleanedResponse = response.trim();
    cleanedResponse = cleanedResponse.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('❌ No JSON in price prediction response', null, { pair });
      throw new Error('No JSON object found in response');
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      logger.error('❌ Price prediction JSON parse failed', parseError instanceof Error ? parseError : null, {
        pair,
        jsonString: jsonMatch[0].slice(0, 300),
      });

      // Try basic repair
      const repairedJson = jsonMatch[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      try {
        parsed = JSON.parse(repairedJson);
        logger.info('✅ Price prediction JSON repaired', { pair });
      } catch {
        throw parseError;
      }
    }

    return {
      shortTerm: parsed.shortTerm || currentPrice * 1.01,
      mediumTerm: parsed.mediumTerm || currentPrice * 1.03,
      longTerm: parsed.longTerm || currentPrice * 1.05,
    };
  } catch (error) {
    logger.error('Price prediction error', error instanceof Error ? error : null);
    // Return conservative predictions on error
    return {
      shortTerm: currentPrice * 1.005,
      mediumTerm: currentPrice * 1.015,
      longTerm: currentPrice * 1.03,
    };
  }
}

/**
 * Analyze risk for a given trade setup
 */
export async function analyzeRiskAI(
  pair: string,
  signal: TradeSignal,
  entryPrice: number,
  stopLoss: number,
  takeProfit: number
): Promise<{
  riskScore: number;
  maxLoss: number;
  maxGain: number;
  recommendation: string;
}> {
  const riskAmount = Math.abs(entryPrice - stopLoss);
  const rewardAmount = Math.abs(takeProfit - entryPrice);
  const riskRewardRatio = rewardAmount / riskAmount;

  const prompt = `
Analyze the risk profile for a ${signal} trade on ${pair}.

Entry: $${entryPrice.toFixed(2)}
Stop Loss: $${stopLoss.toFixed(2)}
Take Profit: $${takeProfit.toFixed(2)}
Risk/Reward Ratio: ${riskRewardRatio.toFixed(2)}

Provide risk assessment with:
1. Risk score (0-100, where 100 is highest risk)
2. Recommended maximum position size (% of account)
3. Risk management recommendation
4. Alternative stop loss/take profit suggestions if needed

Format as JSON:
{
  "riskScore": 45,
  "maxPositionSize": 2.5,
  "recommendation": "suitable for moderate risk traders",
  "alternatives": "consider tighter stop loss"
}
  `.trim();

  try {
    const response = await callOpenAI(prompt);

    // Extract JSON from response (handle markdown code fences and extra text)
    let cleanedResponse = response.trim();
    cleanedResponse = cleanedResponse.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('❌ No JSON in risk analysis response', null, { pair });
      throw new Error('No JSON object found in response');
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      logger.error('❌ Risk analysis JSON parse failed', parseError instanceof Error ? parseError : null, {
        pair,
        jsonString: jsonMatch[0].slice(0, 300),
      });

      // Try basic repair
      const repairedJson = jsonMatch[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      try {
        parsed = JSON.parse(repairedJson);
        logger.info('✅ Risk analysis JSON repaired', { pair });
      } catch {
        throw parseError;
      }
    }

    return {
      riskScore: Math.min(100, Math.max(0, parsed.riskScore || 50)),
      maxLoss: riskAmount,
      maxGain: rewardAmount,
      recommendation: parsed.recommendation || 'Assess risk carefully',
    };
  } catch (error) {
    logger.error('Risk analysis error', error instanceof Error ? error : null);
    return {
      riskScore: 50,
      maxLoss: riskAmount,
      maxGain: rewardAmount,
      recommendation: 'Unable to assess risk at this time',
    };
  }
}

/**
 * AI Confidence Boost Result
 */
export interface AIConfidenceBoostResult {
  adjustment: number; // -15 to +15
  reasoning: string;
  provider: string;
  latencyMs: number;
}

/**
 * Format candles for LLM prompt (compact representation)
 */
function formatCandlesForPrompt(candles: OHLCCandle[]): string {
  return candles.map((c, i) => {
    const change = ((c.close - c.open) / c.open * 100).toFixed(2);
    const direction = c.close >= c.open ? '+' : '';
    return `${i + 1}. O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)} V:${c.volume.toFixed(0)} (${direction}${change}%)`;
  }).join('\n');
}

/**
 * AI Confidence Boost - Hybrid AI Layer
 *
 * Called AFTER deterministic confidence is calculated.
 * Sends last 10 candles + indicators to Claude/OpenAI.
 * Returns confidence adjustment (-15 to +15).
 * Falls back to 0 adjustment on API failure (safe default).
 *
 * The deterministic 3-path gate makes the yes/no signal decision.
 * This function only adjusts HOW confident we are in that decision.
 */
export async function aiConfidenceBoost(
  pair: string,
  candles: OHLCCandle[],
  indicators: TechnicalIndicators,
  deterministicSignal: TradeSignal,
  deterministicConfidence: number,
  regime: string
): Promise<AIConfidenceBoostResult> {
  const startTime = Date.now();
  const maxAdj = aiConfig.confidenceBoostMaxAdjustment;

  // Take last 10 candles for context
  const recentCandles = candles.slice(-10);

  const prompt = `You are a crypto trading confidence advisor. Analyze these recent 15-minute candles and indicators for ${pair}.

RECENT CANDLES (oldest to newest):
${formatCandlesForPrompt(recentCandles)}

CURRENT INDICATORS:
- RSI: ${indicators.rsi.toFixed(1)}
- ADX: ${indicators.adx.toFixed(1)} (regime: ${regime})
- MACD histogram: ${indicators.macd.histogram.toFixed(4)}
- 1h momentum: ${(indicators.momentum1h || 0).toFixed(3)}%
- 4h momentum: ${(indicators.momentum4h || 0).toFixed(3)}%
- Volume ratio: ${(indicators.volumeRatio || 1).toFixed(2)}x

DETERMINISTIC SYSTEM says: ${deterministicSignal.toUpperCase()} with ${deterministicConfidence}% confidence.

Should confidence be adjusted? Consider:
1. Price action pattern (higher highs/lows, consolidation, reversal candles)
2. Volume confirmation (is volume supporting the move?)
3. Momentum divergence (indicators disagreeing with price?)
4. Candle structure (wicks, dojis, engulfing patterns)

Respond with ONLY valid JSON, no other text:
{"adjustment": <number from -${maxAdj} to ${maxAdj}>, "reasoning": "<one sentence>"}

Rules:
- Positive adjustment = more confident in the signal
- Negative adjustment = less confident in the signal
- 0 = no change needed
- Stay within -${maxAdj} to +${maxAdj} range`;

  try {
    const responseText = await callOpenAI(prompt, 200);

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('AI confidence boost: no JSON in response', { pair, response: responseText.slice(0, 200) });
      return { adjustment: 0, reasoning: 'No valid response', provider: 'openai', latencyMs: Date.now() - startTime };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const rawAdjustment = typeof parsed.adjustment === 'number' ? parsed.adjustment : 0;
    // Clamp to ±maxAdj
    const adjustment = Math.min(maxAdj, Math.max(-maxAdj, Math.round(rawAdjustment)));
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No reasoning provided';

    const latencyMs = Date.now() - startTime;

    logger.info('AI confidence boost result', {
      pair,
      deterministicSignal,
      deterministicConfidence,
      adjustment,
      reasoning,
      latencyMs,
    });

    return { adjustment, reasoning, provider: 'openai', latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';

    // Safe fallback: 0 adjustment (no impact on trading)
    logger.warn('AI confidence boost failed, using 0 adjustment (safe fallback)', {
      pair,
      error: errorMsg,
      latencyMs,
    });

    return { adjustment: 0, reasoning: `Fallback: ${errorMsg}`, provider: 'openai', latencyMs };
  }
}
