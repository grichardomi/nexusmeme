/**
 * AI Market Analyzer
 * Orchestrates all AI analysis services
 */

import { logger } from '@/lib/logger';
import {
  calculateTechnicalIndicators,
  detectMarketRegime,
  generatePriceTargets,
} from './market-analysis';
import {
  analyzeSentimentAI,
  generateTradeSignalAI,
  predictPriceAI,
  analyzeRiskAI,
} from './inference';
import { fetchKrakenOHLC } from '@/services/market-data/kraken-ohlc';
import { regimeDetector } from '@/services/regime/detector';
import {
  AIAnalysisRequest,
  AIAnalysisResult,
  OHLCCandle,
} from '@/types/ai';

// Cache disabled per CLAUDE.md: "no cached data"
// AI analysis must be fresh for each market condition check
// especially critical for detecting rising/falling prices in real-time
// If AI_PRESET_CACHE_TTL_MS is set, it overrides this
const CACHE_TTL_MS = process.env.AI_PRESET_CACHE_TTL_MS
  ? parseInt(process.env.AI_PRESET_CACHE_TTL_MS, 10)
  : 0; // Default: 0 = no cache

const cache = new Map<string, AIAnalysisResult>();

/**
 * Perform comprehensive AI market analysis
 */
export async function analyzeMarket(
  request: AIAnalysisRequest
): Promise<AIAnalysisResult> {
  const cacheKey = `${request.pair}:${request.timeframe}`;

  // Check cache only if explicitly enabled via environment variable
  if (CACHE_TTL_MS > 0 && cache.has(cacheKey)) {
    const cached = cache.get(cacheKey)!;
    if (new Date().getTime() - cached.generatedAt.getTime() < CACHE_TTL_MS) {
      logger.debug('Using cached AI analysis', { pair: request.pair, cacheAgeMsS: new Date().getTime() - cached.generatedAt.getTime() });
      return cached;
    }
    cache.delete(cacheKey);
  }

  logger.debug('Starting AI market analysis', {
    pair: request.pair,
    timeframe: request.timeframe,
  });

  try {
    // Fetch market data
    logger.debug('Fetching market data for analysis', {
      pair: request.pair,
      timeframe: request.timeframe,
    });

    const candles = await fetchMarketData(
      request.pair,
      request.timeframe,
      50
    );

    if (candles.length < 26) {
      throw new Error('Insufficient historical data');
    }

    logger.debug('Market data fetched successfully', {
      pair: request.pair,
      candleCount: candles.length,
    });

    const closes = candles.map((c) => c.close);
    const currentPrice = closes[closes.length - 1];

    // Calculate technical indicators
    const indicators = calculateTechnicalIndicators(candles);

    const result: AIAnalysisResult = {
      pair: request.pair,
      timeframe: request.timeframe,
      generatedAt: new Date(),
      confidence: 0,
    };

    let confidenceScores = 0;
    let confidenceCount = 0;

    // Market Regime Analysis
    // CRITICAL: Use regime from database (already detected by orchestrator with 100 candles)
    // instead of recalculating with only 50 candles
    if (request.includeRegime !== false) {
      logger.debug('Analyzing market regime', { pair: request.pair });
      const dbRegime = await regimeDetector.getLatestRegime(request.pair);

      if (dbRegime) {
        // Convert database regime object to MarketRegimeAnalysis format
        result.regime = {
          regime: dbRegime.type,
          confidence: Number(dbRegime.confidence),
          volatility: 0,
          trend: 0,
          analysis: dbRegime.reason,
          timestamp: dbRegime.timestamp,
        };
      } else {
        result.regime = detectMarketRegime(candles, indicators);
      }

      confidenceScores += result.regime.confidence;
      confidenceCount++;

      logger.debug('Market regime analysis complete', {
        pair: request.pair,
        regime: result.regime.regime,
        confidence: result.regime.confidence,
      });
    }

    // Price Prediction
    if (request.includePrediction !== false) {
      logger.debug('Generating price predictions', { pair: request.pair });
      const priceTargets = generatePriceTargets(candles, indicators);
      const predictions = await predictPriceAI(
        request.pair,
        currentPrice,
        indicators,
        result.regime || detectMarketRegime(candles, indicators),
        closes.slice(-24)
      );

      result.prediction = {
        currentPrice,
        shortTerm: {
          price: predictions.shortTerm,
          timeframe: '1h',
          probability: 65,
        },
        mediumTerm: {
          price: predictions.mediumTerm,
          timeframe: '1d',
          probability: 60,
        },
        longTerm: {
          price: predictions.longTerm,
          timeframe: '1w',
          probability: 55,
        },
        direction:
          predictions.longTerm > currentPrice ? 'up' : 'down',
        confidence: 70,
        keyLevels: priceTargets,
        analysis: 'AI-generated price predictions based on technical analysis',
        timestamp: new Date(),
      };

      confidenceScores += result.prediction.confidence;
      confidenceCount++;

      logger.debug('Price prediction analysis complete', {
        pair: request.pair,
        direction: result.prediction.direction,
      });
    }

    // Sentiment Analysis
    if (request.includeSentiment !== false) {
      logger.debug('Analyzing market sentiment', { pair: request.pair });
      const recentNews = await fetchMarketNews();
      result.sentiment = await analyzeSentimentAI(
        request.pair,
        recentNews,
        result.regime?.analysis || 'No regime data'
      );

      confidenceScores += ((result.sentiment.value + 100) / 2) * 0.5;
      confidenceCount++;

      logger.debug('Sentiment analysis complete', {
        pair: request.pair,
        sentiment: result.sentiment.score,
      });
    }

    // Trade Signal Generation
    if (request.includeSignal !== false) {
      logger.debug('Generating trade signal', { pair: request.pair });

      const sentiment = result.sentiment || {
        score: 'neutral',
        value: 0,
        sources: { news: 0, social: 0, onchain: 0, institutional: 0 },
        momentum: 0,
        analysis: '',
        timestamp: new Date(),
      };

      const regime = result.regime || detectMarketRegime(candles, indicators);

      result.signal = await generateTradeSignalAI(
        request.pair,
        currentPrice,
        indicators,
        regime,
        sentiment
      );

      logger.info('Trade signal generated', {
        pair: request.pair,
        signal: result.signal.signal,
        strength: result.signal.strength,
        confidence: result.signal.confidence,
        entryPrice: result.signal.entryPrice,
        stopLoss: result.signal.stopLoss,
        takeProfit: result.signal.takeProfit,
        riskRewardRatio: result.signal.riskRewardRatio,
        technicalScore: result.signal.technicalScore,
        sentimentScore: result.signal.sentimentScore,
        regimeScore: result.signal.regimeScore,
      });

      // Analyze risk for the signal
      logger.debug('Analyzing signal risk', { pair: request.pair });
      const risk = await analyzeRiskAI(
        request.pair,
        result.signal.signal,
        result.signal.entryPrice,
        result.signal.stopLoss,
        result.signal.takeProfit
      );

      logger.debug('Risk analysis complete', {
        pair: request.pair,
        riskScore: risk.riskScore,
      });

      // CRITICAL: Signal confidence is PRIMARY (matches /nexus behavior)
      // Do NOT reduce confidence based on regime or risk analysis
      // The momentum signal is the core entry decision - regime is informational only
      logger.debug('Signal confidence maintained (matching /nexus behavior)', {
        pair: request.pair,
        signalConfidence: result.signal.confidence,
        regime: regime?.regime,
        riskScore: risk.riskScore,
      });
    }

    // Calculate overall confidence (PRIMARY = signal confidence, NOT average)
    // This prevents diluting strong trade signals with weak regime/sentiment
    if (result.signal) {
      result.confidence = result.signal.confidence;
    } else if (confidenceCount > 0) {
      // Only use averaging if no signal was generated
      result.confidence = Math.round(confidenceScores / confidenceCount);
    } else {
      result.confidence = 50;
    }

    // Only log if a signal was generated
    if (result.signal) {
      logger.debug('AI market analysis complete with signal', {
        pair: request.pair,
        overallConfidence: result.confidence,
        signal: result.signal.signal,
        signalConfidence: result.signal.confidence,
      });
    }

    // Cache result only if caching is explicitly enabled
    if (CACHE_TTL_MS > 0) {
      cache.set(cacheKey, result);
    }

    return result;
  } catch (error) {
    logger.error('Market analysis error', error instanceof Error ? error : null, {
      pair: request.pair,
      timeframe: request.timeframe,
    });
    throw error;
  }
}

/**
 * Fetch market data using shared Kraken OHLC utility
 */
async function fetchMarketData(
  pair: string,
  timeframe: string,
  limit: number
): Promise<OHLCCandle[]> {
  return fetchKrakenOHLC(pair, limit, timeframe);
}

/**
 * Fetch recent news for a trading pair
 */
async function fetchMarketNews(): Promise<string[]> {
  // This would fetch from a news API or database
  // For now, returning empty array (news integration would be next phase)
  return [];
}
/**
 * Clear cache (for testing or updates)
 */
export function clearAnalysisCache(): void {
  cache.clear();
}

/**
 * Get cache size
 */
export function getCacheSize(): number {
  return cache.size;
}
