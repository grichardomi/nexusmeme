# Exit Fixes - Quick Reference

## What Changed?

### 1. **Faster Underwater Exits**
   - Was: 5 minutes before exit
   - Now: 2 minutes before exit
   - Trades > 2 min old and worse than -0.5% loss exit automatically

### 2. **Live Profit Tracking**
   - Database now updates `profit_loss` and `profit_loss_percent` every orchestrator cycle
   - Previously these were NULL, preventing proper exit detection

### 3. **New Monitoring Endpoints**

## API Endpoints

### Check Alerts Right Now
```bash
curl "http://localhost:3000/api/bots/trades/alerts?severity=CRITICAL"
```

### View All Positions
```bash
curl "http://localhost:3000/api/bots/dashboard/position-health"
```

### Force Close Underwater Trades
```bash
# Dry run first (shows what would close)
curl -X POST http://localhost:3000/api/bots/trades/force-close-underwater \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'

# Actually close them
curl -X POST http://localhost:3000/api/bots/trades/force-close-underwater \
  -d '{}'
```

## Alert Types

| Alert | When | Action |
|-------|------|--------|
| **UNDERWATER_ALERT** | Trade loses > 0.5% and is > 2 min old | Auto-exits OR manual force-close |
| **EROSION_ALERT** | Profitable trade gives back > cap | Auto-exits to protect peak profit |

## Examples

### Your ETH/USD Trade (429 minutes old, -0.77%)
- **Status**: CRITICAL - FORCE CLOSE NOW
- **Reason**: Underwater > 2 min with loss > -0.5%
- **Action**: Use force-close endpoint or wait for auto-exit

### Typical Profitable Trade
- **Status**: HEALTHY
- **Profit**: +5.2%
- **Peak**: +5.8%
- **Erosion**: 0.6% (within 0.8% cap)
- **Action**: Let it run or take profits manually

## Database Persistence

Every orchestrator cycle now:
- ✅ Fetches current market price
- ✅ Calculates current profit
- ✅ Updates `profit_loss` and `profit_loss_percent` in database
- ✅ Triggers alert checks
- ✅ Executes exits if conditions met

This ensures all three new endpoints have real-time data.

## Configuration

**File**: `src/app/api/bots/route.ts`

```typescript
underwaterExitThresholdPct: -0.005,      // -0.5% threshold
underwaterExitMinTimeMinutes: 2,         // 2 minutes timeout (changed from 5)
profitTargetConservative: 0.02,          // 2% in choppy markets
profitTargetModerate: 0.05,              // 5% in weak trends
profitTargetAggressive: 0.12,            // 12% in strong trends
```

## Creeping Uptrend Mode

**No change to exit logic!** Creeping uptrend only affects:
- Entry momentum requirements (easier)
- Price top checks (1% vs 0.5% from high)

Exit logic is **always** the same regardless of entry mode.

---

## Testing Checklist

- [ ] Check alerts endpoint returns realistic data
- [ ] View position-health dashboard for all positions
- [ ] Dry-run force-close on underwater trades
- [ ] Verify profit_loss_percent is being updated in database
- [ ] Monitor logs for underwater/erosion exit decisions

---

## Support

Check logs for:
```bash
grep "underwater\|erosion\|peak" /path/to/logs
```

Expected log entries:
```
[DEBUG] Peak profit recorded for trade X
[DEBUG] Checking if trade tracked
[INFO] Underwater timeout check result
[CRITICAL] Underwater exit triggered
```
