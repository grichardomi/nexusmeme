import { Pool, PoolClient } from 'pg';
import { getEnv } from '@/config/environment';

/**
 * PostgreSQL connection pool
 * Single instance shared across the application
 */
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const isProduction = process.env.NODE_ENV === 'production';
    // Production (Railway): use internal URL for better performance
    // Development (localhost): use public URL since internal network isn't accessible
    const databaseUrl = isProduction ? getEnv('DATABASE_URL') : getEnv('DATABASE_PUBLIC_URL');

    pool = new Pool({
      connectionString: databaseUrl,
      max: isProduction ? 20 : 5, // Fewer connections in development
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Log pool errors but don't crash
    pool.on('error', error => {
      console.error('Unexpected error on idle client', error);
    });
  }

  return pool;
}

/**
 * Execute a single query
 * Automatically returns connection to pool
 */
export async function query<T = any>(
  text: string,
  values?: (string | number | boolean | null | Date | string[] | number[])[]
): Promise<T[]> {
  const client = await getPool().connect();

  try {
    const result = await client.query(text, values);
    return result.rows as T[];
  } finally {
    client.release();
  }
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
