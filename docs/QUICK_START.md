# Nexus Trading Platform - Quick Start Guide

## Project at a Glance

**Goal**: Scale profitable trading bots to 5000+ users (6-month project)

**Core Constraints**:
- ✅ Scale what works (bots already profitable)
- ✅ Never modify existing trading strategy
- ✅ Minimize API calls (single call for all users)
- ✅ Respect market regime protection
- ✅ Mobile-first, best practices only

**Tech Stack**:
- Frontend: Next.js 15+ with TypeScript, Tailwind CSS, React hooks
- Backend: Node.js, PostgreSQL (with UNLOGGED tables), mgpg (job queue)
- Auth: next-auth with Google Cloud OAuth
- Billing: Stripe (subscriptions + webhooks)
- Email: Resend (transactional)
- Exchanges: Kraken, Binance, Coinbase (pluggable adapters)
- AI: OpenAI (abstracted to allow Claude, etc.)

**Timeline**: 24 weeks (6 months) in 14 phases

---

## Before You Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- GitHub account
- Stripe account (test mode)
- Resend account
- Google Cloud Console access
- OpenAI API key

### Initial Setup (Day 1)
```bash
# Clone repo
git clone <repo-url>
cd new_unnamed_project

# Install dependencies
pnpm install

# Create .env.local with required vars
cp .env.example .env.local
# Edit .env.local with your API keys

# Create local database
createdb nexus_trading_dev
pnpm run migrate:dev

# Start dev server
pnpm dev

# Visit http://localhost:3000
```

### Verify Everything Works
```bash
pnpm type-check    # No errors?
pnpm lint          # No warnings?
pnpm test          # Tests passing?
pnpm build         # Builds successfully?
```

If all pass, you're ready to start Phase 1!

---

## Phase Quick Reference

| Phase | Week | Focus | Key Files | Owner |
|-------|------|-------|-----------|-------|
| 1 | 1-2 | Foundation & Setup | package.json, tsconfig.json, src/config/ | Backend Lead |
| 2 | 3-4 | Trading Engine Core | src/services/market-data/, regime/, execution/ | Backend Lead |
| 3 | 5-6 | Exchange Adapters | src/services/exchanges/, src/services/api-keys/ | Backend Lead |
| 4 | 7-8 | Job Queue & Caching | src/services/jobs/, src/lib/cache.ts | Backend Lead |
| 5 | 9 | Authentication | src/auth/, src/middleware/authorize.ts | Backend Lead |
| 6 | 10 | Stripe Billing | src/app/api/billing/, src/services/billing/ | Backend Lead |
| 7 | 11 | Email System | src/services/email/, src/emails/templates/ | Backend Lead |
| 8 | 12-13 | Frontend | src/components/, src/app/ | Frontend Lead |
| 9 | 14-15 | Alerts & Observability | src/services/alerts/, src/lib/logger.ts | Backend Lead |
| 10 | 16 | AI Abstraction | src/lib/ai/ | Backend Lead |
| 11 | 17-18 | Load Testing | scripts/load-test.ts | DevOps Lead |
| 12 | 19-20 | Security Hardening | Security audit, fixes | Security Lead |
| 13 | 21-22 | Testing & QA | Test suite completion | QA Lead |
| 14 | 23-24 | Deployment & Launch | CI/CD, monitoring, runbooks | DevOps Lead |

---

## Critical Paths (Don't Skip These!)

### Must Complete Before Phase 9
- [ ] Market data aggregation (Phase 2)
- [ ] Regime gatekeeper (Phase 2)
- [ ] Execution fan-out (Phase 2)
- [ ] Exchange adapters (Phase 3)
- [ ] Job queue (Phase 4)
- [ ] Authentication (Phase 5)

### Must Complete Before Phase 14 (Launch)
- [ ] All 13 previous phases complete
- [ ] Load test passing (Phase 11)
- [ ] Security audit passed (Phase 12)
- [ ] All tests passing (Phase 13)
- [ ] Monitoring configured
- [ ] Runbooks documented

---

## Key Decisions to Make Now

These decisions should be made in week 1 (Phase 0):

1. **Team Size & Roles**
   - Backend Engineer: 1-2 people
   - Frontend Engineer: 1-2 people
   - DevOps/Infra: 1 person
   - QA/Testing: 1 person
   - Tech Lead: 1 person

2. **Hosting Provider**
   - Frontend: Vercel (recommended) or Netlify
   - Backend: Railway or Render
   - Database: Railway PostgreSQL (recommended) or Supabase

3. **Monitoring & Alerting**
   - Sentry for error tracking
   - DataDog or New Relic for metrics
   - PagerDuty for on-call

4. **Encryption Library**
   - libsodium (Recommendation: industry standard)
   - Or Node.js crypto

5. **Job Queue Configuration**
   - Max retries: 3 (configurable)
   - Backoff: exponential
   - Max workers: Scale based on load

---

## Key Files to Know

### Core Configuration
- **src/config/environment.ts** - All typed environment variables
- **src/config/pyramiding.ts** - Trading strategy rules (from .env)
- **src/config/billing.ts** - Subscription plans

### Trading Engine
- **src/services/market-data/aggregator.ts** - Single-call market data
- **src/services/regime/gatekeeper.ts** - Regime check + execution guard
- **src/services/execution/fan-out.ts** - Per-user execution plans
- **src/services/exchanges/** - Exchange adapters (Kraken, Binance, Coinbase)

### Backend Infrastructure
- **src/services/jobs/queue.ts** - mgpg job queue
- **src/lib/cache.ts** - Caching abstraction
- **src/middleware/rate-limit.ts** - Rate limiting

### Auth & Billing
- **src/auth/auth.ts** - next-auth configuration
- **src/app/api/webhooks/stripe.ts** - Stripe webhook handler
- **src/services/email/resend.ts** - Email service

### Frontend
- **src/components/ui/** - Reusable UI components
- **src/components/forms/** - Form components with validation
- **src/app/dashboard/** - User dashboard

### Database
- **migrations/** - All database schema migrations
- **scripts/seed.ts** - Seed test data

### Documentation
- **CLAUDE.md** - Development guidelines (read this!)
- **IMPLEMENTATION_PLAN.md** - Detailed plan for all phases
- **WORKFLOW.md** - How to execute the plan

---

## Development Workflow

### Daily Standup (5 min)
```
What did I complete yesterday?
What am I working on today?
Any blockers?
```

### Before Committing Code
```bash
pnpm format          # Auto-format code
pnpm lint --fix      # Fix linting errors
pnpm type-check      # Verify types
pnpm test            # Run tests
git add .
git commit -m "feat: description of change"
```

### Creating a Pull Request
1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes following CLAUDE.md guidelines
3. Add/update tests
4. Push: `git push -u origin feature/my-feature`
5. Open PR with description
6. Wait for review + all checks to pass
7. Merge and deploy to staging

### Code Review Checklist
- [ ] Follows TypeScript best practices
- [ ] No hardcoded values (uses config)
- [ ] Tests added and passing
- [ ] Error handling implemented
- [ ] Database migrations included (if applicable)
- [ ] Backwards compatible
- [ ] Documentation updated

---

## When Things Go Wrong

### Build Fails
```bash
# Clear cache and reinstall
rm -rf node_modules .next
pnpm install
pnpm build
```

### Type Errors
```bash
pnpm type-check  # See all type errors
# Fix them or ask for help in Slack
```

### Database Issues
```bash
# Reset local database
dropdb nexus_trading_dev
createdb nexus_trading_dev
pnpm run migrate:dev
```

### Tests Failing
```bash
pnpm test -- --watch  # Run in watch mode
# Fix issues as they appear
```

### Blocker / Need Help
1. Post in team Slack channel with:
   - What you're trying to do
   - What went wrong
   - Error message/screenshot
   - What you've already tried
2. Tech lead will respond within 4 hours
3. If critical, escalate to tech lead directly

---

## Success Metrics

### Per Phase
- All deliverables completed
- Tests passing (>70% coverage)
- Code reviewed and approved
- No regressions from previous phases

### Before Launch
- Load test: 5000 concurrent users ✅
- API calls: < 1 per second ✅
- Latency: < 500ms p95 ✅
- Error rate: < 0.1% ✅
- Security: All vulnerabilities patched ✅
- Monitoring: Dashboards and alerts active ✅

---

## Useful Commands

```bash
# Development
pnpm dev              # Start dev server
pnpm dev:debug       # Debug mode

# Code Quality
pnpm lint            # Check linting
pnpm format          # Auto-format code
pnpm type-check      # Type checking

# Testing
pnpm test            # Watch mode
pnpm test:ci         # CI mode
pnpm test:coverage   # With coverage

# Building
pnpm build           # Production build
pnpm start           # Start prod server

# Database
pnpm migrate:dev     # Run migrations locally
pnpm migrate:prod    # Run migrations in production

# Load Testing
pnpm load-test       # Run load test

# Monitoring
pnpm metrics         # View metrics endpoint
```

---

## Documentation Structure

**Read in this order:**

1. **This file (QUICK_START.md)** - Overview and quick reference
2. **CLAUDE.md** - Development standards and guidelines
3. **IMPLEMENTATION_PLAN.md** - Detailed plan for each phase
4. **WORKFLOW.md** - How to execute and track progress

**During development:**
- Keep CLAUDE.md open as reference for code style
- Consult IMPLEMENTATION_PLAN.md for phase details
- Use WORKFLOW.md for decision-making and escalations

---

## Team Contacts

- **Tech Lead**: (@tech-lead on Slack)
- **Backend Lead**: (@backend-lead on Slack)
- **Frontend Lead**: (@frontend-lead on Slack)
- **DevOps Lead**: (@devops-lead on Slack)
- **QA Lead**: (@qa-lead on Slack)

---

## Important Notes

### DO NOT
- ❌ Modify existing trading strategy
- ❌ Hardcode configuration values
- ❌ Log API keys or secrets
- ❌ Forget to validate user input
- ❌ Skip tests for "quick fixes"
- ❌ Merge unreviewed code
- ❌ Commit directly to main branch

### DO
- ✅ Scale what's already profitable
- ✅ Use environment variables for all config
- ✅ Write tests as you code
- ✅ Ask for help when blocked
- ✅ Follow code review process
- ✅ Keep documentation updated
- ✅ Monitor API call minimization

### Remember
**This project succeeds by scaling what works, not by fixing what's broken.**

If you're tempted to "improve" the trading logic, stop and ask yourself:
- Is this change required for the feature I'm building?
- Does this maintain the profitability guarantee?
- Have I discussed this with the tech lead?

If the answer to any is "no", don't make the change!

---

## Next Steps

1. **Week 1**:
   - [ ] Read CLAUDE.md completely
   - [ ] Set up development environment
   - [ ] Run `pnpm dev` successfully
   - [ ] Attend team kickoff meeting
   - [ ] Claim first task in GitHub Project

2. **Week 2**:
   - [ ] Complete Phase 1 deliverables
   - [ ] Submit PR for code review
   - [ ] Attend weekly sync
   - [ ] Help team members unblock

3. **Week 3+**:
   - [ ] Follow WORKFLOW.md for execution
   - [ ] Keep IMPLEMENTATION_PLAN.md updated
   - [ ] Participate in daily standups
   - [ ] Review PRs from teammates

---

## Resources

- **Next.js Docs**: https://nextjs.org/docs
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/
- **PostgreSQL**: https://www.postgresql.org/docs/
- **Tailwind CSS**: https://tailwindcss.com/docs
- **Stripe API**: https://stripe.com/docs
- **next-auth**: https://next-auth.js.org/

---

Good luck! Let's build something great. 🚀
