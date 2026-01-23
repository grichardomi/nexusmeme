# Deployment Verification Checklist

Complete this checklist before deploying to production (Railway).

## Pre-Deployment (Local Testing)

### 1. Type Safety
```bash
pnpm type-check
```
**Expected**: No type errors
**Verify**: All TypeScript compilation passes

### 2. Tests
```bash
pnpm test:ci
```
**Expected**: All tests pass
**Verify**:
- ✅ Resilience tests (backoff, circuit breaker)
- ✅ Trade execution tests (idempotency, error handling)
- ✅ Worker lifecycle tests
- ✅ Regime detection tests

### 3. Build
```bash
pnpm build
```
**Expected**: No build errors
**Verify**:
- ✅ `dist/` directory created
- ✅ `dist/worker.js` exists
- ✅ No warnings in output

## Database Verification

### 4. Apply Migration
```bash
psql $DATABASE_URL -f src/migrations/007_market_regime_per_pair.sql
```
**Expected**: Migration applies without error
**Verify**:
```bash
psql $DATABASE_URL -c "
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name='market_regime'
ORDER BY column_name;
"
```
**Should show**:
- ✅ `pair` column (VARCHAR, nullable)
- ✅ `regime` column
- ✅ `confidence` column
- ✅ `timestamp` column

### 5. Verify Indices
```bash
psql $DATABASE_URL -c "
SELECT indexname FROM pg_indexes
WHERE tablename='market_regime';
"
```
**Should show**:
- ✅ `idx_market_regime_pair_time` - for pair-specific lookups
- ✅ `idx_market_regime_global` - for global regime fallback

### 6. Verify Idempotency Constraints
```bash
psql $DATABASE_URL -c "
SELECT indexname FROM pg_indexes
WHERE tablename='trades';
"
```
**Should show**:
- ✅ `idx_trades_idempotency_key` - unique constraint on idempotency_key
- ✅ `idx_trades_unique_entry` - composite unique on (bot_instance_id, pair, side, price)

## Worker Process Testing

### 7. Start Worker Locally
```bash
# Terminal 1: Start dev server
pnpm dev

# Terminal 2: Start worker
node dist/worker.js
```

**Expected Output**:
```
[info] Starting NexusMeme Job Queue Worker { pid: XXXXX }
[info] Worker started successfully - processing jobs { pollIntervalMs: 5000, pid: XXXXX }
```

**Verify**:
- ✅ No "isIdle is not a function" errors
- ✅ No "startProcessing already started" warnings (on first start)
- ✅ Worker logs every 5 seconds that it's checking queue

### 8. Test Graceful Shutdown
```bash
# In worker terminal, send SIGTERM
kill -TERM <WORKER_PID>
```

**Expected Output**:
```
[info] SIGTERM received, starting graceful shutdown
[info] Waiting for in-flight jobs to complete...
[info] All in-flight jobs completed, exiting gracefully
```

**Verify**:
- ✅ Process waits for jobs (doesn't crash immediately)
- ✅ Exits with code 0 (success)
- ✅ No orphaned job processes

## API Testing

### 9. Test Binance Ticker API
```bash
curl -X GET "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT"
```

**Expected**: Response includes `openPrice` (not `opens`)
**Verify**:
- ✅ Response has `openPrice` field
- ✅ Response has `priceChangePercent`, `highPrice`, `lowPrice`
- ✅ All fields are numeric

### 10. Test Order Placement (Paper Trading - Optional)
```bash
# In dev server, POST to /api/bots/{botId}/orders with test API keys
```

**Expected**: Order placed successfully
**Verify**:
- ✅ Binance returns orderId
- ✅ Trade recorded in database with idempotency_key
- ✅ No duplicate trades created on retry

### 11. Test Idempotency
Place same order twice (same botId, pair, price, amount, within 5 minutes)

**Expected**: Second request returns 200 with "duplicate_prevented"
**Verify**:
- ✅ Only one trade in database
- ✅ Database constraint enforced deduplication
- ✅ Job handler recognized the idempotency

## Resilience Testing

### 12. Test Circuit Breaker (Simulate API Failure)
Mock Binance API failures (in local test only):
```bash
# Create mock failure in binance.ts for testing
```

**Expected**:
- ✅ First 5 failures proceed (fail individually)
- ✅ 6th failure triggers "Circuit breaker is OPEN"
- ✅ After 60s timeout, tries recovery (half-open)
- ✅ If API recovers, circuit closes

### 13. Test Retry Logic (Simulate Network Timeout)
Kill connection mid-request:
```bash
# Use tcpkill or similar to drop connections
```

**Expected**:
- ✅ Retries 2-3 times with exponential backoff
- ✅ Eventually succeeds when connection restored
- ✅ Logs each retry attempt

## Market Regime Testing

### 14. Test Per-Pair Regime Detection
```bash
# Create regime detection job for BTC/USDT
# Create different regime job for ETH/USDT
```

**Expected**:
- ✅ BTC/USDT regime stored with pair='BTC/USDT'
- ✅ ETH/USDT regime stored with pair='ETH/USDT'
- ✅ Gatekeeper can block BTC trades while allowing ETH trades

**Verify Database**:
```bash
psql $DATABASE_URL -c "
SELECT pair, regime, confidence, created_at
FROM market_regime
WHERE pair IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
"
```

**Should show**:
- ✅ Different rows for BTC/USDT and ETH/USDT
- ✅ Not relying on reason field for pair identification

### 15. Test Global Regime Fallback
Delete pair-specific regimes:
```bash
psql $DATABASE_URL -c "
DELETE FROM market_regime WHERE pair IS NOT NULL;
INSERT INTO market_regime (id, pair, timestamp, regime, confidence, reason)
VALUES (gen_random_uuid(), NULL, NOW(), 'bearish', 0.8, 'Global bearish');
"
```

**Verify**:
- ✅ Gatekeeper blocks trades when global regime is bearish
- ✅ Doesn't require pair-specific regime to exist

## Railway Deployment Configuration

### 16. Verify railway.toml
```bash
cat railway.toml
```

**Should contain**:
```toml
[[services]]
name = "web"
cmd = "pnpm start"

[[services]]
name = "worker"
cmd = "node dist/worker.js"
```

**Verify**:
- ✅ Two separate services defined
- ✅ Worker has `cmd` to run worker process
- ✅ Web has separate `cmd`

### 17. Environment Variables
Ensure these are set in Railway:
```
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://nexusmeme.railway.app (or your domain)
NODE_ENV=production
# (others from .env.production)
```

**Verify**:
- ✅ All required vars set
- ✅ No hardcoded values in code
- ✅ Worker can access DATABASE_URL

## Load Testing (Before Production)

### 18. Simulate 5K User Load
Using k6 or similar:
```bash
# Create trades for 5000 concurrent users
# Monitor:
# - No duplicate trades
# - No rate limit errors
# - Circuit breaker doesn't trigger
# - Response time < 5s
```

**Expected**:
- ✅ < 5% error rate
- ✅ No duplicate trades in database
- ✅ Worker processes jobs steadily
- ✅ All errors are transient (retried successfully)

### 19. Monitor Logs
Check logs for:
```
[error] Binance ticker parsing
[error] Idempotency check failed
[error] Circuit breaker opened
```

**Expected**:
- ✅ No parsing errors (openPrice field exists)
- ✅ No constraint violations
- ✅ Circuit breaker opens/closes cleanly

## Final Checklist

Before pushing to production:

- ✅ All tests pass locally (`pnpm test:ci`)
- ✅ Type checking passes (`pnpm type-check`)
- ✅ Build succeeds (`pnpm build`)
- ✅ Database migration applied
- ✅ Worker starts without errors
- ✅ Worker shuts down gracefully
- ✅ Binance API calls include openPrice field
- ✅ Trade execution idempotent
- ✅ Market regime per-pair
- ✅ Circuit breaker protects API calls
- ✅ Retry logic works with exponential backoff
- ✅ Integration tests pass
- ✅ Load test passes (5K users)
- ✅ railway.toml configured correctly
- ✅ All environment variables set
- ✅ Logs show healthy operation

## Rollback Plan

If issues occur in production:

1. **Worker crashes**: Kill worker service in Railway, web server continues
2. **Database schema issue**: Keep old code running, investigate migration
3. **Circuit breaker issue**: Restart worker (resets circuit state)
4. **Rate limit issue**: Add jitter/delay, restart worker

**Critical failsafe**: Keep web server running even if worker fails
- Users can still view trades
- New trades won't execute until worker is fixed
- No data loss

## Post-Deployment Monitoring

Monitor these metrics:

```
- job_queue_pending_count: Should be < 10
- circuit_breaker_state: Should be 'closed' (0=closed, 1=open, 2=half_open)
- binance_api_latency: Should be < 1000ms
- trade_execution_success_rate: Should be > 95%
- duplicate_trade_count: Should be 0
- regime_detection_per_pair: All pairs should have recent regime
```

---

**Status**: Ready for Production Deployment ✅
