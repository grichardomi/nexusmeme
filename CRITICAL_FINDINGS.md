# CRITICAL FINDINGS - Exit Logic Not Working

## Problem Summary

**Erosion Cap & Underwater Exits are NOT working because:**

1. ❌ `profit_loss` and `profit_loss_percent` remain NULL in database
2. ❌ Orchestrator last logged activity on January 18 (5 days ago)
3. ❌ Your current trades (from Jan 23) are NOT being managed by Next.js orchestrator

## Root Cause Analysis

### Issue 1: Trades Not Created/Managed by Orchestrator
- Your trades were created at `2026-01-23 13:41:44` (today)
- Last orchestrator log was `2026-01-18 22:09:51` (5 days ago)
- **Conclusion**: Trades are coming from a different system (not the Next.js orchestrator)

### Issue 2: No Profit Metrics Being Calculated
- `profit_loss` is NULL (should be updated every 60 seconds by orchestrator)
- `profit_loss_percent` is NULL
- Without these, erosion cap check cannot determine if trade should exit

### Issue 3: Creeping Uptrend Mode is NOT the Problem
✅ Creeping Uptrend ONLY affects entry logic
✅ Exit logic (underwater, erosion, time-based) is completely separate
✅ But exits can't work without profit metrics

## Current Trade Status

| Trade | Pair | Entry | Peak | Age | Issue |
|-------|------|-------|------|-----|-------|
| Trade 1 | ETH/USD | 2931.23 | +0.0798% | 3 min | Peak profitable but profit eroding - should trigger erosion cap |
| Trade 2 | ETH/USD | 2964.81 | -1.0203% | 435 min | Never profitable AND > 2min old - should trigger underwater exit |

**Trade 1 should exit**: Peak was +0.0798%, price now at 2926.55 = negative profit = erosion exceeded cap
**Trade 2 should exit**: Never profitable, -0.77% loss, been open 435 minutes

## Where Are Trades Coming From?

Your trades are NOT being created by the Next.js orchestrator. They're coming from:
- Option A: FreqTrade bot instances (running separately)
- Option B: Another trading system/service
- Option C: Manual API calls

**This means**: The orchestrator's exit logic (profit targets, erosion cap, underwater) won't apply to these trades.

## Immediate Fix Options

### Option 1: Query Existing Trades (Fastest)
Use the new endpoints to monitor and manually close trades:

```bash
# View all alerts
curl "http://localhost:3000/api/bots/trades/alerts?severity=CRITICAL"

# Manually close underwater trades
curl -X POST http://localhost:3000/api/bots/trades/force-close-underwater \
  -H "Content-Type: application/json" \
  -d '{"pair": "ETH/USD"}'
```

### Option 2: Rebuild Orchestrator (Complete Fix)
If trades should be managed by orchestrator:

1. Stop FreqTrade bots (if running)
2. Verify orchestrator is starting on app boot
3. Ensure trades are being created through `/api/bots/route.ts` (not external system)
4. Monitor orchestrator logs: `grep -i "orchestrator" /home/omi/nexusmeme/logs/combined.log`

### Option 3: Hybrid Approach (Recommended)
Keep current trading system + use monitoring endpoints:

1. Manual exits via `force-close-underwater` endpoint
2. Monitor via `/api/bots/dashboard/position-health` endpoint
3. Alerts via `/api/bots/trades/alerts` endpoint
4. Slowly migrate to orchestrator-managed trades

## Database State Evidence

```sql
-- Current open trades (profit_loss is NULL!)
SELECT pair, profit_loss, profit_loss_percent, peak_profit_percent, entry_time
FROM trades WHERE status = 'open';

pair   | profit_loss | profit_loss_percent | peak_profit_percent | entry_time
-------|-------------|-------------------|-------------------|-------------------
ETH/USD|             |                   | 0.0798            | 2026-01-23 13:37:50
ETH/USD|             |                   |-1.0203            | 2026-01-23 06:26:23

-- Closed trades DO have profit metrics (from erosion cap exits)
SELECT pair, profit_loss_percent, exit_reason
FROM trades WHERE status = 'closed' AND exit_reason = 'erosion_cap_exceeded'
LIMIT 3;

pair   | profit_loss_percent | exit_reason
-------|-------------------|------------------
ETH/USD| 0.0798            | erosion_cap_exceeded
ETH/USD| 0.3029            | erosion_cap_exceeded
BTC/USD| 0.1243            | erosion_cap_exceeded
```

The closed trades have profit metrics because they were managed by orchestrator before closing. Current open trades don't have metrics because they're NOT being managed by orchestrator.

## Next Steps

1. **Clarify**: Where are your current trades coming from?
2. **Test**:  Use force-close endpoint to manually manage positions
3. **Monitor**: Check alerts endpoint regularly
4. **Plan**: Decide whether to migrate to orchestrator or keep hybrid approach
