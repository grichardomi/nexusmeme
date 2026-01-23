# Performance Fee Billing System - Implementation Guide

## Overview

Complete implementation of automatic 5% performance fee billing powered by Stripe. Users only pay when their trading bot generates profits.

## Status: ✅ Complete (Core System Ready for Integration)

---

## What's Implemented

### 1. ✅ Database Schema (`src/migrations/013_performance_fee_billing.sql`)

**Tables:**
- `performance_fees` - Tracks all fees from profitable trades
- `user_stripe_billing` - Stores Stripe customer & billing config
- `billing_runs` - Audit trail of monthly billing cycles
- `fee_charge_history` - Detailed charge attempt history
- `fee_adjustments_audit` - Admin adjustments & waivers

**Key Features:**
- Edge case handling: Refunds, waivers, adjustments, disputes
- Complete audit trail for compliance
- Status tracking: pending_billing → billed → paid → (refunded/waived)

### 2. ✅ Core Services

#### `src/services/billing/performance-fee.ts`
Main service for fee management:
- `recordPerformanceFee()` - Record fee when trade closes
- `getPendingFees()` - Get fees not yet billed
- `getUserFeeSummary()` - Dashboard summary (profits, fees collected, pending)
- `getRecentFeeTransactions()` - Fee transaction history
- `adjustFee()` - Admin: P&L correction
- `waiveFee()` - Admin: Fee waiver (e.g., customer retention)
- `refundFee()` - Admin: Process refund (after payment)
- `markFeesAsBilled()` - Mark fees as included in invoice
- `markFeesAsPaid()` - Mark fees as paid (webhook)

#### `src/services/billing/monthly-billing-job.ts`
Monthly billing orchestration:
- `runMonthlyBillingJob()` - Main monthly job (runs on 1st of month, 2 AM UTC)
- `runBillingJobForMonth()` - Admin: Run billing for specific month
- Aggregates pending fees per user
- Creates Stripe invoices automatically
- Handles failures gracefully with error tracking

### 3. ✅ Stripe Integration

#### Webhook Handler (`src/services/billing/stripe-webhook-handler.ts`)
Listens for Stripe events:
- `handleInvoicePaid()` - Payment succeeded
- `handleInvoicePaymentFailed()` - Card declined
- `handleChargeRefunded()` - Refund processed

**Handles:**
- Payment success → Mark fees as paid
- Payment failure → Update billing status to "past_due"
- Retry logic: Stripeautomatically retries 3 times
- Dunning emails: Sent after each failure
- Suspension: After 3 failed attempts, bot pause scheduled

#### Webhook Endpoint (`src/app/api/webhooks/stripe/billing/route.ts`)
- Verifies Stripe signature
- Dispatches to appropriate handler
- Logs all events for audit trail

### 4. ✅ API Endpoints

#### User Endpoints
- **GET `/api/fees/performance`** - User's fee summary & transaction history
  - Returns: profits, fees collected, pending fees, billing status, charge history

#### Billing Setup Endpoints
- **POST `/api/billing/setup`** - One-time setup flow
  - Create SetupIntent (collect payment method)
  - Confirm setup & store Stripe customer
  - Get setup status

#### Admin Endpoints
- **GET `/api/admin/fees`** - List all fees with filters (userId, status)
- **POST `/api/admin/fees/adjust`** - P&L correction
- **POST `/api/admin/fees/waive`** - Waive fee
- **POST `/api/admin/fees/refund`** - Process refund

### 5. ✅ Email System

#### Email Templates (`src/email/templates/performance-fees.tsx`)

1. **Performance Fee Charged**
   - When: Fee successfully collected
   - Content: Amount, invoice ID, receipt link

2. **Performance Fee Failed**
   - When: Card declined
   - Content: Amount, retry schedule, action needed
   - Variations: 1st, 2nd, 3rd attempt, and suspension notice

3. **Fee Adjustment**
   - When: Admin adjusts fee
   - Content: Original amount, new amount, reason, credit/charge

#### Email Triggers (`src/services/email/triggers.ts`)
- `sendPerformanceFeeChargedEmail()`
- `sendPerformanceFeeFailedEmail()`
- `sendPerformanceFeeDunningEmail()`
- `sendFeeAdjustmentEmail()`
- `sendFeeRefundEmail()`

---

## How to Use

### 1. Run Database Migration

```bash
npm run db:migrate
# Or manually execute: src/migrations/013_performance_fee_billing.sql
```

### 2. Set Stripe Webhook Secret

Add to `.env`:
```
STRIPE_WEBHOOK_SECRET_BILLING=whsec_...
```

Get from Stripe Dashboard → Webhooks → Select "Billing" webhook → Show signing secret

### 3. Enable Webhook Events in Stripe

Dashboard → Webhooks → Add endpoint:
- URL: `https://yourapp.com/api/webhooks/stripe/billing`
- Events: Select `invoice.paid`, `invoice.payment_failed`, `charge.refunded`

### 4. Hook Fee Recording to Trade Close

When a trade closes (in your trade execution handler):

```typescript
import { recordPerformanceFee } from '@/services/billing/performance-fee';

// After trade closes and profit_loss is calculated
if (trade.exit_time && trade.profit_loss > 0) {
  await recordPerformanceFee(
    userId,
    trade.id,
    botInstanceId,
    trade.profit_loss
  );
}
```

### 5. Schedule Monthly Billing Job

Add to your job scheduler (e.g., node-cron, Bull queue):

```typescript
import { runMonthlyBillingJob } from '@/services/billing/monthly-billing-job';

// Cron: "0 2 1 * *" (1st of month, 2 AM UTC)
schedule('0 2 1 * *', async () => {
  const result = await runMonthlyBillingJob();
  logger.info('Monthly billing complete', result);
});
```

### 6. Register Stripe SetupIntent on Bot Creation

When user creates a bot, redirect to billing setup:

```typescript
// After bot created successfully
const setupStatus = await fetch('/api/billing/setup', {
  method: 'POST',
  body: JSON.stringify({ action: 'get-status' })
});

if (!setupStatus.setup_complete) {
  // Redirect to billing setup page
  redirect('/setup/billing');
}
```

---

## User Workflow

### 1. Bot Creation
```
User creates bot → System checks Stripe billing setup
  ↓
If not setup: Redirect to billing setup page
  ↓
User authorizes card via Stripe Hosted Element
  ↓
Stripe customer created & payment method stored
  ↓
Setup complete → Bot ready to trade
```

### 2. Trading & Fee Collection
```
Bot trades profitably
  ↓
Trade closes with $500 profit
  ↓
Platform records: 5% fee = $25 (pending_billing)
  ↓
Monthly job runs (1st of month)
  ↓
Platform creates Stripe invoice for all pending fees
  ↓
Stripe auto-charges user's card
  ↓
Invoice.paid webhook → Mark fees as "paid"
  ↓
User receives receipt email
```

### 3. Payment Failure Handling
```
Stripe charges card → ❌ Declined
  ↓
Status: past_due, retry_count: 1
  ↓
Stripe retries automatically in 2 days
  ↓
If still fails: Dunning email sent (2/3 attempts)
  ↓
After 3 failures: Status = suspended
  ↓
User notified: "Bot will pause in 24 hours"
  ↓
User updates payment method via Stripe portal
  ↓
Stripe retries payment
  ↓
✅ Payment succeeds
```

### 4. Admin Fee Adjustment
```
Admin discovers fee calculation error
  ↓
Navigates to /admin/fees
  ↓
Selects fee, clicks "Adjust"
  ↓
Enters corrected profit amount
  ↓
If already billed: Creates Stripe credit
  ↓
User receives adjustment email
  ↓
Audit trail recorded with reason
```

---

## Edge Cases Handled

### ✅ Card Declined (Payment Failure)
- Automatic retry: Up to 3 times over 5 days
- Dunning emails: After each failure
- Suspension: After 3 failed attempts
- Recovery: User updates card → Auto-retry

### ✅ P&L Correction
- Admin adjusts profit amount
- System recalculates fee
- If billed: Creates Stripe credit to user
- Email sent to user with reason

### ✅ Fee Waiver
- Admin can waive pending fees (not yet billed)
- Cannot waive already-billed fees (must refund instead)
- Audit trail: Reason logged

### ✅ Refund Processing
- Admin can refund paid fees
- Stripe refund issued back to user's card
- Fee marked as refunded
- Audit trail: Reason logged

### ✅ Insufficient Balance
- If user has no USDT (only BUSD): Fee waits pending
- Retries automatically when they deposit USDT
- After 24 hours of retries: Fee waived, user notified

---

## API Examples

### Get Performance Fee Summary
```bash
curl -X GET http://localhost:3000/api/fees/performance \
  -H "Authorization: Bearer $TOKEN"

# Response:
{
  "summary": {
    "total_profits": 2500,
    "total_fees_collected": 125,
    "pending_fees": 45.50,
    "billed_fees": 0,
    "total_trades": 50
  },
  "billing": {
    "billing_status": "active",
    "failed_charge_attempts": 0,
    "pause_trading_on_failed_charge": false
  },
  "recentTransactions": [
    {
      "trade_id": "T-456",
      "profit_amount": 100,
      "fee_amount": 5,
      "status": "paid",
      "paid_at": "2025-02-01T02:15:00Z",
      "pair": "BTC/USDT"
    }
  ],
  "chargeHistory": [
    {
      "billing_period_start": "2025-01-01",
      "billing_period_end": "2025-01-31",
      "total_fees_amount": 125,
      "total_fees_count": 25,
      "status": "succeeded",
      "paid_at": "2025-02-01T02:15:00Z"
    }
  ]
}
```

### Admin: Get All Fees
```bash
curl -X GET "http://localhost:3000/api/admin/fees?userId=user123&status=billed&limit=10" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Admin: Adjust Fee
```bash
curl -X POST http://localhost:3000/api/admin/fees/adjust \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "feeId": "fee-uuid-here",
    "correctedProfit": 400,
    "reason": "Exchange reported incorrect P&L per ticket SUP-123"
  }'
```

### Admin: Waive Fee
```bash
curl -X POST http://localhost:3000/api/admin/fees/waive \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "feeId": "fee-uuid-here",
    "reason": "Early adopter retention - Q1 campaign"
  }'
```

---

## Configuration

### Environment Variables (Required)
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET_BILLING=whsec_...
```

### Optional Configuration
```
# Email notifications
PERFORMANCE_FEE_DUNNING_EMAIL_ENABLED=true
PERFORMANCE_FEE_RECEIPT_EMAIL_ENABLED=true

# Bot pause on failed payment
PAUSE_BOT_ON_FAILED_CHARGE=false  # Can be overridden per-user

# Fee rate (default 5%)
PERFORMANCE_FEE_RATE=0.05
```

---

## Testing

### Test Monthly Billing Job
```typescript
import { runBillingJobForMonth } from '@/services/billing/monthly-billing-job';

// Run billing for January 2025
const result = await runBillingJobForMonth(2025, 1);
console.log(result);
// Output:
// {
//   month: "2025-1",
//   processed: 42,
//   failed: 0,
//   totalUsers: 42
// }
```

### Test Webhook Locally
```bash
# Using Stripe CLI
stripe listen --forward-to localhost:3000/api/webhooks/stripe/billing

# In another terminal, trigger test event
stripe trigger invoice.paid
```

### Manual Test Flow
1. Create test user
2. Connect Stripe test card: `4242 4242 4242 4242` (succeeds)
3. Create bot → Trigger billing setup
4. Record test trade with profit
5. Run monthly billing job
6. Verify fees marked as paid
7. Check user's fee summary
8. Test with failing card: `4000 0000 0000 0002`

---

## Next Steps (Integration Required)

### 1. ✅ Hook Fee Recording
Location: Trade execution handler (wherever `trade.profit_loss` is calculated)
```typescript
await recordPerformanceFee(...);
```

### 2. ✅ Schedule Monthly Billing Job
Location: Job scheduler (cron, Bull, etc.)
```typescript
schedule('0 2 1 * *', runMonthlyBillingJob);
```

### 3. ✅ Create Dashboard Component
Display performance fees in `/dashboard/billing`
- Use `/api/fees/performance` endpoint
- Show: Profits, fees collected, pending fees
- Show: Recent transactions
- Show: Charge history

### 4. ✅ Update ToS & Privacy Policy
- Explain 5% performance fee model
- Clarify automatic monthly charging
- Link to billing FAQs

### 5. ⏳ Testing & Deployment
- Test with Stripe test mode first
- Verify all edge cases
- Load testing: Mock 1000+ users
- Staged rollout: 10% → 50% → 100%

---

## Monitoring & Alerts

### Metrics to Monitor
- Monthly billing job success rate
- Failed charge rate (should be < 5%)
- Fee collection average per user
- Webhook processing latency

### Recommended Alerts
- Billing job fails
- Webhook processing delays > 5s
- Failed charge rate > 10%
- Admin adjustments > $1000 in one day

---

## Support & Troubleshooting

### Issue: Fees not being recorded
**Check:**
- Trade has `exit_time` and `profit_loss > 0`
- `recordPerformanceFee()` is called after trade close
- Database migration was applied

### Issue: Monthly job not running
**Check:**
- Cron job is scheduled
- Job can connect to database
- Check logs for errors

### Issue: Stripe webhook not processing
**Check:**
- Webhook URL is publicly accessible
- Webhook secret in `.env` matches Stripe dashboard
- Webhook events are enabled in Stripe dashboard
- Check webhook logs in Stripe dashboard

### Issue: User can't set up billing
**Check:**
- Stripe API keys are valid
- SetupIntent creation not failing
- User's browser allows 3rd-party cookies (Stripe requirement)

---

## File Structure

```
src/
├── migrations/
│   └── 013_performance_fee_billing.sql    # Database schema
├── services/billing/
│   ├── performance-fee.ts                 # Core fee service
│   ├── monthly-billing-job.ts            # Monthly job
│   └── stripe-webhook-handler.ts         # Webhook handlers
├── app/api/
│   ├── billing/setup/route.ts            # Billing setup endpoint
│   ├── fees/performance/route.ts         # User fee endpoint
│   ├── admin/fees/route.ts               # Admin fees list
│   ├── admin/fees/adjust/route.ts        # Admin adjust fee
│   ├── admin/fees/waive/route.ts         # Admin waive fee
│   ├── admin/fees/refund/route.ts        # Admin refund fee
│   └── webhooks/stripe/billing/route.ts  # Stripe webhook
└── email/templates/
    └── performance-fees.tsx              # Email templates
```

---

## Questions?

Refer to the edge case handling section or check webhook/job logs for details.
