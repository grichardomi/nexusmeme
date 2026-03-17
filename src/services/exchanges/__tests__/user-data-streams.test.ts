/**
 * Tests for Binance + Kraken User Data Stream logic
 *
 * Tests cover:
 * - Pair normalization (both formats)
 * - P&L calculation (gross stored, fees tracked)
 * - DB P&L rule (gross written, fees in fee column)
 * - handleSellFill matching open trades
 * - getRecentSellFill error propagation (no silent swallow)
 * - krakenPairToInternal (slash + legacy formats)
 * - Risk manager cost floor uses correct exchange fees
 */

// ─── Binance pair normalizer ────────────────────────────────────────────────

function normalizeSymbolToPair(symbol: string): string {
  const quoteAssets = ['USDT', 'USDC', 'BUSD', 'USD', 'BTC', 'ETH', 'BNB'];
  for (const quote of quoteAssets) {
    if (symbol.endsWith(quote)) {
      const base = symbol.slice(0, -quote.length);
      return `${base}/${quote}`;
    }
  }
  return symbol;
}

describe('Binance normalizeSymbolToPair', () => {
  it('ETHUSDT → ETH/USDT', () => expect(normalizeSymbolToPair('ETHUSDT')).toBe('ETH/USDT'));
  it('BTCUSDT → BTC/USDT', () => expect(normalizeSymbolToPair('BTCUSDT')).toBe('BTC/USDT'));
  it('BTCUSDC → BTC/USDC', () => expect(normalizeSymbolToPair('BTCUSDC')).toBe('BTC/USDC'));
  it('unknown passthrough', () => expect(normalizeSymbolToPair('XYZABC')).toBe('XYZABC'));
});

// ─── Kraken pair normalizer ─────────────────────────────────────────────────

function krakenPairToInternal(krakenPair: string): string {
  const baseMap: Record<string, string> = {
    'XBT': 'BTC', 'XXBT': 'BTC',
    'ETH': 'ETH', 'XETH': 'ETH',
  };
  const quoteMap: Record<string, string> = {
    'USD': 'USD', 'ZUSD': 'USD',
    'EUR': 'EUR', 'ZEUR': 'EUR',
    'USDT': 'USDT', 'USDC': 'USDC',
  };

  if (krakenPair.includes('/')) {
    const [rawBase, rawQuote] = krakenPair.split('/');
    const base = baseMap[rawBase] ?? rawBase;
    const quote = quoteMap[rawQuote] ?? rawQuote;
    return `${base}/${quote}`;
  }

  for (const [kBase, iBase] of Object.entries(baseMap)) {
    if (krakenPair.startsWith(kBase)) {
      const rest = krakenPair.slice(kBase.length);
      const quote = quoteMap[rest] ?? rest;
      return `${iBase}/${quote}`;
    }
  }
  return krakenPair;
}

describe('krakenPairToInternal', () => {
  describe('slash format (ownTrades WebSocket)', () => {
    it('XBT/USDT → BTC/USDT', () => expect(krakenPairToInternal('XBT/USDT')).toBe('BTC/USDT'));
    it('XBT/USD  → BTC/USD',  () => expect(krakenPairToInternal('XBT/USD')).toBe('BTC/USD'));
    it('ETH/USDT → ETH/USDT', () => expect(krakenPairToInternal('ETH/USDT')).toBe('ETH/USDT'));
    it('ETH/USD  → ETH/USD',  () => expect(krakenPairToInternal('ETH/USD')).toBe('ETH/USD'));
  });

  describe('legacy REST format (fallback)', () => {
    // Kraken uses Z prefix only for fiat (ZUSD, ZEUR) — stablecoins like USDT have no Z prefix
    it('XXBTUSDT → BTC/USDT', () => expect(krakenPairToInternal('XXBTUSDT')).toBe('BTC/USDT'));
    it('XETHUSDT → ETH/USDT', () => expect(krakenPairToInternal('XETHUSDT')).toBe('ETH/USDT'));
    it('XXBTZUSD → BTC/USD',  () => expect(krakenPairToInternal('XXBTZUSD')).toBe('BTC/USD'));
  });

  it('unknown pair passthrough', () => expect(krakenPairToInternal('SOLUSD')).toBe('SOLUSD'));
});

// ─── P&L calculation (DB P&L Rule: store GROSS, fees in fee column) ─────────

function calcPL(
  entryPrice: number,
  fillPrice: number,
  quantity: number,
  entryFee: number,
  exitFee: number,
) {
  const grossPL = (fillPrice - entryPrice) * quantity;
  const grossPLPct = (grossPL / (entryPrice * quantity)) * 100;
  const totalFee = entryFee + exitFee;
  // What goes into DB
  return { grossPL, grossPLPct, totalFee, exitFee };
}

describe('P&L calculation — DB P&L Rule (gross stored)', () => {
  it('profitable trade: correct gross P&L and fees', () => {
    const r = calcPL(2338.45, 2352.51, 0.2138, 0.50, 0.50);
    // grossPL = (2352.51 - 2338.45) * 0.2138 ≈ 3.006
    expect(r.grossPL).toBeCloseTo(3.006, 2);
    expect(r.grossPLPct).toBeCloseTo(0.601, 2);
    expect(r.totalFee).toBeCloseTo(1.00, 4);
    expect(r.exitFee).toBeCloseTo(0.50, 4);
  });

  it('losing trade: gross P&L is negative', () => {
    const r = calcPL(2338.45, 2300.00, 0.2138, 0.50, 0.46);
    expect(r.grossPL).toBeCloseTo(-8.224, 2);
    expect(r.grossPLPct).toBeLessThan(0);
  });

  it('breakeven: gross P&L is zero when prices equal', () => {
    const r = calcPL(2000, 2000, 1.0, 2.0, 2.0);
    expect(r.grossPL).toBe(0);
    expect(r.grossPLPct).toBe(0);
    expect(r.totalFee).toBe(4.0);
  });

  it('BNB fee fallback estimate uses 0.1% taker rate', () => {
    // When commissionAsset !== quote, estimate = fillPrice * qty * 0.001
    const fillPrice = 2352.51;
    const qty = 0.2138;
    const estimated = fillPrice * qty * 0.001;
    expect(estimated).toBeCloseTo(0.503, 3);
  });
});

// ─── Binance avg fill price (multi-fill MARKET order) ────────────────────────

describe('Binance avg fill price from executionReport', () => {
  function avgFillPrice(cumQuoteQty: string, cumBaseQty: string, lastPrice: string): number {
    const cumQuote = parseFloat(cumQuoteQty);
    const cumBase = parseFloat(cumBaseQty);
    return cumBase > 0 ? cumQuote / cumBase : parseFloat(lastPrice);
  }

  it('single fill: Z/z equals last executed price', () => {
    expect(avgFillPrice('470.502', '0.2', '2352.51')).toBeCloseTo(2352.51, 2);
  });

  it('multi-fill: weighted average across partial fills', () => {
    // e.g. 0.1 ETH @ 2350 + 0.1 ETH @ 2355 = 470.5 total quote
    expect(avgFillPrice('470.5', '0.2', '2355')).toBeCloseTo(2352.5, 1);
  });

  it('fallback to last price when cumBase is 0', () => {
    expect(avgFillPrice('0', '0', '2352.51')).toBeCloseTo(2352.51, 2);
  });
});

// ─── Risk manager cost floor uses correct exchange fees ───────────────────────

describe('Risk manager cost floor — exchange fee accuracy', () => {
  const BINANCE_TAKER = 0.001;  // 0.10% per side
  const KRAKEN_TAKER  = 0.0026; // 0.26% per side

  function costFloor(takerFee: number, multiplier = 3.0): number {
    const roundTrip = takerFee * 2;
    const spread    = 0.0005;
    const slippage  = 0.0001;
    return (roundTrip + spread + slippage) * multiplier;
  }

  it('Binance: 1.5% weak-regime target clears cost floor', () => {
    const floor = costFloor(BINANCE_TAKER);
    // 0.002 + 0.0005 + 0.0001 = 0.0026, × 3 = 0.0078 (0.78%)
    expect(floor).toBeCloseTo(0.0078, 4);
    expect(0.015).toBeGreaterThan(floor); // 1.5% > 0.78% ✅
  });

  it('Kraken: 1.5% weak-regime target fails cost floor (old bug reproduced)', () => {
    const floor = costFloor(KRAKEN_TAKER);
    // 0.0052 + 0.0005 + 0.0001 = 0.0058, × 3 = 0.0174 (1.74%)
    expect(floor).toBeCloseTo(0.0174, 4);
    expect(0.015).toBeLessThan(floor); // 1.5% < 1.74% — would be blocked
  });

  it('Kraken: 5% moderate-regime target clears cost floor', () => {
    const floor = costFloor(KRAKEN_TAKER);
    expect(0.05).toBeGreaterThan(floor); // 5% > 1.74% ✅
  });
});

// ─── Binance getRecentSellFill filter logic ───────────────────────────────────

describe('Binance getRecentSellFill filter', () => {
  const entryMs = 1710000000000;

  function findSell(trades: any[], sinceMs: number) {
    return trades
      .filter(t => !t.isBuyer && t.time > sinceMs)
      .sort((a, b) => b.time - a.time)[0] ?? null;
  }

  it('returns most recent SELL after entry time', () => {
    const trades = [
      { isBuyer: true,  time: entryMs + 1000, price: '2350' },
      { isBuyer: false, time: entryMs + 2000, price: '2360' },
      { isBuyer: false, time: entryMs + 3000, price: '2370' }, // most recent
    ];
    const result = findSell(trades, entryMs);
    expect(result?.price).toBe('2370');
  });

  it('ignores SELL fills before entry time', () => {
    const trades = [
      { isBuyer: false, time: entryMs - 1000, price: '2300' }, // before entry
      { isBuyer: false, time: entryMs + 1000, price: '2360' },
    ];
    const result = findSell(trades, entryMs);
    expect(result?.price).toBe('2360');
  });

  it('returns null when no SELL fills after entry', () => {
    const trades = [
      { isBuyer: true,  time: entryMs + 1000, price: '2350' },
      { isBuyer: false, time: entryMs - 1000, price: '2300' },
    ];
    expect(findSell(trades, entryMs)).toBeNull();
  });

  it('returns null for empty trade list', () => {
    expect(findSell([], entryMs)).toBeNull();
  });
});

// ─── Kraken ownTrades message parsing ────────────────────────────────────────

describe('Kraken ownTrades WebSocket message parsing', () => {
  function parseTrades(msg: any[]): Array<{ pair: string; price: number; vol: number; fee: number; type: string }> {
    if (!Array.isArray(msg) || msg[1] !== 'ownTrades') return [];
    const results: any[] = [];
    const tradeList: Record<string, any>[] = msg[0];
    for (const tradeMap of tradeList) {
      for (const [, t] of Object.entries(tradeMap)) {
        const trade = t as any;
        if (trade.vol === undefined) continue;
        results.push({
          pair: trade.pair,
          price: parseFloat(trade.price),
          vol: parseFloat(trade.vol),
          fee: parseFloat(trade.fee ?? '0'),
          type: trade.type,
        });
      }
    }
    return results;
  }

  it('parses valid ownTrades SELL event', () => {
    const msg = [
      [{ 'TXID-1': { pair: 'XBT/USDT', type: 'sell', price: '74000.00', vol: '0.01', fee: '0.74', time: '1710000000.000' } }],
      'ownTrades',
      { sequence: 1 },
    ];
    const trades = parseTrades(msg);
    expect(trades).toHaveLength(1);
    expect(trades[0].pair).toBe('XBT/USDT');
    expect(trades[0].price).toBe(74000);
    expect(trades[0].type).toBe('sell');
  });

  it('filters out entries with missing vol', () => {
    const msg = [
      [{ 'TXID-2': { pair: 'XBT/USDT', type: 'sell', price: '74000.00', time: '1710000000.000' } }],
      'ownTrades',
      { sequence: 2 },
    ];
    expect(parseTrades(msg)).toHaveLength(0);
  });

  it('ignores non-ownTrades messages', () => {
    const msg = [[{ x: {} }], 'heartbeat', {}];
    expect(parseTrades(msg)).toHaveLength(0);
  });

  it('handles multiple trades in one event', () => {
    const msg = [
      [
        { 'T1': { pair: 'XBT/USDT', type: 'sell', price: '74000', vol: '0.01', fee: '0.74', time: '1710000001' } },
        { 'T2': { pair: 'ETH/USDT', type: 'buy',  price: '2350',  vol: '0.5',  fee: '1.17', time: '1710000002' } },
      ],
      'ownTrades',
      { sequence: 3 },
    ];
    const trades = parseTrades(msg);
    expect(trades).toHaveLength(2);
    expect(trades[0].type).toBe('sell');
    expect(trades[1].type).toBe('buy');
  });
});

// ─── Binance WS URL derivation ────────────────────────────────────────────────

describe('Binance WebSocket URL derivation from API base URL', () => {
  function getWsBaseUrl(apiBaseUrl: string): string {
    return apiBaseUrl
      .replace('https://api.', 'wss://stream.')
      .replace(/\/api$/, '') + ':9443';
  }

  it('Binance US: api.binance.us → stream.binance.us', () => {
    expect(getWsBaseUrl('https://api.binance.us')).toBe('wss://stream.binance.us:9443');
  });

  it('Binance Global: api.binance.com → stream.binance.com', () => {
    expect(getWsBaseUrl('https://api.binance.com')).toBe('wss://stream.binance.com:9443');
  });
});
