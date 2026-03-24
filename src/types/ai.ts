/**
 * AI Analysis Types
 * Types for AI-powered market analysis, predictions, and signals
 */

export type MarketRegime = 'choppy' | 'transitioning' | 'weak' | 'moderate' | 'strong';
export type SignalStrength = 'strong' | 'moderate' | 'weak';
export type TradeSignal = 'buy' | 'sell' | 'hold';
export type SentimentScore = 'very_positive' | 'positive' | 'neutral' | 'negative' | 'very_negative';

export interface TechnicalIndicators {
  adx: number;           // Trend strength — how consistently price is moving (0-100, not direction)
  adxSlope?: number;     // ADX rate of change per candle (positive = strengthening)
  momentum1h?: number;   // Raw % price change over last 1h (4 × 15m candles)
  momentum4h?: number;   // Raw % price change over last 4h (16 × 15m candles)
  volumeRatio?: number;  // Current candle volume vs 20-candle average
  intrabarMomentum?: number; // (currentPrice - candleOpen) / candleOpen — real-time direction
  recentHigh?: number;   // Highest high over last 20 candles
  recentLow?: number;    // Lowest low over last 20 candles
}

export interface MarketRegimeAnalysis {
  regime: MarketRegime;
  confidence: number; // 0-100
  volatility: number; // 0-100
  trend: number; // -100 to 100 (negative=down, positive=up)
  analysis: string;
  timestamp: Date;
}

export interface PriceTarget {
  price: number;
  timeframe: '1h' | '4h' | '1d' | '1w';
  probability: number; // 0-100
}

export interface PricePrediction {
  currentPrice: number;
  shortTerm: PriceTarget; // Next 1-4 hours
  mediumTerm: PriceTarget; // Next 1-3 days
  longTerm: PriceTarget; // Next 1-4 weeks
  direction: 'up' | 'down' | 'neutral';
  confidence: number; // 0-100
  keyLevels: {
    support: number[];
    resistance: number[];
  };
  analysis: string;
  timestamp: Date;
}

export interface SentimentAnalysis {
  score: SentimentScore;
  value: number; // -100 to 100 (-100=very negative, 0=neutral, 100=very positive)
  sources: {
    news: number;
    social: number;
    onchain: number;
    institutional: number;
  };
  momentum: number; // -100 to 100 (sentiment change rate)
  analysis: string;
  timestamp: Date;
}

export interface TradeSignalAnalysis {
  signal: TradeSignal;
  strength: SignalStrength;
  confidence: number; // 0-100
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  factors: string[];
  technicalScore: number; // 0-100
  sentimentScore: number; // 0-100
  regimeScore: number; // 0-100
  analysis: string;
  timestamp: Date;
  expiresAt: Date;
}

export interface AIAnalysisRequest {
  pair: string;
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  includeRegime?: boolean;
  includePrediction?: boolean;
  includeSentiment?: boolean;
  includeSignal?: boolean;
  // Optional: Pass current live price + indicators to avoid re-fetching stale OHLC data
  currentPrice?: number;
  indicators?: TechnicalIndicators;
  isVolumeSurge?: boolean; // Extraordinary volume breakout — tells Claude not to penalize low ADX/overbought RSI
  isCreepingUptrend?: boolean; // Slow sustained directional grind — tells Claude to look for consistency not explosiveness
}

export interface AIAnalysisResult {
  pair: string;
  timeframe: string;
  regime?: MarketRegimeAnalysis;
  prediction?: PricePrediction;
  sentiment?: SentimentAnalysis;
  signal?: TradeSignalAnalysis;
  generatedAt: Date;
  confidence: number; // Overall confidence
}

export interface MarketData {
  pair: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OHLCCandle {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AIModel {
  name: string;
  type: 'regime_detection' | 'price_prediction' | 'sentiment' | 'signal_generation';
  version: string;
  accuracy: number; // 0-100
  lastUpdated: Date;
  status: 'active' | 'training' | 'deprecated';
}

export interface AICache {
  pair: string;
  timeframe: string;
  analysis: AIAnalysisResult;
  expiresAt: Date;
}
