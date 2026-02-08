# Settings Comparison: nm_2_8 (Working) vs Current

## ✅ MATCHES (Same in both)
- `RISK_MIN_MOMENTUM_1H=0.005` (0.5%)
- `RISK_MIN_ADX_FOR_ENTRY=20` (after duplicate)
- `RISK_VOLUME_BREAKOUT_RATIO=1.3`
- `RISK_RSI_EXTREME_OVERBOUGHT=85`
- `AI_MIN_CONFIDENCE_THRESHOLD=70`
- `RISK_SPREAD_MAX_PERCENT=0.005` (after duplicate)

## ⚠️ DIFFERENCES

### 1. **CRITICAL: 4H Momentum Threshold**
| Setting | nm_2_8 | Current | Impact |
|---------|--------|---------|--------|
| `RISK_MIN_MOMENTUM_4H` | **0.15** (15%) | **0.003** (0.3%) | Current is 50x lower! |

**Analysis:** This is likely a unit mismatch:
- nm_2_8: Using percent form (0.15 = 0.15%)
- Current: Using decimal form (0.003 = 0.3%)

**Fix needed:** Change to `RISK_MIN_MOMENTUM_4H=0.15` to match nm_2_8

### 2. **NEW: Capital Preservation Layer**
| Feature | nm_2_8 | Current |
|---------|--------|---------|
| `CP_BTC_TREND_GATE_ENABLED` | **Doesn't exist** | **true** (ACTIVE) |
| Effect | No capital preservation | Reduces size to 25% when BTC < EMA200 |

**Impact:** Current version has an additional safety layer that nm_2_8 didn't have. This reduces position sizes but doesn't block trades.

### 3. **Signal Generation Method**
| Method | nm_2_8 | Current |
|--------|--------|---------|
| Type | **OpenAI API calls** | **Deterministic logic** |
| Cost | $60-450/month | $0 |
| Latency | 1-3 seconds | <1ms |

**Impact:** Deterministic is faster and free, but needs correct thresholds.

## 🎯 RECOMMENDED FIXES

### Priority 1: Fix 4H Momentum (CRITICAL)
```bash
# Change from:
RISK_MIN_MOMENTUM_4H=0.003

# To match nm_2_8:
RISK_MIN_MOMENTUM_4H=0.15
```

### Priority 2: Consider Disabling Extra Capital Preservation
If you want to match nm_2_8 behavior exactly:
```bash
# Set to false to remove the extra layer:
CP_BTC_TREND_GATE_ENABLED=false
```

Or keep it for extra safety (reduces size to 25%, doesn't block).

### Priority 3: Keep Deterministic Logic
The deterministic logic is working correctly and is more reliable than OpenAI. No change needed.

## Summary

**Main Issue:** `RISK_MIN_MOMENTUM_4H` is set 50x lower than nm_2_8, likely due to unit confusion.

**Expected behavior after fix:** Bot will require 4H momentum > 0.15% (same as nm_2_8) instead of current 0.3%.
