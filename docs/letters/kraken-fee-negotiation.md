# Kraken Fee Negotiation Letter

**To:** institutional@kraken.com
**Subject:** API Trading Fee Rate Request — NexusMeme Automated Trading Platform (Pre-Launch)
**From:** [Your Name], Founder — NexusMeme

---

Dear Kraken Institutional Team,

My name is [Your Name], and I am the founder of **NexusMeme** — an AI-powered automated crypto trading platform currently in pre-launch. I am writing to discuss a business relationship with Kraken ahead of our public launch, specifically regarding API trading fee structures appropriate for a platform routing consistent, high-frequency spot volume across many user accounts.

---

## About NexusMeme

NexusMeme is a retail-facing algorithmic trading platform that connects users' existing Kraken accounts via API key and executes spot trades autonomously on their behalf. Users never leave Kraken — NexusMeme is purely an API-layer product. All funds, balances, and trade history remain in each user's own Kraken account at all times.

**Key platform characteristics:**

- **Supported exchanges**: Binance (primary) and Kraken (secondary, specifically for US residents and global users who prefer Kraken)
- **Trading pairs**: BTC/USDT and ETH/USDT — the highest-volume pairs on Kraken
- **Trading mode**: Spot only. No derivatives, no margin, no withdrawals. Read + Spot Trading API permissions only.
- **Execution style**: Fully automated, 24/7, signal-driven
- **Architecture**: Each user connects their own Kraken account via API key. NexusMeme does not custody or pool funds.

---

## Why Kraken Specifically

NexusMeme is headquartered in Salt Lake City, Utah. As a US-based company, we understand the US regulatory landscape firsthand — and Kraken is the default exchange recommendation for **US-based users** on NexusMeme, as Binance's global platform is not available to US residents. Given the significant US retail crypto market, Kraken is a meaningful part of our exchange offering and the exchange we direct all US signups toward.

This makes the fee structure on Kraken particularly important: US users tend to have accounts of comparable or larger size to global users, and the platform's profitability for those users is directly affected by Kraken's maker/taker rates.

---

## Trading Volume Profile

Our platform strategy adapts to market conditions in real-time:

| Market Regime | ADX Range | Profit Target | Expected Hold Time |
|---------------|-----------|---------------|--------------------|
| Choppy        | < 20      | 0.5%          | Minutes to 1 hour  |
| Weak trend    | 20–25     | 0.8%          | 1–4 hours          |
| Moderate trend| 25–40     | 2.0%          | 2–8 hours          |
| Strong trend  | > 40      | 8.0%          | Multi-hour run     |

**Volume projection per user (conservative):**

- Average trades per user per day: **8–20 round trips**
- Average trade size: **$200–$2,000 USDT** (minimum $1,000 live balance required before live trading activates)
- Estimated volume per active Kraken user per month: **$50,000–$300,000**

**Platform-level projections (Kraken portion):**

| Stage | Active Kraken Users | Est. Monthly Volume |
|-------|---------------------|---------------------|
| Launch (Month 1–3) | 20–80 | $1M–$24M |
| Growth (Month 4–6) | 80–200 | $8M–$60M |
| Scale (Month 7–12) | 200–800 | $30M–$240M |

---

## Current Fee Rate & The Problem

NexusMeme currently operates at **Kraken's standard retail rates**:
- Maker: **0.16%**
- Taker: **0.26%**

**Round-trip cost at standard rates: ~0.42%**

This is the core challenge: at our tightest profit targets (0.5–0.8% in choppy/weak regimes), a 0.42% round-trip fee consumes the majority of the target profit. In practical terms:

- **0.5% target, 0.42% cost = 0.08% net** — barely viable
- **0.8% target, 0.42% cost = 0.38% net** — acceptable but thin
- **2.0% target, 0.42% cost = 1.58% net** — healthy

Compare this to Binance's 0.10%/0.10% rate (0.20% round-trip), which gives users considerably more room in all regimes.

To make Kraken a genuinely competitive option for our US users — and to drive meaningful, sustained volume to Kraken rather than routing users to workarounds — we need a materially lower fee structure.

---

## What We Are Requesting

| Fee Type | Current | Requested | Notes |
|----------|---------|-----------|-------|
| Taker    | 0.26%   | 0.10%     | Brings Kraken to parity with Binance global |
| Maker    | 0.16%   | 0.08%     | Incentivizes limit-order entries |

A taker rate of **0.10%** (equivalent to Kraken Pro's ~$10M/month volume tier) would put Kraken users on parity with Binance users and allow us to confidently recommend Kraken as the primary exchange for US residents without a meaningful performance penalty.

If a flat rate reduction is not possible at launch, we are open to discussing:
- A volume-tiered agreement that unlocks better rates as our Kraken user base grows
- A maker rebate structure to incentivize limit-order execution
- A dedicated sub-account / intermediary arrangement if Kraken offers this for platforms

---

## Why This Partnership Makes Sense for Kraken

1. **US user channel**: NexusMeme is one of the few algorithmic trading platforms directing US retail users specifically to Kraken. We become a meaningful US acquisition channel.
2. **Automated, consistent volume**: Bot-generated volume runs 24/7 regardless of market sentiment — not correlated to news cycles or retail FOMO
3. **Spot BTC/ETH only**: High-volume, high-liquidity pairs. No exotic markets, no thin order books.
4. **No custody risk**: Each user's funds stay in their own Kraken account. NexusMeme has no settlement or withdrawal exposure.
5. **Long-term relationship**: As NexusMeme scales its US user base, Kraken volume scales in lockstep.

---

## The Competitive Reality

We want to be transparent: at current Kraken retail rates (0.42% round-trip), it is difficult for us to recommend Kraken as a primary exchange when Binance global offers 0.20% round-trip. Without a negotiated rate, we may need to position Kraken as a fallback for US users only, rather than a co-equal exchange option.

A fee reduction to 0.10% taker would change that calculus entirely and allow us to actively promote Kraken to our full global user base as a high-quality alternative — a meaningful increase in the Kraken volume we drive.

---

## Next Steps

I would welcome a call or email introduction with your institutional or business development team to discuss:

- Fee rate structures available for API-heavy platforms
- Kraken's broker or intermediary program (if available)
- Any sub-account architecture that would allow volume aggregation for fee tier purposes
- Technical requirements for production-scale API usage at our volume profile

We are targeting public launch within the next 60–90 days. Ideally, fee structures would be agreed before go-live so we can calibrate our strategy parameters and user-facing documentation accordingly.

Please reach out at **[your email]** or schedule time via **[calendar link]**.

Thank you for your time and consideration.

Regards,

**[Your Name]**
Founder, NexusMeme
Salt Lake City, Utah, USA
[email] | [website: nexusmeme.com] | [LinkedIn]

---

*NexusMeme is a US-based company incorporated in the State of Utah. We are an API-only trading platform. We do not hold, custody, or move user funds. All trading occurs directly within each user's own Kraken account.*
