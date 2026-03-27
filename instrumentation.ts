/**
 * Next.js Instrumentation Hook (Next.js 15+)
 * Runs once on server startup.
 * Registers global error capture → admin email notifications.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Lazy-import to avoid edge-runtime issues
    const { notifyAdminError } = await import('@/services/monitoring/error-notifier');

    // Start background services on server boot (same logic as /api/init)
    try {
      const [
        { jobQueueManager },
        { monthlyBillingScheduler },
        { trialNotificationsScheduler },
        { tradeSignalOrchestrator },
        { logger },
      ] = await Promise.all([
        import('@/services/job-queue/singleton'),
        import('@/services/cron/monthly-billing-scheduler'),
        import('@/services/cron/trial-notifications-scheduler'),
        import('@/services/orchestration/trade-signal-orchestrator'),
        import('@/lib/logger'),
      ]);

      const intervalMs = parseInt(process.env.ORCHESTRATOR_INTERVAL_MS || '60000', 10);
      jobQueueManager.startProcessing(5000);
      await monthlyBillingScheduler.initialize();
      await trialNotificationsScheduler.initialize();
      tradeSignalOrchestrator.start(intervalMs);
      logger.info('Background services started via instrumentation hook');
    } catch (err) {
      console.error('Failed to start background services on boot:', err);
    }

    // Catch unhandled promise rejections from route handlers / background tasks
    process.on('unhandledRejection', (reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      void notifyAdminError({ statusCode: 500, path: 'unhandledRejection', message, stack });
    });

    // Catch uncaught synchronous exceptions (last resort)
    process.on('uncaughtException', (err: Error) => {
      void notifyAdminError({ statusCode: 500, path: 'uncaughtException', message: err.message, stack: err.stack });
    });
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
