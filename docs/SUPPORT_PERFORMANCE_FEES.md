# Support Guide: Performance Fees Troubleshooting

For support staff and automated help systems.

---

## Common Issues & Solutions

### Issue: User Says "I Was Charged Too Much"

#### Diagnosis

1. **Ask**: "What was your profit amount?"
2. **Calculate**: Profit × 0.05 = Expected fee
3. **Compare**: Expected vs. actual charge

#### Common Causes

| Cause | Solution |
|-------|----------|
| Multiple profitable trades | Fees from each trade add up monthly |
| Includes crypto exchange fees | Our 5% is on net profit after exchange fees |
| Includes slippage | Correct - fees are on final P&L |
| Multiple bots | All bots included in one invoice |
| Previous month's fees | Check billing date vs. profit date |

#### Resolution Steps

1. **Get fee details**:
   - Ask user for: Invoice date, total fee amount, time period
   - Pull user's account: `/api/fees/performance`

2. **Verify trades**:
   - Check trade history from exchange
   - Verify profit calculations
   - Compare with our records

3. **If Error Found**:
   - Create admin fee adjustment
   - Send email with explanation
   - Apply credit to next invoice

#### Example Troubleshooting

```
User: I was charged $150 but I only made $500 profit!

Calculation:
$500 profit × 5% = $25 expected fee
User charged: $150
Difference: $125

Question: Do you have multiple bots or trades?
```

---

### Issue: "Payment Failed - Bot Will Be Suspended"

#### User Context

- Card was declined 3 times
- Bot will pause in 24 hours
- User needs to update payment method

#### Support Response

1. **Calm reassurance**:
   - "Don't worry, this is temporary"
   - "Just update your card and we'll resume trading"
   - "You won't lose your bot or settings"

2. **Guidance**:
   - Dashboard → Billing & Plans
   - Click "Update Payment Method"
   - Enter new card details
   - Save

3. **Verification**:
   - Check dashboard status in 5 minutes
   - Should show "Active" again
   - Bot will resume within 1 hour

4. **Prevention**:
   - Update card before expiration
   - Ensure sufficient balance
   - Check spam folder for decline emails

#### Stripe Portal Alternative

If dashboard method doesn't work:
- User can go to email receipt → "Manage Billing"
- Opens Stripe portal directly
- Update card there

---

### Issue: "Fees Disappeared from Dashboard"

#### Diagnosis

1. **Check status**: "What does your billing status show?"
2. **Check date**: "When were fees charged?"
3. **Check email**: "Did you get an invoice email?"

#### Common Causes & Fixes

| Situation | Cause | Fix |
|-----------|-------|-----|
| Fees not showing | Browser cache | Clear browser cache, refresh page |
| Fees moved to "Paid" | Monthly billing ran | Check Charge History for invoice |
| Fees shown as "$0" | No profitable trades | Confirm trades closed with profit |
| No fees visible | Setup incomplete | Verify billing is activated |

#### Resolution

1. **Browser cache**:
   - Ctrl+Shift+Delete (Windows) or Cmd+Shift+Delete (Mac)
   - Clear all cache
   - Refresh page

2. **Check API**:
   ```bash
   # Get live fee data
   curl -X GET https://app.nexusmeme.com/api/fees/performance \
     -H "Authorization: Bearer $TOKEN"
   ```

3. **Verify billing date**:
   - Fees collected on 1st of month at 2 AM UTC
   - If before that date, fees are still "pending"
   - Check timezone conversion

---

### Issue: "I Don't Remember Setting Up Billing"

#### Security Check

1. **Verify identity**: Use normal verification process
2. **Check history**: Pull Stripe events
3. **Review details**: Show what was authorized

#### Common Explanations

- User forgot authorizing during bot creation
- Multiple people using account
- Billing setup redirected after bot creation (expected)
- Billing setup link in welcome email

#### Resolution

1. **Confirm authorization**: "Did you complete bot creation?"
2. **Verify card**: Show last 4 digits from Stripe
3. **Check Stripe portal**: Direct user to review activity
4. **If unauthorized**: Escalate to security team immediately

---

### Issue: "Why Am I Being Charged Monthly if I Don't Trade?"

#### Explanation

1. **No trades** = **No charges**
2. User might be:
   - Confused about billing cycle
   - Seeing old invoice
   - Have profitable trades they forgot about

#### Investigation

1. **Ask**:
   - "When were you charged?"
   - "Did your bot execute trades?"
   - "Did you make any profits?"

2. **Check**:
   ```bash
   # Pull trade history
   curl -X GET https://app.nexusmeme.com/api/bots/{botId}/trades \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

3. **Verify**:
   - If no trades = No fees
   - If trades with losses = No fees
   - If profitable trades = Fee correct

#### Resolution

- **If no trades**: Fees should be $0, investigate charge
- **If trades**: Explain fee calculation with examples
- **If error**: Create fee waiver/adjustment

---

### Issue: "Can I Get a Refund?"

#### Refund Policy

| Scenario | Refundable | Process |
|----------|-----------|---------|
| Fee calculation error | Yes | Verify, adjust, credit |
| Changed mind | No | Delete bot, stop new charges |
| Bot didn't work | No | Fees based on actual profits |
| Duplicate charge | Yes | Issue refund via Stripe |
| Dispute with exchange | Case-by-case | Review trade data |

#### How to Issue Refund

1. **Verify reason**:
   - Review trade data
   - Check calculations
   - Compare with our records

2. **Use admin panel**:
   - Go to /admin/fees
   - Find fee record
   - Click "Refund"
   - Enter amount and reason

3. **Process**:
   - Refund issued to user's card
   - Processing takes 3-5 business days
   - Send email confirmation

#### Example Scenarios

```
Scenario 1: Wrong profit calculation
→ Verify with exchange data
→ If our error: Refund difference

Scenario 2: Trade data corruption
→ Pull exchange history
→ Recalculate fees
→ Adjust and credit account

Scenario 3: User disputes profit reporting
→ Provide full trade logs
→ Show calculation
→ If customer right: Refund
```

---

### Issue: "Card Keeps Getting Declined"

#### Diagnosis Steps

1. **Ask user**:
   - "What's the error message?" (helps identify Stripe error code)
   - "Does the card work elsewhere?"
   - "Is the card expired?"

2. **Check Stripe**:
   - Pull card details from Stripe API
   - Check for known issues

#### Common Causes

| Code | Meaning | User Fix |
|------|---------|----------|
| declined | Card refused by issuer | Contact bank |
| insufficient_funds | Not enough money | Add funds to account |
| expired_card | Card expired | Use different card |
| lost_card | Bank flagged as lost | Use different card |
| processing_error | Temporary Stripe issue | Try again in 5 min |
| rate_limit | Too many attempts | Wait 15 minutes |

#### Solution Path

1. **Verify card details**:
   - Number, expiration, CVC
   - Ensure no typos

2. **Try different card**:
   - If available, test another card
   - Rules out bank issue

3. **Contact bank**:
   - They may be blocking online charges
   - Need to whitelist Stripe/NexusMeme
   - May need to call instead of online

4. **Retry after delay**:
   - Wait 5-15 minutes
   - Retry in dashboard

5. **Alternative**: Stripe portal:
   - Might work differently than dashboard
   - Try from email receipt link

#### Escalation

If all fails:
- Ask user to contact their bank directly
- Provide Stripe's phone number if needed
- Document issue with all error codes
- Schedule follow-up after 24 hours

---

### Issue: "I Want to Stop Trading"

#### Options for User

| Option | Effect | Reversible |
|--------|--------|-----------|
| Pause bot | Bot stops trading, can resume | Yes |
| Delete bot | Bot removed, can create new | Yes (but loses history) |
| Cancel subscription | No new bots, existing continue | Yes (can upgrade again) |
| Close account | Account deleted | No |

#### Most Common: Delete Bot

1. User deletes bot
2. No new charges on that bot
3. Other bots continue
4. Charges only on remaining profitable trades

#### Support Response

1. **Ask**: "Do you want to stop all trading or just this bot?"
2. **Guide**: Recommend deleting bot (not closing account)
3. **Confirm**: "You'll lose this bot's history, okay?"
4. **Execute**: User deletes from dashboard

#### Special Cases

- **"I can't afford fees"**:
  - Delete bots to stop new charges
  - Existing pending fees still due
  - Contact support for possible waiver

- **"Bot isn't profitable"**:
  - Not our responsibility
  - Suggest strategy adjustment
  - Or delete bot and try new strategy

---

### Issue: "How Do I Withdraw My Profits?"

#### This Is An Exchange Question

1. **Clarify scope**:
   - Fees go to NexusMeme
   - Profits stay in exchange account
   - User must withdraw from exchange

2. **Direct to exchange**:
   - Binance: Wallet → Withdraw
   - Kraken: Funding → Withdraw
   - Other: Check exchange help

3. **Our role**:
   - We collect 5% fees monthly
   - We don't hold user's money
   - User withdraws directly from exchange

#### Example

```
Bot makes $500 profit on Binance
→ $500 in user's Binance account
→ NexusMeme bills $25 (5%)
→ User goes to Binance → Withdraw $475 (if desired)
```

---

## Escalation Procedures

### When to Escalate

| Situation | Escalate To |
|-----------|------------|
| Possible account compromise | Security team |
| Stripe API errors | Engineering team |
| Large refund requests | Manager |
| Legal/compliance questions | Compliance team |
| Multiple failed troubleshooting | Senior support |
| Angry/threatening customer | Management |

### Escalation Template

```
ISSUE: [Brief description]
USER: [User ID and email]
DETAILS: [What happened, what we tried]
SCREENSHOTS: [Any error messages]
URGENCY: [Low/Medium/High]
REQUESTED ACTION: [What do we need to do?]
```

---

## Prevention Tips

### Teach Users These Best Practices

1. **Update card before expiration**
   - Set calendar reminder
   - Check dashboard monthly

2. **Monitor profits monthly**
   - Watch P&L in dashboard
   - Understand expected fees
   - No surprises on billing date

3. **Keep billing contact updated**
   - Email address in Stripe
   - Phone for Stripe notifications

4. **Use Stripe portal**
   - Direct link in emails
   - More control than dashboard
   - Can update card anytime

5. **Start with small stake**
   - Test strategy first
   - Increase after gaining confidence
   - Understand fee impact

---

## Admin Commands

### View User's Fees

```bash
curl -X GET https://app.nexusmeme.com/api/admin/fees?userId=USER_ID
```

### Adjust Fee

```bash
curl -X POST https://app.nexusmeme.com/api/admin/fees/adjust \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "feeId": "FEE_ID",
    "correctedProfit": 400,
    "reason": "Corrected profit calculation per user verification"
  }'
```

### Waive Fee (Not Yet Billed)

```bash
curl -X POST https://app.nexusmeme.com/api/admin/fees/waive \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "feeId": "FEE_ID",
    "reason": "Early adopter retention"
  }'
```

### Refund Fee (Already Billed)

```bash
curl -X POST https://app.nexusmeme.com/api/admin/fees/refund \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "feeId": "FEE_ID",
    "reason": "Profit calculation error - user provided exchange records"
  }'
```

---

## Response Templates

### Fee Too High

```
Thank you for reaching out!

I've reviewed your account and fee calculation:
- Your profit this month: $[amount]
- Our fee (5%): $[fee]
- This is correct per our pricing model

However, if you believe there's an error, please share:
- Your bot name
- Trade pair/dates
- Profit amount from your exchange

We'll investigate and adjust if needed.
```

### Payment Failed

```
I see your payment was declined. Here's what to do:

1. Go to Dashboard → Billing & Plans
2. Click "Update Payment Method"
3. Enter your card details
4. Click "Save"

Once updated, we'll retry automatically and lift the suspension.

Common reasons for decline:
- Expired card
- Insufficient funds
- Bank blocking online purchases (contact bank)

Let me know if you need further help!
```

### No Fees Shown

```
Fees only appear after your bot generates profits!

Here's why you might not see fees:
- Your bot hasn't traded yet
- Trades closed with losses (no fee on losses)
- Bot is paused or disabled

To get started:
1. Ensure bot is set to "Active"
2. Check that market conditions match your strategy
3. Let bot run for a while to execute trades

Once profitable trades close, fees will appear on the 1st of next month.
```

---

## Metrics to Monitor

Track these for quality assurance:

- **Fee disputes per month**: Should be < 2%
- **Payment failure rate**: Should be < 5%
- **Customer satisfaction**: Track CSAT on billing tickets
- **Average resolution time**: Target < 24 hours
- **Escalation rate**: Should be < 10% of all tickets

---

## Links for Support Team

- **Admin Panel**: https://app.nexusmeme.com/admin/fees
- **User Dashboard**: https://app.nexusmeme.com/dashboard/billing
- **Stripe Dashboard**: https://dashboard.stripe.com
- **Help Center**: https://app.nexusmeme.com/help
- **Performance Fees Guide**: [This file]

---

## Questions?

For support team questions about policies or procedures, see:
- [Performance Fees Implementation](./PERFORMANCE_FEES_IMPLEMENTATION.md)
- [Performance Fees Help](./PERFORMANCE_FEES_HELP.md)
