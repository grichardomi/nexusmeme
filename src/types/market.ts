export interface MarketData {
  pair: string;
  price: number;
  volume: number;
  timestamp: Date;
  change24h?: number;
  high24h?: number;
  low24h?: number;
  bid?: number;  // Best bid price (for spread calculation)
  ask?: number;  // Best ask price (for spread calculation)
}

export interface OHLCV {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type RegimeType = 'choppy' | 'weak' | 'moderate' | 'strong';

export interface MarketRegime {
  type: RegimeType;
  confidence: number; // 0-1
  reason: string;
  timestamp: Date;
}

export interface TradeDecision {
  pair: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  reason: string;
  timestamp: Date;
  regime: MarketRegime;
  signalConfidence: number; // 0-100: AI's confidence in the trade signal (used for position sizing)
  stopLoss?: number; // Risk management: exit price on loss
  takeProfit?: number; // Dynamic profit target based on regime
  capitalPreservationMultiplier?: number; // 0.25-1.0: position size reduction from capital preservation layers
}

export interface ExecutionPlan {
  userId: string;
  botInstanceId: string;
  pair: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  reason: string;
  timestamp: Date;
  stopLoss?: number; // Risk management: exit price on loss
  takeProfit?: number; // Dynamic profit target based on regime
}
