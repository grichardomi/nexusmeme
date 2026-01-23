/**
 * Market data types for WebSocket streaming
 */

/**
 * Price data for a single trading pair
 */
export interface PriceUpdate {
  pair: string;
  price: number;
  bid: number;
  ask: number;
  high24h: number;
  low24h: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  timestamp: number; // Unix milliseconds
}

/**
 * Binance ticker event format
 * https://binance-docs.github.io/apidocs/spot/en/#individual-symbol-ticker-streams
 */
export interface BinanceTickerEvent {
  e: string; // Event type: 24hrTicker
  E: number; // Event time (milliseconds)
  s: string; // Symbol
  p: string; // Price change
  P: string; // Price change percent
  w: string; // Weighted average price
  x: string; // First trade(F)-price in this period
  c: string; // Last price
  Q: string; // Last quantity
  b: string; // Best bid price
  B: string; // Best bid quantity
  a: string; // Best ask price
  A: string; // Best ask quantity
  o: string; // Open price
  h: string; // High price
  l: string; // Low price
  v: string; // Total traded base asset volume
  q: string; // Total traded quote asset volume
  O: number; // Statistics open time
  C: number; // Statistics close time
  F: number; // First trade ID
  L: number; // Last trade ID
  n: number; // Total number of trades
}

/**
 * WebSocket connection state
 */
export enum WebSocketState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed',
}

/**
 * Subscriber callback for price updates
 */
export type PriceSubscriber = (update: PriceUpdate) => void;
