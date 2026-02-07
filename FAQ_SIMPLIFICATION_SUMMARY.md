# FAQ Simplification Summary

## Changes Made
Removed all technical jargon from help center FAQs and made language user-friendly.

## Technical Terms REMOVED

| Before (Technical) | After (Simple) |
|-------------------|----------------|
| ADX | "clear direction" |
| EMA200 / EMA50 | "trending up/down" |
| RSI | "overbought" → "went up too fast" |
| Stop loss | "automatic exit" |
| Momentum | "price movement" |
| Volatility | "wild price swings" |
| Bear market | "market going down" |
| Bull market | "market going up" |
| API keys | "connection keys" |
| 2FA | "extra security / 2-factor authentication (with explanation)" |
| DCA bots | "auto-trading platforms" |
| Grid bots | "traditional bots" |
| Arbitrage | (removed completely) |
| Consolidation | "flat/choppy" |
| Regime | "conditions" |

## Example Comparisons

### Before (Technical)
"BTC below 200-day EMA → ALL entries blocked (downtrend protection)"

### After (Simple)
"Bitcoin is trending down. Bot waits for the trend to turn positive before entering trades."

---

### Before (Technical)
"ADX must be ≥ 20 (minimum directional movement)"

### After (Simple)
"Market must be moving up or down (not sideways/flat)"

---

### Before (Technical)
"1-hour momentum consistently < 1%"

### After (Simple)
"Prices barely moving hour to hour"

---

## Key Message Changes

**Emphasis on**:
- "Trading platform" (not "investment platform")
- Plain language explanations
- Real-world examples
- What users will actually see in their dashboard
- Why features exist (user benefit, not technical specs)

**Removed**:
- Technical indicator names
- Trading jargon
- Mathematical formulas
- Assumed knowledge of crypto trading

**Added**:
- Simple metaphors ("catching a falling knife")
- Real historical examples (2022 bear market)
- Step-by-step guides
- Clear risk disclaimers

## Files Modified
- `/home/omi/nexusmeme/src/components/help/sections/FAQSection.tsx`

## Test Checklist
- [ ] Visit http://localhost:3000/help
- [ ] Read through all FAQs
- [ ] Verify no technical jargon remains
- [ ] Test search with terms like "not trading" and "why waiting"
- [ ] Check mobile display (collapsible sections)

## User Experience Goal
**Before**: "Why is ADX below 20 blocking my trades?"
**After**: "Oh, the market is too choppy right now. My bot is protecting me. That makes sense!"
