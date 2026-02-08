/**
 * Diagnostic: Check current BTC EMA values (standalone)
 * Run with: node scripts/check-btc-ema-simple.js
 */

function calculateEMA(closes, period) {
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

    const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=251`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const candles = await response.json();

    // Parse Binance format: [openTime, open, high, low, close, volume, closeTime, ...]
    const closes = candles
      .slice(0, -1) // Remove incomplete current candle
      .slice(-250)  // Take last 250
      .map(c => parseFloat(c[4])); // close price

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
    console.log(`Candles analyzed: ${closes.length}`);
    console.log(`Last candle timestamp: ${new Date(candles[candles.length - 2][0]).toISOString()}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkBtcEma();
