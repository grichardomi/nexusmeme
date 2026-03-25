/**
 * AI Inference Service
 * Handles AI model inference for market analysis using Claude (primary) or OpenAI (fallback)
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
  const volumeBucket = Math.floor((indicators.volumeRatio || 1) / 0.5);
  return `${pair}:${priceBucket}:${volumeBucket}`;
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
 * Call Claude API (Haiku) for market analysis
 * Primary LLM provider — cost-effective at ~$0.30/month for buy-signal-only calls
 */
async function callClaude(prompt: string, maxTokens = 300): Promise<string> {
  const ANTHROPIC_API_KEY = aiConfig.anthropicApiKey;
  const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

  if (!ANTHROPIC_API_KEY) {
    logger.error('🚫 Anthropic API key not configured');
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const startTime = Date.now();
  logger.info('🤖 Claude API call starting', { model: CLAUDE_MODEL, maxTokens });

  const attemptFetch = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000); // 10s timeout
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      return response;
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let response: Response;
    try {
      response = await attemptFetch();
    } catch (firstErr) {
      // Single retry on network/timeout error
      logger.warn('🔄 Claude API transient error, retrying once', { error: firstErr instanceof Error ? firstErr.message : String(firstErr) });
      await new Promise(r => setTimeout(r, 1000));
      response = await attemptFetch();
    }

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      logger.error('🚫 Claude API error', null, { status: response.status, statusText: response.statusText, durationMs });
      throw new Error(`Claude API error: ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    logger.info('✅ Claude API call completed', { model: CLAUDE_MODEL, durationMs, chars: text.length });
    return text;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error('🚫 Claude inference error', error instanceof Error ? error : null, { durationMs, model: CLAUDE_MODEL });
    throw error;
  }
}

/**
 * Route LLM call to configured provider (Claude or OpenAI)
 */
async function callLLM(prompt: string, maxTokens = 300): Promise<string> {
  const provider = aiConfig.provider;
  if (provider === 'claude') {
    return callClaude(prompt, maxTokens);
  }
  return callOpenAI(prompt, maxTokens);
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
  // Signal decision: Use same thresholds as risk filter's health gate
  const minMomentum1h = getEnv('RISK_MIN_MOMENTUM_1H_BINANCE') ?? 0.2;
  const minMomentum4h = getEnv('RISK_MIN_MOMENTUM_4H') ?? 0.15;
  const volumeBreakoutRatio = getEnv('RISK_VOLUME_BREAKOUT_RATIO') ?? 1.3;

  const hasStrongMomentum = momentum1h >= minMomentum1h;
  const hasBothPositive = momentum1h >= minMomentum1h && momentum4h >= minMomentum4h;
  const hasVolumeBreakout = volumeRatio >= volumeBreakoutRatio && momentum1h > 0;

  const signal: TradeSignal = (hasStrongMomentum || hasBothPositive || hasVolumeBreakout) ? 'buy' : 'hold';

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

  if (volumeRatio > 1.3) {
    confidence += 5;
    factors.push(`volume ${volumeRatio.toFixed(1)}x (breakout)`);
  }

  if (momentum4h > 0) {
    confidence += 3;
    factors.push(`4h momentum aligned +${momentum4h.toFixed(2)}%`);
  }

  // 4h trend alignment boost
  if (momentum4h > 0.3 && momentum1h > 0) {
    confidence += 20;
    factors.push(`4h trend aligned 4h=${momentum4h.toFixed(2)}% 1h=${momentum1h.toFixed(2)}% (+20)`);
  }

  // Penalties
  if (momentum4h < -2.0) {
    confidence -= 5;
    factors.push(`4h momentum bearish ${momentum4h.toFixed(2)}% (-5)`);
  }

  confidence = Math.min(100, Math.max(0, confidence));

  // Strength from confidence
  const strength: SignalStrength =
    confidence >= 80 ? 'strong' :
    confidence >= 65 ? 'moderate' :
    'weak';

  // Price targets (regime-based) — read from env vars to stay in sync with exit logic
  const envCfg = getEnv('PROFIT_TARGET_CHOPPY') !== undefined ? {
    choppy: getEnv('PROFIT_TARGET_CHOPPY') as number,
    transitioning: getEnv('PROFIT_TARGET_TRANSITIONING') as number,
    weak: getEnv('PROFIT_TARGET_WEAK') as number,
    moderate: getEnv('PROFIT_TARGET_MODERATE') as number,
    strong: getEnv('PROFIT_TARGET_STRONG') as number,
  } : { choppy: 0.005, transitioning: 0.008, weak: 0.015, moderate: 0.02, strong: 0.08 };
  const regimeTarget = (envCfg as Record<string, number>)[regime.regime] ?? envCfg.moderate;

  const entryPrice = currentPrice;
  const stopLoss = currentPrice * 0.95;
  const takeProfit = signal === 'buy'
    ? currentPrice * (1 + regimeTarget)
    : currentPrice * (1 - regimeTarget);

  const risk = Math.abs(entryPrice - stopLoss);
  const reward = Math.abs(takeProfit - entryPrice);
  const riskRewardRatio = reward > 0 ? reward / risk : 1;

  const analysis = signal === 'buy'
    ? `Buy signal: ${momentum1h.toFixed(2)}% 1h, ${momentum4h.toFixed(2)}% 4h momentum, confidence ${confidence}%`
    : `Hold: momentum1h ${momentum1h.toFixed(2)}% insufficient`;

  const result = {
    signal,
    strength,
    confidence,
    entryPrice,
    stopLoss,
    takeProfit,
    riskRewardRatio,
    factors,
    technicalScore: momentum1h > 0.5 ? 75 : 50,
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
    momentum4h: momentum4h.toFixed(2),
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
1h Momentum: ${(indicators.momentum1h || 0).toFixed(2)}%
4h Momentum: ${(indicators.momentum4h || 0).toFixed(2)}%

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
  _regime: string,
  isVolumeSurge = false,
  isCreepingUptrend = false
): Promise<AIConfidenceBoostResult> {
  const startTime = Date.now();
  const maxAdj = aiConfig.confidenceBoostMaxAdjustment;
  const provider = aiConfig.provider;

  // Only call AI for buy signals — hold signals don't need confidence adjustment
  if (deterministicSignal !== 'buy') {
    return { adjustment: 0, reasoning: 'No adjustment needed for hold signal', provider, latencyMs: 0 };
  }

  // Take last 10 candles for context
  const recentCandles = candles.slice(-10);

  const volumeSurgeContext = isVolumeSurge
    ? `\nVOLUME SURGE BREAKOUT: Volume is ${(indicators.volumeRatio || 1).toFixed(1)}x normal — extraordinary buying pressure detected. RSI going overbought during a volume surge is a sign of STRENGTH, not exhaustion. Do NOT penalize RSI in this context.`
    : '';

  const creepingUptrendContext = isCreepingUptrend
    ? `\nCREEPING UPTREND MODE: This is a slow sustained directional grind — NOT a breakout. The profit target is small (1.5%) with a quick exit plan. APPROVE (+adjustment) if you see: consistent small green candles with no large rejection wicks, 1h momentum sustained positive across multiple candles, no sudden large red candle breaking the pattern. REJECT (-adjustment) if you see: a large red candle interrupting the sequence, multiple consecutive lower lows, or a sharp reversal wick on the most recent candle. Volume does not need to be high — steady low volume grind is valid.`
    : '';

  const mom4h = indicators.momentum4h ?? 0;
  const mom1h = indicators.momentum1h ?? 0;
  const downtrend4hContext = mom4h < -0.5
    ? `\n⚠️ 4H DOWNTREND: 4h momentum is ${mom4h.toFixed(2)}% — the broader trend is DOWN. The 1h bounce (${mom1h.toFixed(2)}%) is likely a counter-trend move in a falling market. Apply a strong negative adjustment unless you see compelling reversal evidence.`
    : '';

  const prompt = `You are a crypto trading signal validator. A deterministic system has generated a BUY signal for ${pair}. Your job is to assess whether this buy makes sense given ALL available context — trend direction, momentum across timeframes, and candle patterns.

RECENT CANDLES (oldest to newest):
${formatCandlesForPrompt(recentCandles)}

CURRENT INDICATORS:
- 1h momentum: ${mom1h.toFixed(3)}%
- 4h momentum: ${mom4h.toFixed(3)}%
- Volume ratio: ${(indicators.volumeRatio || 1).toFixed(2)}x${volumeSurgeContext}${creepingUptrendContext}${downtrend4hContext}

DETERMINISTIC SYSTEM says: BUY with ${deterministicConfidence}% confidence.

APPLY NEGATIVE ADJUSTMENT (-5 to -${maxAdj}) when you see ANY of:
- 4h momentum strongly negative (< -0.5%): buying a 1h bounce in a downtrend = high risk of loss
- Bearish engulfing candle on recent candles
- Three consecutive lower highs AND lower lows in the last 5 candles
- Hard rejection at resistance (upper wick ≥ 2× candle body on most recent candle)
- 4h and 1h both trending down (lower lows on multiple timeframes)

APPLY POSITIVE ADJUSTMENT (+5 to +${maxAdj}) when you see:
- Strong volume expansion on green candles
- Higher highs AND higher lows with increasing closes across timeframes
- 4h momentum positive AND accelerating (trend confirmed on higher timeframe)
- Momentum candles (small wicks, large bodies in trend direction)

DEFAULT to 0 only if truly ambiguous with no directional bias evident.

IMPORTANT: Respond with ONLY raw JSON (no markdown, no code blocks, no backticks):
{"adjustment": <integer from -${maxAdj} to ${maxAdj}>, "reasoning": "<max 15 words>"}

Rules:
- Positive = confirmed continuation, higher timeframe aligned
- Negative = counter-trend entry or reversal pattern
- 0 = genuinely ambiguous
- Stay within -${maxAdj} to +${maxAdj} range`;

  try {
    const responseText = await callLLM(prompt, 350);

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('AI confidence boost: no JSON in response', { pair, provider, response: responseText.slice(0, 200) });
      return { adjustment: 0, reasoning: 'No valid response', provider, latencyMs: Date.now() - startTime };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const rawAdjustment = typeof parsed.adjustment === 'number' ? parsed.adjustment : 0;
    // Clamp to ±maxAdj
    const adjustment = Math.min(maxAdj, Math.max(-maxAdj, Math.round(rawAdjustment)));
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No reasoning provided';

    const latencyMs = Date.now() - startTime;

    logger.info('AI confidence boost result', {
      pair,
      provider,
      deterministicSignal,
      deterministicConfidence,
      adjustment,
      reasoning,
      latencyMs,
    });

    return { adjustment, reasoning, provider, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';

    // Safe fallback: 0 adjustment (no impact on trading)
    logger.warn('AI confidence boost failed, using 0 adjustment (safe fallback)', {
      pair,
      provider,
      error: errorMsg,
      latencyMs,
    });

    return { adjustment: 0, reasoning: `Fallback: ${errorMsg}`, provider, latencyMs };
  }
}
