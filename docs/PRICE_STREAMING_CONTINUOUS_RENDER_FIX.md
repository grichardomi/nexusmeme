# WebSocket Price Streaming - Continuous Rendering Fix

## Issue

Dashboard prices were showing continuous subscription callbacks accumulating (30, 31, 32, etc.), causing:
- Memory leaks due to old subscriptions not being properly cleaned up
- Excessive re-renders on every status change
- Multiple EventSource connections being created for the same pairs

### Log Evidence
```
{"level":"debug","timestamp":"...","message":"Callback added to subscription","pair":"BTC/USD","callbacks":30}
{"level":"debug","timestamp":"...","message":"Callback added to subscription","pair":"BTC/USD","callbacks":31}
{"level":"debug","timestamp":"...","message":"Callback added to subscription","pair":"BTC/USD","callbacks":32}
```

## Root Cause

The `usePriceStream` hook had a **circular dependency problem**:

```
State Change (status: connecting → connected → degraded)
         ↓
checkForStalePrices callback reference changed (depends on status)
         ↓
useEffect dependency array saw change
         ↓
useEffect re-ran and created NEW EventSource
         ↓
Old EventSource cleanup too slow
         ↓
New subscription added on top of old ones
         ↓
Accumulating callbacks: 30 → 31 → 32 → ...
```

### Problem Code Flow

**Before Fix:**
```typescript
// checkForStalePrices depended on status
const checkForStalePrices = useCallback(() => {
  // ... uses status ...
}, [pairs, status]); // ❌ Dependencies include status

// useEffect depended on checkForStalePrices
useEffect(() => {
  // ... sets up EventSource ...
  setInterval(checkForStalePrices, 10000);
}, [pairs, handleMessage, handleError, onError, checkForStalePrices]); // ❌ Long dependency list
```

When `status` changed:
1. `checkForStalePrices` was recreated
2. `useEffect` dependency changed
3. Effect re-ran → NEW EventSource created
4. Old listeners not removed in time
5. Result: accumulating subscriptions

## Solution

Moved state values into **refs** to avoid dependency issues:

### Key Changes

#### 1. Added Refs for State Synchronization
```typescript
const statusRef = useRef<'connecting' | 'connected' | 'error' | 'degraded' | 'idle'>('idle');
const pairsRef = useRef<string[]>([]);

// Update refs whenever state changes
useEffect(() => {
  statusRef.current = status;
}, [status]);

useEffect(() => {
  pairsRef.current = pairs;
}, [pairs]);
```

#### 2. Made `checkForStalePrices` Stable
```typescript
// ✅ NO dependencies - uses refs instead
const checkForStalePrices = useCallback(() => {
  const now = Date.now();

  // Use refs, not state/props
  for (const pair of pairsRef.current) {
    const price = pricesRef.current.get(pair);
    // ...
  }

  // Use ref for current status
  const currentStatus = statusRef.current;
  if (hasStaleData && currentStatus === 'connected') {
    setStatus('degraded');
  }
}, []); // ✅ Empty dependency array - STABLE
```

#### 3. Simplified useEffect Dependencies
```typescript
// ✅ Only depends on pairs that trigger actual reconnection
useEffect(() => {
  // ... setup EventSource ...

  // Handlers created inline (recreated each time effect runs)
  const handlePriceUpdate = (update: PriceUpdate) => { /* ... */ };
  const handleMessage = (event: MessageEvent) => { /* ... */ };
  const handleError = () => { /* ... */ };

  eventSource.addEventListener('message', handleMessage);
  eventSource.addEventListener('error', handleError);

  return () => {
    // Cleanup properly when effect re-runs
    eventSource.removeEventListener('message', handleMessage);
    eventSource.removeEventListener('error', handleError);
    eventSource.close();
  };
}, [pairs, updateDebounceMs]); // ✅ Only essential dependencies
```

## Impact

### Before Fix
- New EventSource created on every status change
- Callbacks accumulated: 30 → 31 → 32 → ...
- Memory leak (subscriptions never fully cleaned)
- Multiple active connections for same pairs
- Heavy CPU from re-renders on status changes

### After Fix
- ✅ EventSource created ONLY when pairs list changes
- ✅ Callbacks stay constant per pair (1-2 per pair)
- ✅ Proper cleanup on reconnection
- ✅ Single stable connection per pair list
- ✅ No re-renders triggered by status changes alone

## How It Works

### Ref Update Pattern

```
Render 1: status = 'connecting'
├─ statusRef.current = 'connecting'
└─ checkForStalePrices references statusRef.current

Render 2: status = 'connected' (state changed)
├─ statusRef.current = 'connected' (updated via effect)
├─ checkForStalePrices still exists (same function)
└─ useEffect NOT triggered (checkForStalePrices didn't change)
└─ No new EventSource created ✅

Status Check 10s later:
├─ setInterval calls checkForStalePrices()
├─ Reads current statusRef.current = 'connected'
├─ Compares with stale data
├─ Updates status if needed
└─ Result: Single status → degraded transition ✅
```

### Connection Lifecycle

```
User opens dashboard
├─ pairs = ['BTC/USD', 'ETH/USD']
├─ useEffect runs (pairs changed)
├─ EventSource created
├─ 2 subscriptions added (1 per pair)
└─ Status → 'connecting'

Prices arrive
├─ handleMessage called
├─ Debounce prevents excessive re-renders
├─ setPrices called (batched updates)
└─ Status remains 'connecting' (no effect re-run)

Connected event
├─ setStatus('connected')
├─ statusRef updated via effect
├─ useEffect NOT triggered (pairs unchanged)
├─ checkForStalePrices callback NOT recreated
└─ No new EventSource ✅

User navigates away
├─ pairs = [] (empty)
├─ useEffect runs (pairs changed to [])
├─ Cleanup function called
├─ EventSource.close() called
├─ Listeners removed
└─ Subscriptions cleaned up ✅
```

## Testing

### Verify Fix

1. **Check subscription stability:**
   ```bash
   curl -N "http://localhost:3000/api/market-data/stream?pairs=BTC/USD" | head -20
   ```
   Should NOT see increasing callback counts in logs

2. **Monitor dashboard:**
   - Open `/dashboard/trading`
   - Check browser console for subscription logs
   - Should see single connection establish, not multiple
   - Logs should show "Callback added to subscription" max 1-2 times per pair

3. **Verify no memory leak:**
   - Leave dashboard open for 5 minutes
   - Memory usage should stabilize
   - No increasing subscription counts in logs

### Test Cases Covered

- ✅ Pairs list unchanged: No reconnection
- ✅ Status changes: No reconnection
- ✅ Price updates: Debounced, no effect re-runs
- ✅ Stale detection: Uses refs, not state
- ✅ Cleanup: Properly removes listeners on unmount
- ✅ Empty pairs: Disconnects cleanly
- ✅ Reconnection: Only on pairs change

## Performance Metrics

### Before Fix
- Multiple EventSource connections for same pairs
- Callbacks accumulating per component render
- Effect re-runs on every status change
- Memory usage increasing over time

### After Fix
- ✅ Single EventSource per pairs configuration
- ✅ Callbacks stable (1-2 per pair)
- ✅ Effect runs ONLY on pairs change
- ✅ Stable memory usage over time

## Related Files

- **Hook Implementation:** `src/hooks/usePriceStream.ts`
- **Component Usage:** `src/components/trading/MarketPrices.tsx`
- **API Endpoint:** `src/app/api/market-data/stream/route.ts`
- **Documentation:** `docs/WEBSOCKET_PRICE_STREAMING.md`

## Lessons Learned

1. **Avoid circular dependencies in React:**
   - Don't include derived callbacks in useEffect dependencies
   - Use refs to store values that change frequently but shouldn't trigger effects

2. **Use refs for state that shouldn't cause re-renders:**
   - Current status doesn't need to trigger reconnection
   - Current pairs list is what matters for connection management

3. **Stabilize callbacks with empty dependency arrays:**
   - When callbacks only reference refs, they become stable
   - Stable callbacks prevent unnecessary effect re-runs

4. **Keep effect dependencies minimal:**
   - Only include values that truly require a new effect run
   - Everything else should be in refs or created inline

## Prevention

For future hooks with similar patterns:

```typescript
// ❌ Don't do this
const handler = useCallback(() => {
  // uses status
}, [status]); // circular dependency!

useEffect(() => {
  // ...
}, [handler]); // effect re-runs when status changes

// ✅ Do this instead
const statusRef = useRef(status);
useEffect(() => {
  statusRef.current = status;
}, [status]);

const handler = useCallback(() => {
  // uses statusRef.current instead
}, []); // stable!

useEffect(() => {
  // ...
}, [/* only true dependencies */]);
```
