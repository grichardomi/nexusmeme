/**
 * In-process live price store — fed directly by WebSocket ticker events.
 * Zero DB hits, zero cache TTL lag. Updated on every tick (~100-500ms on Binance).
 *
 * Use this for latency-critical decisions (peak tracking, erosion cap).
 * Use aggregator.getMarketData() for everything else.
 *
 * Supports on-tick callbacks — register a handler to run erosion checks
 * on every price update instead of waiting for the 1.5s poll cycle.
 */

export interface LivePrice {
  price: number;
  bid: number;
  ask: number;
  timestamp: number; // ms
}

export type PriceTickCallback = (pair: string, price: number) => void;

class LivePriceStore {
  private prices: Map<string, LivePrice> = new Map();
  private tickCallbacks: Map<string, PriceTickCallback[]> = new Map();

  update(pair: string, price: number, bid: number, ask: number, timestamp: number): void {
    this.prices.set(pair, { price, bid, ask, timestamp });
    // Fire registered callbacks synchronously — erosion check runs on every tick
    const cbs = this.tickCallbacks.get(pair);
    if (cbs && cbs.length > 0) {
      for (const cb of cbs) {
        try { cb(pair, price); } catch { /* non-fatal */ }
      }
    }
  }

  get(pair: string): LivePrice | null {
    return this.prices.get(pair) ?? null;
  }

  getPrice(pair: string): number | null {
    return this.prices.get(pair)?.price ?? null;
  }

  /** Age in ms since last update. Returns Infinity if never seen. */
  ageMs(pair: string): number {
    const entry = this.prices.get(pair);
    return entry ? Date.now() - entry.timestamp : Infinity;
  }

  isStale(pair: string, maxAgeMs = 5000): boolean {
    return this.ageMs(pair) > maxAgeMs;
  }

  /**
   * Register a callback fired on every WS tick for a pair.
   * Returns an unsubscribe function.
   */
  onTick(pair: string, callback: PriceTickCallback): () => void {
    if (!this.tickCallbacks.has(pair)) {
      this.tickCallbacks.set(pair, []);
    }
    this.tickCallbacks.get(pair)!.push(callback);
    return () => {
      const cbs = this.tickCallbacks.get(pair);
      if (cbs) {
        const idx = cbs.indexOf(callback);
        if (idx !== -1) cbs.splice(idx, 1);
      }
    };
  }

  /** Remove all tick callbacks for a pair (call when trade closes). */
  clearTicks(pair: string): void {
    this.tickCallbacks.delete(pair);
  }
}

export const livePriceStore = new LivePriceStore();
