# Setup Instructions - Phase 1 Complete

**Status**: Ready to run locally

**Time to complete**: ~15 minutes

---

## Prerequisites

- ✅ Node.js 18+ installed
- ✅ pnpm installed (`npm install -g pnpm`)
- ✅ Railway PostgreSQL database (already configured in .env.local)
- ✅ All files created (you have this repo)

---

## Quick Start (Copy & Paste)

```bash
# Navigate to project
cd /home/omi/new_unnamed_project

# 1. Install dependencies (takes ~2 min)
pnpm install

# 2. Verify TypeScript
pnpm type-check

# 3. Run database migrations (creates all tables)
pnpm migrate:dev

# 4. Start development server
pnpm dev

# 5. In a new terminal, verify database connection
curl http://localhost:3000/api/health
```

Expected curl output:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-16T...",
  "version": "0.1.0",
  "checks": {
    "environment": "ok",
    "database": "ok"
  },
  "environment": {
    "nodeEnv": "development",
    "databaseConfigured": true
  }
}
```

---

## Step-by-Step Guide

### Step 1: Navigate to Project Directory
```bash
cd /home/omi/new_unnamed_project
```

Verify you see these files:
```bash
ls -la
# Should show: package.json, tsconfig.json, .env.local, src/, etc.
```

### Step 2: Install Dependencies
```bash
pnpm install
```

**What this does**:
- Downloads all npm packages (Next.js, React, TypeScript, PostgreSQL, etc.)
- Installs them to `node_modules/`
- Creates `pnpm.lock.yaml` (dependency lock file)

**Expected output**:
```
 > pnpm install
Packages in scope:
root
Lockfile is up-to-date, installation skipped
$ husky install 2>/dev/null || true
```

Or if first time:
```
Resolving: total 356, reused 280 from lockfile, downloaded 76, added 356, done
Packages: +356
Dependencies: unchanged
Done in 8.3s
```

**If it fails**:
- Check you have Node 18+: `node --version`
- Check you have pnpm: `pnpm --version`
- Clear cache: `pnpm store prune`
- Retry: `pnpm install`

### Step 3: Type Check
```bash
pnpm type-check
```

**What this does**:
- Compiles TypeScript and checks for type errors
- Takes ~5 seconds

**Expected output**:
```
✓ Compiles successfully
```

**If it fails**:
- This shouldn't happen - all files are correct
- Check you have all files: `ls src/config/environment.ts`
- Run again: `pnpm type-check`

### Step 4: Run Database Migrations
```bash
pnpm migrate:dev
```

**What this does**:
- Connects to Railway PostgreSQL (using DATABASE_URL from .env.local)
- Creates all tables (users, bot_instances, trades, etc.)
- Creates indexes for performance
- Records applied migrations

**Expected output**:
```
🔄 Starting migrations...

▶ Running migration: 001_initial_schema.sql
✓ Completed: 001_initial_schema.sql

✓ Successfully ran 1 migration(s)
```

**If it fails with "connection refused"**:
- Check .env.local has DATABASE_URL
- Verify Railway database is running
- Try manual connection: `psql postgresql://postgres:nEzWKQIlbUtJhicQcRKcGVKBZkpepuIx@ballast.proxy.rlwy.net:31006/railway`

**If it fails with "database already exists"**:
- That's fine - migrations already ran
- Check with: `psql ... -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public';"`

### Step 5: Start Development Server
```bash
pnpm dev
```

**What this does**:
- Starts Next.js development server
- Watches for file changes
- Compiles TypeScript on the fly

**Expected output**:
```
  ▲ Next.js 15.x.x
  - Local:        http://localhost:3000
  - Environments: .env.local

  ✓ Ready in 2.3s
```

**If it fails with "port already in use"**:
- Another app is using port 3000
- Kill it: `lsof -ti:3000 | xargs kill -9`
- Or change port: `PORT=3001 pnpm dev`

### Step 6: Test in Browser
Open http://localhost:3000 in your browser

**You should see**:
- Nexus Trading Platform heading
- "Foundation Setup Complete" box
- All checkmarks green

### Step 7: Test API Health Check
In a new terminal:
```bash
curl http://localhost:3000/api/health
```

**Expected output** (should be JSON):
```json
{
  "status": "healthy",
  "timestamp": "2026-01-16T19:45:23.456Z",
  "version": "0.1.0",
  "checks": {
    "environment": "ok",
    "database": "ok"
  },
  "environment": {
    "nodeEnv": "development",
    "databaseConfigured": true
  }
}
```

If you get `"database": "failed"`, the connection is broken - check DATABASE_URL

### Step 8: Verify Database
In a new terminal:
```bash
# Connect to Railway database
psql postgresql://postgres:nEzWKQIlbUtJhicQcRKcGVKBZkpepuIx@ballast.proxy.rlwy.net:31006/railway

# Inside psql prompt:
\dt                              -- List all tables
SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;
\q                               -- Exit psql
```

**Should show tables**:
- bot_instances
- email_log
- email_preferences
- exchange_api_keys
- job_queue
- market_data_cache
- market_regime
- migrations_applied
- sessions
- subscriptions
- trades
- users

---

## All Commands Reference

```bash
# Development
pnpm dev              # Start dev server
pnpm dev:debug       # Start with debugger

# Code Quality
pnpm type-check      # TypeScript type checking
pnpm lint            # Lint and auto-fix
pnpm format          # Auto-format code
pnpm lint --fix      # Fix lint errors

# Testing
pnpm test            # Jest watch mode
pnpm test:ci         # CI mode (single run)

# Database
pnpm migrate:dev     # Run migrations on dev
pnpm migrate:prod    # Run migrations on prod
pnpm seed            # Seed test data (coming soon)

# Production
pnpm build           # Build for production
pnpm start           # Start prod server

# Performance
pnpm load-test       # Run load test (coming soon)
```

---

## Troubleshooting

### "command not found: pnpm"
```bash
npm install -g pnpm
# Then retry your command
```

### "Error: Cannot find module '@/config/environment'"
```bash
# Make sure tsconfig.json is correct:
cat tsconfig.json | grep -A 5 '"paths"'
# Should show "@/*": ["./src/*"]
```

### "Error: connect ECONNREFUSED 127.0.0.1:5432"
- Database is not running locally OR
- You're trying to use local database instead of Railway

**Solution**: Check .env.local points to Railway:
```bash
grep DATABASE_URL .env.local
# Should show: postgresql://postgres:...@ballast.proxy.rlwy.net:...
```

### "Error: password authentication failed"
- Wrong password in DATABASE_URL
- Check .env.local matches credentials from Railway

### Port 3000 already in use
```bash
# Kill the process
lsof -ti:3000 | xargs kill -9

# Or use different port
PORT=3001 pnpm dev
# Then visit http://localhost:3001
```

### TypeScript errors in IDE but code works
```bash
# Restart TypeScript language server
# In VS Code: Ctrl+Shift+P > "TypeScript: Restart TS Server"
```

### Migrations won't run
```bash
# Check if migrations already applied
psql postgresql://postgres:...@ballast.proxy.rlwy.net:31006/railway
# Inside psql:
SELECT * FROM migrations_applied;
# If shows 001_initial_schema.sql, migrations already ran
```

---

## Development Workflow

### Daily Development
```bash
# Terminal 1: Start dev server
cd /home/omi/new_unnamed_project
pnpm dev

# Terminal 2: Watch for changes, run tests
pnpm test

# Terminal 3: Code and edit files
# Changes are hot-reloaded in browser
```

### Before Committing
```bash
pnpm type-check  # Verify types
pnpm lint --fix  # Auto-fix linting issues
pnpm test:ci     # Run tests once
git add .
git commit -m "feat: description"
```

### Debugging
```bash
# Add console.log in your code, it appears in Terminal 1 (dev server)
# Or use VS Code debugger:
# - Create .vscode/launch.json (ask for template)
# - Press F5 to start debugging
# - Set breakpoints and inspect variables
```

---

## Next: Phase 2

Once dev server is running and you see the homepage:

1. Read **CLAUDE.md** (development standards)
2. Check **IMPLEMENTATION_PLAN.md Phase 2**
3. Start building market data aggregator

Phase 2 deliverables:
- Market data aggregation (single-call architecture)
- Regime gatekeeper
- Execution fan-out

---

## Still Having Issues?

1. Check **QUICK_START.md**
2. Check **CLAUDE.md** troubleshooting section
3. Verify all files exist: `ls -la src/config/ src/lib/ src/migrations/`
4. Check database: `psql ... -c "SELECT 1"`

**Everything working?** Great! You're ready for Phase 2. 🚀

---

**Status**: ✅ Phase 1 Foundation Complete

Next command: `pnpm dev`

Let me know when you see the homepage!
