# Cron Scheduling Architecture

## Question: What cron approach are we using? Is it best practice?

---

## Answer: Railway-Native Approach (Not Traditional Cron)

### What We Implemented

We use a **Node.js in-process scheduler** that:
- Runs within the application process
- Calculates next run time using JavaScript date math
- Schedules using `setTimeout` (not system cron)
- Initializes on app startup
- Gracefully handles shutdown

### Why NOT Traditional Cron (cron.org)?

**Traditional cron issues for modern cloud apps:**

1. **Server-Dependent**
   - Requires SSH access to server
   - Breaks if you deploy to new server
   - Not reproducible across environments
   - Hard to track in version control

2. **Single-Instance Risk**
   - If using Railway's preview deployments, cron runs on wrong instance
   - No built-in multi-instance coordination
   - No alerting if job fails

3. **Difficult to Debug**
   - Logs are on the server, not in application
   - Environment variables may not be available
   - Credentials not accessible to cron user
   - Hard to test locally

4. **Not Cloud-Native**
   - Railway recommends application-level scheduling
   - Heroku, Vercel, Render all do the same
   - Matches modern serverless patterns

### Our Approach: Best Practice for Railway ✅

**In-Process Scheduler Architecture:**

```javascript
// Runs inside Next.js application
class MonthlyBillingScheduler {
  // 1. Calculate next run time
  scheduleNextRun() {
    const nextRun = new Date();
    nextRun.setUTCDate(1);           // 1st of month
    nextRun.setUTCHours(2, 0, 0, 0); // 2 AM UTC
    return nextRun;
  }

  // 2. Schedule using setTimeout
  scheduleNextRun(jobId) {
    const delayMs = job.nextRun.getTime() - Date.now();
    setTimeout(() => {
      this.executeJob(jobId);
    }, delayMs);
  }

  // 3. Execute with error handling & retries
  async executeJob(jobId) {
    try {
      const result = await runMonthlyBillingJob();
      // Schedule next run
      this.scheduleNextRun(jobId);
    } catch (error) {
      logger.error('Job failed', error);
      // Schedule next run anyway (so it doesn't stop)
      this.scheduleNextRun(jobId);
    }
  }
}
```

**Advantages:**

✅ **Cloud-Native**: Works with Railway, Heroku, Vercel
✅ **Reproducible**: Same code runs everywhere
✅ **Debuggable**: Errors logged to application logs
✅ **Testable**: Can mock `setTimeout` in tests
✅ **Observable**: Scheduler status available via `/api/init`
✅ **Version Controlled**: All config in code, not on server
✅ **Scalable**: Can be offloaded to worker process if needed

---

## When to Use Different Approaches

### Use In-Process Scheduler (Our Approach) ✅

**Good for:**
- Small to medium-scale jobs (1-10 concurrent jobs)
- Jobs that run infrequently (monthly, weekly, daily)
- Self-hosted or Railway-like platforms
- When you want job config in version control

**Examples:**
- Monthly billing runs
- Weekly reports
- Daily cleanup tasks
- Nightly data syncs

**NexusMeme Use Case**: Monthly billing job (runs once/month) → In-process ✅

### Use Traditional Cron

**Good for:**
- Server-specific tasks (disk cleanup, log rotation)
- When jobs must run regardless of app status
- Legacy applications already using cron

**Not recommended for:**
- Business-critical jobs
- Modern cloud applications
- Microservices

### Use Dedicated Job Queue (Bull/RabbitMQ)

**Good for:**
- High-throughput jobs (100+ per minute)
- Distributed workloads across servers
- Complex retry logic and backpressure handling
- When you need horizontal scaling

**Examples:**
- Email sending (high volume)
- Image processing
- API data syncs
- Trading webhook processing

**NexusMeme Already Uses This**: Job queue handles email, trade execution, etc.

### Use Cron + Webhooks (External Service)

**Good for:**
- Maximum reliability (job doesn't depend on app status)
- Monitoring and alerting built-in
- When you're willing to pay for service

**Services:**
- AWS EventBridge
- Google Cloud Scheduler
- Azure Scheduler
- Zapier, IFTTT

**Cost**: ~$5-20/month for small number of jobs

---

## NexusMeme Scheduling Stack

```
┌─────────────────────────────────────────────────────┐
│  Monthly Billing (Once/month) → In-Process         │  ← Our focus
│  Scheduler (MonthlyBillingScheduler.ts)            │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  Job Queue (High-Frequency) → PostgreSQL Queue     │  ← Existing
│  Email, Trade Execution, Webhooks                  │
│  (JobQueueManager.ts)                              │
└─────────────────────────────────────────────────────┘
```

**This is ideal for NexusMeme:**
- Low-frequency, critical tasks → In-process scheduler
- High-frequency, async tasks → Job queue
- Best of both worlds with minimal dependencies

---

## Implementation Details

### 1. Initialization

The scheduler starts automatically on app boot:

```typescript
// src/lib/init.ts (called on app startup)
await monthlyBillingScheduler.initialize();
```

### 2. Cron Expression

We use a simplified cron format supporting: `"0 2 1 * *"` (1st of month, 2 AM UTC)

Why not full cron syntax?
- Only need monthly billing (one job type)
- Simpler code, fewer bugs
- Can expand if needed

### 3. Timezone: Always UTC

The system uses **UTC only** to avoid daylight saving time issues:

```typescript
nextRun.setUTCHours(2, 0, 0, 0);  // 2 AM UTC, not local time
```

### 4. Next Run Calculation

```typescript
calculateNextRun(now: Date) {
  const nextRun = new Date(now);
  nextRun.setUTCDate(1);           // Move to 1st
  nextRun.setUTCHours(2, 0, 0, 0); // Set to 2 AM UTC

  // If already past 2 AM today, move to next month
  if (nextRun <= now) {
    nextRun.setUTCMonth(nextRun.getUTCMonth() + 1);
  }

  return nextRun;
}
```

### 5. Error Recovery

If a job fails:
- Error is logged
- Next run is scheduled anyway
- Doesn't cascade failures

```typescript
try {
  await runMonthlyBillingJob();
} catch (error) {
  logger.error('Job failed', error);
  // STILL schedule next run
  this.scheduleNextRun(jobId);
}
```

### 6. Observability

Check scheduler status at any time:

```bash
curl http://localhost:3000/api/init | jq '.status.scheduler'
```

Returns:

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

## Comparison: In-Process vs Alternatives

| Feature | In-Process | Traditional Cron | External Service |
|---------|-----------|-----------------|------------------|
| **Setup** | Code only | SSH + server | Web UI |
| **Version Control** | ✅ Yes | ❌ No | ✅ Sometimes |
| **Observability** | ✅ App logs | ❌ Server logs | ✅ Dashboard |
| **Testing** | ✅ Easy | ❌ Hard | ⚠️ Mocking |
| **Cost** | Free | Free | $5-20/month |
| **Debugging** | ✅ Easy | ❌ Hard | ⚠️ Limited |
| **Reliability** | App-dependent | Server-dependent | Very high |
| **Scaling** | Simple → Complex | ❌ No | ✅ Yes |
| **Multi-Instance** | ⚠️ Needs coordination | ❌ No | ✅ Built-in |

---

## Multi-Instance Considerations

**Current Setup (NexusMeme on Railway):**

Railway default: 1 instance running = One app instance = Scheduler runs once per month ✅

**Future: Multiple Instances**

If scaling to multiple instances, we need to prevent duplicate billing runs:

**Option 1: Leader Election (Simple)**
```typescript
// Only run on one instance (use database distributed lock)
const gotLock = await acquireDistributedLock('monthly_billing');
if (!gotLock) return; // Another instance already running
```

**Option 2: Dedicated Worker (Recommended)**
```bash
# worker.ts runs separately, only this runs scheduler
npm run worker
```

**Option 3: External Scheduler**
Move to AWS EventBridge / Google Cloud Scheduler

---

## Future Improvements

### Short Term
1. ✅ **Monitoring**: Alert if job misses its run time
2. ✅ **Retry Policy**: Manual retry endpoint for failed runs
3. ✅ **Logging**: Detailed execution metrics

### Medium Term
1. Support more cron expressions (daily, weekly)
2. Add job status dashboard
3. Support for multiple jobs

### Long Term
1. Consider dedicated worker process if job volume grows
2. Evaluate external scheduler (Google Cloud Scheduler) for even higher reliability
3. Multi-instance coordination with database locks

---

## Key Takeaways

✅ **Our Approach is Best Practice** for modern cloud apps
- Works on Railway, Heroku, Vercel, etc.
- Reproducible across environments
- All config in version control
- Observable via application logs
- Cost-effective (free)

⚠️ **Limitations**
- Depends on app staying alive (but Railway handles this)
- No multi-instance coordination (only if scaling beyond 1 instance)
- Job doesn't run if app is down (but best practice anyway)

🚀 **Scalability Path**
- Current: In-process (1 instance)
- Next: Dedicated worker process (multiple instances)
- Future: External scheduler (mission-critical)

---

## References

- **Railway Docs**: https://docs.railway.app/
- **Node.js setTimeout**: https://nodejs.org/api/timers.html
- **Cron Format**: https://crontab.guru/
- **Distributed Locks**: https://www.postgresql.org/docs/current/sql-advisory-locks.html
- **Bull Queue** (alternative): https://github.com/OptimalBits/bull

---

## Questions?

- **Why not use node-cron?** - It's heavier than needed, we only need one job
- **Why not AWS Lambda?** - Railway is simpler, Lambda requires more infrastructure
- **Why UTC?** - Avoids DST issues, standard for server applications
- **Can we monitor it?** - Yes, check `/api/init` or look at logs
