# NexusMeme Trading Bot - Development Guide

## Core Principles

**NO HARDCODING - PERIOD**
- All parameters must come from `.env.local` via `environment.ts`
- No magic numbers in code (3.0, 0.005, 85, etc.)
- If you write a constant, add it to environment.ts first

**NO COOLDOWNS - EVER**
- Cooldowns are FORBIDDEN - they equal missed opportunities
- Every trade opportunity must be evaluated on its own merit
- A loss does not affect the validity of the next setup
- Do NOT add cooldown/pause/throttle/delay logic under ANY name

**Test-Production Parity**
- Kraken and Binance configurations must match (different pairs/fees only)
- Both environments use same logic paths
- Changes to one must apply to both

**Single Source of Truth**
- `.env.local` is the authoritative configuration
- `src/config/environment.ts` validates and exports all env vars
- Code reads from environment, never hardcodes

## Trading Philosophy & Best Practices

**Core Motto: "Make Money No Matter What"**

The bot's entire purpose is to capture profitable opportunities without leaving money on the table or cutting winners too early.

## Estimated Trade Performance & Analysis

**Baseline Assumptions (Estimation Only)**
- Spread/fees: 0.1-0.2% effective round-trip per trade
- Slippage: ~0.1-0.3% on market orders; lower on limit-with-retry
- Data quality: Real-time price feed is stable and synchronized with order execution

**Expected Trade Paths (Targets Drive Behavior, Not Guarantees)**
- Quick scalp exits (1-2% target): triggered in weak/moderate trends; intended to close within minutes to ~1h with minimal drawdown
- Trend run exits (5-12% target): activated when ADX > 25/40; holds longer (multi-hour) and tolerates controlled pullbacks to avoid premature exit
- Early loss protection: exits small reds early to prevent -2%+ slides; goal is low average loss magnitude
- Net objective: positive expectancy through smaller average loss vs. larger average win while keeping fee drag below target

**Key KPIs to Track Weekly**
- Win rate by regime: weak vs. moderate vs. strong ADX
- Average win/loss size and expectancy after fees
- Median vs. P90 hold time for each exit path
- Slippage vs. fee budget per venue; % trades breaching budget
- Drawdown during open trades; % trades that swing from >2% unrealized gain to loss
- Pyramid contribution: incremental P&L and risk when L1/L2 enabled

**Current Weaknesses / Gaps**
- ADX-only regime detection can lag; late recognition of chop causes overstay and profit give-back
- No explicit max adverse excursion (MAE) guard tuned per pair/venue; early weakness rules may be too coarse
- Limited slippage/fee budget enforcement; thin-liquidity pairs can erase small targets
- Pyramiding depends on static thresholds; lacks volatility-adjusted sizing and staggered exits
- Profit locks rely on discrete targets; missing trailing/ratchet to secure mid-trade gains

**Recommendations (Prioritized)**
- Add trailing/ratchet exits once unrealized > target/2 to avoid green-to-red flips
- Enforce per-trade cost budget (fees+slippage) and block entries when spread exceeds budget
- Add volatility-aware MAE and time-based stops (e.g., exit if not +0.5% in 10-15m)
- Incorporate secondary regime signal (e.g., volume trend or realized volatility) to confirm ADX before pyramiding
- Stagger pyramid exits (scale-out) and size pyramids with volatility-normalized units instead of static levels
- Log and review KPIs weekly; adapt thresholds per venue/pair based on observed slippage and hold-time distributions

---

## Quantitative Impact Analysis

### Current Baseline Performance (Estimated)

| Metric | Weak Regime | Moderate | Strong |
|--------|-------------|----------|--------|
| ADX Range | < 25 | 25-40 | > 40 |
| Win Rate | 60% | 65% | 70% |
| Avg Win | 2.0% | 5.0% | 12.0% |
| Avg Loss | 1.5% | 2.0% | 3.0% |
| Costs (fees+slippage) | 0.5% | 0.5% | 0.5% |
| **Net Expectancy** | **+0.1%** | **+2.05%** | **+6.9%** |

**Expectancy Formula:**
```
E[trade] = (WinRate × AvgWin) - ((1-WinRate) × AvgLoss) - Costs
```

### Exchange Cost Comparison

| Cost Component | Kraken | Binance |
|----------------|--------|---------|
| Maker fee | 0.16% | 0.10% |
| Taker fee | 0.26% | 0.10% |
| Round-trip total | ~0.42% | ~0.20% |
| Typical slippage | 0.1-0.3% | 0.05-0.15% |
| **Effective cost floor** | **0.5-0.7%** | **0.25-0.35%** |

**Critical insight:** Weak regime on Kraken (0.7% cost) may be **negative expectancy**. Consider skipping weak regime entries on Kraken or using limit orders only.

---

### Improvement #1: Trailing/Ratchet Stop

**Problem:** 15% of winning trades flip from +3% unrealized to -1% realized (profit slippage)

| Metric | Before | After |
|--------|--------|-------|
| Trades flipping green-to-red | 15% | ~5% |
| Win rate (moderate regime) | 65% | 72% |
| Avg win (moderate) | 5.0% | 4.2% (exit earlier) |

**Impact on moderate regime:**
```
Before: (0.65 × 5.0%) - (0.35 × 2.0%) - 0.5% = +2.05%
After:  (0.72 × 4.2%) - (0.28 × 1.8%) - 0.5% = +2.02%
```
Similar expectancy but **lower variance** and **fewer painful reversals**

**Impact on strong regime:**
```
Before: (0.70 × 12%) - (0.30 × 3.0%) - 0.5% = +6.9%
After:  (0.78 × 10%) - (0.22 × 2.5%) - 0.5% = +6.75%
```
**8% more trades end profitable** instead of flipping

**Env vars needed:** `TRAILING_STOP_ACTIVATION_PCT`, `TRAILING_STOP_DISTANCE_PCT`

---

### Improvement #2: Spread/Cost Budget Check

**Problem:** Entering when spread is 0.5% = instant -0.5% underwater

| Metric | Before | After |
|--------|--------|-------|
| Trades in wide spread | 100% | Block if spread > 0.3% |
| Avg entry slippage | 0.25% | 0.15% |
| Effective cost reduction | - | **-0.10% per trade** |

**Impact on weak regime (most cost-sensitive):**
```
Before: (0.60 × 2.0%) - (0.40 × 1.5%) - 0.50% = +0.10%
After:  (0.60 × 2.0%) - (0.40 × 1.5%) - 0.40% = +0.20%
```
**+100% improvement** in weak regime expectancy (0.1% → 0.2%)

**Env var needed:** `MAX_ENTRY_SPREAD_PCT`

---

### Improvement #3: Time-Based Profit Lock

**Problem:** Waiting for 2% target when trend is dying; trade expires to loss

**Rule:** Exit at +1% after 30min if momentum fading (don't wait for full target)

| Metric | Before | After |
|--------|--------|-------|
| Weak regime hitting full target | 60% | 55% |
| Early profit lock exits (+1%) | 0% | 15% |
| Trades expiring to loss | 40% | 30% |

**Impact on weak regime:**
```
Before: (0.60 × 2.0%) - (0.40 × 1.5%) - 0.5% = +0.10%
After:  (0.55 × 2.0%) + (0.15 × 1.0%) - (0.30 × 1.3%) - 0.5% = +0.36%
```
**+260% improvement** in weak regime (0.10% → 0.36%)

**Env vars needed:** `TIME_PROFIT_LOCK_MINUTES`, `TIME_PROFIT_LOCK_MIN_PCT`

---

### Improvement #4: Secondary Regime Confirmation (ADX + Volume)

**Problem:** ADX says "moderate trend" but actually chop → wrong target, overstay

| Metric | Before | After |
|--------|--------|-------|
| Regime misclassification | ~20% | ~8% |
| Trades entering chop with 5% target | Common | Rare |

**Impact calculation:**
```
Misclassified trade (moderate target in weak market):
  Expected: +2.05%, Actual: -0.5% (held too long, wrong target)

Reduction: 12% fewer misclassified × 2.5% avoided loss = +0.30% overall
```

**Implementation:** Require ADX + volume trend confirmation before moderate/strong classification

---

### Improvement #5: Volatility-Adjusted Pyramid Sizing

**Problem:** Fixed 50% pyramid add in high volatility = oversized, blown up

| Scenario | Before | After |
|----------|--------|-------|
| High ATR (volatile) | Add 50% | Add 30% |
| Low ATR (calm) | Add 50% | Add 70% |
| Pyramid blowup rate | ~8% | ~3% |

**Impact on pyramid trades:**
```
Before: (0.92 × 1.5%) + (0.08 × -4.0%) = +1.06%
After:  (0.97 × 1.2%) + (0.03 × -2.5%) = +1.09%
```
Similar return, **much lower risk** (blowup rate 8% → 3%)

---

### Combined Impact Summary

| Change | Weak | Moderate | Strong | Effort |
|--------|------|----------|--------|--------|
| Trailing stop | +0% | -0.03%* | -0.15%* | Medium |
| Spread check | **+0.10%** | +0.10% | +0.10% | Low |
| Time profit lock | **+0.26%** | +0.05% | +0% | Medium |
| Regime confirmation | +0.10% | **+0.30%** | +0.10% | High |
| Volatility pyramids | N/A | +0.03% | +0.03% | Medium |

*Trailing stop trades expectancy for consistency (8% more wins, smaller avg win)

**Total Estimated Improvement:**
| Regime | Before | After | Change |
|--------|--------|-------|--------|
| Weak | +0.10% | **+0.56%** | +460% |
| Moderate | +2.05% | **+2.50%** | +22% |
| Strong | +6.90% | **+6.98%** | +1% |

---

### Implementation Priority

| Priority | Change | Rationale |
|----------|--------|-----------|
| **#1** | Time-based profit lock | Biggest impact on weak regime (+260%) |
| **#2** | Spread check | Easy win, low effort, helps all regimes |
| **#3** | Trailing stop | Reduces variance, prevents painful reversals |
| **#4** | Regime confirmation | Harder but prevents costly misclassification |
| **#5** | Volatility pyramids | Lower priority, reduces tail risk |

**Key Insight:** Weak regime is where most trades occur and currently barely breaks even. Changes #1 and #2 alone could improve weak regime from +0.1% to +0.46% per trade.

---

### Profit Management Rules

**1. Never Let Profit Slip Away (Critical)**
- Problem: Profitable trades turning negative is a design failure
- Solution: Lock gains faster while protecting winners
- Implementation:
  - Fast profit-taking mechanism for small gains (1-2% quick exits)
  - Dynamic profit targets that let strong trends run (5-12%)
  - Early loss protection (exit if trade goes slightly negative early)
  - Balance: Capture sure wins without cutting strong winners prematurely

**2. Opportunistic at Every Turn - NO COOLDOWNS (ENFORCED)**
- **COOLDOWNS ARE FORBIDDEN** - cooldown = missed opportunity = lost money
- All cooldown code has been removed from the codebase (not just disabled)
- Trade whenever conditions warrant entry - EVERY opportunity is evaluated
- Each trading opportunity is independent and evaluated on its own merit
- Fast entry/exit execution with no friction
- A loss on one trade has ZERO bearing on whether the next setup is valid
- Do NOT re-add cooldown logic under any name (pause, delay, throttle, etc.)

**3. Conditional Pyramiding**
- **ONLY pyramid in strong setups:**
  - High confidence AI signals (confidence >= 85% for L1, 90% for L2)
  - Strong trend conditions (ADX > 35 for L1, ADX > 40 for L2)
  - Positive momentum verified
- **Single source of truth for ADX thresholds:**
  - `.env.local` → `PYRAMID_L1_MIN_ADX=35`, `PYRAMID_L2_MIN_ADX=40`
  - Global (Kraken/Binance share the same ADX gates)
- **NEVER pyramid in:**
  - Low confidence AI signals
  - Choppy/sideways markets (low ADX)
  - Early-stage trades showing weakness
  - High-risk market conditions (dumps, panics, spreads widening)

**4. Dynamic Profit Targeting**
- Adapt to market regime detected by ADX:
  - **Weak trend (ADX < 25):** 2% target → exit before volatility turns against you
  - **Moderate trend (ADX 25-40):** 5% target → let developing momentum run
  - **Strong trend (ADX > 40):** 12% target → maximize momentum capture
- Goal: Let winners run in trends, lock gains in choppy markets

**5. Risk Management First, Profit Second**
- Entry blocked if market conditions bad (5-stage risk filter)
- Exit fast when conditions warrant - trading is about discipline
- Better to exit with small loss than watch it become big loss

---

## Exit Logic (Simplified)

**Philosophy: Agile Trading - 3 Core Exit Checks Only**

Trading means discipline. Get in green, get out fast. No complex overlapping checks.

| Priority | Check | Trigger | Purpose |
|----------|-------|---------|---------|
| **1** | **EROSION CAP** | Trade had profit, erosion > cap (20%) | Protect profits |
| **2** | **EARLY LOSS** | Never profitable, loss > threshold | Cut bad entries |
| **3** | **EMERGENCY STOP** | Loss > -6% | Safety net |
| **4** | **PROFIT TARGET** | Profit >= target (2-12% by ADX) | Take profit |

**How They Work:**

1. **EROSION CAP** - If trade ever had ANY profit (peak > 0) and eroded beyond regime cap → EXIT
   - No minimum peak requirement (even +0.01% peak counts)
   - No green-trade requirement (exits even if trade went underwater)
   - Regime caps: 20% (choppy/weak/moderate), 30% (strong)

2. **EARLY LOSS** - If trade NEVER profited (peak ≤ 0) and losing → EXIT
   - Age-scaled thresholds: -1.5% at 5min, -2.5% at 30min, -3.5% at 3h
   - Only applies to trades that never went positive

3. **EMERGENCY STOP** - Catastrophic loss safety net
   - Fixed at -6% (configurable via `emergencyLossLimit`)

4. **PROFIT TARGET** - Take profit when target reached
   - Dynamic by ADX: 2% (weak), 5% (moderate), 12% (strong)

**What Was Removed (Redundant):**
- ~~Profit Lock~~ → Erosion cap handles this better
- ~~Time Profit Lock~~ → Erosion cap handles it
- ~~Trailing Stop~~ → Erosion cap is essentially a trailing stop
- ~~Green-to-Red~~ → Erosion cap handles underwater trades
- ~~Momentum Failure~~ → Early loss handles underwater trades
- ~~Max Hold Time~~ → Rarely needed, adds complexity
- ~~Stale Flat Trade~~ → Erosion cap or early loss will catch it

**Key Insight:** Simpler = faster execution, fewer edge cases, easier debugging.

---

### Implementation Checklist

- [x] Erosion cap fires immediately when triggered (no guards)
- [x] Early loss thresholds scale with trade age
- [x] Emergency stop as safety net
- [x] Profit targets dynamic based on ADX regime
- [x] Entry spread check - Block entry if spread > 0.3%
- [x] Pyramiding only in strong trend conditions (ADX > 35)
- [x] No artificial cooldowns between trades
- [x] Trade exit reasons logged clearly
- [x] Fee deduction accurate in P&L display

## Key Files

| File | Purpose | Notes |
|------|---------|-------|
| `.env.local` | All configuration | Never commit secrets, never hardcode in code |
| `src/config/environment.ts` | Env schema validation | Add new vars here first |
| `src/services/risk/risk-manager.ts` | 5-stage risk filter | Uses RISK_* env vars |
| `src/services/exchanges/kraken.ts` | Kraken adapter | Captures fees on order execution |
| `src/services/exchanges/binance.ts` | Binance adapter | Captures fees on order execution |
| `src/app/api/bots/trades/close/route.ts` | Trade exit handler | Deducts fees from P&L |
| `src/services/orchestration/trade-signal-orchestrator.ts` | Trade orchestrator | Direct execution, position checks |
| `src/services/execution/fan-out.ts` | Trade execution | Direct execution (no job queue) |
| `src/services/market-data/aggregator.ts` | Price fetcher | Uses Kraken public API |
| `src/services/market-data/background-fetcher.ts` | Background prices | Dynamic pairs from active bots |

## Execution Architecture (/nexus Parity)

**Direct Execution (No Job Queue)**
- Trades execute synchronously, one at a time - prevents race conditions
- Position check happens BEFORE signal generation (like /nexus)
- No async job queue that can cause duplicate trades

**Key Flow:**
1. Orchestrator checks if open position exists for pair → skip if yes
2. Generate signal only for pairs without open positions
3. Execute trade directly via `executeTradesDirect()` (not queued)
4. Each execution has duplicate check before insert

**Dynamic Exchange/Pair Handling:**
- Market data aggregator uses Kraken public API (no auth required)
- Background fetcher queries active bots for pairs: `SELECT enabled_pairs FROM bot_instances WHERE status = 'running'`
- No hardcoded pair lists - pairs come from bot config in dashboard

## Common Patterns

### Adding a Configuration Parameter

1. **Add to `.env.local`**:
   ```
   MY_NEW_PARAM=1.5
   ```

2. **Add to `environment.ts` schema**:
   ```typescript
   MY_NEW_PARAM: z.string().transform(Number).default('1.5'),
   ```

3. **Add to `getDefaultEnvironment()`**:
   ```typescript
   MY_NEW_PARAM: 1.5,
   ```

4. **Use in code**:
   ```typescript
   const env = getEnvironmentConfig();
   const value = env.MY_NEW_PARAM;  // ✅ CORRECT
   ```

### Wrong Ways

```typescript
const value = 1.5;  // ❌ HARDCODED
const value = '1.5';  // ❌ HARDCODED STRING
const value = process.env.MY_NEW_PARAM;  // ❌ BYPASSES VALIDATION
```

## Exchange Configuration Pattern

All exchange-specific settings follow this pattern in `.env.local`:

```
# Kraken
KRAKEN_BOT_PYRAMIDING_ENABLED=true
KRAKEN_BOT_PYRAMID_LEVELS=2
...

# Binance (must match Kraken unless intentionally different)
BINANCE_BOT_PYRAMIDING_ENABLED=true
BINANCE_BOT_PYRAMID_LEVELS=2
...
```

## Risk Management Guardrails

All RISK_* parameters are configurable:
- `RISK_VOLUME_SPIKE_MAX` - Volume panic spike threshold
- `RISK_BTC_DUMP_THRESHOLD` - BTC protection threshold
- `RISK_MIN_ADX_FOR_ENTRY` - Trend strength requirement
- `RISK_MIN_MOMENTUM_1H/4H` - Momentum thresholds
- `RISK_PROFIT_TARGET_MINIMUM` - Cost floor

Update `.env.local`, not code.

## Fee Handling

- Kraken adapter queries fees on order placement
- Binance adapter sums commission from fills
- Trade close endpoint deducts: `P&L = grossProfit - entryFee - exitFee`
- Fallback fees configurable: `KRAKEN_TAKER_FEE_DEFAULT`, `BINANCE_TAKER_FEE_DEFAULT`

## Testing Changes

1. Update parameter in `.env.local`
2. Restart server (`npm run dev`)
3. Verify both Kraken and Binance bots behave identically
4. Check logs for new values being read from environment

## Type Checking

```bash
pnpm type-check  # Must pass before commit
```

If you added env vars and get type errors, ensure they're in both:
- `envSchema` (top of environment.ts)
- `getDefaultEnvironment()` (build phase defaults)

## Committing

Include in message:
- What was hardcoded → what is now configurable
- Example: "Moved volumeSpikeMax from 3.0 hardcoded to RISK_VOLUME_SPIKE_MAX env var"
- Verify no new hardcoded values remain

## Quick Checklist

Before pushing:
- [ ] No magic numbers in code
- [ ] All new parameters in `.env.local`
- [ ] All new parameters validated in `environment.ts`
- [ ] Bot configs have parity (unless intentionally different)
- [ ] `pnpm type-check` passes
- [ ] Commit message explains what was deconfigured
