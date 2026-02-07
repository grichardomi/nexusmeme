import { NextRequest, NextResponse } from 'next/server';
import { incrementCounter } from '@/lib/redis';
import { logger } from '@/lib/logger';

/**
 * Rate Limiting Middleware
 * Protects API from abuse using fixed window counter in Upstash Redis
 *
 * Migration from PostgreSQL to Redis:
 * - PostgreSQL: 3-4 queries per request (DELETE + INSERT + COUNT)
 * - Redis: 1 operation (INCR) with automatic TTL-based cleanup
 * - Performance: ~10x faster, ~100x less database pressure
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
      // Fail closed in production - reject if we can't verify rate limit
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
          { error: 'Service temporarily unavailable' },
          { status: 503 }
        );
      }
      // In development, allow for easier testing
      return NextResponse.next();
    }
  };
}

/**
 * Check if request is within rate limit
 * Uses fixed window counter algorithm in Redis
 *
 * Algorithm:
 * 1. Increment counter in Redis (atomic)
 * 2. Set TTL on first increment (TTL = window duration)
 * 3. Compare count against limit
 *
 * Benefits over PostgreSQL:
 * - Single Redis operation vs 3-4 database queries
 * - Automatic TTL cleanup (no manual DELETE needed)
 * - ~10x faster (Redis vs network roundtrip to PostgreSQL)
 * - Zero database connection pool pressure
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
  const windowSeconds = Math.ceil(windowMs / 1000);
  const resetAt = now + windowMs;

  try {
    // Increment counter and set TTL (atomic operations in Redis)
    const count = await incrementCounter(key, windowSeconds);

    const allowed = count <= maxRequests;
    const remaining = Math.max(0, maxRequests - count);

    return {
      allowed,
      remaining,
      resetAt,
    };
  } catch (error) {
    logger.error('Failed to check rate limit', error instanceof Error ? error : null, { key });
    // Fail closed in production to prevent brute-force during Redis outage
    const isProduction = process.env.NODE_ENV === 'production';
    return {
      allowed: !isProduction,
      remaining: isProduction ? 0 : maxRequests,
      resetAt,
    };
  }
}

/**
 * Get rate limit key from request
 * Prioritizes user ID, falls back to IP address
 */
function getRateLimitKey(request: NextRequest, prefix: string = 'rl'): string {
  // Try to get user ID from auth header or session
  const authHeader = request.headers.get('authorization');
  const userId = extractUserIdFromAuth(authHeader);

  if (userId) {
    return `${prefix}:user:${userId}`;
  }

  // Fall back to IP address
  const ip = getClientIp(request);
  return `${prefix}:ip:${ip}`;
}

/**
 * Extract user ID from authorization header
 */
function extractUserIdFromAuth(authHeader: string | null): string | null {
  if (!authHeader) return null;

  try {
    // Bearer token format: Bearer <token>
    if (authHeader.startsWith('Bearer ')) {
      // TODO: Validate JWT and extract user ID
      // For now, return null to fall back to IP
      return null;
    }
  } catch (error) {
    // Ignore parse errors
  }

  return null;
}

/**
 * Get client IP address from request
 */
function getClientIp(request: NextRequest): string {
  // Try various headers in order of preference
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) {
    return cfIp;
  }

  // NextRequest doesn't expose IP directly, use a placeholder
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
};
