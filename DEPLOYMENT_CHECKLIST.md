# Performance Fee Billing System - Deployment Checklist

## Pre-Deployment Verification

### 1. ✅ Type-Check
```bash
pnpm run type-check
# Expected: No errors
```

### 2. ✅ Database Migration
```bash
npm run migrate:dev
# Expected: "✓ Completed: 013_performance_fee_billing.sql"
```

**What this migration does**:
- Creates `bot_suspension_log` table (tracks bot pauses and resumals)
- Adds new email types to `email_queue` constraint

### 3. Environment Variables Setup

Add these to your `.env.local` or deployment environment:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_...                    # Already required
STRIPE_WEBHOOK_SECRET_BILLING=whsec_...          # NEW - from Stripe Dashboard
STRIPE_PUBLISHABLE_KEY=pk_live_...               # Already required

# Stripe Webhook Endpoint
# Go to: https://dashboard.stripe.com/webhooks
# Create webhook to: https://your-domain.com/api/webhooks/stripe/billing
# Subscribe to: invoice.paid, invoice.payment_failed, charge.refunded
```

### 4. Start Development Server
```bash
pnpm dev
```

Check logs for these success indicators:
```
✅ Startup validation passed!
✅ Monthly billing scheduler initialized!
✅ Trade signal orchestrator started!
```

---

## Post-Deployment Testing

### Test 1: Bot Suspension Job Queue
1. Go to admin panel or use database
2. Manually trigger a payment failure on a user's invoice
3. Wait for the system to queue a suspension job
4. Check job_queue table: `SELECT * FROM job_queue WHERE type = 'suspend_bot' ORDER BY created_at DESC LIMIT 1;`
5. Monitor logs for: `"Suspending bot from queue"` and `"Bot suspended successfully"`

### Test 2: Billing Run Metrics
1. Navigate to `/api/fees/performance` as a user with fees
2. Verify response includes:
   - `billingRunId` (unique identifier for this run)
   - `successCount` (number of users billed)
   - `failureCount` (number of failed billings)
   - `totalBilled` (total amount billed)

### Test 3: Email Pipeline
```bash
npm run test-email-pipeline
```

Verify emails are queued and sent:
- `performance_fee_charged` - when invoice is paid
- `performance_fee_dunning` - when payment fails (with deadlines)
- `performance_fee_failed` - when all retries exhausted
- `bot_suspended_payment_failure` - when bot is paused
- `bot_resumed` - when bot resumes after payment

### Test 4: Stripe Webhook
1. Go to Stripe Dashboard → Webhooks → Click your endpoint
2. Send test event: `invoice.paid` 
3. Check application logs for: `"Processing invoice.paid event"`
4. Verify corresponding database updates (performance_fees status, fee_charge_history)

---

## Monitoring & Observability

### Key Logs to Monitor
```bash
# Bot suspension jobs
"Suspending bot from queue"
"Bot suspended successfully"
"Bot resumed successfully"

# Billing metrics
"Monthly billing job completed"
"successCount: X, failureCount: Y"

# Email sending
"Job enqueued" (type: send_email)
"Email sent successfully"

# Startup
"Startup validation passed!"
"Monthly billing scheduler initialized!"
```

### Database Queries for Monitoring

**Check suspended bots**:
```sql
SELECT * FROM bot_suspension_log 
WHERE suspended_at IS NOT NULL AND resumed_at IS NULL
ORDER BY suspended_at DESC
LIMIT 10;
```

**Check pending jobs**:
```sql
SELECT id, type, status, priority, created_at 
FROM job_queue 
WHERE status IN ('pending', 'retrying')
ORDER BY priority DESC, created_at ASC;
```

**Check recent billings**:
```sql
SELECT id, status, total_users_billed, total_fees_amount, completed_at
FROM billing_runs
ORDER BY created_at DESC
LIMIT 5;
```

**Check payment failures**:
```sql
SELECT fch.*, pf.user_id, pf.fee_amount
FROM fee_charge_history fch
JOIN performance_fees pf ON fch.stripe_invoice_id = pf.stripe_invoice_id
WHERE fch.status = 'failed'
ORDER BY fch.last_failed_charge_date DESC
LIMIT 20;
```

---

## Rollback Plan

If critical issues arise:

1. **Immediate**: Set `DISABLE_BILLING=true` in environment to skip billing job
2. **Revert migrations**: 
   ```bash
   # Manually drop bot_suspension_log table if needed
   DROP TABLE IF EXISTS bot_suspension_log CASCADE;
   ```
3. **Revert code**: Deploy previous version without billing system changes

---

## Frequently Asked Questions

**Q: How often does monthly billing run?**
A: 1st of each month at 2 AM UTC. Runs automatically (no manual trigger needed).

**Q: What happens if billing run fails?**
A: Job is marked as failed in database. Retries will process it next scheduled run. Email notification sent to admin.

**Q: How long until bot is suspended after 3rd payment failure?**
A: 24 hours. A suspension job is queued and waits 24 hours before pausing the bot.

**Q: Can suspended bots resume automatically?**
A: Yes, if user's payment succeeds. `handleInvoicePaid` queues a resume job immediately.

**Q: What if Stripe webhook fails?**
A: Webhook response returns 400/500 error. Stripe retries delivery for 3 days. Check webhook logs in Stripe dashboard.

**Q: Where do I find webhook logs?**
A: https://dashboard.stripe.com/webhooks → Click endpoint → "Events" tab

---

## Support & Debugging

### Enable Detailed Logging
```bash
# In .env.local
DEBUG=nexus:*
LOG_LEVEL=debug
```

### Check Email Queue Status
```bash
npm run check-email-queue
```

### Verify Stripe Connection
```bash
# In Node REPL
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
await stripe.customers.list({ limit: 1 });
// If successful, prints customer list
```

---

## Deployment Success Criteria

✅ Type-check passes
✅ Migration completes successfully
✅ App starts with "✅ Monthly billing scheduler initialized!"
✅ No "Unknown job type: suspend_bot" errors in logs
✅ Stripe webhook endpoint is active and receiving events
✅ Job queue processor is running and processing jobs
✅ Email pipeline is operational (can check with npm run test-email-pipeline)

---

**Last Updated**: 2026-01-19
**System Version**: Performance Fee Billing v1.0
