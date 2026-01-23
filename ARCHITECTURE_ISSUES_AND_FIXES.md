# WebSocket Price Streaming - Architecture Issues and Fixes

## Critical Issues Identified

### 1. New Pairs Not Subscribed (CRITICAL)

**Problem:**
- PriceBroadcaster.initialize() is called once with initial pairs
- Later when new pairs are added via subscribe(), the WebSocket client doesn't actually subscribe to them on Binance
- Result: New pairs never stream prices

**Current Flow:**
```
PriceBroadcaster.subscribe("NEW_PAIR")
  ↓
BinanceWebSocketClient.subscribe("NEW_PAIR", callback)
  ↓ (only adds local callback)
Result: NO Binance subscription update ❌
```

**Fix Needed:**
```
PriceBroadcaster.subscribe("NEW_PAIR")
  ↓
Detect new pair not in active subscriptions
  ↓
Call client.addPairs(["NEW_PAIR"])
  ↓
BinanceWebSocketClient.addPairs()
  ├─ Unsubscribe from old streams
  ├─ Add to subscribedPairs
  ├─ Create new combined stream URL
  └─ Resubscribe to Binance
  ↓
Result: NEW_PAIR starts streaming ✅
```

### 2. Leader Loss Stops Streaming (CRITICAL)

**Problem:**
- When instance loses leadership, it calls disconnect()
- disconnect() sets state to DISCONNECTED
- onClose() won't schedule reconnect if state is DISCONNECTED
- When leadership is regained, nothing calls connect() again
- Result: WebSocket never reconnects after leadership change

**Current Flow:**
```
Lost Leadership
  ↓
leaderElection callback → disconnect()
  ↓
disconnect() → setState(DISCONNECTED)
  ↓
ws.close() triggered
  ↓
onClose() checks: state !== DISCONNECTED → FALSE
  ↓
scheduleReconnect() NOT called ❌

Later: Regained Leadership
  ↓
leaderElection callback → no handler!
  ↓
isLeader = true
  ↓
But no connect() called ❌
```

**Fix Needed:**
```
Separate intentional disconnects from connection failures:
- leadershipLost() → sets state to DISCONNECTED + flag "intentional"
- leadershipRegained() → clears flag, calls connect() if subscribers exist
- onClose() → schedules reconnect if NOT intentional disconnect

Result: Automatic reconnect on leadership change ✅
```

### 3. No Follower Streaming Path (CRITICAL)

**Problem:**
- Architecture says "1 WebSocket + Redis fan-out" but it's not implemented
- Followers skip connect() (design: save resources)
- But they don't have ANY mechanism to consume prices from Redis
- SSE endpoint just waits for prices but followers never receive them
- Result: Follower instances serve stale cache only, no real-time prices

**Current Implementation:**
```
Follower Instance (non-leader):
  ↓
PriceBroadcaster.initialize()
  ↓
BinanceWebSocketClient.connect()
  ├─ Check: becomeLeader() → FALSE
  └─ Return early, NO WebSocket connection ✓
  ↓
Later: SSE client connects
  ↓
PriceBroadcaster.subscribe("BTC/USD")
  ↓
client.subscribe() → adds local callback
  ↓
But no prices arrive (no WebSocket, no Redis listener) ❌
```

**Fix Needed:**
```
Follower Instance:
  ↓
PriceBroadcaster.initialize()
  ├─ Check: leader? NO
  ├─ Instead of WebSocket: startRedisListener()
  └─ Subscribe to Redis channels for all pairs
  ↓
Redis price published
  ↓
Follower's Redis listener receives update
  ↓
Broadcasts to local SSE clients ✓
  ↓
Result: Real-time prices for followers too ✅
```

### 4. Fallback Logic Unused (MEDIUM)

**Problem:**
- ErrorRecoveryStrategy created but not integrated
- PriceBroadcaster doesn't use it
- SSE endpoint doesn't use it
- No automatic cascade to Redis/local cache when WebSocket fails

**Current:**
- ErrorRecoveryStrategy only appears in health endpoint
- No actual fallback mechanism in place

**Fix Needed:**
- Wire ErrorRecoveryStrategy into PriceBroadcaster
- Use it to store local prices (caching)
- Activate fallback when WebSocket goes down
- SSE returns cached prices when needed

---

## Implementation Plan

### Phase 1: Fix Dynamic Pair Subscription (Issue #1)

**Changes to BinanceWebSocketClient:**
```typescript
// Add method to dynamically add pairs
async addPairs(newPairs: string[]): Promise<void> {
  // Filter out already-subscribed pairs
  const pairsToAdd = newPairs.filter(p => !this.subscribedPairs.has(p));

  if (pairsToAdd.length === 0) return; // Already subscribed

  // Add to our set
  pairsToAdd.forEach(p => this.subscribedPairs.add(p));

  // If connected: update Binance subscription
  if (this.state === StateEnum.CONNECTED && this.ws) {
    // Build new combined streams URL with ALL pairs
    const streams = Array.from(this.subscribedPairs)
      .map(pair => getPairStreamName(pair))
      .join('/');
    const url = `${this.binanceWsUrl}/stream?streams=${streams}`;

    // Close old connection and open new one
    this.ws.close();
    this.ws = new WebSocket(url);
    // Reattach listeners...
  }
}
```

**Changes to PriceBroadcaster:**
```typescript
subscribe(pair: string, callback: PriceSubscriber): () => void {
  let subscription = this.subscriptions.get(pair);

  if (!subscription) {
    subscription = {
      pair,
      callbacks: new Set(),
      unsubscribeFromWs: null,
    };

    // **NEW**: Check if we need to add pair to WebSocket
    const client = getBinanceWebSocketClient();
    const currentPairs = client.getSubscribedPairs();
    if (!currentPairs.includes(pair) && this.initialized) {
      // Dynamically add new pair
      client.addPairs([pair]).catch(err => {
        logger.error('Failed to add pair to WebSocket', err, { pair });
      });
    }

    subscription.unsubscribeFromWs = client.subscribe(pair, (update: PriceUpdate) => {
      this.broadcast(pair, update);
    });

    this.subscriptions.set(pair, subscription);
    logger.debug('New price subscription created', { pair });
  }

  subscription.callbacks.add(callback);
  // ...
}
```

### Phase 2: Fix Leader/Follower Transitions (Issue #2)

**Changes to BinanceWebSocketClient:**
```typescript
private intentionalDisconnect = false; // NEW: flag for intentional disconnects

async connect(pairs: string[]): Promise<void> {
  // ... existing code ...

  // Check leadership
  try {
    this.isLeader = await this.leaderElection.becomeLeader();
  } catch (error) {
    this.isLeader = true; // Assume leader if check fails
  }

  // **CHANGE**: Only connect if leader
  if (!this.isLeader) {
    logger.info('Not the leader, will use Redis for prices');
    this.setState(StateEnum.CONNECTED); // Mark as "ready" even though not connecting
    return; // Don't connect to Binance
  }

  // ... rest of connection logic ...
}

disconnect(): void {
  logger.info('Intentionally disconnecting from Binance WebSocket');
  this.intentionalDisconnect = true; // **NEW**: Set flag
  this.heartbeat.stop();

  // ... rest of disconnect logic ...
}

private onClose(): void {
  // **CHANGE**: Check intentional flag
  if (!this.intentionalDisconnect && this.state !== StateEnum.DISCONNECTED) {
    this.setState(StateEnum.RECONNECTING);
    this.scheduleReconnect();
  }

  this.intentionalDisconnect = false; // Reset flag
}

async handleLeadershipChange(isLeader: boolean): Promise<void> {
  // **NEW**: Method to handle leadership transitions
  if (isLeader && !this.isLeader && this.subscribedPairs.size > 0) {
    // Gained leadership - reconnect
    logger.info('Gained price stream leadership, reconnecting to Binance');
    this.isLeader = true;
    const pairs = Array.from(this.subscribedPairs);
    await this.connect(pairs);
  } else if (!isLeader && this.isLeader) {
    // Lost leadership - disconnect from Binance
    logger.warn('Lost price stream leadership, disconnecting from Binance');
    this.isLeader = false;
    this.intentionalDisconnect = true;
    this.disconnect();
  }
}
```

### Phase 3: Implement Follower Redis Path (Issue #3)

**Changes to PriceBroadcaster:**
```typescript
private redisSubscriber: any = null; // NEW: for followers
private isLeader = false; // NEW: track our role

async initialize(pairs: string[]): Promise<void> {
  if (this.initialized || pairs.length === 0) return;

  try {
    const client = getBinanceWebSocketClient();

    // Check if we're the leader
    const leaderElection = getPriceLeaderElection();
    this.isLeader = await leaderElection.becomeLeader();

    if (this.isLeader) {
      // **LEADER PATH**: Connect to Binance
      await client.connect(pairs);
      logger.info('Price broadcaster initialized as LEADER');
    } else {
      // **FOLLOWER PATH**: Subscribe to Redis instead
      await this.startRedisSubscription(pairs);
      logger.info('Price broadcaster initialized as FOLLOWER, subscribed to Redis');
    }

    this.initialized = true;
  } catch (error) {
    logger.error('Failed to initialize price broadcaster', error);
  }
}

private async startRedisSubscription(pairs: string[]): Promise<void> {
  // **NEW**: Subscribe to Redis channels for all pairs
  const redis = await getRedisClient(); // Need to implement

  for (const pair of pairs) {
    const channel = `prices:dist:${pair}:latest`;

    redis.subscribe(channel, (message: string) => {
      try {
        const update = JSON.parse(message) as PriceUpdate;

        // Broadcast to local SSE clients
        const subscription = this.subscriptions.get(pair);
        if (subscription) {
          subscription.callbacks.forEach(callback => {
            try {
              callback(update);
            } catch (err) {
              logger.error('Broadcast callback failed', err, { pair });
            }
          });
        }
      } catch (err) {
        logger.error('Failed to parse Redis price', err, { pair });
      }
    });
  }

  this.redisSubscriber = redis;
}
```

### Phase 4: Integrate Fallback Logic (Issue #4)

**Changes to PriceBroadcaster:**
```typescript
import { getErrorRecoveryStrategy } from './error-recovery';

private errorRecovery = getErrorRecoveryStrategy();

private broadcast(pair: string, update: PriceUpdate): void {
  const subscription = this.subscriptions.get(pair);
  if (!subscription) return;

  // **NEW**: Cache locally for fallback
  this.errorRecovery.cacheLocalPrice(pair, update);

  // Broadcast to subscribers
  subscription.callbacks.forEach(callback => {
    try {
      callback(update);
    } catch (error) {
      logger.error('Broadcast callback failed', error, { pair });
    }
  });
}

async getCachedPrice(pair: string): Promise<PriceUpdate | null> {
  try {
    // Check Redis distribution first
    const redisPrice = await getPriceFromRedis(pair);
    if (redisPrice) {
      return redisPrice;
    }

    // **NEW**: Check local cache from error recovery
    const localPrice = this.errorRecovery.getLocalCachedPrice(pair);
    if (localPrice) {
      return localPrice;
    }

    // Fall back to old cache
    const cacheKey = `price:${pair}:latest`;
    return getCached<PriceUpdate>(cacheKey);
  } catch (error) {
    logger.error('Error getting cached price', error, { pair });

    // **NEW**: Last resort - return any cached value
    return this.errorRecovery.getLocalCachedPrice(pair);
  }
}
```

**Changes to SSE Endpoint:**
```typescript
// In SSE handler, use fallback logic
const handleMissingPrice = async (pair: string) => {
  const errorRecovery = getErrorRecoveryStrategy();
  const cachedPrice = await broadcaster.getCachedPrice(pair);

  if (cachedPrice) {
    // Send cached price with status
    controller.enqueue(
      new TextEncoder().encode(
        `data: ${JSON.stringify({ ...cachedPrice, cached: true })}\n\n`
      )
    );
  }
};
```

---

## Verification Steps

### After Fixes Applied

1. **Issue 1 - New Pairs Subscription:**
   ```
   [✓] Add BTC/USD via SSE
   [✓] Add ETH/USD later (new pair)
   [✓] Verify both receive real prices
   [✓] Check logs for addPairs() called
   ```

2. **Issue 2 - Leadership Transitions:**
   ```
   [✓] Start 2 instances
   [✓] Verify instance 1 is leader (connects to Binance)
   [✓] Stop instance 1
   [✓] Verify instance 2 becomes leader (reconnects)
   [✓] Restart instance 1
   [✓] Verify no double connection
   ```

3. **Issue 3 - Follower Streaming:**
   ```
   [✓] Start leader instance
   [✓] Start follower instance
   [✓] Connect SSE to follower for BTC/USD
   [✓] Verify follower receives prices (from Redis)
   [✓] Stop leader
   [✓] Verify follower still streams (from cache until next failure)
   ```

4. **Issue 4 - Fallback Logic:**
   ```
   [✓] Connect to WebSocket (live prices)
   [✓] Kill WebSocket connection
   [✓] Verify fallback to Redis cache
   [✓] Verify fallback to local cache
   [✓] Verify fallback to stale cache
   ```

---

## Code Review Checklist

- [ ] addPairs() method added to BinanceWebSocketClient
- [ ] intentionalDisconnect flag prevents incorrect reconnects
- [ ] handleLeadershipChange() properly transitions between roles
- [ ] startRedisSubscription() implemented for followers
- [ ] ErrorRecoveryStrategy wired into broadcast logic
- [ ] getCachedPrice() uses all fallback levels
- [ ] Tests updated for new pair subscription
- [ ] Tests updated for leadership transitions
- [ ] Tests updated for follower Redis path
- [ ] No regression in existing functionality

---

## Testing Requirements

All existing tests should pass, plus new tests for:

1. Dynamic pair addition
2. Leader/follower transitions
3. Redis fallback for followers
4. Multi-level cache fallback
5. Proper cleanup on disconnect

---

## Risk Assessment

**Risk Level: HIGH** - These are core architecture fixes

**Mitigations:**
- Extensive testing before production
- Staged rollout (staging → canary → prod)
- Fallback to REST polling if needed
- Health monitoring alerts
- Logs tracking all subscription changes

---

## Timeline

1. Implement Phase 1 (Dynamic Pairs): 1-2 hours
2. Implement Phase 2 (Leadership): 1-2 hours
3. Implement Phase 3 (Followers): 1-2 hours
4. Implement Phase 4 (Fallback): 30 minutes
5. Testing & validation: 2-3 hours
6. **Total: 6-10 hours**

