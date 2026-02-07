/**
 * AI Inference Service
 * Handles AI model inference for market analysis using OpenAI
 */

import { logger } from '@/lib/logger';
import { getEnv } from '@/config/environment';
import {
  TechnicalIndicators,
  MarketRegimeAnalysis,
  SentimentAnalysis,
  SentimentScore,
  TradeSignalAnalysis,
  TradeSignal,
  SignalStrength,
} from '@/types/ai';

const OPENAI_API_KEY = getEnv('OPENAI_API_KEY');
const OPENAI_BASE_URL = 'https://api.openai.com/v1';
// COST OPTIMIZATION: Use env var to select model
// gpt-4: $0.03/1K input, $0.06/1K output (expensive)
// gpt-4-turbo: $0.01/1K input, $0.03/1K output (3x cheaper)
// gpt-4o-mini: $0.00015/1K input, $0.0006/1K output (200x cheaper - RECOMMENDED)
// gpt-3.5-turbo: $0.0005/1K input, $0.0015/1K output (60x cheaper)
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

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

  // /nexus parity: Simple momentum display, no reversal complexity
  const momentum1h = indicators.momentum1h || 0;

  const prompt = `
Generate a trade signal for ${pair} at price $${currentPrice.toFixed(2)}.

Technical Indicators:
- 1h Momentum: ${momentum1h.toFixed(3)}% (recent trend acceleration)
- 4h Momentum: ${(indicators.momentum4h || 0).toFixed(3)}% (longer trend context)
- RSI: ${indicators.rsi.toFixed(2)} (30-70 range is neutral, <30 oversold bullish, >70 overbought bearish)
- MACD Histogram: ${indicators.macd.histogram.toFixed(6)} (positive = bullish, negative = bearish)
- ADX: ${indicators.adx.toFixed(2)} (>25 = trending, <25 = ranging)
- ATR: ${indicators.atr.toFixed(8)} (volatility measure)
- Bollinger Bands Position: ${(((currentPrice - indicators.bollingerBands.lower) / (indicators.bollingerBands.upper - indicators.bollingerBands.lower)) * 100).toFixed(2)}% (0% = lower band, 50% = middle, 100% = upper band)
${indicators.ema200 ? `- EMA200: ${indicators.ema200.toFixed(2)} (Current price relative: ${((currentPrice / indicators.ema200 - 1) * 100).toFixed(2)}%)` : '- EMA200: Not available'}

Market Regime: ${regime.regime} (Confidence: ${regime.confidence.toFixed(0)}%)
Sentiment: ${sentiment.score} (Value: ${sentiment.value})

═══════════════════════════════════════════════════════════════
CRITICAL SIGNAL GENERATION RULES (Matching /nexus - Momentum First):
═══════════════════════════════════════════════════════════════

PRIMARY RULE: Positive 1h momentum (>0%) = BUY signal
SECONDARY: Regime adjusts confidence level, not whether to trade
SIMPLICITY: /nexus trades successfully with this simple approach

Current Regime: ${regime.regime} (ADX: ${indicators.adx.toFixed(1)})

DECISION RULES (/nexus parity - SIMPLE):
1. ✅ BUY when momentum1h > 0.5% (catches 0.68% entries like /nexus)
2. ❌ HOLD when momentum1h ≤ 0.5% (too weak)
3. Volume < 0.8x is OK - "Despite low volume, positive momentum suggests early stage recovery"
4. Block if RSI > 85 (extreme overbought)

CONFIDENCE SCORING (/nexus FLAT 70%):
- momentum1h > 0.5%: FLAT 70% confidence (no regime variations)
- momentum1h ≤ 0.5%: 40-55% confidence (HOLD)
- Low volume acceptable - /nexus trades with 0.29x volume successfully

BOOSTERS (add +2-3% each):
- MACD histogram positive
- Volume > 1.0x average
- RSI in 30-60 range (not extreme)

PENALTIES (subtract -5% each):
- RSI > 85 (extreme overbought)
- 4h momentum < -2.0% (strong bearish trend)

TARGET: Generate 70%+ confidence when momentum1h > 0.75% in trending markets (balanced approach)

PROFIT TARGET STRATEGY (Regime-Driven):
- Choppy (ADX < 20): 2% target
- Weak (ADX 20-30): 4.5% target
- Moderate (ADX 30-35): 6.5% target
- Strong (ADX >= 35): 12% target

Based on this analysis, provide:
1. Trade signal (buy, sell, hold) - REGIME DETERMINES DEFAULT
2. Signal strength (strong, moderate, weak)
3. Suggested entry price (should match current price ±0.5% typically)
4. Stop loss price (2% below entry for buy, 2% above for sell)
5. Take profit target (use regime-appropriate target from above)
6. Confidence (0-100) - Follow regime guidelines above
7. Key factors influencing the signal

STRICT OUTPUT FORMAT:
- Return ONLY valid JSON (no prose, no code fences, no comments)
- All numeric fields MUST be numbers (no % signs or text)
- "takeProfit" MUST be a price number, not a percent

Format as JSON:
{
  "signal": "buy",
  "strength": "moderate",
  "entryPrice": 0,
  "stopLoss": 0,
  "takeProfit": 0,
  "confidence": 75,
  "factors": ["factor1", "factor2"],
  "analysis": "brief analysis"
}
  `.trim();

  try {
    const response = await callOpenAI(prompt);

    // Extract JSON from response (handle markdown code fences and extra text)
    let cleanedResponse = response.trim();

    // Remove markdown code fences if present (```json ... ``` or ``` ... ```)
    cleanedResponse = cleanedResponse.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

    // Extract JSON object from the cleaned response
    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('❌ No JSON object found in AI response', null, {
        pair,
        responseLength: response.length,
        responsePreview: response.slice(0, 500),
      });
      throw new Error('No JSON object found in response');
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      // Log the actual JSON that failed to parse for debugging
      logger.error('❌ JSON parsing failed', parseError instanceof Error ? parseError : null, {
        pair,
        jsonString: jsonMatch[0],
        errorMessage: parseError instanceof Error ? parseError.message : String(parseError),
      });

      // Try to repair common JSON issues
      let repairedJson = jsonMatch[0]
        .replace(/,\s*}/g, '}')  // Remove trailing commas before }
        .replace(/,\s*]/g, ']')  // Remove trailing commas before ]
        .replace(/'\s*:/g, '":') // Replace single quotes with double quotes for keys
        .replace(/:\s*'/g, ':"')  // Replace single quotes with double quotes for values
        .replace(/}'/g, '}"')
        .replace(/]'/g, ']"');

      // Additional repair: sanitize numeric fields that may contain text like "12% target (approx. 79172.45)"
      try {
        const numericFields = ['entryPrice', 'stopLoss', 'takeProfit', 'confidence'];
        for (const field of numericFields) {
          const re = new RegExp(`("${field}"\s*:\s*)([^,}\
]+)`, 'i');
          const m = repairedJson.match(re);
          if (m) {
            const rawVal = m[2];
            // Extract all numeric tokens (supports integers and decimals)
            const nums = String(rawVal).match(/-?\d+(?:\.\d+)?/g);
            if (nums && nums.length > 0) {
              // Heuristic: choose the largest absolute value (prefers actual price over small percentages)
              const best = nums
                .map(n => parseFloat(n))
                .filter(n => !isNaN(n))
                .sort((a, b) => Math.abs(b) - Math.abs(a))[0];
              // Replace the entire value with the numeric literal
              repairedJson = repairedJson.replace(re, `$1${best}`);
            } else {
              // If no numbers found, set to currentPrice-based sensible default placeholders
              // Defer to later numeric validation which will fallback appropriately
              repairedJson = repairedJson.replace(re, `$10`);
            }
          }
        }
      } catch (numRepairErr) {
        logger.debug('Numeric field sanitization skipped', {
          pair,
          error: numRepairErr instanceof Error ? numRepairErr.message : String(numRepairErr),
        });
      }

      try {
        parsed = JSON.parse(repairedJson);
        logger.info('✅ JSON repaired successfully', { pair });
      } catch (repairError) {
        logger.error('❌ JSON repair failed', repairError instanceof Error ? repairError : null, {
          pair,
          originalJson: jsonMatch[0].slice(0, 300),
          repairedJson: repairedJson.slice(0, 300),
        });
        throw parseError; // Throw original error
      }
    }

    const signalMap: Record<string, TradeSignal> = {
      buy: 'buy',
      sell: 'sell',
      hold: 'hold',
    };

    const strengthMap: Record<string, SignalStrength> = {
      strong: 'strong',
      moderate: 'moderate',
      weak: 'weak',
    };

    const signal = signalMap[parsed.signal] || 'hold';
    const strength = strengthMap[parsed.strength] || 'weak';

    // Calculate dynamic profit target based on regime (matching Nexus behavior)
    // This is critical for profitability in different market conditions
    const regimeProfitTargets: Record<string, number> = {
      choppy: 0.02,    // 2% - quick exits in ranging markets
      weak: 0.045,     // 4.5% - short-term reversals
      moderate: 0.065, // 6.5% - developing trends
      strong: 0.12,    // 12% - maximize momentum
    };
    const regimeBasedProfitTarget = regimeProfitTargets[regime.regime] || 0.05; // 5% default

    // Use AI-provided takeProfit if available, otherwise use regime-based target
    // IMPORTANT: AI may return "N/A" (string) for hold signals - must validate as number
    const entryPrice = (typeof parsed.entryPrice === 'number' && !isNaN(parsed.entryPrice) && parsed.entryPrice > 0)
      ? parsed.entryPrice
      : currentPrice;
    // Validate numeric values from AI (may return "N/A" strings for hold signals)
    const isValidNum = (v: any): v is number => typeof v === 'number' && !isNaN(v) && v > 0;
    const parsedStopLoss = isValidNum(parsed.stopLoss) ? parsed.stopLoss : null;
    const parsedTakeProfit = isValidNum(parsed.takeProfit) ? parsed.takeProfit : null;

    const finalTakeProfit = parsedTakeProfit || (
      signal === 'buy'
        ? entryPrice * (1 + regimeBasedProfitTarget)
        : entryPrice * (1 - regimeBasedProfitTarget)
    );

    // Calculate risk/reward ratio
    let riskRewardRatio = 1;
    if (signal === 'buy') {
      const risk = Math.abs(entryPrice - (parsedStopLoss || entryPrice * 0.99)); // Hybrid: -1% stop loss
      const reward = Math.abs(finalTakeProfit - entryPrice);
      riskRewardRatio = reward > 0 ? reward / risk : 1;
    }

    const result = {
      signal,
      strength,
      confidence: Math.min(100, Math.max(0, parsed.confidence || 50)),
      entryPrice,
      stopLoss: parsedStopLoss || (signal === 'buy' ? currentPrice * 0.95 : currentPrice * 1.05), // 5% stop loss for parity with Nexus
      takeProfit: finalTakeProfit,
      riskRewardRatio,
      factors: parsed.factors || [],
      technicalScore: indicators.rsi > 30 && indicators.rsi < 70 ? 75 : 50,
      sentimentScore: ((sentiment.value + 100) / 2) * 0.5,
      regimeScore: regime.confidence,
      analysis: parsed.analysis || '',
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours
    };

    // /nexus parity: Cache the response for future calls
    setCache(cacheKey, JSON.stringify(result));

    return result;
  } catch (error) {
    logger.error('Signal generation error', error instanceof Error ? error : null);
    // Return neutral hold signal on error
    return {
      signal: 'hold',
      strength: 'weak',
      confidence: 30,
      entryPrice: currentPrice,
      stopLoss: currentPrice * 0.95, // 5% stop loss for parity with Nexus
      takeProfit: currentPrice * 1.05,
      riskRewardRatio: 1,
      factors: ['Unable to generate signal'],
      technicalScore: 50,
      sentimentScore: 50,
      regimeScore: 50,
      analysis: 'Insufficient data for reliable signal',
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + 1 * 60 * 60 * 1000),
    };
  }
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
