# Trade Exit Fixes Summary

## Problems Identified & Fixed

### Issue 1: Underwater Exit Not Triggering
**Root Cause:** Trade exit timeout was 5 minutes (too slow), and `profit_loss_percent` wasn't being persisted to database.

**Fixes Applied:**
1. ✅ Reduced `underwaterExitMinTimeMinutes` from 5 → 2 minutes (aggressive exit on bad entries)
2. ✅ Added profit metrics persistence - now updates `profit_loss` and `profit_loss_percent` on EVERY orchestrator check
3. ✅ Enhanced diagnostics logging showing exact reasons why exits don't trigger

### Issue 2: Creeping Uptrend Mode & Exit Conflicts
**Root Cause:** Creeping Uptrend only affects ENTRIES (momentum requirements, price top checks), not exits. No conflict exists.

**Confirmation:** Exit logic is independent of entry mode - all exit checks run regardless of creeping uptrend setting.

---

## New Features & Endpoints

### 1. Force Close Underwater Trades
**Endpoint:** `POST /api/bots/trades/force-close-underwater`

**Purpose:** Immediately close all trades that are underwater (negative P&L), bypassing the 2-minute timeout.

**Request Body:**
```json
{
  "pair": "ETH/USD",           // Optional - close only specific pair
  "botInstanceId": "uuid",     // Optional - close only specific bot
  "dryRun": true               // Optional - show what would be closed without actually closing
}
```

**Response (Dry Run):**
```json
{
  "success": true,
  "dryRun": true,
  "tradeCount": 2,
  "trades": [
    {
      "id": "trade-id",
      "pair": "ETH/USD",
      "entryPrice": 2964.81,
      "quantity": 1.7452,
      "profitLoss": -86.21,
      "profitLossPct": -0.77
    }
  ]
}
```

**Response (Execute):**
```json
{
  "success": true,
  "dryRun": false,
  "totalUnderwaterTrades": 2,
  "closedCount": 2,
  "closedTrades": [
    {
      "id": "trade-id",
      "pair": "ETH/USD",
      "profitLossPct": -0.77
    }
  ]
}
```

### 2. Position Alerts Monitoring
**Endpoint:** `GET /api/bots/trades/alerts`

**Purpose:** Real-time monitoring of UNDERWATER_ALERT and EROSION_ALERT conditions.

**Query Parameters:**
- `type`: "UNDERWATER_ALERT" | "EROSION_ALERT" (optional)
- `pair`: "ETH/USD" (optional)
- `severity`: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" (optional)
- `limit`: 100 (default)

**Response:**
```json
{
  "success": true,
  "summary": {
    "totalAlerts": 2,
    "totalOpenTrades": 3,
    "bySeverity": {
      "CRITICAL": 1,
      "HIGH": 1,
      "MEDIUM": 0,
      "LOW": 0
    },
    "byType": {
      "UNDERWATER_ALERT": 1,
      "EROSION_ALERT": 1
    }
  },
  "alerts": [
    {
      "type": "UNDERWATER_ALERT",
      "tradeId": "trade-id",
      "pair": "ETH/USD",
      "severity": "CRITICAL",
      "message": "Trade underwater: -0.77% (threshold: -0.5%)",
      "currentProfitPct": -0.77,
      "peakProfitPct": 0,
      "threshold": -0.5,
      "ageMinutes": 429
    }
  ]
}
```

### 3. Position Health Dashboard
**Endpoint:** `GET /api/bots/dashboard/position-health`

**Purpose:** Comprehensive view of all positions with profit tracking and alert status.

**Query Parameters:**
- `includeClosed`: true (optional - include closed trades)

**Response:**
```json
{
  "success": true,
  "timestamp": "2026-01-23T14:00:00Z",
  "summary": {
    "totalPositions": 2,
    "healthy": 0,
    "warning": 1,
    "critical": 1,
    "underwater": 0,
    "totalProfitPct": -0.77,
    "peakProfitPct": -0.77
  },
  "positions": [
    {
      "id": "trade-id",
      "pair": "ETH/USD",
      "entryPrice": 2964.81,
      "currentProfit": -86.21,
      "currentProfitPct": -0.77,
      "peakProfitPct": 0,
      "ageMinutes": 429,
      "status": "critical",
      "alerts": [
        "UNDERWATER_ALERT: -0.77% (threshold: -0.5%)"
      ],
      "recommendation": "FORCE CLOSE: Trade is -0.77% underwater and has been open 429m"
    }
  ]
}
```

---

## Configuration Changes

### Before
```typescript
underwaterExitThresholdPct: -0.005,    // -0.5% underwater threshold
underwaterExitMinTimeMinutes: 5,        // 5 minutes minimum (slow!)
```

### After
```typescript
underwaterExitThresholdPct: -0.005,    // -0.5% underwater threshold (same)
underwaterExitMinTimeMinutes: 2,        // 2 minutes minimum (aggressive!)
```

---

## Database Updates

The orchestrator now **automatically updates** these fields on every check cycle:
- `profit_loss` - Current P&L in USD
- `profit_loss_percent` - Current P&L in percentage
- `updated_at` - Last update timestamp

These metrics are **persisted immediately**, enabling:
- Real-time dashboard monitoring
- Accurate alert triggering
- Historical P&L tracking

---

## Exit Logic Priority (Unchanged)

The orchestrator checks exits in this order:
1. **Stop Loss** - Immediate exit if price < stop_loss
2. **Underwater Exit** - Exit if underwater > 2 minutes AND loss > -0.5%
3. **Erosion Cap** - Exit if peak profit eroded beyond regime cap
4. **Profit Target** - Exit if profit target reached
5. **Time-Based Exit** - Exit if max hold time exceeded
6. **Emergency Loss Limit** - Exit if loss > -6% (safety net)

---

## Recommended Usage

### Monitor Alerts in Real-Time
```bash
# Check all critical alerts
curl "http://localhost:3000/api/bots/trades/alerts?severity=CRITICAL"

# Check only underwater alerts
curl "http://localhost:3000/api/bots/trades/alerts?type=UNDERWATER_ALERT"

# Check specific pair
curl "http://localhost:3000/api/bots/trades/alerts?pair=ETH/USD"
```

### View Position Health Dashboard
```bash
# Complete position health overview
curl "http://localhost:3000/api/bots/dashboard/position-health"

# Include closed trades in analysis
curl "http://localhost:3000/api/bots/dashboard/position-health?includeClosed=true"
```

### Force Close Underwater Trades
```bash
# Dry run - see what would be closed
curl -X POST http://localhost:3000/api/bots/trades/force-close-underwater \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'

# Actually close all underwater trades
curl -X POST http://localhost:3000/api/bots/trades/force-close-underwater \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}'

# Close only ETH/USD trades that are underwater
curl -X POST http://localhost:3000/api/bots/trades/force-close-underwater \
  -H "Content-Type: application/json" \
  -d '{"pair": "ETH/USD", "dryRun": false}'
```

---

## Severity Levels

### UNDERWATER_ALERT Severity
- **LOW**: Loss is 0.5× threshold worse (e.g., -0.75% when threshold is -0.5%)
- **MEDIUM**: Loss is 1.0× threshold worse (e.g., -1.0% when threshold is -0.5%)
- **HIGH**: Loss is 2.0× threshold worse (e.g., -1.5% when threshold is -0.5%)
- **CRITICAL**: Loss is >2× threshold worse (e.g., -1.2%+ when threshold is -0.5%)

### EROSION_ALERT Severity
- **LOW**: Erosion is 1.0-1.2× cap (e.g., 0.01% erosion when cap is 0.008%)
- **MEDIUM**: Erosion is 1.2-1.5× cap
- **HIGH**: Erosion is 1.5-2.0× cap
- **CRITICAL**: Erosion is >2× cap (e.g., 0.02% erosion when cap is 0.008%)

---

## Enhanced Diagnostics

The system now logs detailed information about why exits don't trigger:

```
[DEBUG] Underwater check: peak was positive - skipping underwater exit
[DEBUG] Underwater check: trade is not underwater - skipping
[DEBUG] Underwater check: trade too young to exit (age: 1.2m, required: 2m, remaining: 0.8m)
[INFO] Underwater timeout triggered - position should exit
```

Check logs with:
```bash
grep -i "underwater\|erosion\|peak" /path/to/logs
```

---

## Next Steps

1. **Monitor the alerts endpoint** to catch positions before they become problems
2. **Use force-close** when you want manual control over underwater trades
3. **Review logs** to understand why specific trades exit (or don't)
4. **Adjust severity thresholds** if you want more/less aggressive exit timing

---

## Files Modified

- ✅ `src/app/api/bots/route.ts` - Reduced underwater timeout to 2 min
- ✅ `src/services/orchestration/trade-signal-orchestrator.ts` - Added profit metrics persistence
- ✅ `src/services/risk/position-tracker.ts` - Enhanced diagnostics logging

## Files Created

- ✅ `src/app/api/bots/trades/force-close-underwater/route.ts` - Force close endpoint
- ✅ `src/app/api/bots/trades/alerts/route.ts` - Alerts monitoring endpoint
- ✅ `src/app/api/bots/dashboard/position-health/route.ts` - Health dashboard
- ✅ `src/services/alerts/position-alerts.ts` - Alert service (reference)
