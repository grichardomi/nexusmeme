# Market Data Architecture: Cache-First Design

## Overview

NexusMeme uses a **cache-first, shared aggregator** architecture for market data:

- **Single Source of Rate-Limit Control**: Only the `MarketDataAggregator` calls the exchange APIs
- **Shared Redis Cache**: All clients read from the same cache (no per-user exchange calls)
- **Infinitely Scalable**: Add unlimited users without increasing exchange API load
- **Graceful Degradation**: Stale data + indicators instead of errors on cache misses

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Background Fetcher                        │
│  - Runs every 4 seconds                                      │
│  - Fetches configured trading pairs                          │
│  - Calls MarketDataAggregator                                │
│  Location: /src/services/market-data/background-fetcher.ts  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│            MarketDataAggregator (ONLY Exchange Client)       │
│  - Batches pairs (10 at a time)                              │
│  - Concurrency limiting (3 concurrent batches)               │
│  - Implements circuit breaker + exponential backoff          │
│  - Caches results in Redis (15s TTL)                         │
│  Location: /src/services/market-data/aggregator.ts          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Exchange API (Binance)                      │
│  Single connection point - all rate limiting here            │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Redis Cache (Upstash)                      │
│  Key format: `market_data:{pair}`                            │
│  TTL: 15 seconds                                             │
│  Shared by ALL clients (single source of truth)              │
└────────────────────────┬────────────────────────────────────┘
                         │
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
┌────────────────┐┌────────────────┐┌────────────────┐
│  Client 1      ││  Client 2      ││  Client 3      │
│ /api/market-   ││ /api/market-   ││ /api/market-   │
│ data/prices    ││ data/prices    ││ data/prices    │
│                ││                ││                │
│ (cache read    ││ (cache read    ││ (cache read    │
│  only)         ││  only)         ││  only)         │
└────────────────┘└────────────────┘└────────────────┘
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │
                    (all read same cache)
```

---

## Component Details

### 1. Background Fetcher
**File**: `src/services/market-data/background-fetcher.ts`

Runs every 4 seconds to keep the Redis cache warm:

```typescript
// Fetches all configured trading pairs
// Aggregator handles batching and rate limiting
// Prices automatically cached in Redis by aggregator
const fetcher = getBackgroundMarketDataFetcher();
fetcher.start(4000); // 4 second interval
```

**Features**:
- Idempotent (safe to call multiple times)
- Exponential backoff on errors
- Detailed statistics and health metrics
- Integrates with app startup sequence

**Lifecycle**:
- Started in `src/lib/init.ts` during app initialization
- Stopped gracefully on process shutdown
- Statistics available via `getStats()` and `getCacheHealth()`

---

### 2. Market Data Aggregator
**File**: `src/services/market-data/aggregator.ts`

**CRITICAL**: This is the ONLY place that calls exchange APIs.

**Rate Limiting Strategy**:
- Batch size: 10 pairs per request
- Concurrency: Max 3 concurrent batches
- Cache TTL: 15 seconds
- Memory cache + Redis cache (redundancy)

**Why only one aggregator?**
- Central point for rate-limit control
- No per-user API calls
- Prevents cascading failures
- Easy to monitor/throttle

```typescript
const aggregator = marketDataAggregator;
const data = await aggregator.getMarketData(['BTC/USD', 'ETH/USD']);
// Returns cached data if fresh (< 15s old)
// Otherwise fetches from Binance and caches
```

---

### 3. Cache Endpoint
**File**: `src/app/api/market-data/prices/route.ts`

**Cache-Only Read** (NO direct exchange calls):

```typescript
GET /api/market-data/prices?pairs=BTC/USD,ETH/USD
```

**Response**:
- ✅ 200: Returns all cached prices
- 206: Partial success (some pairs missing)
- 503: Cache cold (no data available yet)

**Response Format**:
```json
{
  "BTC/USD": {
    "pair": "BTC/USD",
    "price": 43250.00,
    "volume": 28500000,
    "timestamp": 1634567890123,
    "change24h": 2.5,
    "high24h": 43500,
    "low24h": 42900
  }
}
```

---

### 4. Client-Side Polling
**File**: `src/hooks/usePriceCachePolling.ts`

Simple polling hook that reads from the cache endpoint:

```typescript
const { prices, status, isStale, stalePairs } = usePriceCachePolling(
  ['BTC/USD', 'ETH/USD'],
  { pollIntervalMs: 2000, staleThresholdMs: 30000 }
);

// Status values:
// - 'polling': Getting fresh data
// - 'stale': Data older than threshold
// - 'unavailable': Cache not yet populated
// - 'error': Network error
```

**Key Features**:
- Debouncing to reduce re-renders
- Automatic stale detection
- Graceful error handling
- No SSE/WebSocket complexity

---

### 5. UI Components
**File**: `src/components/trading/MarketPrices.tsx`

Shows real-time prices with status indicators:

```typescript
<MarketPrices />
```

**Display Elements**:
- Live indicator (green pulse) when fresh
- Stale indicator (yellow) when old
- Per-pair price cards with 24h change
- Graceful handling of missing data

---

## Data Flow Example

### Initial Load (Cache Cold)

1. **App starts** → `initializeApp()` called
2. **Background fetcher starts** → Runs every 4s
3. **First fetch** → Calls `marketDataAggregator.getMarketData()`
4. **Aggregator batches** → 10 pairs at a time
5. **Exchange call** → Hits Binance API (single call for all pairs)
6. **Redis cache** → Stores with 15s TTL
7. **Client polls** → Gets data from Redis
8. **UI renders** → Shows real prices

### Steady State (Cache Warm)

1. **Every 4s** → Background fetcher runs
2. **Aggregator checks cache** → Data still fresh (< 15s old)
3. **Returns cached data** → No exchange call
4. **Client polls** → Gets data from Redis (cache hit)
5. **UI shows live prices** → Green "Live" indicator

### Cache Miss (First Time or After Expiry)

1. **Client polls** → Requests `/api/market-data/prices?pairs=...`
2. **Endpoint checks Redis** → No data available
3. **Returns 503** → "Price data temporarily unavailable"
4. **UI shows loading** → "Temporarily unavailable" message
5. **Next fetch cycle** → Background fetcher populates cache
6. **Client retries** → Gets data

---

## Configuration

### Environment Variables
```env
# Market Data Cache TTL (milliseconds)
MARKET_DATA_CACHE_TTL_MS=15000          # Cache expires after 15s

# When data becomes "stale" indicator
MARKET_DATA_CACHE_STALE_TTL_MS=5000     # Mark as stale after 5s

# Trading pairs to fetch
TRADING_PAIRS=["BTC/USD","BTC/USDT","ETH/USD","ETH/USDT"]

# Exchange APIs
BINANCE_API_BASE_URL=https://api.binance.com
```

### Background Fetcher Interval
**File**: `src/services/market-data/background-fetcher.ts`

Default: 4 seconds
Range: 2-10 seconds

```typescript
initializeBackgroundFetcher(4000); // 4 second interval
```

**Why 4 seconds?**
- Cache TTL: 15 seconds
- Fetch every 4s → margin of 11 seconds
- Safe: No cache expiration before next fetch

---

## Rate Limiting Analysis

### Exchange API Load (Per Hour)

**Before (WebSocket approach)**:
- 1000 users × 1 request/10s = 6000 requests/hour
- ❌ Hits rate limits (1200 requests/minute = 72,000/hour)

**After (Cache-first)**:
- 1 aggregator × 1 request/4s = 900 requests/hour
- ✅ Well under limits
- ✅ Scales infinitely (same load for 10,000 users)

### Redis Load
- 1000 clients × 1 poll/2s = 500 reads/second
- Upstash supports 10,000+ ops/sec
- ✅ No bottleneck

---

## Troubleshooting

### Cache Cold / 503 Errors

**Symptom**: `/api/market-data/prices` returns 503

**Causes**:
1. Background fetcher not running
2. First startup (cache being populated)
3. Exchange API down

**Debug**:
```bash
# Check fetcher status
curl http://localhost:3000/api/market-data/init
# Returns: fetcher.isRunning, stats, health

# Check Redis cache
redis-cli GET market_data:BTC/USD

# Check aggregator health
curl http://localhost:3000/api/market-data/health
```

### Stale Data

**Symptom**: UI shows "Stale" indicator even though cache is fresh

**Causes**:
1. `staleThresholdMs` too low
2. Timestamp mismatch between server/client
3. Background fetcher falling behind

**Debug**:
```typescript
const { lastServerUpdate, isStale } = usePriceCachePolling(['BTC/USD']);
console.log({
  age: Date.now() - lastServerUpdate,
  threshold: 30000,
  isStale
});
```

### Missing Pairs

**Symptom**: Some pairs missing from `/api/market-data/prices`

**Causes**:
1. Pair not in `TRADING_PAIRS` config
2. Exchange error for specific pair
3. Cache expired before fetch

**Debug**:
```bash
# Check configured pairs
grep TRADING_PAIRS .env

# Check which pairs cached
redis-cli KEYS "market_data:*"

# Check background fetcher stats
curl http://localhost:3000/api/market-data/init | jq '.fetcher.stats'
```

---

## Migration Path (From WebSocket)

### Old Architecture (❌ Deprecated)
- Per-user WebSocket connections to Binance
- SSE endpoint for broadcasting
- `BinanceWebSocketClient` + `PriceBroadcaster`
- Rate limit concerns
- Per-user overhead

### New Architecture (✅ Current)
- Single background fetcher
- Shared Redis cache
- Simple polling hook
- No rate limit concerns
- Infinite scalability

**Deprecated Files** (can be removed):
- `src/services/market-data/websocket-client.ts`
- `src/services/market-data/price-broadcaster.ts`
- `src/services/market-data/leader-election.ts`
- `src/services/market-data/error-recovery.ts`
- `src/services/market-data/redis-price-distribution.ts`
- `src/hooks/usePriceStream.ts` (replaced by `usePriceCachePolling.ts`)
- `src/lib/websocket-heartbeat.ts`
- `src/lib/circuit-breaker.ts`

---

## Monitoring & Metrics

### Health Check Endpoint
```bash
GET /api/market-data/init
```

Returns:
```json
{
  "status": "ok",
  "fetcher": {
    "isRunning": true,
    "stats": {
      "lastFetchTime": 1634567890123,
      "lastFetchDurationMs": 234,
      "fetchAttempts": 1500,
      "fetchSuccesses": 1485,
      "fetchErrors": 15,
      "lastError": null
    },
    "health": {
      "isRunning": true,
      "cacheAge": 1234,
      "isCacheStale": false,
      "fetchSuccessRate": 0.99,
      "lastErrorMessage": null
    }
  }
}
```

### Key Metrics to Track

1. **Cache Hit Rate**: `fetchSuccesses / fetchAttempts`
2. **Cache Age**: `Date.now() - lastFetchTime`
3. **Fetch Latency**: `lastFetchDurationMs`
4. **Error Rate**: `fetchErrors / fetchAttempts`

---

## Best Practices

### ✅ DO

- Read from cache endpoint for all client-side price data
- Use `usePriceCachePolling` hook for React components
- Monitor background fetcher health
- Set appropriate `staleThresholdMs` per use case
- Handle 503 gracefully in UI

### ❌ DON'T

- Make direct calls to exchange APIs from client code
- Use per-user polling (goes through aggregator)
- Call `marketDataAggregator` from multiple places
- Reduce `MARKET_DATA_CACHE_TTL_MS` below 10 seconds
- Ignore cache cold state (always check 503 responses)

---

## Related Documentation

- [Redis Configuration](./REDIS.md)
- [Exchange API Integration](./EXCHANGE_APIS.md)
- [Performance Optimization](./PERFORMANCE.md)
