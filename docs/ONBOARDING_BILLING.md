# Onboarding: Billing Setup

## Welcome to NexusMeme!

This guide walks you through setting up billing so you can start trading with your AI-powered bot.

---

## What You Need

Before starting, have ready:
- ✅ Valid credit or debit card (Visa, Mastercard, American Express)
- ✅ Active NexusMeme account
- ✅ 5 minutes to complete setup

---

## Step 1: Create Your First Bot

1. Log in to your NexusMeme account
2. Go to **Dashboard → Trading Bot**
3. Click **"+ Create New Bot"**
4. Configure your bot:
   - **Bot Name**: Give it a descriptive name (e.g., "BTC Scalper")
   - **Exchange**: Select your crypto exchange (Binance, Kraken, etc.)
   - **Trading Pairs**: Choose which pairs to trade
   - **Strategy**: Select a trading strategy
   - **Risk Settings**: Configure your risk parameters
5. Click **"Create Bot"**

---

## Step 2: Complete Billing Setup

After creating your bot, you'll see:

> 🔔 **Billing Setup Required**
>
> Complete payment setup to activate your bot and start trading.

### Here's what happens:

1. Click **"Complete Billing Setup"** button
2. You'll be taken to a secure payment page (powered by Stripe)
3. Stripe will ask for:
   - Card number
   - Expiration date
   - CVC (security code)
   - Billing address (optional for some cards)

4. Click **"Authorize Payment Method"**
5. ✅ Success! Your billing is set up

### What This Does

- **Authorizes** a payment method (doesn't charge yet)
- **Creates** a Stripe customer for your account
- **Allows** automatic monthly billing

### What This DOESN'T Do

- ❌ Doesn't charge your card immediately
- ❌ Doesn't take any money right now
- ❌ Doesn't store card details on our servers (Stripe handles securely)

---

## Step 3: Verify Setup Completion

After authorizing, you should see:

✅ **Billing Status: Active**

This means:
- Your bot is ready to trade
- Your payment method is saved
- You're all set!

---

## Step 4: Start Trading

Your bot will now:
1. Connect to your exchange (Binance, Kraken, etc.)
2. Start monitoring market prices
3. Execute trades based on your strategy
4. Collect profits

### Fees Are Only on Profits

- ✅ Profitable trade: 5% fee charged
- ❌ Losing trade: No fee
- ✅ No trades: No fees

---

## Monthly Billing: When & How

### When You're Charged

**1st of every month at 2:00 AM UTC**

Stripe automatically charges your card for all pending fees from profitable trades.

### What You'll Receive

1. **Invoice Email** with:
   - Total profits this month
   - Total fees collected
   - Invoice number and PDF
   - Payment receipt

2. **Dashboard Update**:
   - Fees marked as "paid"
   - New charge appears in history

---

## Managing Your Billing

### View Your Fees Anytime

1. Go to **Dashboard → Billing & Plans**
2. See:
   - **Performance Overview**: Total profits, fees, pending
   - **Recent Transactions**: Last 10 trades with fees
   - **Charge History**: Monthly billing cycles

### Update Your Card

1. Go to **Dashboard → Billing & Plans**
2. Click **"Update Payment Method"**
3. Enter new card details
4. Click **"Save"**

**Important**: Update before your card expires to avoid billing failures!

### Download Invoices

1. Go to **Dashboard → Billing & Plans**
2. Find invoice in **"Charge History"**
3. Click **"Download PDF"**
4. Use for accounting/taxes

### View Stripe Portal

For advanced options, use Stripe's customer portal:
- View all transactions
- Update payment methods
- View failed payment details
- Download invoices

Link available in billing dashboard or email receipts.

---

## Payment Failures: What to Know

### If Your Card Is Declined

**Here's what happens:**

1. **Decline**: Card rejected by bank (insufficient funds, expired, etc.)
2. **Notification**: You get an email immediately
3. **Retry #1**: Stripe retries automatically (2 days later)
4. **Retry #2**: Second attempt (2 days later)
5. **Retry #3**: Final attempt (2 days later)

### After 3 Failed Attempts

- **Status**: "Suspended"
- **Action**: Your bot will pause in 24 hours
- **Fix**: Update your payment method in dashboard
- **Recovery**: Stripe retries, bot resumes

### How to Avoid This

- Update card before it expires
- Ensure sufficient account balance
- Check your email immediately if payment fails
- Update card in dashboard right away (don't wait for retries)

---

## Security & Privacy

### We DON'T Store Card Details

- Stripe handles all card information securely
- We never see your full card number
- Your card data is encrypted
- PCI DSS compliant

### Your Data is Safe

- All payments use industry-standard encryption
- Stripe is a trusted payment processor
- Your billing information is confidential
- You control what data you share

---

## Troubleshooting

### "Billing Setup Required" - But I Already Set It Up

**Fix**:
1. Try refreshing the page (F5)
2. Log out and back in
3. Go to Dashboard → Billing & Plans
4. Click "Try Again"

If problem persists, contact support.

### "Payment Method Not Authorized"

**Meaning**: Card was declined during setup authorization.

**Fix**:
1. Try a different card
2. Contact your bank (they might be declining online transactions)
3. Try again after 15 minutes
4. Contact support with error message

### "Billing Suspended" After Creating Bot

**Meaning**: Previous payment failed, billing is suspended.

**Fix**:
1. Go to **Dashboard → Billing & Plans**
2. Click **"Update Payment Method"**
3. Enter valid card details
4. Bot will resume within hours

### Still Having Issues?

**Contact Support**:
- **In-App**: Dashboard → Support (create ticket)
- **Email**: support@nexusmeme.com
- **Response Time**: Within 24 hours

---

## What's Next?

Once billing is set up:

1. ✅ **Configure Your Bot**
   - Adjust risk settings
   - Set trading pairs
   - Choose strategy

2. ✅ **Monitor Performance**
   - Dashboard → Trading (real-time prices)
   - Dashboard → Portfolio (P&L tracking)

3. ✅ **Track Your Fees**
   - Dashboard → Billing & Plans
   - Review monthly charges
   - Download invoices

4. ✅ **Withdraw Profits**
   - Use your exchange's withdrawal feature
   - Transfer USDT to your wallet
   - Keep trading with remaining balance

---

## FAQs

### Q: Why do I need to provide a card if I'm just testing?

**A:** We require a payment method to activate any bot. However, you're only charged on actual profits - not for setup or testing.

### Q: Can I use cryptocurrency to pay fees?

**A:** Currently, we only accept credit/debit cards via Stripe. Future versions may support crypto payments.

### Q: What if I want to delete my bot later?

**A:** You can delete bots anytime. You'll stop paying fees immediately. No cancellation fee.

### Q: Can I have multiple bots?

**A:** Yes! All fees are combined into one monthly invoice.

### Q: Is my card safe?

**A:** Yes! Stripe is PCI DSS Level 1 compliant. Your card data is never stored on our servers.

### Q: What if I dispute a fee?

**A:** Contact support with trade details. We'll investigate and adjust fees if there's an error.

---

## Summary

| Step | What Happens | Time |
|------|-------------|------|
| 1 | Create bot | 5 min |
| 2 | Authorize card | 3 min |
| 3 | Start trading | instant |
| Monthly | Auto-charge on 1st | 1 min (automatic) |

**You're all set! Start trading now.** 🚀

---

## Need Help?

- **Questions?** Check [Performance Fees Help](./PERFORMANCE_FEES_HELP.md)
- **Payment Issues?** See Troubleshooting above
- **Technical Problems?** Contact support in dashboard
- **Security Concerns?** Email security@nexusmeme.com
