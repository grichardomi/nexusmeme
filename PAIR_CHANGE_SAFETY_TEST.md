# Pair Change Safety Check - Manual Test Guide

## What Was Implemented

Added safety check to prevent users from removing trading pairs when they have open trades on those pairs.

**Location**: `/home/omi/nexusmeme/src/app/api/bots/route.ts` (PATCH endpoint, lines ~424-442)

## How It Works

When user tries to update `enabledPairs`:
1. API compares new pairs vs. current pairs
2. Identifies pairs being **removed**
3. Checks if any open trades exist on removed pairs
4. **BLOCKS** update if open trades found
5. **ALLOWS** update if no open trades (or only adding pairs)

## Test Scenarios

### Scenario 1: Remove Pair with Open Trade (Should BLOCK)

**Setup**:
1. Log in as `grichardomi@gmail.com`
2. Go to bot detail page: `http://localhost:3000/dashboard/bots/{bot-id}`
3. Note current pairs (e.g., `BTC/USD`)
4. Create an open trade on BTC/USD (or verify one exists)

**Test**:
1. Click "Edit Trading Pairs"
2. Uncheck `BTC/USD` (or any pair with open trade)
3. Check `BTC/USDT` (different pair)
4. Click "Save Changes"

**Expected Result**:
```
❌ Error: "Cannot remove BTC/USD — you have 1 open trade on this pair.
Close your open positions first, then change pairs."
```

**HTTP Response**:
- Status: `409 Conflict`
- Body:
```json
{
  "error": "Cannot remove BTC/USD — you have 1 open trade(s) on this pair...",
  "code": "OPEN_TRADES_ON_PAIR",
  "openTrades": 1,
  "affectedPairs": ["BTC/USD"]
}
```

---

### Scenario 2: Remove Pair with No Open Trades (Should ALLOW)

**Setup**:
1. Same bot as Scenario 1
2. Close ALL open trades on BTC/USD
3. Verify no open positions: `SELECT * FROM trades WHERE bot_instance_id = '{bot-id}' AND status = 'open' AND pair = 'BTC/USD'` → 0 rows

**Test**:
1. Click "Edit Trading Pairs"
2. Uncheck `BTC/USD`
3. Check `BTC/USDT`
4. Click "Save Changes"

**Expected Result**:
```
✅ Success: "Trading pairs updated successfully"
```

Bot now has `BTC/USDT` instead of `BTC/USD`

---

### Scenario 3: Add New Pairs (Should ALLOW)

**Setup**:
1. Bot currently has `BTC/USD`
2. May or may not have open trades (doesn't matter)

**Test**:
1. Click "Edit Trading Pairs"
2. Keep `BTC/USD` checked
3. Also check `ETH/USD` (adding new pair)
4. Click "Save Changes"

**Expected Result**:
```
✅ Success: "Trading pairs updated successfully"
```

Bot now has both `BTC/USD` and `ETH/USD`. No safety check triggered because no pairs were removed.

---

### Scenario 4: Switch USD ↔ USDT with Open Trade (Should BLOCK)

**Setup**:
1. Bot has `BTC/USD` with 1 open trade
2. User wants to switch to `BTC/USDT`

**Test**:
1. Click "Edit Trading Pairs"
2. Uncheck `BTC/USD`
3. Check `BTC/USDT`
4. Click "Save Changes"

**Expected Result**:
```
❌ Error: "Cannot remove BTC/USD — you have 1 open trade on this pair.
Close your open positions first, then change pairs."
```

**Workaround for User**:
1. Go to "Trades" tab
2. Close the BTC/USD position (exit at market)
3. Wait for trade to close
4. Then retry pair change → Success

---

## SQL Verification Queries

### Check bot's current pairs:
```sql
SELECT id, enabled_pairs, status
FROM bot_instances
WHERE user_id = (SELECT id FROM users WHERE email = 'grichardomi@gmail.com');
```

### Check open trades by pair:
```sql
SELECT t.id, t.pair, t.status, t.entry_price, t.created_at
FROM trades t
JOIN bot_instances bi ON bi.id = t.bot_instance_id
WHERE bi.user_id = (SELECT id FROM users WHERE email = 'grichardomi@gmail.com')
  AND t.status = 'open'
ORDER BY t.pair, t.created_at DESC;
```

### Simulate the safety check query:
```sql
-- Replace {bot-id} and {removed-pairs} with actual values
SELECT id, pair
FROM trades
WHERE bot_instance_id = '{bot-id}'
  AND status = 'open'
  AND pair = ANY(ARRAY['BTC/USD']::text[]);  -- pairs being removed
```

If this returns rows → BLOCK
If this returns 0 rows → ALLOW

---

## Edge Cases Covered

✅ **Removing multiple pairs**: Checks all removed pairs for open trades
✅ **Multiple open trades on same pair**: Counts total, blocks if any exist
✅ **Mixed changes**: Adding some pairs + removing others → only checks removed pairs
✅ **Quote currency change**: BTC/USD → BTC/USDT treated as remove + add (blocks if BTC/USD has open trade)

---

## Code Location

**API Route**: `/home/omi/nexusmeme/src/app/api/bots/route.ts`

```typescript
// Around line 424-442
if (enabledPairs !== undefined) {
  // ... validation ...

  // Check for open trades on pairs being removed
  const currentPairs: string[] = bot[0].enabled_pairs || [];
  const removedPairs = currentPairs.filter((p: string) => !enabledPairs.includes(p));

  if (removedPairs.length > 0) {
    const openTrades = await query(
      `SELECT id, pair FROM trades
       WHERE bot_instance_id = $1
         AND status = 'open'
         AND pair = ANY($2)`,
      [botId, removedPairs]
    );

    if (openTrades.length > 0) {
      const affectedPairs = [...new Set(openTrades.map((t: any) => t.pair))];
      return NextResponse.json(
        {
          error: `Cannot remove ${affectedPairs.join(', ')} — you have ${openTrades.length} open trade(s)...`,
          code: 'OPEN_TRADES_ON_PAIR',
          openTrades: openTrades.length,
          affectedPairs,
        },
        { status: 409 }
      );
    }
  }
}
```

---

## Quick Manual Test (Recommended)

1. Open browser: `http://localhost:3000/dashboard/bots`
2. Select your bot
3. Go to "Trades" tab — note if any open trades and their pairs
4. Go back to "Details" tab
5. Click "Edit Trading Pairs"
6. Try to uncheck a pair that has an open trade
7. Click "Save Changes"
8. Verify you get the error message
9. Close the trade
10. Retry pair change → should succeed

---

## Success Criteria

- ✅ Cannot remove pair with open trades
- ✅ Can remove pair with no open trades
- ✅ Can add new pairs anytime
- ✅ Clear error message displayed to user
- ✅ HTTP 409 status code returned
- ✅ Error includes count and affected pairs
