# NexusMeme Documentation Index

## 📚 Main References

### Getting Started
- **[README.md](README.md)** - Project overview and features
- **[QUICK_START.md](QUICK_START.md)** - Quick setup guide
- **[SETUP_INSTRUCTIONS.md](SETUP_INSTRUCTIONS.md)** - Detailed setup steps

### Development
- **[../CLAUDE.md](../CLAUDE.md)** - Developer guide (in root) - Code style, patterns, and best practices
- **[WORKFLOW.md](WORKFLOW.md)** - Development workflow and git practices
- **[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)** - Architecture and implementation strategy

### Deployment & Operations
- **[PHASE_1_SETUP.md](PHASE_1_SETUP.md)** - Phase 1 setup checklist
- **[DEPLOYMENT_VERIFICATION.md](DEPLOYMENT_VERIFICATION.md)** - Deployment verification steps
- **[DELIVERY_CHECKLIST.md](DELIVERY_CHECKLIST.md)** - Delivery checklist

### Project Documentation
- **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)** - High-level project overview
- **[CRITICAL_FIXES_SUMMARY.md](CRITICAL_FIXES_SUMMARY.md)** - Important fixes and changes
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - Implementation status
- **[ADDENDUM.md](ADDENDUM.md)** - Additional notes and updates

---

## 🎯 Plan Features Implementation

### Status: ✅ FULLY IMPLEMENTED

Plan limits are now **enforced** in the bot API endpoints:

**Trading Pairs Per Bot** (enforced via plan subscription):
- **Starter (Free)**: 2 pairs max (BTC, ETH only)
- **NexusMeme Standard** ($19.99/mo): 5 pairs max
- **NexusMeme Pro** ($34.99/mo): 10 pairs max

**Enforcement Points**:
1. ✅ **POST /api/bots** - When creating a bot with initial pairs
2. ✅ **PATCH /api/bots** - When updating/adding trading pairs
3. ✅ **checkActionAllowed()** - Service function validates against plan limits

**Error Responses**:
```json
{
  "error": "Your plan allows a maximum of 2 trading pairs",
  "code": "PLAN_LIMIT_EXCEEDED",
  "limit": 2,
  "requested": 5,
  "status": 403
}
```

### All Users Have Access
- ✅ Documentation: All users can read `/docs/` files
- ✅ API errors: Clear messages about plan limits
- ✅ Community support: Available to all plan tiers

---

## 📋 Key Files Modified

### API Endpoints
- `src/app/api/bots/route.ts` - Added plan enforcement to POST and PATCH

### Services
- `src/services/billing/subscription.ts` - Updated `checkActionAllowed()` to return plan limits

### Configuration
- `src/config/pricing.ts` - Plan definitions with trading pair limits
- `src/types/billing.ts` - Type definitions

### Email Templates
- `src/email/templates/subscription.tsx` - Updated plan features
- `src/email/templates/trial-ending.tsx` - Trial expiration notices
- `src/email/templates/welcome.tsx` - Onboarding with logo
- `src/email/templates/invoice.tsx` - Invoice emails with logo
- `src/email/templates/password-reset.tsx` - Password reset with logo

---

## 🚀 Testing Plan Limits

### Test 1: Create Bot with Starter Plan (2 pair limit)
```bash
# Should succeed
POST /api/bots
{ "enabledPairs": ["BTC/USD"] }

# Should fail - exceeds 2 pair limit
POST /api/bots
{ "enabledPairs": ["BTC/USD", "ETH/USD", "BTC/USDT"] }
```

### Test 2: Update Bot with Standard Plan (5 pair limit)
```bash
# After upgrading to Standard ($19.99/mo)
# Should succeed
PATCH /api/bots
{ "botId": "xxx", "enabledPairs": ["BTC/USD", "ETH/USD", "BTC/USDT", "ETH/USDT"] }

# Should fail - exceeds 5 pair limit
PATCH /api/bots
{ "botId": "xxx", "enabledPairs": ["BTC/USD", "ETH/USD", "BTC/USDT", "ETH/USDT", "BTC/BUSD", "ETH/BUSD"] }
```

### Test 3: Free Trial Expires
- User signs up → Auto-assigned Starter plan with 14-day trial
- Day 3 before expiry → Email sent with upgrade options
- After 14 days → Subscription moves to active status but pair limit enforced

---

## 💾 Database Schema

### Subscriptions Table
```sql
subscriptions (
  id, user_id, plan, status,
  trial_ends_at, trial_notification_sent_at,
  stripe_subscription_id, stripe_customer_id,
  current_period_start, current_period_end,
  cancelled_at, created_at, updated_at
)
```

### Bot Instances Table
```sql
bot_instances (
  id, user_id, exchange,
  enabled_pairs, trading_pairs,
  status, config, created_at, updated_at
)
```

---

## 🔒 Security & Access

- All authenticated users can read documentation
- Plan limits enforced at API boundary
- Subscription status checked before operations
- Stripe webhooks sync trial expiration dates

---

## 📞 Support

All plans include access to:
- Community documentation (`/docs/`)
- Email support (priority varies by plan)
- API error messages with upgrade recommendations

---

**Last Updated**: January 2026
**Version**: 2.0 (Plan Enforcement Active)
