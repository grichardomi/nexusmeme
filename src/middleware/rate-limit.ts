import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Rate Limiting Middleware
 * Protects API from abuse using fixed window counter in PostgreSQL
 *
 * Uses api_rate_limits table with upsert for atomic increments.
 * Expired windows are cleaned up lazily on each request.
 */

export interface RateLimitConfig {
  maxRequests: number; // Max requests per window
  windowMs: number; // Time window in milliseconds
  keyPrefix?: string; // Optional prefix for rate limit keys
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
  keyPrefix: 'rl',
};

/**
 * Ensure the api_rate_limits table exists (idempotent).
 */
let tableEnsured = false;
async function ensureTable() {
  if (tableEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS api_rate_limits (
      key TEXT NOT NULL,
      window_start BIGINT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (key, window_start)
    )
  `);
  tableEnsured = true;
}

/**
 * Create rate limit middleware
 */
export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return async (request: NextRequest) => {
    try {
      const key = getRateLimitKey(request, finalConfig.keyPrefix);

      const { allowed, remaining, resetAt } = await checkRateLimit(
        key,
        finalConfig.maxRequests,
        finalConfig.windowMs
      );

      // Add rate limit headers
      const headers = new Headers();
      headers.set('X-RateLimit-Limit', finalConfig.maxRequests.toString());
      headers.set('X-RateLimit-Remaining', Math.max(0, remaining).toString());
      headers.set('X-RateLimit-Reset', resetAt.toString());

      if (!allowed) {
        logger.warn('Rate limit exceeded', {
          key,
          limit: finalConfig.maxRequests,
          window: `${finalConfig.windowMs}ms`,
        });

        return NextResponse.json(
          {
            error: 'Rate limit exceeded',
            retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
          },
          {
            status: 429,
            headers,
          }
        );
      }

      // Return response with rate-limit headers
      const response = NextResponse.next();
      response.headers.set('X-RateLimit-Limit', finalConfig.maxRequests.toString());
      response.headers.set('X-RateLimit-Remaining', Math.max(0, remaining).toString());
      response.headers.set('X-RateLimit-Reset', resetAt.toString());
      return response;
    } catch (error) {
      logger.error('Rate limit check failed', error instanceof Error ? error : null);
      // Fail open — don't block auth on DB error (brute-force risk is low vs availability)
      return NextResponse.next();
    }
  };
}

/**
 * Check if request is within rate limit using PostgreSQL fixed-window counter.
 *
 * Algorithm:
 * 1. Compute current window start (floor to window boundary)
 * 2. Upsert row: INSERT ... ON CONFLICT DO UPDATE SET count = count + 1
 * 3. Compare returned count against limit
 * 4. Lazily delete expired windows (older than 2x window) to avoid table bloat
 */
async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
}> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;

  try {
    await ensureTable();

    // Upsert: atomically increment the counter for this key+window
    const rows = await query<{ count: number }>(
      `INSERT INTO api_rate_limits (key, window_start, count)
       VALUES ($1, $2, 1)
       ON CONFLICT (key, window_start)
       DO UPDATE SET count = api_rate_limits.count + 1
       RETURNING count`,
      [key, windowStart]
    );

    const count = rows[0]?.count ?? 1;
    const allowed = count <= maxRequests;
    const remaining = Math.max(0, maxRequests - count);

    // Lazy cleanup: delete windows older than 2x the window duration (fire-and-forget)
    const cutoff = now - windowMs * 2;
    query(`DELETE FROM api_rate_limits WHERE window_start < $1`, [cutoff]).catch(() => {});

    return { allowed, remaining, resetAt };
  } catch (error) {
    logger.error('Failed to check rate limit', error instanceof Error ? error : null, { key });
    // Fail open on DB error
    return {
      allowed: true,
      remaining: maxRequests,
      resetAt,
    };
  }
}

/**
 * Get rate limit key from request
 * Prioritizes user ID, falls back to IP address
 */
function getRateLimitKey(request: NextRequest, prefix: string = 'rl'): string {
  const authHeader = request.headers.get('authorization');
  const userId = extractUserIdFromAuth(authHeader);

  if (userId) {
    return `${prefix}:user:${userId}`;
  }

  const ip = getClientIp(request);
  return `${prefix}:ip:${ip}`;
}

/**
 * Extract user ID from authorization header
 */
function extractUserIdFromAuth(authHeader: string | null): string | null {
  if (!authHeader) return null;

  try {
    if (authHeader.startsWith('Bearer ')) {
      // TODO: Validate JWT and extract user ID
      return null;
    }
  } catch {
    // Ignore parse errors
  }

  return null;
}

/**
 * Get client IP address from request.
 * Uses the LAST entry of x-forwarded-for to prevent spoofing.
 * x-forwarded-for is appended by each proxy in the chain — the last value
 * is set by the closest trusted proxy (Railway/infra) and cannot be spoofed
 * by the client. Taking [0] (leftmost) is exploitable by setting a fake IP.
 */
function getClientIp(request: NextRequest): string {
  // Cloudflare sets this directly — trust it if present (cannot be spoofed at CF edge)
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  // x-forwarded-for: use the LAST (rightmost) entry — set by our trusted infra proxy
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map(ip => ip.trim()).filter(Boolean);
    if (ips.length > 0) return ips[ips.length - 1];
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  return 'unknown';
}

/**
 * Per-route rate limiters with sensible defaults
 */

export const apiRateLimits = {
  // General API: 100 requests per minute
  general: createRateLimiter({
    maxRequests: 100,
    windowMs: 60 * 1000,
    keyPrefix: 'api',
  }),

  // Auth endpoints: 5 requests per minute (prevent brute force)
  auth: createRateLimiter({
    maxRequests: 5,
    windowMs: 60 * 1000,
    keyPrefix: 'auth',
  }),

  // Trading endpoints: 50 requests per minute
  trading: createRateLimiter({
    maxRequests: 50,
    windowMs: 60 * 1000,
    keyPrefix: 'trading',
  }),

  // Webhook endpoints: 1000 requests per minute (from trusted sources)
  webhook: createRateLimiter({
    maxRequests: 1000,
    windowMs: 60 * 1000,
    keyPrefix: 'webhook',
  }),

  // Exchange key submission: 10 per minute (prevents key-validation DoS against exchange)
  exchangeKeys: createRateLimiter({
    maxRequests: 10,
    windowMs: 60 * 1000,
    keyPrefix: 'exchange-keys',
  }),
};
