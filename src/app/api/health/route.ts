import { NextResponse } from 'next/server';
import { healthCheck } from '@/lib/db';
import { getEnvironmentConfig } from '@/config/environment';

/**
 * Health check endpoint
 * Verifies: environment, database connection, basic system health
 */
export async function GET() {
  try {
    // Check environment
    const env = getEnvironmentConfig();

    // Check database
    const dbHealthy = await healthCheck();

    if (!dbHealthy) {
      return NextResponse.json(
        {
          status: 'unhealthy',
          message: 'Database connection failed',
          checks: {
            environment: 'ok',
            database: 'failed',
          },
        },
        { status: 503 }
      );
    }

    // Test Binance.com accessibility from this server
    let binanceComStatus = 'unknown';
    try {
      const binanceRes = await fetch('https://api.binance.com/api/v3/ping', { signal: AbortSignal.timeout(5000) });
      const binanceBody = await binanceRes.json();
      binanceComStatus = binanceBody && Object.keys(binanceBody).length === 0 ? 'accessible' : `blocked: ${JSON.stringify(binanceBody)}`;
    } catch {
      binanceComStatus = 'error';
    }

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      checks: {
        environment: 'ok',
        database: 'ok',
        binanceCom: binanceComStatus,
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        databaseConfigured: !!env.DATABASE_URL,
      },
    });
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
