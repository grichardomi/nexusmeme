# Performance Fees - Implementation Status

## Overview

This document tracks the implementation of performance fee billing system across the entire NexusMeme platform, including code updates, documentation, and onboarding flows.

---

## ✅ Completed

### 1. Core System (Backend)
- ✅ Database schema: `013_performance_fee_billing.sql`
- ✅ Performance fee service: `src/services/billing/performance-fee.ts`
- ✅ Monthly billing job: `src/services/billing/monthly-billing-job.ts`
- ✅ Stripe webhook handler: `src/services/billing/stripe-webhook-handler.ts`
- ✅ API endpoints for fees and billing
- ✅ Email templates for fee notifications

### 2. User-Facing Pages
- ✅ **Pricing page** (`/pricing`) - Updated to show 5% performance fee model
  - Shows how performance fees work
  - Example calculations
  - Comparison vs. traditional plans
  - FAQ section with key questions
  - CTA to create bot

### 3. Documentation
- ✅ **Performance Fees Help** (`docs/PERFORMANCE_FEES_HELP.md`)
  - User-friendly explanation
  - Getting started guide
  - Viewing fees in dashboard
  - Billing status explanations
  - Common questions FAQ
  - Troubleshooting section

- ✅ **Onboarding: Billing Setup** (`docs/ONBOARDING_BILLING.md`)
  - Step-by-step setup guide
  - What billing setup does/doesn't do
  - Security & privacy
  - Payment failure handling
  - Managing billing

- ✅ **Support Troubleshooting** (`docs/SUPPORT_PERFORMANCE_FEES.md`)
  - Complete support staff guide
  - Common issues with solutions
  - Refund policy
  - Escalation procedures
  - Admin commands
  - Response templates

### 4. Components
- ✅ **PerformanceFeesPricing component** (`src/components/billing/PerformanceFeesPricing.tsx`)
  - Reusable pricing display component
  - Works on pricing page and other sections
  - Includes how-it-works diagram
  - Benefits list
  - Monthly example
  - Comparison table
  - FAQ section

---

## ⏳ In Progress

### Dashboard Billing Page
**File**: `/dashboard/billing/page.tsx`

**Changes Needed**:
1. Add performance fee summary section
   - Total profits
   - Total fees collected
   - Pending fees
   - Recent transactions list

2. Add monthly charge history
   - Invoices with dates
   - Charge amounts and status
   - Download invoice links

3. Add payment method management
   - Update card button
   - List of payment methods
   - Default method selection

**Components to Create**:
- `PerformanceFeesSummary.tsx` - Shows profit/fee overview
- `ChargeHistory.tsx` - Lists monthly billing cycles
- `PaymentMethods.tsx` - Manage payment methods

---

## 📋 Pending (Should Be Done)

### 1. Terms of Service & Privacy Policy
**Files**:
- `src/app/legal/terms/page.tsx` or similar
- `src/app/legal/privacy/page.tsx` or similar

**Updates Needed**:
- Add section explaining 5% performance fee model
- Clarify automatic monthly billing
- Explain billing status (suspended, past-due, etc.)
- Link to Performance Fees Help doc
- Explain fee waiver/adjustment policy

### 2. Help Center Article
**File**: `src/app/help/performance-fees/page.tsx` (NEW)

**Content**:
- Import and display `PERFORMANCE_FEES_HELP.md`
- Or create React component with same content
- Add navigation links to related articles

### 3. Onboarding Flow
**File**: Bot creation flow (`/dashboard/bots/new`)

**Changes**:
- After bot created, show billing setup prompt
- Explain why billing is needed
- Link to billing setup page
- Show billing setup progress indicator

### 4. User Emails
**Triggers to Implement**:
- Email when bot created (reminder to set up billing)
- Email when first profitable trade closes (showing fee calculation)
- Email when monthly billing runs (invoice receipt)
- Email when payment fails (with action items)

**Template**: Already created in `src/email/templates/performance-fees.tsx`
**Triggers**: Need to wire up in `src/services/email/triggers.ts`

### 5. Admin Panel
**File**: `/admin/fees` (may need updates)

**Features**:
- View all fees with user details
- Adjust fee (if calculation error)
- Waive fee (if not yet billed)
- Refund fee (if already billed)
- View audit trail

---

## 🔄 Integration Checklist

### Backend Integration

- [ ] **Trade Execution**: Hook fee recording to trade close
  ```typescript
  // In trade execution handler
  if (trade.profit_loss > 0) {
    await recordPerformanceFee(userId, trade.id, botId, trade.profit_loss);
  }
  ```

- [ ] **Cron Job**: Schedule monthly billing
  ```typescript
  // In job scheduler
  schedule('0 2 1 * *', () => runMonthlyBillingJob());
  ```

- [ ] **Webhook**: Stripe webhook is configured
  - Endpoint: `/api/webhooks/stripe/billing`
  - Events: `invoice.paid`, `invoice.payment_failed`, `charge.refunded`
  - Secret: Set in `.env` as `STRIPE_WEBHOOK_SECRET_BILLING`

### Frontend Integration

- [ ] **Billing Dashboard**: Show performance fees
- [ ] **Bot Creation**: Billing setup during bot creation
- [ ] **Help Pages**: Links to performance fees documentation
- [ ] **Error Messages**: Clear explanations of billing statuses
- [ ] **Emails**: Trigger fee-related emails

### Documentation

- [ ] **Help Center**: Live help pages for users
- [ ] **Blog**: Article explaining performance fees
- [ ] **FAQ**: Visible in multiple locations
- [ ] **Support**: Team trained on handling fee questions

---

## 📂 File Structure (Created)

```
docs/
├── PERFORMANCE_FEES_IMPLEMENTATION.md    # System design (existing)
├── PERFORMANCE_FEES_INTEGRATION_GUIDE.md # Integration steps (existing)
├── PERFORMANCE_FEES_SUMMARY.md           # Executive summary (existing)
├── PERFORMANCE_FEES_HELP.md              # ✅ User help guide (NEW)
├── ONBOARDING_BILLING.md                 # ✅ Billing setup guide (NEW)
├── SUPPORT_PERFORMANCE_FEES.md           # ✅ Support staff guide (NEW)
└── IMPLEMENTATION_STATUS.md              # ✅ This file (NEW)

src/components/billing/
├── PricingPlans.tsx                      # (existing - keep)
├── CheckoutModal.tsx                     # (existing - keep)
└── PerformanceFeesPricing.tsx            # ✅ New pricing display (NEW)

src/app/pricing/
└── page.tsx                              # ✅ Updated to use PerformanceFeesPricing

src/app/dashboard/billing/
└── page.tsx                              # (needs performance fees section)
```

---

## 🚀 Rollout Strategy

### Phase 1: User Awareness (Week 1-2)
- [ ] Update pricing page (DONE ✅)
- [ ] Create help documentation (DONE ✅)
- [ ] Notify existing users via email about new billing model
- [ ] Update FAQ and support pages

### Phase 2: New Users (Week 3-4)
- [ ] Enable billing setup during bot creation
- [ ] Show performance fees in dashboard
- [ ] Test with beta users (5-10)
- [ ] Collect feedback

### Phase 3: All Users (Week 5)
- [ ] Full rollout to all users
- [ ] Migrate existing plans to performance fee model
- [ ] Monitor for support tickets
- [ ] Track billing metrics

### Phase 4: Optimization (Ongoing)
- [ ] Analyze fee collection patterns
- [ ] Adjust messaging based on feedback
- [ ] Refine help documentation
- [ ] Train support team

---

## 📊 Key Metrics to Track

- Monthly fee collection rate (% of profitable users paying)
- Average fee per user per month
- Payment failure rate (should be < 5%)
- Average resolution time for billing issues
- Customer satisfaction (CSAT) on billing pages
- Churn rate (comparing before/after fee implementation)

---

## 🎯 Success Criteria

✅ Users understand they only pay on profits
✅ Billing setup is completed by 80% of users
✅ Payment failure rate stays below 5%
✅ Support gets < 5% of tickets about billing confusion
✅ No unplanned refunds or disputes
✅ All new bots have billing set up before trading

---

## 🔗 Related Documentation

- [Performance Fees Implementation](./PERFORMANCE_FEES_IMPLEMENTATION.md)
- [Performance Fees Integration Guide](./PERFORMANCE_FEES_INTEGRATION_GUIDE.md)
- [Performance Fees Summary](./PERFORMANCE_FEES_SUMMARY.md)
- [Performance Fees Help](./PERFORMANCE_FEES_HELP.md)
- [Onboarding: Billing Setup](./ONBOARDING_BILLING.md)
- [Support: Performance Fees](./SUPPORT_PERFORMANCE_FEES.md)

---

## 📝 Next Steps

1. **Immediate** (This week):
   - [ ] Create billing dashboard section with performance fees
   - [ ] Update Terms of Service
   - [ ] Create help center article

2. **Short-term** (Next week):
   - [ ] Implement bot creation → billing setup flow
   - [ ] Wire up fee-related emails
   - [ ] Update admin panel

3. **Medium-term** (2 weeks):
   - [ ] Beta test with select users
   - [ ] Refine based on feedback
   - [ ] Train support team

4. **Long-term** (Ongoing):
   - [ ] Monitor metrics
   - [ ] Optimize user experience
   - [ ] Adjust messaging

---

## Questions?

Refer to the specific documentation files:
- **Users**: See `PERFORMANCE_FEES_HELP.md`
- **Onboarding**: See `ONBOARDING_BILLING.md`
- **Support Staff**: See `SUPPORT_PERFORMANCE_FEES.md`
- **Technical**: See `PERFORMANCE_FEES_IMPLEMENTATION.md`
