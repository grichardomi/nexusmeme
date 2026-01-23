# Price Streaming - Quick Reference

## For Frontend Developers

### Display Real-Time Prices

```typescript
import { usePriceStream } from '@/hooks/usePriceStream';

export function MyComponent() {
  const { prices, status, isPriceStale, stalePairs, error } = usePriceStream([
    'BTC/USD',
    'ETH/USD',
  ]);

  if (status === 'connecting') return <div>Loading prices...</div>;
  if (status === 'error') return <div>Price service unavailable</div>;

  // Good to use prices now
  const btcPrice = prices.get('BTC/USD');
  return <div>BTC: ${btcPrice?.price.toFixed(2)}</div>;
}
```

### Handle Degraded Mode

```typescript
const { status, stalePairs } = usePriceStream(['BTC/USD']);

if (status === 'degraded') {
  return (
    <div className="bg-yellow-100 p-3 rounded">
      ⚠️ Prices delayed for: {stalePairs.join(', ')}
      (Showing cached values)
    </div>
  );
}
```

### Custom Error Handling

```typescript
const { error } = usePriceStream(['BTC/USD'], {
  onError: (err) => {
    console.error('Price stream error:', err);
    // Send to error tracking service
    Sentry.captureException(err);
  },
});
```

---

## For Backend Developers

### Verify WebSocket Connection

```bash
# Check health endpoint
curl http://localhost:3000/api/market-data/health | jq .

# Check specific fields
curl http://localhost:3000/api/market-data/health | jq '.websocket.state'
# Output: "connected"
```

### Test SSE Endpoint

```bash
# Stream prices
curl -N 'http://localhost:3000/api/market-data/stream?pairs=BTC/USD,ETH/USD'

# Output (streaming):
# data: {"pair":"BTC/USD","price":93245.67,"timestamp":1705689600000}
# data: {"pair":"ETH/USD","price":3124.50,"timestamp":1705689600500}
```

### Check Leader Status

```typescript
// In your code:
const client = getBinanceWebSocketClient();
const stats = client.getStats();
console.log(stats.isLeader); // true or false
```

### Monitor Circuit Breaker

```typescript
const client = getBinanceWebSocketClient();
const stats = client.getStats();

console.log(stats.circuitBreaker.state);      // 'closed' | 'open' | 'half_open'
console.log(stats.circuitBreaker.failureCount); // number of failures
```

---

## Common Troubleshooting

### Prices Show as Mock ($43,250)

**Problem**: `getMockPrice()` is still being called

**Solution**:
1. Verify `usePriceStream` is imported in component
2. Check that prices come from hook, not from `getMockPrice()`
3. Verify SSE endpoint is running: `GET /api/market-data/stream`
4. Check health: `GET /api/market-data/health`

### Prices Stuck / Not Updating

**Check in this order**:

1. **WebSocket connected?**
   ```bash
   curl http://localhost:3000/api/market-data/health | jq '.websocket.state'
   # Should output: "connected"
   ```

2. **Redis accessible?**
   ```bash
   # Test via Upstash console
   PING
   GET price:dist:BTC/USDT:latest
   # Should return recent price
   ```

3. **SSE endpoint working?**
   ```bash
   curl -N 'http://localhost:3000/api/market-data/stream?pairs=BTC/USDT'
   # Should stream prices every 1-2 seconds
   ```

4. **Browser EventSource connected?**
   ```javascript
   // In browser console
   const es = new EventSource('/api/market-data/stream?pairs=BTC/USDT');
   es.onmessage = (e) => console.log(JSON.parse(e.data));
   // Should see price updates
   ```

### High Memory Usage

**Cause**: Too many SSE connections or large local cache

**Solution**:
```typescript
// In usePriceStream hook options
const { prices } = usePriceStream(['BTC/USD'], {
  updateDebounceMs: 1000, // Increase debounce to 1s
});
```

### Circuit Breaker Open

**Meaning**: WebSocket has failed 5+ times

**Check**:
```bash
curl http://localhost:3000/api/market-data/health | jq '.websocket.circuitBreaker'
# {
#   "state": "open",
#   "failureCount": 5,
#   "timeSinceLastFailure": 2000
# }
```

**Recover**:
- Wait 60 seconds (automatically transitions to half-open)
- Or restart service
- Or check Binance API status

### Redis Connection Failed

**Error**: `Failed to publish price to Redis`

**Check**:
1. Redis URL in environment: `UPSTASH_REDIS_REST_URL`
2. Redis token in environment: `UPSTASH_REDIS_REST_TOKEN`
3. Upstash console shows connection active
4. Try manual test: `GET price:dist:BTC/USDT:latest`

---

## Performance Tuning

### Reduce CPU Usage

```typescript
// Increase debounce (default: 500ms)
const { prices } = usePriceStream(['BTC/USD'], {
  updateDebounceMs: 1000, // UI update every 1s max
});
```

### Reduce Memory Usage

```typescript
// Unsubscribe when component unmounts
useEffect(() => {
  return () => {
    // Automatic cleanup via EventSource.close()
  };
}, []);
```

### Reduce Network Bandwidth

```typescript
// Subscribe to fewer pairs
const { prices } = usePriceStream(['BTC/USD']); // Not all 20 pairs
```

---

## Monitoring Queries

### Most Important Health Checks

```bash
# 1. Is leader running?
curl http://localhost:3000/api/market-data/health | jq '.websocket.isLeader'

# 2. How many SSE clients?
curl http://localhost:3000/api/market-data/health | jq '.broadcasting.activeSubscriptions'

# 3. Any alerts?
curl http://localhost:3000/api/market-data/health | jq '.alerts'

# 4. Capacity percentage
curl http://localhost:3000/api/market-data/health | jq '.scaling.capacityPercentage'
```

### Redis Cache Status

```typescript
// In code:
const broadcaster = getPriceBroadcaster();
const status = broadcaster.getStatus();
console.log(status.subscribedPairs); // ['BTC/USD', 'ETH/USD']
```

---

## Deployment

### Before Deploying

```bash
# 1. Install dependencies
npm install ws @types/ws

# 2. Type check
npm run type-check

# 3. Run tests
npm run test

# 4. Build
npm run build
```

### Environment Variables Required

```
BINANCE_API_BASE_URL=https://api.binance.com
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

### Verify After Deploy

```bash
# 1. Health check
GET /api/market-data/health → status: "healthy"

# 2. Real prices
GET /api/market-data/stream?pairs=BTC/USD
# Should stream real prices from Binance

# 3. UI shows real prices
# Open dashboard, see real BTC price (not $43K)
```

---

## Quick Reference: Data Structures

### PriceUpdate

```typescript
interface PriceUpdate {
  pair: string;           // 'BTC/USD'
  price: number;          // 93245.67
  bid: number;            // 93244.50
  ask: number;            // 93246.84
  high24h: number;        // 95000.00
  low24h: number;         // 91000.00
  change24h: number;      // -500.00 (absolute)
  changePercent24h: number; // -0.53 (percentage)
  volume24h: number;      // 1234567890.00
  timestamp: number;      // 1705689600000 (ms)
}
```

### Hook Return

```typescript
interface UsePriceStreamResult {
  prices: Map<string, PriceUpdate>;        // Latest prices
  status: 'connecting' | 'connected' | 'error' | 'degraded' | 'idle';
  isLoading: boolean;                      // true while connecting
  lastUpdate: number;                      // Timestamp of last update
  error: Error | null;                     // Error if any
  isPriceStale: boolean;                   // true if > 30s old
  stalePairs: string[];                    // Pairs without updates
}
```

---

## Emergency Procedures

### Kill and Restart WebSocket

```bash
# In Railway dashboard:
# 1. Go to Deployments
# 2. Select current deployment
# 3. Click "Restart"

# WebSocket will:
# 1. Restart connection to Binance
# 2. Re-elect leader
# 3. Resume publishing prices to Redis
```

### Disable Price Streaming (Fallback to Polling)

```typescript
// In MarketPrices component, temporarily:
if (true) { // TODO: Remove this fallback
  return <OldPollingImplementation />;
}
```

### Force Leader Election

```typescript
// Restart instance to force new election
// Or manually delete Redis key:
// KEY: price_stream:leader
// (Will be recreated on next request)
```

---

## Dashboard Links

- Health: http://localhost:3000/api/market-data/health
- Stream (SSE): http://localhost:3000/api/market-data/stream?pairs=BTC/USD
- Trading Dashboard: http://localhost:3000/dashboard

---

Last updated: 2026-01-19
