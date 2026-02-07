export interface ApiKeys {
  publicKey: string;
  secretKey: string;
}

export interface Order {
  id: string;
  pair: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  status: 'open' | 'closed' | 'cancelled';
  timestamp: Date;
  fee?: number; // Fee value (quote currency if feeAsset=quote)
  feeAsset?: string; // Asset the exchange charged fee in (e.g., BNB)
  feeQuote?: number; // Fee converted to quote currency at execution
  isMaker?: boolean; // Maker/taker flag if known
}

export interface Balance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

export interface Ticker {
  pair: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  timestamp: Date;
  // 24h statistics (from Binance /v3/ticker/24hr)
  priceChange?: number; // Absolute price change
  priceChangePercent?: number; // Percentage change
  highPrice?: number; // 24h high
  lowPrice?: number; // 24h low
  openPrice?: number; // Opening price (matches Binance field name)
}

export interface OrderResult {
  orderId: string;
  pair: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  avgPrice?: number; // Average fill price if provided by exchange
  timestamp: Date;
  status: 'pending' | 'filled' | 'error';
  error?: string;
  fee?: number; // Trading fee (raw amount, asset in feeAsset if not quote)
  feeAsset?: string; // Fee asset symbol (e.g., BNB)
  feeQuote?: number; // Fee converted to quote currency for accurate P&L
  isMaker?: boolean; // Whether the fill executed as maker (if uniform across fills)
}

export interface ExchangeError extends Error {
  code?: string;
  status?: number;
  retryable: boolean;
}
