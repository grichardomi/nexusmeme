# Nexus Trading Platform

**Scale profitable trading bots to 5000+ users. Mobile-first. Best practices only.**

---

## 📋 Quick Navigation

### 🎯 Want to Understand the Project?
Start here: **[PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md)** (10 min read)
- Executive summary
- What we're building and why
- Success criteria
- Risk mitigation
- Approval checklist

### 🚀 Getting Started as a Developer?
Start here: **[QUICK_START.md](./QUICK_START.md)** (10 min read)
- Installation steps
- Development workflow
- Key commands
- When things go wrong
- Emergency contacts

### 📖 What Are the Rules?
Read this before coding: **[CLAUDE.md](./CLAUDE.md)** (30 min read)
- Core architecture principles (non-negotiable!)
- Code style and standards
- TypeScript conventions
- Database best practices
- Security guidelines
- Common mistakes to avoid

### 📅 How Do We Execute?
Reference during execution: **[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** (read per phase)
- Detailed plan for all 14 phases
- Specific deliverables for each phase
- Critical decision points
- Testing strategy per phase
- Success criteria for each phase

### 🔄 How Do We Track Progress?
Reference during team coordination: **[WORKFLOW.md](./WORKFLOW.md)** (reference)
- Phased execution with exit criteria
- Decision-making framework
- Quality gates and checkpoints
- Team communication plan
- Issue & blocker management
- Post-launch operational workflow

---

## 🎯 Project at a Glance

**Goal**: Build a SaaS trading platform for 5000+ users in 24 weeks

**Core Constraints** (Non-Negotiable):
- ✅ Scale what works (existing bots already profitable)
- ✅ Never modify trading strategy
- ✅ Minimize API calls (single call for all users)
- ✅ Respect market regime protection
- ✅ No hardcoding or temporary fixes

**Tech Stack**:
- Next.js 15+ with TypeScript & Tailwind CSS
- PostgreSQL with UNLOGGED tables
- mgpg job queue
- next-auth + Google Cloud OAuth
- Stripe subscriptions
- Resend for email
- Kraken, Binance, Coinbase adapters

**Timeline**: 24 weeks (6 months) across 14 phases

**Team**: 5-7 people (Backend 2x, Frontend 2x, DevOps 1x, QA 1x, Tech Lead 1x)

---

## 📚 Document Reading Guide

### For Different Roles

**Tech Lead** (Read first):
1. PROJECT_SUMMARY.md (10 min) - Understand scope, timeline, resources
2. IMPLEMENTATION_PLAN.md (30 min) - See detailed phases and decisions
3. WORKFLOW.md (20 min) - Understand how to manage execution
4. CLAUDE.md (15 min) - Reference for code review standards

**Backend Engineer** (Read first):
1. QUICK_START.md (10 min) - Get dev environment running
2. CLAUDE.md (30 min) - Core development standards
3. IMPLEMENTATION_PLAN.md Phase 2-7 (45 min) - Trading engine + infrastructure
4. WORKFLOW.md (10 min) - Understand decision-making process

**Frontend Engineer** (Read first):
1. QUICK_START.md (10 min) - Get dev environment running
2. CLAUDE.md (30 min) - Development standards
3. IMPLEMENTATION_PLAN.md Phase 8 (10 min) - Frontend architecture
4. WORKFLOW.md (10 min) - Understand process

**DevOps Engineer** (Read first):
1. QUICK_START.md (10 min) - Development environment
2. IMPLEMENTATION_PLAN.md Phase 1, 11, 14 (20 min) - Infrastructure phases
3. WORKFLOW.md (20 min) - Deployment and monitoring
4. CLAUDE.md (15 min) - Development standards

**QA Engineer** (Read first):
1. QUICK_START.md (10 min) - Development environment
2. CLAUDE.md Section: Testing Strategy (20 min)
3. IMPLEMENTATION_PLAN.md Phase 13 (15 min) - Testing and QA
4. WORKFLOW.md (10 min) - Quality gates and checkpoints

### For Different Situations

**"I'm new to the project"**:
→ QUICK_START.md + CLAUDE.md + onboarding with tech lead

**"I need to know the timeline"**:
→ PROJECT_SUMMARY.md → IMPLEMENTATION_PLAN.md

**"I'm starting a new phase"**:
→ IMPLEMENTATION_PLAN.md for that specific phase → WORKFLOW.md for execution

**"I have a blocker"**:
→ CLAUDE.md Common Mistakes section → WORKFLOW.md Blocker Management → Slack tech lead

**"I need to make a decision"**:
→ CLAUDE.md relevant section → WORKFLOW.md Decision Framework → Tech lead if still unclear

**"Code review time"**:
→ CLAUDE.md Code Style section + WORKFLOW.md Code Review Checklist

---

## 🚀 Getting Started (5 Minutes)

### Prerequisites
```
- Node.js 18+
- PostgreSQL 14+ (local Docker or managed)
- GitHub account
- Stripe test mode account
- Resend account
- Google Cloud OAuth credentials
- OpenAI API key
```

### Setup
```bash
# Clone repository
git clone <repo-url>
cd new_unnamed_project

# Install dependencies
pnpm install

# Create environment file
cp .env.example .env.local
# Edit .env.local with your keys

# Create database
createdb nexus_trading_dev

# Run migrations
pnpm run migrate:dev

# Start development server
pnpm dev

# Verify everything works
pnpm type-check && pnpm lint && pnpm test && pnpm build
```

### Next
- Read [CLAUDE.md](./CLAUDE.md) completely
- Attend team kickoff meeting
- Claim your first task from GitHub Project board

---

## 📊 14-Phase Execution Plan

| Phase | Weeks | Focus | Owner | Status |
|-------|-------|-------|-------|--------|
| 1 | 1-2 | Foundation & Architecture | Backend | 📋 Planned |
| 2 | 3-4 | Trading Engine Core | Backend | 📋 Planned |
| 3 | 5-6 | Exchange Integration | Backend | 📋 Planned |
| 4 | 7-8 | Job Queue & Caching | Backend | 📋 Planned |
| 5 | 9 | Authentication | Backend | 📋 Planned |
| 6 | 10 | Stripe Billing | Backend | 📋 Planned |
| 7 | 11 | Email System | Backend | 📋 Planned |
| 8 | 12-13 | Frontend | Frontend | 📋 Planned |
| 9 | 14-15 | Alerts & Observability | Backend | 📋 Planned |
| 10 | 16 | AI Abstraction | Backend | 📋 Planned |
| 11 | 17-18 | Load Testing | DevOps | 📋 Planned |
| 12 | 19-20 | Security Hardening | Security | 📋 Planned |
| 13 | 21-22 | Testing & QA | QA | 📋 Planned |
| 14 | 23-24 | Deployment & Launch | DevOps | 📋 Planned |

---

## ✅ Success Criteria

### Technical
- ✅ Handles 5000+ concurrent users
- ✅ < 1 API call per second for all users
- ✅ < 500ms p95 latency
- ✅ < 0.1% error rate
- ✅ > 70% test coverage
- ✅ Zero security vulnerabilities

### Strategic
- ✅ Existing trading logic unchanged
- ✅ Profitable trading preserved
- ✅ Market regime protection active
- ✅ All API keys encrypted and secure

---

## 🎯 Key Decision Points

These should be decided in **Phase 0** (before week 1):

1. **Team Composition**: Who is tech lead, backend leads, frontend leads, etc.?
2. **Hosting Provider**: Vercel for frontend? Railway for database?
3. **Monitoring**: DataDog? New Relic? Sentry?
4. **Encryption Library**: libsodium or Node.js crypto?
5. **Caching TTL**: 5, 15, or 30 seconds for market data?

See **WORKFLOW.md - Decision Framework** for process.

---

## 📞 Getting Help

### Daily Blocker/Question
1. Post in team Slack channel with:
   - What you're trying to do
   - What error occurred
   - What you've already tried
2. Tech lead responds within 4 hours

### Urgent/Critical Blocker
1. Ping tech lead directly in Slack
2. Call team lead if urgent
3. Escalation process in WORKFLOW.md

### Code Review
1. Submit PR with description
2. Request review from tech lead
3. Address feedback
4. Merge when approved

---

## 📈 Monitoring & Metrics

### Key Metrics to Track
- **API Calls/Second**: Target < 1 for 5000 users
- **Market Data Fetch Latency**: Target < 100ms
- **Trade Execution Latency**: Target < 500ms p95
- **Error Rate**: Target < 0.1%
- **Job Queue Depth**: Alert if > 10,000 pending
- **Database Connection Pool**: Alert if > 80% used

See **IMPLEMENTATION_PLAN.md Phase 9** for observability setup.

---

## 🔐 Critical Security Rules

**NEVER**:
- ❌ Log API keys (plaintext or encrypted)
- ❌ Commit secrets to git
- ❌ Trust unverified webhooks
- ❌ Hardcode configuration
- ❌ Skip input validation
- ❌ Use string interpolation in SQL

**ALWAYS**:
- ✅ Validate user input
- ✅ Encrypt sensitive data at rest
- ✅ Verify webhook signatures
- ✅ Use parameterized SQL queries
- ✅ Implement rate limiting
- ✅ Log security events

See **CLAUDE.md - Security Best Practices** for details.

---

## 🔄 Development Workflow

### Daily Work
```bash
# Before committing
pnpm format          # Auto-format
pnpm lint --fix      # Fix linting
pnpm type-check      # Type check
pnpm test            # Run tests

# Commit with good message
git commit -m "feat: description of change"

# Push and create PR
git push
# Open PR on GitHub
```

### Code Review Checklist
- [ ] Follows TypeScript best practices
- [ ] No hardcoded values
- [ ] Tests added and passing
- [ ] No API key logging
- [ ] Error handling implemented
- [ ] Database migrations included
- [ ] Backwards compatible
- [ ] Documentation updated

### PR Process
1. Create feature branch
2. Make changes following CLAUDE.md
3. Add/update tests
4. Push and open PR
5. Request review from tech lead
6. Address feedback
7. Merge when approved
8. Verify deployment to staging

---

## 🎓 Important Concepts

### Single-Call Architecture (Phase 2)
- One market data fetch per interval (not per user)
- All users consume same data
- Reduces API calls by 99.98%

### Regime Gatekeeper (Phase 2)
- Prevents trading during unfavorable conditions (e.g., price drops)
- Protects user capital
- Fully logged and observable

### Execution Fan-Out (Phase 2)
- One trade decision → per-user execution plans
- Respects user limits (balance, concurrent trades)
- Idempotent and safe to retry

### Configuration-First (Phase 1)
- All values from environment variables
- No hardcoding
- Easy to change without code recompilation

### UNLOGGED Tables (Phase 4)
- High-volume, ephemeral data (trades, market data, email logs)
- Faster writes, less durability
- Logged tables for persistent data (users, subscriptions)

---

## 🛠️ Common Commands

```bash
# Development
pnpm dev              # Start dev server
pnpm dev:debug       # Debug mode with inspector

# Code Quality
pnpm lint            # Check linting
pnpm format          # Auto-format code
pnpm type-check      # TypeScript checking

# Testing
pnpm test            # Jest watch mode
pnpm test:ci         # CI single-run
pnpm test:coverage   # With coverage report

# Building
pnpm build           # Production build
pnpm start           # Start prod server

# Database
pnpm migrate:dev     # Run migrations locally
pnpm migrate:prod    # Run in production

# Load Testing
pnpm load-test       # Run load test

# Performance
pnpm metrics         # View metrics endpoint
```

---

## 📚 Documentation Philosophy

These documents work together:

**Decisions & Why**
→ PROJECT_SUMMARY.md, WORKFLOW.md

**How To Build It**
→ IMPLEMENTATION_PLAN.md, QUICK_START.md

**How To Write Code**
→ CLAUDE.md

**How We Work Together**
→ WORKFLOW.md

**When You're Stuck**
→ CLAUDE.md (check patterns) → WORKFLOW.md (escalate) → Slack (ask team)

---

## ❓ FAQ

**Q: Can I change the trading strategy?**
A: No. Scale what works, don't fix what's profitable. Any changes require tech lead approval.

**Q: What if I need to hardcode a value?**
A: Don't. Use environment variables and configuration files instead. See CLAUDE.md.

**Q: How do I handle API keys securely?**
A: Never log them. Encrypt at rest. Use manager.ts service. See CLAUDE.md Security section.

**Q: What's the difference between UNLOGGED and regular tables?**
A: UNLOGGED = faster, no durability. Use for trades, market data, logs. Regular = durable, use for users, subscriptions.

**Q: Can I use a different LLM?**
A: Yes! That's why we abstracted it. See IMPLEMENTATION_PLAN.md Phase 10.

**Q: What if the load test fails?**
A: Don't proceed to Phase 12. Debug bottleneck (usually database or API calls). Optimize and retest.

**Q: Can I merge code without review?**
A: No. All code requires review. See WORKFLOW.md Code Review Checklist.

**Q: What if I find a security issue?**
A: Alert tech lead immediately in Slack. Don't continue. Fix before deployment.

---

## 🚨 Critical Paths

These must complete on-time or project delays:

1. **Phase 2 (Trading Engine)**: Core architecture, must be rock solid
2. **Phase 4 (Infrastructure)**: Job queue, caching, rate limiting
3. **Phase 5 (Auth)**: Gating for all protected features
4. **Phase 11 (Load Testing)**: Proves architecture scales
5. **Phase 12 (Security)**: Must pass before launch
6. **Phase 14 (Deployment)**: Final launch validation

If any of these run 3+ days behind, escalate immediately.

---

## 📞 Team Structure

**Tech Lead** - Architecture decisions, code review, blocker escalation
**Backend Lead** - Trading engine, APIs, database, job queue
**Frontend Lead** - UI/UX, forms, components, accessibility
**DevOps Lead** - CI/CD, infrastructure, monitoring, deployments
**QA Lead** - Testing strategy, test automation, quality gates

See WORKFLOW.md for detailed responsibilities per phase.

---

## 🎉 Success Definition

We succeed when:

✅ System runs in production serving real users
✅ Existing trading logic unchanged and profitable
✅ 5000+ concurrent users handled smoothly
✅ Team confident in stability and supportability
✅ Monitoring and alerts catching issues
✅ User feedback positive

---

## 📄 License & Attribution

This project built with care, following best practices, and respecting the profitability of existing trading strategies.

**Start Date**: [Week of _____]
**Target Launch**: [6 months from start]
**Status**: ✅ Ready for approval and team kickoff

---

## 🚀 Next Steps

**Today**:
1. Read PROJECT_SUMMARY.md (10 min)
2. Request approval if you have it
3. Schedule team kickoff

**This Week**:
1. Read QUICK_START.md and CLAUDE.md
2. Set up development environment
3. Get `pnpm dev` running
4. Attend kickoff meeting
5. Claim first task

**Week 1**:
1. Complete Phase 1 tasks
2. Familiarize with IMPLEMENTATION_PLAN.md
3. Start daily standups
4. Submit first PRs for review

Let's build something great! 🚀

---

**Questions?** Slack the tech lead.
**Blocked?** Escalate immediately.
**Found a bug?** File an issue.
**Have ideas?** Discuss in GitHub discussions.

Good luck! 💪
