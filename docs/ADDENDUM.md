# Addendum: Critical Clarifications

**Date**: January 16, 2026
**Purpose**: Address 4 critical design questions

---

## 1. No Team Slack Channel

**Update to Communication Plan**:

Remove: "Create Slack channel"

Replace with:
- **Daily Standups**: Async via GitHub Project board comments or email
- **Weekly Syncs**: Video call or in-person (no Slack)
- **Blockers**: Direct email or GitHub issues (not Slack)
- **Async Updates**: GitHub Project board, milestones, issues
- **Decision Logging**: GitHub issues/discussions only

**Communication Flow**:
```
Daily Updates → GitHub Project Board comments
Questions/Blockers → GitHub Issues or direct email
Decisions → GitHub Issues with decision template
Weekly Sync → Scheduled video call or meeting
Urgent Issues → Direct phone/email to tech lead
```

**Impact**:
- Remove all Slack references from WORKFLOW.md
- Use GitHub as single source of truth
- Better for distributed teams
- Easier to track decisions long-term

---

## 2. Maintaining Current Profitability of /nexus Bot

**Critical**: Never change existing trading logic. Here's how we preserve profitability:

### Strategy Isolation
```
/nexus (Kraken) → Existing profitable bot
  ├── Entry rules (UNCHANGED)
  ├── Exit rules (UNCHANGED)
  ├── Pyramiding (.env variables - UNCHANGED)
  ├── Risk management (UNCHANGED)
  └── Market regime gating (UNCHANGED - already built in)

/nexus_binance (Binance) → Existing profitable bot
  ├── Same isolation
  ├── Same rules
  └── Same profitability guarantee
```

### What We DO Change
✅ **UI** - How users see trades
✅ **User Management** - Authentication, billing, API key storage
✅ **Execution Plumbing** - Job queue, scheduling
✅ **Observability** - Logging, monitoring

### What We DON'T Touch
❌ Entry logic
❌ Exit logic
❌ Pyramiding rules (read from .env, never modify)
❌ Stop loss / take profit thresholds
❌ Market regime detection logic
❌ Risk management calculations

### SaaS Model Preservation
```
USER 1 connects Kraken account
  ↓
App triggers /nexus bot (existing profitable bot)
  ↓
Bot uses USER 1's API keys (encrypted storage)
  ↓
Executes trades using ORIGINAL entry/exit rules
  ↓
Results: Same profitability per user

USER 2, USER 3, USER 4... same flow
```

**The Bot Stays Profitable Because**:
1. We never modify the strategy code
2. We use the same entry/exit/risk rules
3. We respect the same market regime protection
4. We apply the same pyramiding configuration
5. We maintain the same execution discipline

**Risk**: Only if we accidentally change parameters (prevented by code review in CLAUDE.md)

---

## 3. Bot Scalability Model: One Bot Per User, Multiple Pairs

**Architecture**:

### Current Understanding
- Each user has exactly 1 bot instance
- That bot can trade multiple pairs (BTC, ETH, etc.)
- User can configure which pairs the bot trades

### Scalability Flow
```
USER 1 (Pro Plan)
  ├── 1 Bot Instance
  │   ├── BTC/USDT (enabled)
  │   ├── ETH/USDT (enabled)
  │   └── SOL/USDT (disabled)
  └── Max 5 pairs per plan tier

USER 2 (Free Plan)
  ├── 1 Bot Instance
  │   ├── BTC/USDT (enabled)
  │   └── Max 1 pair per plan tier

USER 3 (Enterprise)
  ├── 1 Bot Instance
  │   ├── BTC/USDT ✅
  │   ├── ETH/USDT ✅
  │   ├── SOL/USDT ✅
  │   ├── DOGE/USDT ✅
  │   └── MAX 20 pairs per plan tier
```

### Why This Works (1 Bot, Multi-Pair)

**Scalability Advantage**:
1. **Simpler State Management**: 1 bot instance per user = simpler account model
2. **Reduced API Overhead**: 1 bot manages all pairs (not 5 bots making redundant calls)
3. **Easier Monitoring**: 1 bot per user to track
4. **Lower Resource Cost**: Fewer bot processes = cheaper hosting

**Database Schema**:
```sql
CREATE TABLE bot_instances (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE NOT NULL,  -- One bot per user
  exchange VARCHAR,
  trading_pairs TEXT[] NOT NULL,  -- ['BTC/USDT', 'ETH/USDT']
  enabled_pairs TEXT[],           -- Which pairs are active
  config JSONB
);
```

**API Structure**:
```
POST /api/bots
  ↓ Creates one bot for user
  ↓ Returns bot_id

PATCH /api/bots/:bot_id
  ↓ Update pairs: ['BTC/USDT', 'ETH/USDT']
  ↓ Bot now trades both

GET /api/bots/:bot_id/trades
  ↓ See trades from ALL pairs for this bot
```

### Profitability Per Pair
```
Bot Instance Decision: "Buy BTC now"
  ├── Execute for pair: BTC/USDT
  ├── Execute for pair: BTC/USDC (if enabled)
  └── Same trade rules, same profitability

Market sends another signal: "Buy ETH"
  ├── Execute for pair: ETH/USDT
  ├── Execute for pair: ETH/USDC (if enabled)
  └── Same rules, same returns
```

### Plan Tier Limits
```
FREE
├── 1 bot per user
├── 1 trading pair max
└── Limited to BTC or ETH only

PRO ($29/month)
├── 1 bot per user
├── 5 trading pairs max
└── BTC, ETH, SOL, DOGE, etc.

ENTERPRISE ($99/month)
├── 1 bot per user
├── 20 trading pairs max
└── Any supported pair
```

### Why NOT Multiple Bots Per User?
❌ **More complex**: More state, more database queries
❌ **Higher API overhead**: Each bot independently fetches market data
❌ **Harder to monitor**: Track profit/loss across 5 bots
❌ **More resource use**: 5 bot processes vs 1
❌ **Breaks single-call architecture**: We want ONE market data fetch for all users

### Verdict
✅ **One bot per user with multiple pairs is the right model** for:
- Scalability (5000+ users)
- Profitability preservation (same rules apply to all pairs)
- Cost efficiency
- Simplicity
- Single-call market data architecture

---

## 4. Allowed Trading Pairs: USD, USDT, Crypto vs Crypto

**Design Decision**:

### Supported Quote Currencies
✅ **USDT** (Tether) - Primary, most liquid
✅ **USD** (Fiat, where available on exchange) - Kraken, Coinbase
✅ **USDC** (USD Coin) - Stablecoin alternative
✅ **Crypto pairs** - Potentially (BTC, ETH as quote)

### Example Pairs (User Can Trade)

**Kraken**:
- BTC/USD ✅
- ETH/USD ✅
- BTC/USDT ✅
- ETH/USDT ✅

**Binance**:
- BTC/USDT ✅
- ETH/USDT ✅
- SOL/USDT ✅
- DOGE/USDT ✅
- BTC/BUSD ✅

**Coinbase**:
- BTC/USD ✅
- ETH/USD ✅
- SOL/USD ✅

### NOT Supported
❌ **Crypto-to-crypto** (e.g., BTC/ETH): Too volatile, breaks pyramiding logic
❌ **Illiquid pairs**: Would get slippage, break profitability
❌ **Leverage/margin trading**: Out of scope, add complexity

### Configuration Strategy

**Per Exchange, Per User**:
```sql
CREATE TABLE bot_instances (
  ...
  exchange VARCHAR,  -- 'kraken', 'binance', 'coinbase'
  config JSONB,
  -- Where config includes:
  -- {
  --   "quote_currency": "USDT",  -- Default per exchange
  --   "supported_pairs": ["BTC/USDT", "ETH/USDT"],
  --   "enabled_pairs": ["BTC/USDT"],
  --   "min_quote_amount": 10.00,  -- Minimum order size
  -- }
);
```

### Why USDT/USD Over Crypto Pairs?

1. **Stable Reference**: Trading USD/USDT = same profitability regardless of BTC price
2. **Pyramiding Simplicity**: Rules assume fiat/stablecoin reference
3. **Risk Management**: Stop loss in dollars = predictable risk
4. **Exchange Liquidity**: USDT/USD pairs have best liquidity
5. **User Simplicity**: Users understand "buy BTC for $45,000" not "1.5 ETH"

### Profitability Preservation

Existing bot rules assume:
```
Entry: Price crosses EMA
Take Profit: +5% (in quote currency, usually USD/USDT)
Stop Loss: -3% (in quote currency)
Pyramiding: Add 50% more at -2% intervals (in quote currency)
```

These rules work identically whether quote is USD or USDT.
They break if quote is volatile crypto (BTC/ETH).

### Implementation

**In IMPLEMENTATION_PLAN.md Phase 3 (Exchange Adapters)**:

Add validation:
```typescript
function validatePair(pair: string, exchange: string): boolean {
  // Only allow pairs ending in USD, USDT, USDC
  const validQuotes = ['USD', 'USDT', 'USDC', 'BUSD'];
  const quote = pair.split('/')[1];
  return validQuotes.includes(quote);
}
```

**In User Settings**:
```
Exchange: Kraken
Supported Pairs: [BTC/USD, ETH/USD, BTC/USDT, ETH/USDT]
Select Active Pairs: [BTC/USD, ETH/USD]
Quote Currency: USD (auto-detected per exchange)
```

---

## Summary of Updates

### Update IMPLEMENTATION_PLAN.md
- Phase 1: Remove Slack, use GitHub
- Phase 5: Add pair validation (USD/USDT/USDC only)
- Phase 8: Show pair selection UI (1 bot, multi-pair)

### Update CLAUDE.md
- Add section: "Preserving Profitability" (how to avoid breaking bot)
- Add trading pair validation rules
- Add quote currency rules

### Update Database Schema
- `bot_instances` has `trading_pairs[]` and `enabled_pairs[]`
- Plan tiers limit max pair count

### Update Bot Execution
- Single bot instance processes all enabled pairs
- Same rules apply to each pair
- Profitability preserved across all pairs

---

## Key Takeaways

| Question | Answer |
|----------|--------|
| **Slack?** | No - use GitHub Issues/Project Board + email |
| **Bot Profitability?** | Never touch strategy code, only deployment plumbing |
| **Scalability Model?** | 1 bot per user, multiple pairs per bot (5-20 depending on plan) |
| **Allowed Pairs?** | USD/USDT/USDC only (fiat/stable, not crypto-crypto) |

---

This addendum clarifies the 4 critical design decisions. Update all docs with these constraints.

**No other changes to IMPLEMENTATION_PLAN.md, CLAUDE.md, WORKFLOW.md needed.**

Next: Ready for team kickoff with these clarifications locked in.
