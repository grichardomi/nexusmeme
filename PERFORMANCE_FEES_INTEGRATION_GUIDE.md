# Performance Fees Integration Guide

Complete integration guide for connecting bot instances with the NexusMeme performance fee billing system.

## Status: ✅ Complete (Ready for Bot Integration)

---

## Overview

The performance fee system is now fully integrated into NexusMeme:

1. **Trade Close Endpoint** - Bot instances report closed trades → Fee recording triggered
2. **Monthly Billing Scheduler** - Cron job runs 1st of month at 2 AM UTC → Fees billed automatically
3. **Stripe Webhooks** - Payment events processed → User notified

---

## Bot Instance Integration

### 1. Report Closed Trades


```
POST /api/bots/trades/close
```

**Request Format:**

```json
{
  "botInstanceId": "550e8400-e29b-41d4-a716-446655440000",
  "tradeId": "trade_BTC/USDT_20250115_001",
  "pair": "BTC/USDT",
  "exitTime": "2025-01-15T10:30:00Z",
  "exitPrice": 45000,
  "profitLoss": 250,
  "profitLossPercent": 2.5
}
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `botInstanceId` | UUID | Bot instance identifier (same as bot config) |
| `tradeId` | string | Unique trade identifier |
| `pair` | string | Trading pair (e.g., BTC/USDT) |
| `exitTime` | ISO 8601 | Trade close timestamp (UTC) |
| `exitPrice` | number | Price at which trade closed |
| `profitLoss` | number | Absolute profit/loss in base currency |
| `profitLossPercent` | number | Profit/loss as percentage (0-100) |

**Response on Success (200):**

```json
{
  "success": true,
  "message": "Trade closed successfully",
  "tradeId": "trade_BTC/USDT_20250115_001",
  "feeRecorded": true,
  "feeAmount": "12.50"
}
```

**Response on Error (400/500):**

```json
{
  "error": "Validation failed",
  "details": {
    "fieldName": ["error message"]
  }
}
```

### 2. How Fee Recording Works

When a profitable trade is closed:

1. **Trade Updated**: `exit_time`, `exit_price`, `profit_loss` recorded in database
2. **Fee Calculated**: 5% of profit amount calculated
3. **Fee Recorded**: Fee stored in `performance_fees` table with status `pending_billing`
4. **Monthly Billing**: On 1st of month, all pending fees aggregated and charged via Stripe

**Example Flow:**

```
Bot closes trade with $500 profit
  ↓
POST /api/bots/trades/close
  ↓
System records: profit_loss = 500
  ↓
System records: performance_fee = 25 (5% of $500)
  ↓
Fee status: pending_billing (until monthly job runs)
  ↓
On 1st of month:
  - Monthly job aggregates all pending fees
  - Creates Stripe invoice
  - Auto-charges user's card
  - On success: Fee status = paid
```

### 3. Python Integration

Add this to your bot's trade close handler:

```python
import requests
import json
from datetime import datetime

def on_trade_closed(trade):
    """


    if not trade.exit_time or trade.profit_loss is None:
        return  # Trade not fully closed yet

    # Calculate profit/loss percent
    profit_loss_percent = (trade.profit_loss / trade.stake_amount) * 100

    # Prepare request payload
    payload = {
        "botInstanceId": os.getenv('BOT_INSTANCE_ID'),
        "tradeId": f"trade_{trade.pair}_{int(trade.open_date.timestamp())}",
        "pair": trade.pair,
        "exitTime": trade.exit_date.isoformat() + "Z",
        "exitPrice": float(trade.close_rate),
        "profitLoss": float(trade.profit_abs),
        "profitLossPercent": profit_loss_percent
    }

    # POST to NexusMeme
    try:
        response = requests.post(
            f"{NEXUSMEME_API_URL}/api/bots/trades/close",
            json=payload,
            timeout=10
        )

        if response.status_code == 200:
            logger.info(f"Trade close reported: {trade.pair} profit={trade.profit_abs}")
        else:
            logger.error(f"Failed to report trade close: {response.text}")

    except Exception as e:
        logger.error(f"Error reporting trade close: {str(e)}")
```

### 4. Environment Variables for Bot Instances

```bash
# Bot Identity
BOT_INSTANCE_ID=550e8400-e29b-41d4-a716-446655440000

# NexusMeme API
NEXUSMEME_API_URL=https://yourdomain.com
NEXUSMEME_API_KEY=your-api-key-here  # Optional if using auth

# Logging
LOG_LEVEL=info
```

---

## Monthly Billing Scheduler

### How It Works

The system automatically runs the monthly billing job on **1st of each month at 2 AM UTC**:

1. **Aggregation**: Collects all pending fees per user
2. **Invoice Creation**: Creates Stripe invoice with aggregated fees
3. **Auto-Charging**: Stripe automatically charges user's saved card
4. **Notifications**: Sends receipt or failure email

### Manual Billing Run (Admin)

To run billing manually for a specific month:

```bash
curl -X POST http://localhost:3000/api/admin/billing/run-month \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "year": 2025,
    "month": 1
  }'
```

### Monitoring

Check scheduler status:

```bash
curl http://localhost:3000/api/init | jq '.status.scheduler'
```

Response:

```json
{
  "isInitialized": true,
  "jobCount": 1,
  "jobs": [
    {
      "id": "monthly_billing",
      "name": "Monthly Billing Job",
      "cronExpression": "0 2 1 * *",
      "lastRun": "2025-01-01T02:15:00.000Z",
      "nextRun": "2025-02-01T02:00:00.000Z",
      "isRunning": false
    }
  ]
}
```

---

## Setup Checklist

### Backend Setup (Already Completed)

- ✅ Database migration applied (`013_performance_fee_billing.sql`)
- ✅ Performance fee service created (`performance-fee.ts`)
- ✅ Monthly billing job created (`monthly-billing-job.ts`)
- ✅ Stripe webhook handlers created
- ✅ Trade close endpoint created (`/api/bots/trades/close`)
- ✅ Cron scheduler initialized
- ✅ Email templates configured

### Configuration Required

- [ ] Add to `.env`:
  ```
  STRIPE_WEBHOOK_SECRET_BILLING=whsec_...
  ```
  Get from Stripe Dashboard → Webhooks → Select billing webhook → Show signing secret

- [ ] Enable Stripe webhook in dashboard:
  - URL: `https://yourdomain.com/api/webhooks/stripe/billing`
  - Events: `invoice.paid`, `invoice.payment_failed`, `charge.refunded`

### Bot Instance Integration

- [ ] Bot instances updated to call `/api/bots/trades/close` on trade close
- [ ] Environment variables set: `BOT_INSTANCE_ID`, `NEXUSMEME_API_URL`
- [ ] Test with dry-run bot first
- [ ] Verify fee recording in database
- [ ] Verify monthly billing runs successfully

### User Setup

- [ ] Users complete billing setup (payment method collection)
- [ ] Stripe SetupIntent flow tested
- [ ] Test email notifications working

---

## Testing Performance Fees

### 1. Test Trade Close Integration

**Create a test trade:**

```bash
curl -X POST http://localhost:3000/api/bots/trades/close \
  -H "Content-Type: application/json" \
  -d '{
    "botInstanceId": "550e8400-e29b-41d4-a716-446655440000",
    "tradeId": "test_trade_001",
    "pair": "BTC/USDT",
    "exitTime": "2025-01-15T10:30:00Z",
    "exitPrice": 45000,
    "profitLoss": 500,
    "profitLossPercent": 5
  }'
```

**Verify fee was recorded:**

```bash
curl -X GET http://localhost:3000/api/fees/performance \
  -H "Authorization: Bearer $USER_TOKEN"
```

Should show:
- `pending_fees`: 25.00 (5% of $500)
- `recent_transactions`: Entry with status "pending_billing"

### 2. Test Monthly Billing

**Check next scheduled run:**

```bash
curl http://localhost:3000/api/init | jq '.status.scheduler.jobs[0].nextRun'
```

**Manual test run (admin only):**

```bash
curl -X POST http://localhost:3000/api/admin/billing/run-month \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"year": 2025, "month": 1}'
```

**Verify billing ran:**

Check database:

```sql
SELECT * FROM fee_charge_history WHERE user_id = $1 ORDER BY billing_period_end DESC LIMIT 1;
```

Should show status: `pending` (if card not yet charged) or `succeeded` (if test card used)

### 3. Test Stripe Webhooks Locally

**Using Stripe CLI:**

```bash
# Forward webhooks to local app
stripe listen --forward-to localhost:3000/api/webhooks/stripe/billing

# In another terminal, trigger test event
stripe trigger invoice.paid
```

**Monitor logs for webhook processing:**

```bash
tail -f logs/app.log | grep "webhook\|stripe"
```

### 4. Test Email Notifications

Create a profitable trade and verify emails sent:

- **Email 1**: Performance Fee Charged (when payment succeeds)
- **Email 2**: Performance Fee Failed (when payment fails) - test with `4000 0000 0000 0002`

Check email logs in database:

```sql
SELECT email_type, status, recipient FROM email_queue
WHERE email_type LIKE 'performance_fee%'
ORDER BY created_at DESC LIMIT 5;
```

---

## Troubleshooting

### Issue: Trade close endpoint returns 404

**Cause**: Bot instance ID doesn't exist in database

**Fix**: Verify bot was created:
```sql
SELECT id, user_id FROM bot_instances WHERE id = $1;
```

### Issue: Fee not being recorded

**Cause**: Trade close request didn't include profitable trade

**Fix**: Ensure `profitLoss > 0` in request. Check logs:
```bash
grep "recordPerformanceFee\|profit_loss" logs/app.log
```

### Issue: Monthly job doesn't run

**Cause**: Scheduler not initialized

**Fix**: Ensure `/api/init` was called on app startup:
```bash
curl http://localhost:3000/api/init
```

Should return `scheduler.started: true`

### Issue: Stripe webhook not processing

**Cause**: Webhook secret mismatch or endpoint not reachable

**Fix**:
1. Verify `STRIPE_WEBHOOK_SECRET_BILLING` set correctly
2. Test locally: `stripe listen --forward-to localhost:3000/api/webhooks/stripe/billing`
3. Check webhook logs in Stripe Dashboard

---

## API Reference

### POST /api/bots/trades/close

Report a closed trade and trigger fee recording.

- **Auth**: None (secured by bot instance ID validation)
- **Rate Limit**: 100 req/min per bot instance
- **Idempotency**: Safe to retry

### GET /api/fees/performance

Get user's performance fee summary.

- **Auth**: Required (user session)
- **Rate Limit**: 10 req/min per user
- **Response**: Summary, billing status, recent transactions, charge history

### GET /api/admin/fees

List all performance fees (admin only).

- **Auth**: Required (admin role)
- **Query**: `?userId=...&status=...&limit=10&offset=0`
- **Statuses**: `pending_billing`, `billed`, `paid`, `refunded`, `waived`

### POST /api/admin/fees/adjust

Adjust a fee for P&L correction (admin only).

- **Auth**: Required (admin role)
- **Body**: `{ feeId, correctedProfit, reason }`

### POST /api/admin/fees/waive

Waive a pending fee (admin only).

- **Auth**: Required (admin role)
- **Body**: `{ feeId, reason }`

### POST /api/admin/fees/refund

Refund a paid fee (admin only).

- **Auth**: Required (admin role)
- **Body**: `{ feeId, reason }`

### POST /api/admin/billing/run-month

Run monthly billing manually for a specific month (admin only).

- **Auth**: Required (admin role)
- **Body**: `{ year, month }`
- **Example**: `{ "year": 2025, "month": 1 }`

---

## Architecture Diagram

```
Bot Instance                    NexusMeme API Server              Stripe
    │                                 │                            │
    │  Trade closes                   │                            │
    │                     │                            │
    │                                 │                            │
    ├──────────────────────────────>  │                            │
    │  POST /api/bots/trades/close    │                            │
    │  (exitTime, exitPrice, profit)  │                            │
    │                                 │                            │
    │                          ┌──────┴─────┐                      │
    │                          │ Update      │                      │
    │                          │ trade       │                      │
    │                          │ record      │                      │
    │                          │ in DB       │                      │
    │                          └──────┬─────┘                       │
    │                                 │                            │
    │                          ┌──────┴─────────┐                  │
    │                          │ If profitable: │                  │
    │                          │ recordPerf Fee │                  │
    │                          └──────┬─────────┘                  │
    │                                 │                            │
    │                          Status: pending_billing              │
    │                          (until monthly job)                  │
    │                                 │                            │
    │                         [1st of month, 2 AM UTC]             │
    │                          ┌──────┴──────────┐                 │
    │                          │ Monthly Job:    │                 │
    │                          │ - Aggregate fees│                 │
    │                          │ - Create invoice│                 │
    │                          └──────┬──────────┘                 │
    │                                 │                            │
    │                          ┌──────┴──────────┐                 │
    │                          │ Auto-charge     │                 │
    │                          │ Stripe invoice  │                 │
    │                          └──────┬──────────┘                 │
    │                                 │                            │
    │                                 ├────────────────────────>   │
    │                                 │ Create invoice              │
    │                                 │ Charge card                 │
    │                                 │                            │
    │                                 │  <──────────────────────   │
    │                                 │ Webhook: invoice.paid      │
    │                                 │ (or invoice.payment_failed) │
    │                                 │                            │
    │                          ┌──────┴──────────┐                 │
    │                          │ Mark fees as:   │                 │
    │                          │ paid/past_due   │                 │
    │                          │ Send email      │                 │
    │                          └─────────────────┘                 │
    │                                 │                            │
    │  <──────────────────────────────┘                            │
    │  Fee paid! Status: paid                                      │
```

---

## Next Steps

1. **Update bot instances** to call `/api/bots/trades/close`
2. **Configure Stripe webhook** in production
3. **Run first monthly billing** cycle with test users
4. **Monitor and optimize**:
   - Track failed charges
   - Monitor fee collection rate
   - Verify email delivery

---

## Support

For integration questions or issues:
- Check PERFORMANCE_FEES_IMPLEMENTATION.md for detailed system architecture
- Review test examples in section "Testing Performance Fees"
- Check application logs for detailed error messages
