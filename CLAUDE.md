# NexusMeme Trading Bot - Development Guide

## Core Principles

**NO HARDCODING - PERIOD**
- All parameters must come from `.env.local` via `environment.ts`
- No magic numbers in code (3.0, 0.005, 85, etc.)
- If you write a constant, add it to environment.ts first

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

### Profit Management Rules

**1. Never Let Profit Slip Away (Critical)**
- Problem: Profitable trades turning negative is a design failure
- Solution: Lock gains faster while protecting winners
- Implementation:
  - Fast profit-taking mechanism for small gains (1-2% quick exits)
  - Dynamic profit targets that let strong trends run (5-12%)
  - Early loss protection (exit if trade goes slightly negative early)
  - Balance: Capture sure wins without cutting strong winners prematurely

**2. Opportunistic at Every Turn**
- No artificial cooldowns between trades (cooldown = missed opportunity)
- Trade whenever conditions warrant entry
- Each trading opportunity is independent and evaluated on merit
- Fast entry/exit execution with no friction

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
- Early exit if trade loses momentum or shows early weakness
- Protect against "profit slippage" by maintaining vigilance
- Better to exit with 1% gain than watch it become -2% loss

### Implementation Checklist

- [ ] Profit targets are dynamic based on trend strength (ADX)
- [ ] Fast exit mechanism in place for quick gains
- [ ] Pyramiding only enabled in high-confidence + strong trend conditions
- [ ] No artificial cooldowns preventing back-to-back trades
- [ ] Early loss thresholds aggressive (exit within first 5-15 min if down)
- [ ] Trade exit reasons logged (why each position was closed)
- [ ] Fee deduction accurate (don't oversell P&L to user)

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
