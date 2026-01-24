# NexusMeme Performance Fees

## The Rule

**5% of profits. No profits, no fee.**

That's it. No tiers, no caps, no hidden charges. Everyone pays the same rate.

---

## How It Works

1. Your bot closes a trade with profit
2. Platform records 5% of that profit as a fee
3. On the 1st of each month, all pending fees are charged to your card
4. You get a receipt email

### Example

```
Trade closes with $500 profit
  Fee: 5% of $500 = $25
  You keep: $475

Monthly invoice (1st of month):
  All pending fees charged in one payment
```

### Minimum Invoice

Fees under $1.00 roll forward to the next month. No micro-charges.

---

## What Users See

**Dashboard → Billing:**

```
Your Profits This Month:  $1,250.00
Platform Fee (5%):           $62.50
You Keep:                 $1,187.50
```

---

## FAQ (User-Facing)

**Q: How much do I pay?**
A: 5% of profits. If your bot makes $100, we take $5.

**Q: What if my bot loses money?**
A: You pay nothing. Fees only apply to profitable trades.

**Q: Are there discounts for bigger accounts?**
A: No. Everyone pays the same 5%. Fair is fair.

**Q: When am I charged?**
A: 1st of each month, automatically from your saved card.

**Q: Are there hidden fees?**
A: No. Just 5% of profits.

**Q: What if my card is declined?**
A: Stripe retries up to 3 times over 5 days. Update your card to avoid bot suspension.

---

## Technical Implementation

### Environment Variables

```bash
PERFORMANCE_FEE_RATE=0.05              # 5% (configurable)
PERFORMANCE_FEE_MIN_INVOICE_USD=1.00   # Roll forward if under $1
```

### Key Files

| File | Purpose |
|------|---------|
| `src/config/environment.ts` | Fee rate + min invoice config |
| `src/services/billing/performance-fee.ts` | Fee recording & management |
| `src/services/billing/monthly-billing-job.ts` | Monthly billing (1st, 2AM UTC) |
| `src/services/billing/stripe-webhook-handler.ts` | Payment event processing |
| `src/migrations/013_performance_fee_billing.sql` | Database schema |

### Stripe Setup

NexusMeme uses **Invoice Items + Invoices** (not Products/Prices) because fees are variable:

1. **SetupIntent** - One-time card authorization on first bot creation
2. **InvoiceItem** - Created monthly with aggregated fee total
3. **Invoice** - Auto-finalized, auto-charged to saved card
4. **Webhooks** - `invoice.paid`, `invoice.payment_failed`, `charge.refunded`

No Stripe Products or recurring Subscriptions needed.

### Billing Flow

```
Trade closes profitably
    ↓
recordPerformanceFee() → status: pending_billing
    ↓
Monthly job (1st of month, 2AM UTC)
    ↓
getPendingFeesPerUser() → skips if total < $1.00
    ↓
stripe.invoiceItems.create() + stripe.invoices.create()
    ↓
Stripe auto-charges card
    ↓
Webhook: invoice.paid → markFeesAsPaid()
    ↓
Receipt email sent
```

### Payment Failure Flow

```
Card declined → status: past_due
    ↓
Stripe retries (up to 3x over 5 days)
    ↓
Dunning email after each failure
    ↓
After 3 failures → billing_status: suspended
    ↓
Bot pause scheduled (24h grace)
    ↓
User updates card → Stripe retries → resolved
```

### Admin Controls

| Endpoint | Purpose |
|----------|---------|
| `GET /api/admin/fees` | List all fees |
| `POST /api/admin/fees/adjust` | Correct P&L error |
| `POST /api/admin/fees/waive` | Waive pending fee |
| `POST /api/admin/fees/refund` | Refund paid fee |

### Database Tables

| Table | Purpose |
|-------|---------|
| `performance_fees` | Per-trade fee records |
| `user_stripe_billing` | Stripe customer + card |
| `fee_charge_history` | Monthly charge audit |
| `billing_runs` | Billing cycle audit |
| `fee_adjustments_audit` | Admin action log |

---

## Design Decisions

1. **Flat 5% for everyone** - Simple, fair, explainable in one sentence
2. **Monthly billing** - Reduces transaction volume, one invoice per month
3. **$1.00 minimum** - No annoying micro-charges
4. **Stripe Invoices (not Subscriptions)** - Variable amounts don't fit subscription model
5. **SetupIntent** - One-time card auth, safe for unattended monthly charges
6. **No tiers, no caps** - Complexity creates confusion and support tickets
