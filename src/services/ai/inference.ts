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
 * Call OpenAI API for market analysis
 */
async function callOpenAI(
  prompt: string,
  maxTokens = 500
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
 */
export async function generateTradeSignalAI(
  pair: string,
  currentPrice: number,
  indicators: TechnicalIndicators,
  regime: MarketRegimeAnalysis,
  sentiment: SentimentAnalysis
): Promise<TradeSignalAnalysis> {
  const prompt = `
Generate a trade signal for ${pair} at price $${currentPrice.toFixed(2)}.

Technical Indicators:
- 1h Momentum: ${(indicators.momentum1h || 0).toFixed(3)}% (recent trend acceleration)
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
CRITICAL SIGNAL GENERATION RULES (ADX-Based Regime, Matching Nexus):
═══════════════════════════════════════════════════════════════

MOMENTUM-FIRST APPROACH (Nexus Pattern):
- ALL regimes: Positive momentum1h is the PRIMARY buy signal
- Regime determines CONFIDENCE LEVEL, not whether to trade
- Strong regime: Positive momentum + any confirmation = HIGH confidence (75-85%)
- Weak regime: Positive momentum + light confirmation = MEDIUM confidence (70-75%)
- Choppy regime: Positive momentum + multiple confirmations = LOWER confidence (65-70%)

Current Regime: ${regime.regime} (ADX-based classification)

1. STRONG REGIME (ADX >= 35, ${regime.regime === 'strong' ? 'ACTIVE' : 'not active'}):
   → PRIMARY: Generate BUY if momentum1h is positive
   → Secondary: Price above EMA200 increases confidence (75-85%)
   → Tertiary: MACD positive reinforces signal
   → Price significantly below EMA200: Still BUY but lower confidence (70%)
   → Confidence: 75-85% for BUY (momentum positive), 50-70% for HOLD/SELL

2. MODERATE REGIME (ADX 30-35, ${regime.regime === 'moderate' ? 'ACTIVE' : 'not active'}):
   → PRIMARY: Generate BUY if momentum1h is positive
   → Secondary: Price above EMA200 or MACD positive = confirmation
   → BUY with positive momentum + any confirmation (confidence 70-75%)
   → HOLD if momentum negative or all confirmations missing
   → Confidence: 70-75% for BUY (when momentum positive + confirmation), 50-68% for HOLD

3. WEAK REGIME (ADX 20-30, ${regime.regime === 'weak' ? 'ACTIVE' : 'not active'}):
   → MOMENTUM-FIRST: 1h momentum direction is the PRIMARY signal
   → HARD BLOCKERS (only these prevent BUY):
     • 4h momentum < -2.0% (strong bearish trend, wait for reversal)
     • RSI < 15 (extreme panic selling)
   → If 1h momentum is positive OR turning positive (was negative, now less negative):
     • Generate BUY with confidence 70-75%
     • Use 4.5% profit target for quick exits
   → If 1h momentum is negative but improving (less negative than 4h):
     • Generate BUY with confidence 68-72% (early reversal play)
   → If 1h momentum is deeply negative (< -0.5%) and worsening:
     • Generate HOLD with confidence 55-65%
   → CONFIRMATIONS boost confidence by 2-3% each:
     • MACD histogram positive or turning positive
     • RSI between 30-50 (oversold bounce zone)
     • Price holding above recent lows
   → Confidence: 68-75% for BUY (momentum positive or improving), 55-65% for HOLD

4. CHOPPY REGIME (ADX < 20, ${regime.regime === 'choppy' ? 'ACTIVE' : 'not active'}):
   → Ranging/choppy market: Avoid entries unless extreme momentum
   → Only BUY if: RSI <30 (oversold) + MACD turning + extreme 1h momentum (>0.5%)
   → Generate BUY with 65-70% confidence ONLY if all extreme conditions met
   → Otherwise generate HOLD (55-65%)
   → Use tight stops (1-2% instead of 2%)
   → Price action matters more than trend
   → Confidence: 55-70% (low confidence environment)

CONFIDENCE SCORING (Regime-Driven, Matching Nexus 70% Base Threshold):
CRITICAL: Nexus uses simple 70% threshold across all regimes.
Confidence ranges should target ABOVE 70% when trading conditions are met:
- 75-85%: Strong regime + trend-aligned signal (price above EMA200 in uptrend)
  → Most signals will exceed 70% threshold ✓
- 70-78%: Moderate regime + good confluence of indicators
  → Many signals will meet/exceed 70% threshold ✓
- 68-75%: Weak regime + multiple confirmations needed
  → Some signals will meet 70% threshold (require better confluence) ✓
- 55-70%: Choppy regime + only extreme momentum plays
  → Only trade if momentum is extreme (69-70% range) ✓
- <55%: Avoid trading (insufficient signal clarity)

PROFIT TARGET STRATEGY (Regime-Driven Dynamic Exits):
Nexus achieves profitability in sideways/choppy markets by using DYNAMIC profit targets:
- Choppy (ADX<20): 2% profit target → Quick exits, jump in/out frequently
- Weak (ADX 20-30): 4.5% profit target → Short-term reversals, fast entries/exits
- Moderate (ADX 30-35): 6.5% profit target → Let developing trends run
- Strong (ADX>=35): 12% profit target → MAXIMIZE momentum gains, hold for the move

CRITICAL: Adapt profit targets to market regime for profitability!
- Weak regime with 62% confidence → Use 4.5% target, not 4%
- Choppy regime → Use aggressive 2% target for quick wins
- Strong regime → Extend to 12% to capture full momentum

Based on this analysis, provide:
1. Trade signal (buy, sell, hold) - REGIME DETERMINES DEFAULT
2. Signal strength (strong, moderate, weak)
3. Suggested entry price (should match current price ±0.5% typically)
4. Stop loss price (2% below entry for buy, 2% above for sell)
5. Take profit target (use regime-appropriate target from above)
6. Confidence (0-100) - Follow regime guidelines above
7. Key factors influencing the signal

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

    // Extract JSON from response (handle cases where OpenAI adds extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

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

    return {
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

    // Extract JSON from response (handle cases where OpenAI adds extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

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

    // Extract JSON from response (handle cases where OpenAI adds extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

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
