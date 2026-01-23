# Nexus Trading Platform - Implementation Plan

## Executive Summary

Build a scalable, mobile-first trading platform that exposes existing profitable trading bots to 5000+ users while maintaining strategy integrity, minimizing API overhead, and respecting market regime protection.

**Core Principle**: Scale what works. Don't change it.

---

## Phase 1: Foundation & Architecture (Week 1-2)

### 1.1 Repository Structure & Setup
- **Deliverable**: Complete project scaffold with all directories, configs, and tooling
- **Tasks**:
  - [ ] Initialize Next.js 15+ with TypeScript (app router)
  - [ ] Set up monorepo structure:
    ```
    /src
      /app              # Next.js pages/API routes
      /components       # React components (mobile-first)
      /lib              # Shared utilities
      /types            # TypeScript definitions
      /services         # Business logic (trading, billing, auth)
      /middleware       # Auth, validation
    /docs              # Documentation
    /scripts            # Setup, maintenance, migrations
    ```
  - [ ] Configure pnpm workspaces (if expanding to multiple services later)
  - [ ] Set up Git workflow and branch protection
  - [ ] Initialize database migrations folder (PostgreSQL)
  - [ ] Configure environment variables schema validation

### 1.2 Environment & Configuration System
- **Deliverable**: Typed, validated configuration system - single source of truth
- **Critical**: No hardcoding of trading parameters
- **Tasks**:
  - [ ] Create `src/config/environment.ts`:
    - Validate all required env vars at startup
    - Typed configuration object with defaults
    - Support for development, staging, production
  - [ ] Define env schema:
    ```
    # Database
    DATABASE_URL

    # Authentication
    NEXTAUTH_URL, NEXTAUTH_SECRET
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

    # APIs
    OPENAI_API_KEY
    RESEND_API_KEY
    STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET

    # Trading (Bot Configuration)
    KRAKEN_API_BASE_URL
    BINANCE_API_BASE_URL
    COINBASE_API_BASE_URL
    TRADING_PAIRS (JSON: ["BTC/USD", "ETH/USD", ...])

    # Market Regime
    REGIME_CHECK_INTERVAL_MS
    REGIME_FALLBACK_STRATEGY (conservative/aggressive)

    # Rate Limiting & Performance
    MAX_API_CALLS_PER_MINUTE
    MARKET_DATA_CACHE_TTL_MS
    BOT_INSTANCE_PORT_RANGE_START
    BOT_INSTANCE_PORT_RANGE_END

    # Feature Flags
    ENABLE_TRADE_ALERTS
    ENABLE_BACKTESTING
    ```
  - [ ] Create `src/lib/env.ts` with validation and type safety
  - [ ] Add dotenv validation middleware

### 1.3 Database Schema Setup
- **Deliverable**: PostgreSQL schema with proper indexing and unlogged tables strategy
- **Tasks**:
  - [ ] Create migration system (use TypeORM or raw SQL migrations)
  - [ ] Define core tables:
    ```sql
    -- Core User Management
    CREATE TABLE users (
      id UUID PRIMARY KEY,
      email VARCHAR UNIQUE NOT NULL,
      name VARCHAR,
      password_hash VARCHAR,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP
    );

    -- Authentication & Sessions
    CREATE TABLE sessions (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id),
      token VARCHAR UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Exchange API Keys (Encrypted)
    CREATE TABLE exchange_api_keys (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id),
      exchange VARCHAR NOT NULL, -- 'kraken', 'binance'
      encrypted_public_key VARCHAR NOT NULL,
      encrypted_secret_key VARCHAR NOT NULL,
      validated_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, exchange)
    );

    -- Bot Instances (User's Trading Bot)
    CREATE TABLE bot_instances (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id),
      exchange VARCHAR NOT NULL,
      trading_pairs TEXT[] NOT NULL, -- ['BTC/USD', 'ETH/USD']
      status VARCHAR, -- 'running', 'stopped', 'error'
      config JSONB NOT NULL, -- Dynamic bot configuration
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP
    );

    -- Trade History (UNLOGGED for high volume)
    CREATE UNLOGGED TABLE trades (
      id UUID PRIMARY KEY,
      bot_instance_id UUID NOT NULL REFERENCES bot_instances(id),
      pair VARCHAR NOT NULL,
      side VARCHAR, -- 'buy', 'sell'
      amount DECIMAL,
      price DECIMAL,
      fee DECIMAL,
      status VARCHAR, -- 'open', 'closed', 'failed'
      entry_time TIMESTAMP,
      exit_time TIMESTAMP,
      profit_loss DECIMAL,
      profit_loss_percent DECIMAL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX ON trades(bot_instance_id, created_at DESC);

    -- Market Data (UNLOGGED, ephemeral)
    CREATE UNLOGGED TABLE market_data_cache (
      id UUID PRIMARY KEY,
      pair VARCHAR NOT NULL,
      timestamp TIMESTAMP NOT NULL,
      price DECIMAL NOT NULL,
      volume DECIMAL,
      data JSONB, -- Full OHLCV or indicator data
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(pair, timestamp)
    );

    -- Market Regime (Current market state)
    CREATE TABLE market_regime (
      id UUID PRIMARY KEY,
      timestamp TIMESTAMP NOT NULL,
      regime VARCHAR, -- 'bullish', 'bearish', 'sideways'
      confidence DECIMAL, -- 0-1
      reason VARCHAR,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX ON market_regime(created_at DESC);

    -- Billing & Subscriptions
    CREATE TABLE subscriptions (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL UNIQUE REFERENCES users(id),
      stripe_subscription_id VARCHAR UNIQUE,
      plan_tier VARCHAR, -- 'free', 'pro', 'enterprise'
      status VARCHAR, -- 'active', 'cancelled', 'past_due'
      current_period_start TIMESTAMP,
      current_period_end TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP
    );

    -- Email Log (For transactional tracking)
    CREATE UNLOGGED TABLE email_log (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id),
      email_type VARCHAR, -- 'trade_alert', 'billing', 'password_reset'
      recipient VARCHAR,
      subject VARCHAR,
      status VARCHAR, -- 'sent', 'failed', 'bounced'
      sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
    ```
  - [ ] Create indexes on frequently queried columns
  - [ ] Set up UNLOGGED tables strategy (trades, market_data_cache, email_log for high volume, low durability)
  - [ ] Create backup strategy for logged tables (users, subscriptions, bot_instances)

---

## Phase 2: Trading Engine Core (Week 3-4)

### 2.1 Market Data Aggregation (Single-Call Architecture)
- **Deliverable**: Centralized market data fetch - all users consume same data
- **Critical**: Minimize API calls to exchanges
- **Tasks**:
  - [ ] Create `src/services/market-data/aggregator.ts`:
    ```typescript
    // Pseudo-code structure
    class MarketDataAggregator {
      private lastFetchTime: Map<string, number> = new Map();
      private cache: Map<string, MarketData> = new Map();

      async fetchMarketData(pairs: string[]): Promise<Map<string, MarketData>> {
        // Fetch all required pairs in a single call
        // Cache result
        // Broadcast to all subscribed consumers
        // Return cached data to subsequent requests within TTL
      }

      subscribeToUpdates(callback: (data: MarketData) => void) {
        // Event-driven updates
      }
    }
    ```
  - [ ] Implement caching layer with TTL (configurable per pair, default 5-30 seconds)
  - [ ] Create pub/sub mechanism for real-time market data distribution
  - [ ] Log all API calls for monitoring (count, latency, errors)
  - [ ] Implement fallback data sources (historical, synthetic)
  - [ ] Add circuit breaker for exchange API failures

### 2.2 Market Regime Gatekeeper
- **Deliverable**: Preserve existing regime detection, add execution guard layer
- **Critical**: Don't call APIs during unfavorable conditions
- **Tasks**:
  - [ ] Create `src/services/regime/gatekeeper.ts`:
    ```typescript
    class RegimeGatekeeper {
      async checkMarketRegime(): Promise<Regime> {
        // Query existing regime detection logic
        // Return: { type: 'bullish'|'bearish'|'sideways', confidence, reason }
      }

      shouldAllowExecution(regime: Regime): boolean {
        // Return false during bearish regime or low confidence
        // Log all skipped executions for observability
      }

      shouldFetchMarketData(regime: Regime): boolean {
        // More aggressive: fetch during all regimes
        // But don't execute trades during bearish
      }
    }
    ```
  - [ ] Integrate with existing regime detection (don't modify existing logic)
  - [ ] Create execution guard layer:
    - Check regime before any API call
    - Check regime before placing orders
    - Log all blocked executions with reason
  - [ ] Add observability:
    - Metric: `regime_skipped_executions` (counter)
    - Metric: `regime_type` (gauge with current regime)
    - Metric: `regime_confidence` (gauge)

### 2.3 Execution Fan-Out Architecture
- **Deliverable**: Convert shared market decision into per-user execution plans
- **Tasks**:
  - [ ] Create `src/services/execution/fan-out.ts`:
    ```typescript
    class ExecutionFanOut {
      async fanOutTradeDecision(
        decision: TradeDecision,
        activeUsers: User[]
      ): Promise<ExecutionPlan[]> {
        // For each user:
        // 1. Validate bot is running
        // 2. Check user balance on exchange
        // 3. Apply pyramiding rules from .env
        // 4. Create user-specific execution plan
        // 5. Queue for execution (mgpg job)
        return executionPlans;
      }
    }
    ```
  - [ ] Respect per-user constraints:
    - User balance available
    - Max concurrent trades per user
    - Exchange rate limits
    - Pair-specific risk limits
  - [ ] Ensure idempotency (duplicate detection, safe retry)
  - [ ] Queue jobs for async execution (mgpg)

### 2.4 Pyramiding & Position Management
- **Deliverable**: Preserve existing .env pyramiding logic, expose via config system
- **Critical**: Don't modify existing rules
- **Tasks**:
  - [ ] Parse existing pyramiding variables from .env:
    - `PYRAMID_LAYERS` (number of buy levels)
    - `PYRAMID_INITIAL_INVESTMENT` (first buy amount)
    - `PYRAMID_MULTIPLIER` (each layer size multiplier)
    - `PYRAMID_PROFIT_TARGET` (exit criteria)
    - `PYRAMID_STOP_LOSS` (risk limit)
  - [ ] Create `src/config/pyramiding.ts`:
    ```typescript
    export const pyramidingRules = {
      layers: parseInt(process.env.PYRAMID_LAYERS || '3'),
      initialInvestment: parseFloat(process.env.PYRAMID_INITIAL_INVESTMENT || '100'),
      multiplier: parseFloat(process.env.PYRAMID_MULTIPLIER || '1.5'),
      profitTarget: parseFloat(process.env.PYRAMID_PROFIT_TARGET || '5'),
      stopLoss: parseFloat(process.env.PYRAMID_STOP_LOSS || '3'),
    };
    ```
  - [ ] Create position calculator:
    ```typescript
    class PositionCalculator {
      calculatePyramidLevels(initialCapital: number): Level[] {
        // Apply pyramiding rules
        // Return: positions to open at each price level
      }

      calculateExitPrice(entryPrice: number, riskTarget: number): number {
        // Calculate exit price based on profit target
      }
    }
    ```
  - [ ] Never hardcode rules - always read from config

---

## Phase 3: Exchange Integration Framework (Week 5-6)

### 3.1 Exchange Adapter Interface
- **Deliverable**: Pluggable adapter system for Kraken, Binance, Coinbase
- **Tasks**:
  - [ ] Create `src/services/exchanges/types.ts`:
    ```typescript
    export interface ExchangeAdapter {
      // Connection
      connect(keys: ApiKeys): Promise<void>;
      validateConnection(): Promise<boolean>;

      // Orders
      placeOrder(order: Order): Promise<OrderResult>;
      cancelOrder(orderId: string): Promise<void>;
      getOrder(orderId: string): Promise<Order>;
      listOpenOrders(pair: string): Promise<Order[]>;

      // Account
      getBalances(): Promise<Balance[]>;
      getBalance(asset: string): Promise<Balance>;

      // Market Data
      getTicker(pair: string): Promise<Ticker>;
      getOHLCV(pair: string, timeframe: string): Promise<OHLCV[]>;

      // Metadata
      getSupportedPairs(): Promise<string[]>;
      getMinOrderSize(pair: string): Promise<number>;
    }
    ```
  - [ ] Implement Kraken adapter: `src/services/exchanges/kraken.ts`
  - [ ] Implement Binance adapter: `src/services/exchanges/binance.ts`
  - [ ] Create adapter factory: `src/services/exchanges/factory.ts`
    ```typescript
    export function createAdapter(exchange: 'kraken' | 'binance'): ExchangeAdapter {
      switch (exchange) {
        case 'kraken': return new KrakenAdapter();
        case 'binance': return new BinanceAdapter();
      }
    }
    ```
  - [ ] Each adapter handles:
    - API endpoint routing
    - Authentication/signing
    - Error handling
    - Rate limiting
    - Response parsing

### 3.2 API Key Management
- **Deliverable**: Secure, encrypted key storage with validation
- **Tasks**:
  - [ ] Create `src/lib/crypto.ts`:
    ```typescript
    export class KeyEncryption {
      encrypt(plaintext: string): string {
        // Use libsodium or Node crypto
        // Return encrypted + nonce
      }

      decrypt(ciphertext: string): string {
        // Reverse encryption
      }
    }
    ```
  - [ ] Create `src/services/api-keys/manager.ts`:
    ```typescript
    class ApiKeyManager {
      async storeKeys(
        userId: string,
        exchange: string,
        publicKey: string,
        secretKey: string
      ): Promise<void> {
        // Validate format
        // Encrypt both keys
        // Store in DB
        // Test connection (don't log result)
      }

      async getKeys(userId: string, exchange: string): Promise<ApiKeys> {
        // Fetch from DB
        // Decrypt
        // Return (never log)
      }

      async validateConnection(exchange: string, keys: ApiKeys): Promise<boolean> {
        // Make minimal API call (e.g., fetch balance)
        // Return true/false
        // Log only success/failure, never keys
      }

      async rotateKeys(userId: string, exchange: string): Promise<void> {
        // Store new keys
        // Test connection
        // Mark old keys for deletion after N days
      }
    }
    ```
  - [ ] Add strict logging rules:
    - Never log API keys (plaintext or encrypted)
    - Log only connection success/failure
    - Log only operation type and timestamp
  - [ ] Test rotation without exposing keys

---

## Phase 4: Backend Infrastructure (Week 7-8)

### 4.1 Job & Event System (mgpg)
- **Deliverable**: Replace BullMQ with mgpg for job queuing
- **Tasks**:
  - [ ] Set up mgpg connection pool
  - [ ] Create `src/services/jobs/types.ts`:
    ```typescript
    export interface Job<T = any> {
      id: string;
      type: 'trade_execution' | 'trade_alert' | 'billing_sync' | 'market_data_fetch';
      payload: T;
      status: 'pending' | 'processing' | 'completed' | 'failed';
      retries: number;
      maxRetries: number;
      createdAt: Date;
      processedAt?: Date;
    }
    ```
  - [ ] Create job types:
    - `trade_execution`: Place orders, manage positions
    - `trade_alert`: Send email alerts
    - `billing_sync`: Sync Stripe subscriptions
    - `market_data_fetch`: Fetch and cache market data
    - `regime_check`: Check market regime
  - [ ] Create `src/services/jobs/queue.ts`:
    ```typescript
    class JobQueue {
      async enqueue<T>(type: string, payload: T, options?: JobOptions): Promise<string>;
      async process(type: string, handler: (job: Job) => Promise<void>): Promise<void>;
      async retry(jobId: string, delayMs?: number): Promise<void>;
    }
    ```
  - [ ] Implement retry logic with exponential backoff
  - [ ] Ensure all trade execution jobs are idempotent
  - [ ] Add dead-letter queue for failed jobs
  - [ ] Monitor queue depth and processing latency

### 4.2 Caching & Session Strategy
- **Deliverable**: Minimal Redis usage, prefer UNLOGGED tables for high-volume data
- **Tasks**:
  - [ ] Identify what needs to be cached:
    - Market data → UNLOGGED `market_data_cache` table
    - Trade history → UNLOGGED `trades` table
    - Sessions → Use `sessions` table (logged for security)
    - Rate limit counters → Redis (ephemeral, fast)
  - [ ] Create `src/lib/cache.ts`:
    ```typescript
    interface CacheConfig {
      ttlMs: number;
      storage: 'memory' | 'postgres' | 'redis';
    }

    class Cache {
      set<T>(key: string, value: T, config: CacheConfig): Promise<void>;
      get<T>(key: string): Promise<T | null>;
      delete(key: string): Promise<void>;
    }
    ```
  - [ ] Minimize Redis usage (only for rate limiting, temporary counters)
  - [ ] Use database triggers to clean up old data in UNLOGGED tables

### 4.3 API Rate Limiting
- **Deliverable**: Per-user, per-exchange rate limiting
- **Tasks**:
  - [ ] Create `src/middleware/rate-limit.ts`:
    ```typescript
    export function createRateLimiter(options: RateLimitConfig) {
      return async (req, res, next) => {
        const userId = req.user?.id;
        const key = `ratelimit:${userId}`;

        const count = await redis.incr(key);
        if (count === 1) {
          redis.expire(key, options.windowSeconds);
        }

        if (count > options.maxRequests) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        next();
      };
    }
    ```
  - [ ] Apply to:
    - Exchange API calls (per exchange, per user)
    - Market data fetch (global, shared)
    - User-facing API endpoints
  - [ ] Respect exchange-specific limits (Kraken, Binance, Coinbase)

---

## Phase 5: Authentication & Authorization (Week 9)

### 5.1 next-auth Setup
- **Deliverable**: Secure auth with Google Cloud & email/password flows
- **Tasks**:
  - [ ] Create `src/auth/auth.ts`:
    ```typescript
    import NextAuth from 'next-auth';
    import GoogleProvider from 'next-auth/providers/google';
    import CredentialsProvider from 'next-auth/providers/credentials';

    export const auth = NextAuth({
      providers: [
        GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
        CredentialsProvider({
          async authorize(credentials) {
            // Email/password login
            // Hash password using bcrypt
            // Return user object or null
          },
        }),
      ],
      callbacks: {
        async jwt({ token, user, account }) {
          // Add user ID to token
          if (user) {
            token.sub = user.id;
          }
          return token;
        },
        async session({ session, token }) {
          session.user.id = token.sub!;
          return session;
        },
      },
      pages: {
        signIn: '/login',
        error: '/login',
      },
    });
    ```
  - [ ] Create sign-up flow: `src/app/signup/page.tsx`
    - Email validation
    - Password strength requirements
    - Terms acceptance
    - Send verification email
  - [ ] Create sign-in flow: `src/app/login/page.tsx`
    - Email/password form
    - "Sign in with Google" button
    - "Forgot password" link
  - [ ] Create password reset flow:
    - Generate secure reset token
    - Send email with reset link
    - Validate token, allow password change
    - Invalidate all other sessions

### 5.2 Session & Token Management
- **Deliverable**: Secure, hardened session handling
- **Tasks**:
  - [ ] Store sessions in database (not memory):
    ```typescript
    class SessionStore {
      async create(userId: string): Promise<Session>;
      async get(sessionId: string): Promise<Session | null>;
      async delete(sessionId: string): Promise<void>;
      async deleteAllForUser(userId: string): Promise<void>;
    }
    ```
  - [ ] Add session expiry (24-30 days)
  - [ ] Add logout endpoint that deletes session
  - [ ] Add "logout all devices" endpoint
  - [ ] Implement CSRF token validation on state-changing endpoints

### 5.3 Role-Based Access Control (RBAC)
- **Deliverable**: User roles and permission system
- **Tasks**:
  - [ ] Define roles:
    - `user`: Can create bots, execute trades, view alerts
    - `admin`: Can view all users, disable accounts, export data
    - `billing`: Can manage subscriptions
  - [ ] Create `src/middleware/authorize.ts`:
    ```typescript
    export function requireRole(...roles: string[]) {
      return async (req, res, next) => {
        const session = await getSession({ req });
        if (!session || !roles.includes(session.user.role)) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        next();
      };
    }
    ```
  - [ ] Enforce on API routes and pages

---

## Phase 6: Stripe Billing & Webhooks (Week 10)

### 6.1 Subscription Plans & Checkout
- **Deliverable**: Stripe integration for subscription management
- **Tasks**:
  - [ ] Define plan tiers in `src/config/billing.ts`:
    ```typescript
    export const plans = {
      free: {
        id: 'free',
        name: 'Free',
        price: 0,
        maxBots: 1,
        maxPairs: 1,
        features: ['basic_alerts'],
      },
      pro: {
        id: 'price_pro_monthly',
        name: 'Pro',
        price: 29,
        maxBots: 3,
        maxPairs: 5,
        features: ['all_alerts', 'advanced_analytics'],
      },
      enterprise: {
        id: 'price_enterprise_monthly',
        name: 'Enterprise',
        price: 99,
        maxBots: 10,
        maxPairs: 20,
        features: ['all_alerts', 'advanced_analytics', 'api_access'],
      },
    };
    ```
  - [ ] Create checkout flow: `src/app/api/billing/checkout.ts`
    ```typescript
    export async function POST(req) {
      const { planId } = await req.json();
      const session = await getSession({ req });

      const checkoutSession = await stripe.checkout.sessions.create({
        customer_email: session.user.email,
        metadata: { userId: session.user.id },
        line_items: [{ price: plans[planId].id, quantity: 1 }],
        mode: 'subscription',
        success_url: `${BASE_URL}/billing/success`,
        cancel_url: `${BASE_URL}/billing`,
      });

      return res.json({ url: checkoutSession.url });
    }
    ```
  - [ ] Create pricing page: `src/app/pricing/page.tsx`
    - Display plans with features
    - "Get Started" buttons for each plan
    - FAQ section

### 6.2 Webhook Event Handling
- **Deliverable**: Secure Stripe webhook processing
- **Tasks**:
  - [ ] Create webhook endpoint: `src/app/api/webhooks/stripe.ts`
    ```typescript
    export async function POST(req) {
      const sig = req.headers['stripe-signature']!;
      const body = await req.text();

      let event;
      try {
        event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
      } catch (err) {
        return res.status(400).json({ error: 'Invalid signature' });
      }

      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await handleSubscriptionUpdate(event.data.object);
          break;
        case 'customer.subscription.deleted':
          await handleSubscriptionCancelled(event.data.object);
          break;
        case 'invoice.payment_failed':
          await handlePaymentFailed(event.data.object);
          break;
        default:
          // Log unexpected event type
      }

      res.json({ received: true });
    }
    ```
  - [ ] Handle events:
    - `customer.subscription.created`: Update user plan tier
    - `customer.subscription.updated`: Update current period dates, handle tier changes
    - `customer.subscription.deleted`: Downgrade to free plan
    - `invoice.payment_failed`: Send email, disable bots, set grace period
    - `invoice.payment_succeeded`: Clear grace period
  - [ ] Implement idempotent webhook processing (use idempotency key)
  - [ ] Queue webhook events for async processing (mgpg)
  - [ ] Log all webhook events for auditing

### 6.3 Plan Enforcement
- **Deliverable**: Validate user limits against active plan
- **Tasks**:
  - [ ] Create `src/services/billing/plan-enforcer.ts`:
    ```typescript
    class PlanEnforcer {
      async canCreateBot(userId: string): Promise<boolean> {
        const subscription = await getSubscription(userId);
        const botCount = await countBots(userId);
        return botCount < plans[subscription.planTier].maxBots;
      }

      async canAddPair(userId: string, pair: string): Promise<boolean> {
        const subscription = await getSubscription(userId);
        const pairCount = await countUniquePairs(userId);
        return pairCount < plans[subscription.planTier].maxPairs;
      }
    }
    ```
  - [ ] Check limits before:
    - Creating new bot
    - Adding pair to existing bot
    - Starting bot
  - [ ] Return user-friendly error messages
  - [ ] Show upgrade prompts in UI

---

## Phase 7: Email System (Week 11)

### 7.1 Resend Integration
- **Deliverable**: Transactional emails via Resend
- **Tasks**:
  - [ ] Create `src/services/email/resend.ts`:
    ```typescript
    import { Resend } from 'resend';

    const resend = new Resend(process.env.RESEND_API_KEY);

    export class EmailService {
      async sendSignupEmail(to: string, verificationLink: string) {
        // Send signup verification email
      }

      async sendPasswordResetEmail(to: string, resetLink: string) {
        // Send password reset email
      }

      async sendTradeAlertEmail(to: string, trade: Trade) {
        // Send trade execution alert
      }

      async sendBillingEmail(to: string, type: 'invoice' | 'failed_payment' | 'subscription_updated') {
        // Send billing-related emails
      }

      async sendReferralEmail(to: string, referralLink: string) {
        // Optional: referral invitations
      }
    }
    ```
  - [ ] All emails queue as jobs (mgpg)
  - [ ] Log email sends to UNLOGGED `email_log` table
  - [ ] Implement retry logic (up to 3 attempts)

### 7.2 Email Templates
- **Deliverable**: React-based email templates
- **Tasks**:
  - [ ] Create templates in `src/emails/`:
    ```
    /src/emails
      /templates
        SignupVerification.tsx
        PasswordReset.tsx
        TradeAlert.tsx
        InvoiceReceipt.tsx
        PaymentFailed.tsx
        SubscriptionUpdated.tsx
    ```
  - [ ] Use React Email library or similar
  - [ ] Template content:
    - **Signup Verification**: Welcome message, verify email link, 24hr expiry
    - **Password Reset**: Reset link, 1hr expiry, security warning
    - **Trade Alert**: Pair, entry price, take profit, stop loss, chart
    - **Invoice Receipt**: Plan tier, amount, payment date, invoice link
    - **Payment Failed**: Reason, retry link, grace period info
    - **Subscription Updated**: New tier, features, effective date
  - [ ] Centralized styles and branding
  - [ ] Mobile-responsive design
  - [ ] No external image dependencies (inline SVGs only)

---

## Phase 8: Frontend Architecture (Week 12-13)

### 8.1 Mobile-First Component System
- **Deliverable**: Reusable, accessible components with Tailwind CSS
- **Tasks**:
  - [ ] Set up Tailwind CSS with light/dark mode via class strategy:
    ```js
    // tailwind.config.js
    module.exports = {
      darkMode: 'class',
      // ...
    };
    ```
  - [ ] Create component library in `src/components/`:
    ```
    /src/components
      /ui
        Button.tsx
        Card.tsx
        Input.tsx
        Select.tsx
        Modal.tsx
        Alert.tsx
        Badge.tsx
        Table.tsx
        Form.tsx
        Toast.tsx
      /layout
        Header.tsx
        Sidebar.tsx
        Footer.tsx
      /forms
        LoginForm.tsx
        SignupForm.tsx
        BotConfigForm.tsx
        ExchangeKeysForm.tsx
      /trading
        BotCard.tsx
        TradeHistory.tsx
        PositionManager.tsx
        PerformanceChart.tsx
    ```
  - [ ] Implement dark mode:
    ```tsx
    export function DarkModeToggle() {
      const [isDark, setIsDark] = useState(false);

      const toggle = () => {
        setIsDark(!isDark);
        document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'light' : 'dark');
      };

      return <button onClick={toggle}>Toggle Theme</button>;
    }
    ```
  - [ ] All components:
    - Mobile-first responsive (sm, md, lg, xl breakpoints)
    - Accessibility (ARIA labels, keyboard navigation)
    - Light/dark mode support
    - Reusable props pattern

### 8.2 Form System with Validation
- **Deliverable**: Consistent form handling with field validation
- **Tasks**:
  - [ ] Create form builder: `src/components/Form.tsx`
    ```tsx
    export function Form<T extends Record<string, any>>({
      fields: FormField<T>[],
      onSubmit: (data: T) => Promise<void>,
      submitButtonLabel: string,
    }) {
      const [errors, setErrors] = useState<Partial<T>>({});
      const [isSubmitting, setIsSubmitting] = useState(false);

      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        // Validate fields
        // Call onSubmit
        setIsSubmitting(false);
      };

      return (
        <form onSubmit={handleSubmit}>
          {fields.map(field => (
            <FormField key={field.name} {...field} error={errors[field.name]} />
          ))}
          <Button disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Loading...' : submitButtonLabel}
          </Button>
        </form>
      );
    }
    ```
  - [ ] Create field validators:
    ```typescript
    export const validators = {
      email: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : 'Invalid email',
      password: (value: string) => value.length >= 8 ? null : 'Password must be 8+ characters',
      required: (value: string) => value ? null : 'Required',
      apiKey: (value: string) => value.length > 0 ? null : 'API key required',
    };
    ```
  - [ ] Disable submit button until form is valid
  - [ ] Show validation errors inline
  - [ ] Handle async validation (e.g., email uniqueness)

### 8.3 Page Structure
- **Deliverable**: Complete page layouts
- **Tasks**:
  - [ ] Authentication pages:
    - `/login` - Email/password + Google OAuth
    - `/signup` - Email/password registration
    - `/forgot-password` - Email-based reset
    - `/reset-password/[token]` - Password reset form
  - [ ] Dashboard pages:
    - `/dashboard` - Overview, active bots, recent trades
    - `/bots` - List, create, edit, delete bots
    - `/bots/[id]/settings` - Bot configuration
    - `/trading/history` - Trade history with filters
    - `/trading/positions` - Open positions, P&L
  - [ ] Account pages:
    - `/account/profile` - User info, 2FA
    - `/account/api-keys` - Manage exchange keys
    - `/account/settings` - Preferences, notifications
  - [ ] Billing pages:
    - `/billing` - Current plan, usage, upgrade
    - `/billing/success` - Post-checkout success
    - `/billing/history` - Invoice history
  - [ ] All pages:
    - Mobile-responsive
    - Loading states
    - Error boundaries
    - Empty states

---

## Phase 9: Trade Alerts & Observability (Week 14-15)

### 9.1 Trade Alert System
- **Deliverable**: Email alerts for trade executions
- **Tasks**:
  - [ ] Create alert manager: `src/services/alerts/trade-alerts.ts`
    ```typescript
    class TradeAlertManager {
      async onTradeExecuted(trade: Trade, botInstance: BotInstance, user: User) {
        if (!user.emailPreferences.tradeAlerts) return;

        const alert = {
          type: 'trade_execution',
          pair: trade.pair,
          side: trade.side,
          entryPrice: trade.price,
          timestamp: new Date(),
        };

        // Queue email job
        await jobQueue.enqueue('trade_alert', {
          userId: user.id,
          to: user.email,
          alert,
        });
      }
    }
    ```
  - [ ] Create email template for trade alerts
  - [ ] Create user preference system:
    - Email for all trades (on/off)
    - Email for losses only (on/off)
    - Email digest (real-time / daily / weekly)
  - [ ] Add to `src/app/account/notifications/page.tsx`

### 9.2 Observability & Monitoring
- **Deliverable**: Structured logging and metrics
- **Tasks**:
  - [ ] Set up structured logging: `src/lib/logger.ts`
    ```typescript
    export const logger = {
      info: (message: string, context?: Record<string, any>) =>
        console.log(JSON.stringify({ level: 'info', timestamp: new Date(), message, ...context })),

      error: (message: string, error?: Error, context?: Record<string, any>) =>
        console.error(JSON.stringify({ level: 'error', timestamp: new Date(), message, error: error?.message, ...context })),

      warn: (message: string, context?: Record<string, any>) =>
        console.warn(JSON.stringify({ level: 'warn', timestamp: new Date(), message, ...context })),
    };
    ```
  - [ ] Log key events:
    - User sign-up, sign-in, password reset
    - Bot creation, deletion, start, stop
    - Trade execution, cancellation, failure
    - API call (exchange, market data, regime check)
    - Regime skipped execution
    - Billing events (subscription, payment, failure)
    - Email sent, failed
  - [ ] Create metrics:
    - `api_calls_total` (counter) - by exchange, by type
    - `trades_executed_total` (counter) - by pair, by result
    - `regime_type` (gauge) - current market regime
    - `active_bots` (gauge) - per user, global
    - `active_subscriptions` (gauge) - by tier
    - `email_sent_total` (counter) - by type, result
    - `job_queue_depth` (gauge) - by job type
  - [ ] Export metrics endpoint: `/api/metrics` (Prometheus format)

### 9.3 Error Tracking & Alerting
- **Deliverable**: Error tracking and notification
- **Tasks**:
  - [ ] Set up Sentry or similar error tracking
  - [ ] Configure error budget alerts:
    - Alert if error rate > 1% in 5 min window
    - Alert if specific error types spike
  - [ ] Create dashboard with:
    - Recent errors
    - Error trends
    - Affected users count

---

## Phase 10: AI Abstraction Layer (Week 16)

### 10.1 LLM Provider Interface
- **Deliverable**: Abstract AI model selection
- **Tasks**:
  - [ ] Create LLM provider interface: `src/lib/ai/provider.ts`
    ```typescript
    export interface LLMProvider {
      generateCompletion(prompt: string, options?: GenerationOptions): Promise<string>;
      generateEmbedding(text: string): Promise<number[]>;
      countTokens(text: string): number;
    }

    export class OpenAIProvider implements LLMProvider {
      // Implementation using OpenAI API
    }

    export class ClaudeProvider implements LLMProvider {
      // Implementation using Anthropic API
    }
    ```
  - [ ] Create provider factory:
    ```typescript
    export function createLLMProvider(provider: 'openai' | 'claude'): LLMProvider {
      switch (provider) {
        case 'openai': return new OpenAIProvider();
        case 'claude': return new ClaudeProvider();
        default: return new OpenAIProvider();
      }
    }
    ```
  - [ ] Select provider via env: `LLM_PROVIDER=openai`
  - [ ] Use in market regime detection, trade analysis, etc.

---

## Phase 11: Load Testing & Optimization (Week 17-18)

### 11.1 Load Testing
- **Deliverable**: Validate architecture scales to 5000+ users
- **Tasks**:
  - [ ] Create load test script: `scripts/load-test.ts`
    - Simulate 5000 concurrent users
    - Each user: creates 2 bots, checks market data, executes trades
    - Measure:
      - API latency (p50, p95, p99)
      - Database query latency
      - Job queue depth
      - Error rate
  - [ ] Test scenarios:
    - Normal market data fetch (all users subscribe to same data)
    - Trade execution fan-out (one decision → 5000 users)
    - Regime gatekeeper (block all executions during bearish)
  - [ ] Load test database (PostgreSQL max connections, query performance)
  - [ ] Load test job queue (mgpg throughput)

### 11.2 Performance Optimization
- **Deliverable**: Sub-second latency at scale
- **Tasks**:
  - [ ] Database optimization:
    - [ ] Add indexes on frequently queried columns
    - [ ] Use UNLOGGED tables for high-volume ephemeral data
    - [ ] Connection pooling (PgBouncer)
    - [ ] Query optimization (EXPLAIN ANALYZE)
  - [ ] API optimization:
    - [ ] Compress responses (gzip)
    - [ ] Implement request deduplication
    - [ ] Cache market data aggressively
  - [ ] Frontend optimization:
    - [ ] Code splitting
    - [ ] Lazy loading
    - [ ] Image optimization
    - [ ] CSS/JS minification

---

## Phase 12: Security Hardening (Week 19-20)

### 12.1 Security Review Checklist
- **Deliverable**: Security audit and fixes
- **Tasks**:
  - [ ] **Authentication & Authorization**
    - [ ] CSRF protection on all state-changing endpoints
    - [ ] Password hashing with bcrypt (salt rounds ≥ 12)
    - [ ] Session fixation prevention
    - [ ] Rate limiting on login attempts
    - [ ] 2FA support (optional)
  - [ ] **API Key Handling**
    - [ ] Never log plaintext keys
    - [ ] Encrypt keys at rest
    - [ ] Use encryption key rotation
    - [ ] Validate keys on first use
  - [ ] **Webhook Security**
    - [ ] Validate Stripe webhook signatures
    - [ ] Idempotent processing
    - [ ] Rate limiting on webhook endpoint
  - [ ] **Data Protection**
    - [ ] HTTPS enforced (HSTS)
    - [ ] SQL injection prevention (parameterized queries)
    - [ ] XSS prevention (React sanitization)
    - [ ] CORS properly configured
  - [ ] **Billing & Payment**
    - [ ] Never store full credit card numbers
    - [ ] PCI DSS compliance (use Stripe's hosted checkout)
    - [ ] Validate subscription limits
  - [ ] **Audit Logging**
    - [ ] Log all security events
    - [ ] Retain logs for 90 days minimum
    - [ ] Monitor suspicious patterns

### 12.2 Dependency Security
- **Deliverable**: Secure dependency management
- **Tasks**:
  - [ ] Configure `npm audit` in CI/CD
  - [ ] Use Dependabot or Renovate for updates
  - [ ] Review major version upgrades manually
  - [ ] Pin security-critical dependencies

---

## Phase 13: Testing & QA (Week 21-22)

### 13.1 Unit & Integration Tests
- **Deliverable**: > 70% code coverage
- **Tasks**:
  - [ ] Test strategy:
    - API routes (happy path + error cases)
    - Exchange adapters (with mock APIs)
    - Job queue (enqueue, process, retry)
    - Email system (template rendering)
    - Billing logic (plan enforcement)
  - [ ] Use Jest + Supertest for API testing
  - [ ] Mock external APIs (Stripe, Resend, Kraken, Binance, Coinbase)

### 13.2 End-to-End (E2E) Testing
- **Deliverable**: Critical user flows validated
- **Tasks**:
  - [ ] E2E flows to test:
    - Sign-up → email verification → login
    - Create bot → configure pairs → start bot
    - Execute trade → receive alert email → view in history
    - Upgrade subscription → plan limit enforced
    - Webhook: Stripe payment → subscription updated → email sent
  - [ ] Use Playwright or Cypress
  - [ ] Run in staging before production

---

## Phase 14: Deployment & Launch (Week 23-24)

### 14.1 Infrastructure Setup
- **Deliverable**: Production-ready deployment
- **Tasks**:
  - [ ] Choose hosting:
    - **Vercel** for Next.js frontend
    - **Railway** or **Render** for PostgreSQL
    - **GitHub Actions** for CI/CD
  - [ ] Environment management:
    - Separate .env files (dev, staging, prod)
    - Secret management (GitHub Secrets or Vercel Secrets)
    - No secrets in code
  - [ ] Database migrations:
    - Set up migration runner
    - Test migrations in staging first
    - Plan rollback strategy

### 14.2 CI/CD Pipeline
- **Deliverable**: Automated testing and deployment
- **Tasks**:
  - [ ] GitHub Actions workflow:
    ```yaml
    name: CI/CD
    on: [push, pull_request]
    jobs:
      test:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v3
          - uses: actions/setup-node@v3
            with:
              node-version: '18'
          - run: pnpm install
          - run: pnpm run type-check
          - run: pnpm run lint
          - run: pnpm run test
          - run: pnpm run build

      deploy:
        needs: test
        if: github.ref == 'refs/heads/main'
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v3
          - run: |
              curl -X POST https://api.vercel.com/v12/deployments \
                -H "Authorization: Bearer ${{ secrets.VERCEL_TOKEN }}" \
                -d '{"name":"nexus-trading","gitSource":{"type":"github","repo":"..."}}'
    ```
  - [ ] Staging environment for testing
  - [ ] Production deployment with rollback capability

### 14.3 Monitoring & Runbooks
- **Deliverable**: Operational readiness
- **Tasks**:
  - [ ] Set up monitoring dashboards:
    - API latency, error rate, throughput
    - Database performance
    - Job queue depth
    - Active bot count
  - [ ] Create runbooks for:
    - Database connection failures
    - Job queue backed up
    - Stripe webhook failures
    - Exchange API outages
    - Market regime stuck/stale data
  - [ ] Set up on-call alerting (PagerDuty or similar)

---

## Success Metrics & Milestones

### Milestones (Weeks 1-24)
- **Week 2**: Foundation complete, database initialized
- **Week 4**: Market data aggregation working, single-call architecture proven
- **Week 6**: All exchange adapters implemented
- **Week 9**: Authentication complete, users can sign up
- **Week 11**: Billing and emails working end-to-end
- **Week 13**: Frontend feature-complete
- **Week 15**: Observability in place, can diagnose issues
- **Week 18**: Load test passes (5000+ concurrent users)
- **Week 20**: Security audit completed and all findings addressed
- **Week 22**: All tests passing, E2E flows validated
- **Week 24**: Production launch ready

### Success Criteria
- ✅ **API Call Minimization**: < 1 API call per second for 5000 users (proven by load test)
- ✅ **Regime Protection**: 100% of executions respect regime gatekeeper
- ✅ **Scalability**: Handles 5000+ concurrent users with < 500ms p95 latency
- ✅ **Strategy Preservation**: No changes to existing pyramiding rules or execution logic
- ✅ **Security**: All API keys encrypted, no plaintext logs, webhook signatures validated
- ✅ **Reliability**: > 99.5% uptime, < 0.1% error rate
- ✅ **Code Quality**: > 70% test coverage, zero security vulnerabilities in dependencies

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| **Database performance at scale** | Use UNLOGGED tables for trades, connection pooling, extensive load testing |
| **Exchange API outages block all users** | Implement fallback data sources, circuit breaker, graceful degradation |
| **Regime gatekeeper bugs allow bad trades** | Extensive testing, logging, automated alerts on abnormal execution patterns |
| **Stripe webhook failures** | Webhook retries (Stripe), fallback polling, idempotent processing |
| **API key compromise** | Encryption at rest, secure rotation, limited-scope keys, activity logging |
| **Job queue backlog** | Monitoring, auto-scaling, dead-letter queue, prioritization |

---

## Team & Ownership (Suggested)

- **Backend/Trading Engine**: You (focus on market data, regime, execution fan-out, exchange adapters)
- **Frontend**: Design-focused developer (mobile-first UI, forms, accessibility)
- **DevOps/Infrastructure**: Automation-focused developer (CI/CD, monitoring, scaling)
- **QA**: Test-focused developer (unit tests, E2E, load testing, security)

---

## Next Steps

1. **Approve this plan** and clarify any requirements
2. **Set up project repository** with structure outlined in Phase 1.1
3. **Begin Phase 1** (Foundation & Architecture)
4. **Weekly sync** to review progress, unblock issues
5. **Iterate** based on learnings from implementation

---

## Appendix: Key Files to Create

- `src/config/environment.ts` - Typed environment variables
- `src/config/pyramiding.ts` - Pyramiding rules (DO NOT HARDCODE)
- `src/services/market-data/aggregator.ts` - Single-call market data
- `src/services/regime/gatekeeper.ts` - Regime check & execution guard
- `src/services/execution/fan-out.ts` - Per-user execution plans
- `src/services/exchanges/types.ts` - Exchange adapter interface
- `src/services/exchanges/factory.ts` - Exchange adapter factory
- `src/services/exchanges/kraken.ts` - Kraken adapter
- `src/services/exchanges/binance.ts` - Binance adapter
- `src/services/exchanges/coinbase.ts` - Coinbase adapter
- `src/services/api-keys/manager.ts` - Secure key storage & validation
- `src/services/jobs/queue.ts` - mgpg job queue
- `src/services/billing/plan-enforcer.ts` - Subscription limits
- `src/services/email/resend.ts` - Email service
- `src/lib/ai/provider.ts` - LLM provider abstraction
- `src/lib/logger.ts` - Structured logging
- `src/middleware/rate-limit.ts` - Rate limiting
- `src/middleware/authorize.ts` - RBAC middleware
- `src/auth/auth.ts` - next-auth configuration
- `src/emails/templates/` - Email templates
- `src/components/` - React component library
- Database migration files
- Test files for all services
