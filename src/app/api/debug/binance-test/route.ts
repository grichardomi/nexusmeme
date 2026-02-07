/**
 * DEBUG: Test direct Binance API connectivity
 * This endpoint attempts to fetch a BTC/USDT ticker directly from Binance
 * to verify API connectivity and data format
 * PROTECTED: Admin-only access
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminCheck = await query(`SELECT role FROM users WHERE id = $1`, [session.user.id]);
    if (!adminCheck[0] || adminCheck[0].role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const symbol = 'BTCUSDT';
    const url = `https://api.binance.us/api/v3/ticker/24hr?symbol=${symbol}`;

    const startTime = Date.now();
    const response = await fetch(url);
    const fetchDuration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          status: 'error',
          message: `Binance API returned ${response.status}`,
          error: errorText.slice(0, 200),
          fetchDuration,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      status: 'ok',
      message: 'Binance API is reachable',
      fetchDuration,
      data: {
        symbol: data.symbol,
        lastPrice: parseFloat(data.lastPrice),
        bidPrice: parseFloat(data.bidPrice),
        askPrice: parseFloat(data.askPrice),
        volume: parseFloat(data.volume),
        priceChangePercent: parseFloat(data.priceChangePercent),
        highPrice: parseFloat(data.highPrice),
        lowPrice: parseFloat(data.lowPrice),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to test Binance API',
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
