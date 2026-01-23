# Performance Fees - Help & FAQ

## Understanding Performance Fees

NexusMeme uses a **performance-based pricing model**, not traditional subscription plans. You only pay when your trading bot makes profits.

### How It Works

- **Fee Rate**: 5% of profits
- **When Charged**: Monthly on profitable trades
- **How It's Calculated**: When your trading bot closes a trade with a profit, we collect 5% of that profit

### Example

```
Trade closes with $500 profit
→ Performance fee: 5% of $500 = $25
→ You keep: $475

Monthly billing (1st of month):
→ Platform automatically charges your card for all pending fees
→ You receive an email with invoice receipt
```

---

## Getting Started

### Step 1: Set Up Billing

When you create your first trading bot, you'll be prompted to set up billing:

1. Click **"Create Bot"**
2. After bot creation, you'll see **"Complete Billing Setup"**
3. Enter your payment information (credit/debit card)
4. Click **"Authorize Payment Method"**
5. ✅ Done! You're ready to start trading

**Important**: You won't be charged until your bot makes a profit and the monthly billing runs.

### Step 2: Bot Starts Trading

Your bot will:
- Execute trades based on your configured strategy
- Record profits/losses
- Collect 5% fees from profitable trades (marked as "pending")

### Step 3: Monthly Billing (1st of month)

On the 1st of each month at 2 AM UTC:
- Platform aggregates all pending fees
- Creates an invoice in Stripe
- Automatically charges your payment method
- You receive a receipt email

---

## Viewing Your Fees

### In Dashboard

Visit **Dashboard → Billing & Plans** to see:

**Performance Overview:**
- **Total Profits**: Sum of all profitable trades
- **Total Fees Collected**: 5% of profits already charged
- **Pending Fees**: Fees waiting for monthly billing
- **Recent Transactions**: Last 10 trades with fees

**Charge History:**
- Shows monthly billing cycles
- Invoice status: Succeeded, Failed, or Pending
- Amount charged and date

### API Endpoint

Get your fee summary programmatically:

```bash
GET /api/fees/performance
```

Response:
```json
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
    "failed_charge_attempts": 0
  },
  "recentTransactions": [
    {
      "trade_id": "T-456",
      "profit_amount": 100,
      "fee_amount": 5,
      "status": "paid",
      "pair": "BTC/USDT"
    }
  ]
}
```

---

## Billing Status

### Active ✅

- Payment method is valid
- Charges are being processed successfully
- Status: All good, trading can continue

### Past Due ⚠️

- Credit card was declined
- Stripe is retrying automatically (up to 3 times)
- Check your email for dunning notice
- **Action needed**: Update your payment method

### Suspended 🚫

- Payment failed 3 times
- Your bot will pause in 24 hours
- Must update payment method immediately

---

## Managing Your Billing

### Update Payment Method

1. Go to **Dashboard → Billing & Plans**
2. Click **"Update Payment Method"**
3. Enter new card details
4. Click **"Save"**

Or use Stripe's customer portal:
- Link in email receipts
- Link in billing dashboard
- Manage cards directly

### Cancel Your Subscription

At any time, you can:
- Stop creating new bots
- Let existing bots trade
- No penalty for deletion
- Continue paying fees only for profitable trades

### Download Invoices

1. Go to **Dashboard → Billing & Plans**
2. Click invoice in **"Charge History"**
3. Click **"Download PDF"**

---

## Common Questions

### Q: Do I pay if my bot loses money?

**A:** No! You only pay 5% on profitable trades. Losing trades are free.

### Q: When exactly am I charged?

**A:** Every 1st of the month at 2 AM UTC, all pending fees are charged in one batch.

### Q: What if my card is declined?

**A:**
- Stripe automatically retries for 5 days
- You'll receive an email after each failed attempt
- After 3 failed attempts, your bot will pause
- Update your card to resume trading

### Q: Can I change my payment method?

**A:** Yes, anytime in **Dashboard → Billing & Plans** or Stripe portal.

### Q: Do I get a discount for annual payment?

**A:** Performance fees are monthly only. There's no annual discount (you only pay when you trade).

### Q: What if I have multiple bots?

**A:** Fees are calculated per-bot and charged monthly in one invoice covering all bots.

### Q: Can I get an invoice for accounting?

**A:** Yes! Download PDF invoices from **Dashboard → Billing & Plans** under "Charge History".

### Q: What happens if I don't update my payment method after suspension?

**A:** After 72 hours, your bots will be permanently paused. Reactivate by updating payment method.

### Q: Are there any setup fees or hidden charges?

**A:** No setup fees. Only the 5% performance fee on profits.

### Q: Can I get a refund for fees?

**A:** Contact support for fee disputes. We're happy to review trade data and adjust if there's an error.

---

## Troubleshooting

### "Billing Setup Required"

**Meaning**: You haven't authorized a payment method yet.

**Fix**:
1. Go to **Dashboard → Billing & Plans**
2. Click **"Complete Billing Setup"**
3. Enter card details and authorize

### "Payment Failed - Retry Pending"

**Meaning**: Your card was declined, Stripe is retrying.

**Fix**:
1. Check email for "Payment Failed" notice
2. Verify card is valid and has available balance
3. Go to Stripe portal and update card immediately (don't wait for retries)
4. Stripe will retry within 5 days

### "Billing Suspended"

**Meaning**: Payment failed 3 times. Bot will pause in 24 hours.

**Fix**:
1. Update payment method immediately
2. Contact support if you need emergency extension
3. Once updated, Stripe will retry and lift suspension

### "Fee Charges Are Wrong"

**Meaning**: You think fees are calculated incorrectly.

**Fix**:
1. Get your fee summary from **Dashboard → Billing & Plans**
2. Review recent trades and profit amounts
3. Open support ticket with trade IDs and amounts
4. We'll investigate and adjust if needed

### "I Was Charged But Didn't Get Invoice Email"

**Meaning**: Invoice email might not have arrived.

**Fix**:
1. Check spam folder
2. Download invoice from **Dashboard → Billing & Plans**
3. Check Stripe portal directly
4. Contact support to resend

---

## Support

Have questions about your fees?

**Contact Support:**
- **Email**: support@nexusmeme.com
- **In-App**: **Dashboard → Support** (create ticket)
- **Chat**: Available during business hours (UTC)

We typically respond within 24 hours.

---

## Related Articles

- [Billing Setup Guide](./ONBOARDING_BILLING.md)
- [Payment Methods & Security](./PAYMENT_SECURITY.md)
- [Trading Strategies & Profitability](./STRATEGIES.md)
- [Terms of Service](./TERMS_OF_SERVICE.md)
