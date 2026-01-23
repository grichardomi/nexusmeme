# WebSocket Price Streaming Implementation

## Overview

This document describes the complete implementation of real-time WebSocket price streaming for NexusMeme, replacing hardcoded mock prices with live Binance data.

**Status**: ✅ Complete (Phases 1-4)
**Last Updated**: 2026-01-19

---

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BINANCE EXCHANGE                            │
│              Real-time ticker streams (BTC/USDT, etc)               │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           │ Leader Instance (elected via Redis)
                           ▼
        ┌──────────────────────────────────────────────────┐
        │   BinanceWebSocketClient (ws package)           │
        │   - Connects to Binance combined streams        │
        │   - Parses @ticker events                       │
        │   - Circuit breaker protection                  │
        │   - Exponential backoff reconnection            │
        └──────────────────┬───────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────────────────┐
        │     Redis Cache & Distribution Layer            │
        │   - price:dist:BTC/USDT:latest (5 min TTL)      │
        │   - Shared across all instances                 │
        │   - Fallback for follower instances             │
        └──────────────────┬───────────────────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
        ▼ Leader Instance                     ▼ Follower Instances
    ┌─────────────┐                      ┌─────────────┐
    │ SSE Endpoint│                      │ SSE Endpoint│
    │  (Stream)   │                      │  (Stream)   │
    └────┬────────┘                      └────┬────────┘
         │                                    │
         └────────────────┬────────────────────┘
                          │
                 ┌────────┴────────┐
                 │                 │
        ┌────────▼────────┐  ┌──────▼─────────┐
        │  Browser 1      │  │   Browser 2    │
        │ usePriceStream  │  │ usePriceStream │
        │  EventSource    │  │  EventSource   │
        └─────────────────┘  └────────────────┘
```

### Multi-Instance Design

**Leader Instance** (Elected via Redis):
- Maintains single Binance WebSocket connection
- Publishes prices to Redis
- Broadcasts to local SSE clients
- Publishes performance metrics

**Follower Instances**:
- No Binance connection (saves resources)
- Read prices from Redis cache
- Broadcast to local SSE clients
- Fallback to cache on disconnection

---

## Key Components

### 1. BinanceWebSocketClient (`src/services/market-data/websocket-client.ts`)

**Responsibility**: Connect to Binance and stream price updates

**Key Features**:
- WebSocket connection management
- Circuit breaker for failure protection
- Exponential backoff reconnection (1s → 2s → 4s → ... → 60s)
- Leader election integration
- Heartbeat every 3 minutes (Binance requirement)
- Local broadcasting to subscribers

**Usage**:
```typescript
const client = getBinanceWebSocketClient();
await client.connect(['BTC/USD', 'ETH/USD']);

const unsubscribe = client.subscribe('BTC/USD', (update: PriceUpdate) => {
  console.log(`New price: ${update.price}`);
});
```

**Circuit Breaker States**:
- `CLOSED`: Normal operation
- `OPEN`: After 5 consecutive failures (waits 60s before half-open)
- `HALF_OPEN`: Testing recovery (3 successes = CLOSED)

### 2. PriceLeaderElection (`src/services/market-data/leader-election.ts`)

**Responsibility**: Ensure only one instance connects to Binance

**Key Features**:
- Redis-based lock with 30-second TTL
- Automatic failover if leader dies
- Periodic heartbeat to maintain leadership
- Instance identification via hostname + PID

**Election Flow**:
1. Instance checks if leader exists in Redis
2. If no leader or heartbeat expired → become leader
3. If leader exists → become follower
4. Followers monitor Redis for leader changes
5. On leader failure → election triggers

### 3. RedisDistribution (`src/services/market-data/redis-price-distribution.ts`)

**Responsibility**: Distribute prices to all instances

**Key Features**:
- Publish prices to Redis: `price:dist:{pair}:latest`
- 5-minute TTL (matches WebSocket delivery)
- Health checks for Redis availability
- Batch publishing for efficiency

**Data Flow**:
```
Binance → WebSocket Client → publishPriceToRedis()
                               ↓
                          Redis Cache
                          ↓
              ┌───────────┴──────────┐
              ↓                      ↓
        Leader Instance      Follower Instances
        (broadcasts SSE)     (broadcasts SSE)
```

### 4. SSE Endpoint (`src/app/api/market-data/stream/route.ts`)

**Responsibility**: Stream prices to browser clients

**API**:
```
GET /api/market-data/stream?pairs=BTC/USD,ETH/USD

Response: Server-Sent Events (text/event-stream)
```

**Rate Limiting**:
- Max 10,000 concurrent connections per instance
- Returns 503 if capacity exceeded
- Message debouncing on client side

**Connection Tracking**:
- Increments on connection open
- Decrements on connection close
- Logs every 100 connections

### 5. usePriceStream Hook (`src/hooks/usePriceStream.ts`)

**Responsibility**: React hook for consuming SSE prices

**Usage**:
```typescript
const { prices, status, isPriceStale, stalePairs, error } = usePriceStream([
  'BTC/USD',
  'ETH/USD',
]);

if (status === 'connecting') return <Spinner />;
if (status === 'error') return <ErrorMessage />;
if (status === 'degraded') return <WarningWithCachedPrices />;

const btcPrice = prices.get('BTC/USD');
```

**Features**:
- Auto-reconnection via EventSource
- Stale price detection (>30 seconds)
- Debounced updates (500ms default)
- Degraded mode status
- List of stale pairs for debugging

### 6. ErrorRecoveryStrategy (`src/services/market-data/error-recovery.ts`)

**Responsibility**: Graceful degradation on failures

**Fallback Hierarchy**:
1. **WebSocket** (real-time, ideal)
2. **Redis Cache** (5 min old, good)
3. **Local Cache** (app lifetime, acceptable)
4. **Degraded Mode** (show warning to user)

**Staleness Analysis**:
- `fresh`: < 5 seconds
- `acceptable`: < 1 minute
- `stale`: > 1 minute

### 7. CircuitBreaker (`src/lib/circuit-breaker.ts`)

**Responsibility**: Prevent cascading failures

**States**:
- `CLOSED`: All requests pass through
- `OPEN`: Fast-fail after threshold (default: 5 failures)
- `HALF_OPEN`: Test recovery after timeout (default: 60s)

**Configuration**:
- Failure threshold: 5
- Success threshold: 3
- Timeout: 60 seconds

---

## Performance Characteristics

### At 5,000 Users (3 Railway Instances)

| Metric | Value |
|--------|-------|
| WebSocket connections | 1 (leader) |
| SSE connections | ~1,667 per instance |
| Messages/sec | ~2 (debounced from 1) |
| Memory per SSE client | ~100KB |
| Total memory | 500MB (acceptable) |
| Redis cache size | ~4 pairs × 300 bytes = 1.2KB |
| Network bandwidth | 500 bytes/sec per pair |

### Scaling Path

| Users | Instances | WebSocket | SSE/Instance | Recommendation |
|-------|-----------|-----------|--------------|-----------------|
| 100 | 1 | 1 | 100 | ✅ Healthy |
| 1,000 | 1 | 1 | 1,000 | ✅ Healthy |
| 5,000 | 1 | 1 | 5,000 | ⚠️ Monitor |
| 10,000 | 2 | 1 | 5,000 | ✅ Healthy |
| 20,000 | 4 | 1 | 5,000 | ✅ Healthy |

---

## Error Scenarios & Recovery

### Scenario 1: Binance WebSocket Disconnects

```
Time 0s: Connection drops
↓
1-5s: Reconnection attempts with exponential backoff
↓
1s: Try connect #1
2s: Try connect #2 (wait 1s)
4s: Try connect #3 (wait 2s)
8s: Try connect #4 (wait 4s)
16s: Try connect #5 (wait 8s)
↓
After 5 failures: Circuit breaker opens
↓
60s: Circuit breaker half-open (test recovery)
↓
Success: Circuit breaker closes, normal operation resumes
```

**User Experience**: Degraded mode, showing cached prices with ⚠️ indicator

### Scenario 2: Redis Cache Expires

```
Event: Price not updated for 5+ minutes
↓
SSE endpoint returns cached price
↓
Browser hook: stalePairs list updated
↓
Status: 'degraded' (if still connected)
↓
User sees: "Cached values" warning
```

**Fallback**: Eventually falls back to local cache in browser (app lifetime)

### Scenario 3: Leader Instance Dies

```
Time 0s: Leader dies
↓
30s: Redis lock expires
↓
Follower detects no leader
↓
Follower initiates election
↓
Follower becomes new leader
↓
New leader connects to Binance
↓
Publishes to Redis
↓
All instances receive updates
```

**User Experience**: Brief interruption (30s), then resumes with new leader

### Scenario 4: All Connectivity Lost

```
WebSocket: Disconnected ✗
Redis: Unavailable ✗
Local Cache: Expired ✗
↓
Status: 'error'
↓
User sees: "Price data unavailable. Reconnecting..."
↓
Hook detects connection restored
↓
Auto-reconnection via EventSource
```

---

## Monitoring & Health Checks

### Health Endpoint

```
GET /api/market-data/health

Response (200 OK):
{
  "status": "healthy",
  "websocket": {
    "state": "connected",
    "isLeader": true,
    "uptime": 3600000,
    "consecutiveErrors": 0,
    "circuitBreaker": {
      "state": "closed",
      "failureCount": 0
    }
  },
  "broadcasting": {
    "activeSubscriptions": 150,
    "subscribedPairs": 4
  },
  "scaling": {
    "capacityPercentage": 1.5,
    "recommendation": "HEALTHY"
  },
  "alerts": []
}
```

### Alert Thresholds

| Condition | Alert | Action |
|-----------|-------|--------|
| Circuit breaker OPEN | High priority | Investigate Binance issues |
| 3+ consecutive errors | Medium | Monitor reconnection attempts |
| Redis unhealthy | High | Check Redis availability |
| 80%+ capacity | Medium | Plan scaling |
| Price stale > 1 min | Low | Degraded mode active |

---

## Configuration

### Environment Variables

```bash
# Binance
BINANCE_API_BASE_URL=https://api.binance.com

# Redis (Upstash)
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Optional
MARKET_DATA_CACHE_TTL_MS=15000           # Redis TTL
MARKET_DATA_CACHE_STALE_TTL_MS=5000      # Stale threshold
```

### Runtime Configuration

See `src/config/environment.ts` for full configuration schema.

---

## Testing Strategy

### Unit Tests

- [ ] CircuitBreaker state transitions
- [ ] ExponentialBackoff calculations
- [ ] PriceLeaderElection logic
- [ ] RedisDistribution publish/consume
- [ ] ErrorRecoveryStrategy fallback logic
- [ ] usePriceStream hook state management

### Integration Tests

- [ ] Multi-instance leader election
- [ ] Price flow: Binance → Redis → SSE → Browser
- [ ] Fallback: WebSocket → Redis → Local cache
- [ ] Error recovery: Reconnection scenarios
- [ ] Circuit breaker: Failure threshold triggering

### Load Tests

- [ ] 1,000 concurrent SSE connections
- [ ] High-frequency price updates (100/sec)
- [ ] Network failure scenarios
- [ ] Memory usage over 24 hours

### Manual Tests

- [ ] Real Binance WebSocket connection
- [ ] Multi-instance deployment (2+ Railway instances)
- [ ] Verify prices match binance.com
- [ ] Kill leader, verify failover
- [ ] Break Redis, verify fallback

---

## Deployment Checklist

- [ ] Dependencies installed: `npm install ws @types/ws`
- [ ] Environment variables configured
- [ ] Redis accessible (Upstash)
- [ ] Railway instances deployed
- [ ] Health endpoint responding
- [ ] SSE endpoint accepting connections
- [ ] Real prices showing in UI (not $43K mock)
- [ ] Live indicator visible
- [ ] Monitoring dashboard set up

---

## Migration Path from Mock Prices

### Before (Broken)
```typescript
function getMockPrice(pair: string): number {
  return 43250 + Math.random() * 100; // ❌ Hardcoded
}
```

### After (Fixed)
```typescript
const { prices } = usePriceStream(['BTC/USD']);
const btcPrice = prices.get('BTC/USD');
// ✅ Real-time from Binance
```

**Timeline**:
1. Deploy backend (WebSocket + Redis + SSE) - no UI changes
2. Deploy React hook (usePriceStream) - still uses fallback
3. Update MarketPrices component - replaces getMockPrice()
4. Remove mock price functions - cleanup

---

## Future Enhancements

- [ ] Trade execution stream (buy/sell notifications)
- [ ] Order book visualization
- [ ] WebSocket for bot status updates
- [ ] Price history charting
- [ ] Dynamic pair subscription (add/remove at runtime)
- [ ] Prometheus metrics export
- [ ] Alerting system for price movements

---

## References

- Binance Streams: https://binance-docs.github.io/apidocs/spot/en/#websocket-market-streams
- Server-Sent Events: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
- Circuit Breaker Pattern: https://martinfowler.com/bliki/CircuitBreaker.html
- NexusMeme Architecture: `/docs/ARCHITECTURE.md`

---

## Support

For issues or questions:
1. Check health endpoint: `/api/market-data/health`
2. Review logs: Look for "WebSocket" or "price" errors
3. Verify Redis: Test `PING` via Upstash console
4. Check circuit breaker state: `/api/market-data/health` → `websocket.circuitBreaker`
