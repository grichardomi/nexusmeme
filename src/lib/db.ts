import { Pool, PoolClient } from 'pg';
import { getEnv } from '@/config/environment';

/**
 * PostgreSQL connection pool
 * Single instance shared across the application
 *
 * RAILWAY-OPTIMIZED: Handles proxy connection drops and latency
 */
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const isProduction = process.env.NODE_ENV === 'production';
    // Production: prefer pooler URL (Railway's built-in PgBouncer) for scalability.
    // Falls back to DATABASE_URL if pooler not configured.
    // Development: use public URL since Railway internal network isn't accessible locally.
    const databaseUrl = isProduction
      ? (process.env.DATABASE_POOLER_URL || getEnv('DATABASE_URL'))
      : getEnv('DATABASE_PUBLIC_URL');

    const usingPooler = isProduction && !!process.env.DATABASE_POOLER_URL;

    pool = new Pool({
      connectionString: databaseUrl,
      // With Railway pooler (PgBouncer): app pool can be large — pooler multiplexes to ~20 real connections.
      // Without pooler: keep small to stay within Railway's direct Postgres connection limit.
      max: isProduction ? (usingPooler ? 100 : 15) : 20,
      min: 2,

      connectionTimeoutMillis: 5000,  // Fail fast — don't queue for 40s
      idleTimeoutMillis: usingPooler ? 30000 : 60000,

      statement_timeout: 15000,
      query_timeout: 15000,

      // Keepalive not needed when pooler manages connections
      keepAlive: !usingPooler,
      keepAliveInitialDelayMillis: 10000,
    });

    // Log pool errors but don't crash
    pool.on('error', error => {
      console.error('Pool error on idle client - will reconnect', error.message);
    });

    // Log connection events for debugging
    pool.on('connect', () => {
      console.log('Pool: New client connected');
    });

    pool.on('remove', () => {
      console.log('Pool: Client removed');
    });
  }

  return pool;
}

/**
 * Execute a single query with automatic retry on connection failures
 * Automatically returns connection to pool
 *
 * Retries on: connection timeout, connection terminated, connection refused
 * Does NOT retry on: syntax errors, constraint violations, etc.
 */
export async function query<T = any>(
  text: string,
  values?: (string | number | boolean | null | Date | string[] | number[])[],
  maxRetries = 2
): Promise<T[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let client: PoolClient | null = null;

    try {
      client = await getPool().connect();
      const result = await client.query(text, values);
      return result.rows as T[];
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMsg = lastError.message.toLowerCase();

      // Only retry on connection-related errors
      const isConnectionError =
        errorMsg.includes('connection timeout') ||
        errorMsg.includes('connection terminated') ||
        errorMsg.includes('connection refused') ||
        errorMsg.includes('econnreset') ||
        errorMsg.includes('econnrefused') ||
        errorMsg.includes('etimedout');

      if (isConnectionError && attempt < maxRetries) {
        console.warn(`DB query failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying...`, {
          error: lastError.message,
          query: text.slice(0, 50),
        });
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
        continue;
      }

      // Non-connection error or max retries reached - throw
      throw lastError;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error('Query failed after retries');
}

/**
 * Execute a single query expecting one result
 */
export async function queryOne<T = any>(
  text: string,
  values?: (string | number | boolean | null | Date | string[] | number[])[]
): Promise<T | null> {
  const results = await query<T>(text, values);
  return results[0] ?? null;
}

/**
 * Execute multiple queries in a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Close the connection pool (for graceful shutdown)
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Health check - verify database connection works
 */
export async function healthCheck(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}
