/**
 * DEBUG: Test direct Binance API connectivity
 * This endpoint attempts to fetch a BTC/USDT ticker directly from Binance
 * to verify API connectivity and data format
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    console.log('[DEBUG] Testing BinanceUS API connectivity...');

    const symbol = 'BTCUSDT';
    // Use BinanceUS API endpoint (better geographic compatibility)
    const url = `https://api.binance.us/api/v3/ticker/24hr?symbol=${symbol}`;

    console.log('[DEBUG] Fetching from:', url);

    const startTime = Date.now();
    const response = await fetch(url);
    const fetchDuration = Date.now() - startTime;

    console.log('[DEBUG] Response status:', response.status, response.statusText);
    console.log('[DEBUG] Fetch duration:', fetchDuration, 'ms');

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DEBUG] Binance API error response:', errorText.slice(0, 200));
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

    console.log('[DEBUG] Successfully fetched Binance data:', {
      symbol: data.symbol,
      lastPrice: data.lastPrice,
      bidPrice: data.bidPrice,
      askPrice: data.askPrice,
    });

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
    console.error('[DEBUG] Error testing Binance API:', error);
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
