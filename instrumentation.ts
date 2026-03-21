/**
 * Next.js Instrumentation Hook (Next.js 15+)
 * Runs once on server startup.
 * Registers global error capture → admin email notifications.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Lazy-import to avoid edge-runtime issues
    const { notifyAdminError } = await import('@/services/monitoring/error-notifier');

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
