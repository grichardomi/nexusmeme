/**
 * Admin Error Notifier
 *
 * Sends email alerts to SUPPORT_ADMIN_EMAIL when HTTP errors (5xx/404),
 * DB failures, or trade failures occur.
 *
 * Rate-limits via PG: max 1 email per (statusCode + path) per 15 minutes.
 * Uses existing Mailgun/Resend email queue — no Sentry dependency.
 */

import { getPool } from '@/lib/db';
import { getEnvironmentConfig } from '@/config/environment';
import { queueEmail } from '@/services/email/queue';

const DEDUP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/** Internal dedup map (survives within a single server process, PG is the real gate) */
const recentAlerts = new Map<string, number>();

function dedupKey(statusCode: number | string, path: string): string {
  return `${statusCode}:${path}`;
}

function isRateLimited(key: string): boolean {
  const last = recentAlerts.get(key);
  if (!last) return false;
  return Date.now() - last < DEDUP_WINDOW_MS;
}

function markSent(key: string): void {
  recentAlerts.set(key, Date.now());
  // Prune old entries to avoid unbounded growth
  if (recentAlerts.size > 500) {
    const cutoff = Date.now() - DEDUP_WINDOW_MS;
    for (const [k, ts] of recentAlerts) {
      if (ts < cutoff) recentAlerts.delete(k);
    }
  }
}

async function isRateLimitedPg(key: string): Promise<boolean> {
  try {
    const pool = getPool();
    const res = await pool.query(
      `SELECT sent_at FROM admin_error_log WHERE dedup_key = $1 AND sent_at > NOW() - INTERVAL '15 minutes' LIMIT 1`,
      [key]
    );
    return res.rowCount !== null && res.rowCount > 0;
  } catch {
    // If table doesn't exist yet, fall through (will be created lazily)
    return false;
  }
}

async function recordSentPg(key: string, statusCode: number | string, path: string): Promise<void> {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO admin_error_log (dedup_key, status_code, path, sent_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (dedup_key) DO UPDATE SET sent_at = NOW(), status_code = EXCLUDED.status_code`,
      [key, String(statusCode), path]
    );
  } catch {
    // Table creation handled by migration; silently skip if not ready
  }
}

export interface ErrorAlertOptions {
  statusCode: number | string;
  path: string;
  message: string;
  userId?: string;
  stack?: string;
}

/**
 * Notify admin of an HTTP or application error.
 * Safe to call from anywhere — fire-and-forget, never throws.
 */
export async function notifyAdminError(opts: ErrorAlertOptions): Promise<void> {
  try {
    const env = getEnvironmentConfig();
    const adminEmail = env.SUPPORT_ADMIN_EMAIL;
    if (!adminEmail) return;

    // Skip 404s for static assets to avoid noise
    if (
      opts.statusCode === 404 &&
      /\.(ico|png|jpg|svg|css|js|map|woff|ttf)$/i.test(opts.path)
    ) return;

    const key = dedupKey(opts.statusCode, opts.path);

    // In-process dedup first (fast path)
    if (isRateLimited(key)) return;

    // PG dedup (cross-process / cross-restart)
    if (await isRateLimitedPg(key)) {
      markSent(key); // sync local state
      return;
    }

    markSent(key);
    await recordSentPg(key, opts.statusCode, opts.path);

    await queueEmail('admin_error_alert', adminEmail, {
      statusCode: opts.statusCode,
      path: opts.path,
      message: opts.message,
      userId: opts.userId,
      stack: opts.stack,
      timestamp: new Date().toISOString(),
    } as any);
  } catch {
    // Never let monitoring break the app
  }
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, string>;
  recentErrors?: number;
  activeBots?: number;
  timestamp: string;
}

/**
 * Run a full system health check and return the result.
 * Does NOT send email — call sendSystemHealthAlert() for that.
 */
export async function runSystemHealthCheck(): Promise<HealthCheckResult> {
  const checks: Record<string, string> = {};
  let overallHealthy = true;

  // DB check
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    checks['database'] = 'ok';
  } catch (e) {
    checks['database'] = `failed: ${e instanceof Error ? e.message : 'unknown'}`;
    overallHealthy = false;
  }

  // Active bots
  let activeBots: number | undefined;
  try {
    const pool = getPool();
    const res = await pool.query(`SELECT COUNT(*) FROM bot_instances WHERE status = 'running'`);
    activeBots = parseInt(res.rows[0].count, 10);
    checks['active_bots'] = String(activeBots);
  } catch {
    checks['active_bots'] = 'unavailable';
  }

  // Recent errors (last 1h from admin_error_log)
  let recentErrors: number | undefined;
  try {
    const pool = getPool();
    const res = await pool.query(
      `SELECT COUNT(*) FROM admin_error_log WHERE sent_at > NOW() - INTERVAL '1 hour'`
    );
    recentErrors = parseInt(res.rows[0].count, 10);
    checks['recent_errors_1h'] = String(recentErrors);
  } catch {
    checks['recent_errors_1h'] = 'unavailable';
  }

  // Binance reachability (non-blocking 3s timeout)
  try {
    const env = getEnvironmentConfig();
    const baseUrl = env.BINANCE_MARKET_DATA_URL ?? 'https://api.binance.com';
    const res = await fetch(`${baseUrl}/api/v3/ping`, { signal: AbortSignal.timeout(3000) });
    checks['binance_api'] = res.ok ? 'ok' : `status ${res.status}`;
  } catch {
    checks['binance_api'] = 'unreachable';
    // Don't mark unhealthy for exchange — local dev is commonly blocked
  }

  const status = overallHealthy
    ? (recentErrors !== undefined && recentErrors > 20 ? 'degraded' : 'healthy')
    : 'unhealthy';

  return {
    status,
    checks,
    recentErrors,
    activeBots,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Run health check and email admin if status is not healthy.
 * Call from a cron job or scheduled task.
 */
export async function sendSystemHealthAlert(forceEmail = false): Promise<void> {
  try {
    const env = getEnvironmentConfig();
    const adminEmail = env.SUPPORT_ADMIN_EMAIL;
    if (!adminEmail) return;

    const result = await runSystemHealthCheck();

    if (!forceEmail && result.status === 'healthy') return;

    await queueEmail('system_health_report', adminEmail, {
      ...result,
    } as any);
  } catch {
    // Never let monitoring break the app
  }
}
