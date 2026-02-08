/**
 * Diagnostic: Check current BTC EMA values
 * Run with: npx tsx scripts/check-btc-ema.ts
 */

import { fetchOHLC } from '../src/services/market-data/ohlc-fetcher';

function calculateEMA(closes: number[], period: number): number {
  if (closes.length === 0) return 0;
  const multiplier = 2 / (period + 1);
  let ema = closes[0];
  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * multiplier + ema * (1 - multiplier);
  }
  return ema;
}

async function checkBtcEma() {
  try {
    console.log('Fetching BTC daily candles from Binance...\n');

    const candles = await fetchOHLC('BTC/USDT', 250, '1d');

    if (!candles || candles.length < 200) {
      console.error('❌ Insufficient candle data:', candles?.length || 0);
      return;
    }

    const closes = candles.map(c => c.close);
    const currentPrice = closes[closes.length - 1];
    const ema50 = calculateEMA(closes, 50);
    const ema200 = calculateEMA(closes, 200);

    console.log('📊 BTC TREND ANALYSIS (Fresh Data)');
    console.log('═══════════════════════════════════════');
    console.log(`Current BTC Price: $${currentPrice.toFixed(2)}`);
    console.log(`EMA50:            $${ema50.toFixed(2)}`);
    console.log(`EMA200:           $${ema200.toFixed(2)}`);
    console.log('');

    if (currentPrice > ema50) {
      console.log('✅ BTC ABOVE EMA50 - Full trading enabled');
    } else if (currentPrice > ema200) {
      console.log('⚠️  BTC below EMA50, above EMA200 - 50% position sizing');
    } else {
      console.log('🛑 BTC BELOW EMA200 - ALL ENTRIES BLOCKED');
      const recoveryNeeded = ((ema200 - currentPrice) / currentPrice * 100).toFixed(2);
      console.log(`   Need ${recoveryNeeded}% rally to reach EMA200`);
    }

    console.log('');
    console.log(`Candles fetched: ${candles.length}`);
    console.log(`Latest candle time: ${candles[candles.length - 1].time.toISOString()}`);

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  }
}

checkBtcEma();
