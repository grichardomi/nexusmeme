/**
 * Next.js Instrumentation Hook (Next.js 15+)
 * Runs once on server startup.
 * Registers global error capture → admin email notifications.
 */

export async function register() {
  // Log immediately — if this doesn't appear, instrumentation.ts itself isn't being invoked
  console.log('[instrumentation] register() called, NEXT_RUNTIME=' + process.env.NEXT_RUNTIME);
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // 1. Start orchestrator first — isolated, nothing else can block it
  try {
    const { tradeSignalOrchestrator } = await import('@/services/orchestration/trade-signal-orchestrator');
    const intervalMs = parseInt(process.env.ORCHESTRATOR_INTERVAL_MS || '60000', 10);
    tradeSignalOrchestrator.start(intervalMs);
    console.log('✅ [instrumentation] Orchestrator started, intervalMs=' + intervalMs);

    // Watchdog: restart if heartbeat goes stale (loop silently died)
    const watchdogMs = Math.max(intervalMs * 5, 60_000);
    setInterval(() => {
      const staleSince = Date.now() - tradeSignalOrchestrator.lastHeartbeat;
      if (tradeSignalOrchestrator.lastHeartbeat > 0 && staleSince > watchdogMs) {
        console.warn('[instrumentation] Watchdog: orchestrator stale, restarting');
        tradeSignalOrchestrator.stop();
        tradeSignalOrchestrator.start(intervalMs);
      }
    }, watchdogMs);
  } catch (err) {
    console.error('[instrumentation] Failed to start orchestrator:', err);
    process.stderr.write('[instrumentation] Orchestrator error: ' + String(err) + '\n');
  }

  // 2. Start other background services — failures here don't affect trading
  try {
    const [{ jobQueueManager }, { monthlyBillingScheduler }, { trialNotificationsScheduler }] = await Promise.all([
      import('@/services/job-queue/singleton'),
      import('@/services/cron/monthly-billing-scheduler'),
      import('@/services/cron/trial-notifications-scheduler'),
    ]);
    jobQueueManager.startProcessing(5000);
    await monthlyBillingScheduler.initialize();
    await trialNotificationsScheduler.initialize();
    console.log('✅ [instrumentation] Background services started');
  } catch (err) {
    console.error('[instrumentation] Failed to start background services:', err);
  }

  // 3. Error monitoring — isolated so import failure doesn't kill steps 1+2
  try {
    const { notifyAdminError } = await import('@/services/monitoring/error-notifier');
    process.on('unhandledRejection', (reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      void notifyAdminError({ statusCode: 500, path: 'unhandledRejection', message, stack });
    });
    process.on('uncaughtException', (err: Error) => {
      void notifyAdminError({ statusCode: 500, path: 'uncaughtException', message: err.message, stack: err.stack });
    });
  } catch (err) {
    console.error('[instrumentation] Failed to start error monitoring:', err);
  }
}

/**
 * Next.js 15 onRequestError hook — fires for every HTTP error (4xx/5xx).
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation#onrequesterror
 */
export async function onRequestError(
  err: { digest?: string } & Error,
  request: { path: string; method: string },
  context: { routeType: string }
) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { notifyAdminError } = await import('@/services/monitoring/error-notifier');

  // Only alert on server errors (5xx) — 4xx are expected client mistakes
  // Exception: 404 on API routes (may indicate broken integrations)
  const isApiRoute = context.routeType === 'route';
  const message = err.message ?? 'Unknown error';

  void notifyAdminError({
    statusCode: 500,
    path: `${request.method} ${request.path}`,
    message,
    stack: err.stack,
  });

  void isApiRoute; // suppress unused warning
}
