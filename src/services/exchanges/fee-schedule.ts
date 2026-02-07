import { query } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { getExchangeAdapter } from '@/services/exchanges/singleton';
import type { ExchangeAdapter } from '@/services/exchanges/adapter';
import { logger } from '@/lib/logger';
import { createHmac } from 'crypto';

type FeeKey = string; // `${userId}:${exchange}`

interface CachedFees {
  maker: number;
  taker: number;
  expiresAt: number;
}

const FEES_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const cache = new Map<FeeKey, CachedFees>();
const symbolCache = new Map<string, CachedFees>(); // key: `${userId}:${exchange}:${symbol}`

function key(userId: string, exchange: string): FeeKey {
  return `${userId}:${exchange.toLowerCase()}`;
}

export async function getAccountFeeRates(userId: string, exchange: string): Promise<{ maker: number; taker: number }> {
  try {
    const k = key(userId, exchange);
    const now = Date.now();
    const cached = cache.get(k);
    if (cached && cached.expiresAt > now) {
      return { maker: cached.maker, taker: cached.taker };
    }

    // Load API keys for this user/exchange
    const keysResult = await query<{ encrypted_public_key: string; encrypted_secret_key: string }>(
      `SELECT encrypted_public_key, encrypted_secret_key
       FROM exchange_api_keys
       WHERE user_id = $1 AND exchange = $2`,
      [userId, exchange.toLowerCase()]
    );

    if (keysResult.length === 0) {
      throw new Error(`No API keys for ${exchange}`);
    }

    let publicKey: string;
    let secretKey: string;
    try {
      publicKey = decrypt(keysResult[0].encrypted_public_key);
      secretKey = decrypt(keysResult[0].encrypted_secret_key);
    } catch {
      // Fallback for legacy base64-stored keys
      publicKey = Buffer.from(keysResult[0].encrypted_public_key, 'base64').toString('utf-8');
      secretKey = Buffer.from(keysResult[0].encrypted_secret_key, 'base64').toString('utf-8');
    }

    const adapter: ExchangeAdapter = getExchangeAdapter(exchange);
    await adapter.connect({ publicKey, secretKey });
    const fees = await adapter.getFees();

    cache.set(k, {
      maker: fees.maker,
      taker: fees.taker,
      expiresAt: now + FEES_TTL_MS,
    });
    return fees;
  } catch (error) {
    logger.error('Fee schedule fetch failed', error instanceof Error ? error : null, {
      userId,
      exchange,
    });
    // In case of failure, return a safe default of zero; callers should fall back to captured fees
    return { maker: 0, taker: 0 };
  }
}

export function computeMinExitPrice(entryPrice: number, entryFeeQuote: number, qty: number, takerRate: number, bufferPct = 0.001): number {
  // Solve: (Pexit - entryPrice)*qty - (entryFeeQuote + takerRate*Pexit*qty) >= 0
  // => Pexit * qty * (1 - takerRate) >= entryPrice*qty + entryFeeQuote
  const numerator = (entryPrice * qty) + entryFeeQuote;
  const denom = qty * (1 - takerRate);
  const requiredPx = denom > 0 ? (numerator / denom) : entryPrice;
  return requiredPx * (1 + bufferPct);
}

/**
 * Get taker fee rate for a specific symbol (per-user), if supported by exchange
 * Returns decimal rates (e.g., 0.001 for 0.10%)
 */
export async function getSymbolTakerRate(userId: string, exchange: string, pair: string): Promise<number> {
  const ex = exchange.toLowerCase();
  if (ex !== 'binance') {
    // Kraken typically uniform per account; fallback to account-level taker
    const fees = await getAccountFeeRates(userId, exchange);
    return fees.taker;
  }

  try {
    // Convert pair like ETH/USDT to symbol ETHUSDT
    const symbol = pair.replace('/', '');
    const cacheKey = `${userId}:${ex}:${symbol}`;
    const now = Date.now();
    const cached = symbolCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.taker;
    }

    // Load API keys
    const keysResult = await query<{ encrypted_public_key: string; encrypted_secret_key: string }>(
      `SELECT encrypted_public_key, encrypted_secret_key
       FROM exchange_api_keys
       WHERE user_id = $1 AND exchange = $2`,
      [userId, ex]
    );
    if (keysResult.length === 0) {
      throw new Error('No API keys for symbol fee lookup');
    }

    let publicKey: string;
    let secretKey: string;
    try {
      publicKey = decrypt(keysResult[0].encrypted_public_key);
      secretKey = decrypt(keysResult[0].encrypted_secret_key);
    } catch {
      publicKey = Buffer.from(keysResult[0].encrypted_public_key, 'base64').toString('utf-8');
      secretKey = Buffer.from(keysResult[0].encrypted_secret_key, 'base64').toString('utf-8');
    }

    // Binance SAPI /sapi/v1/asset/tradeFee?symbol=ETHUSDT (private signed)
    const baseUrl = 'https://api.binance.com/sapi';
    const path = '/v1/asset/tradeFee';
    const params: Record<string, any> = { symbol, timestamp: Date.now() };
    const queryString = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
    const signature = createHmac('sha256', secretKey).update(queryString).digest('hex');
    const url = `${baseUrl}${path}?${queryString}&signature=${signature}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'X-MBX-APIKEY': publicKey },
    });
    if (!res.ok) {
      throw new Error(`Binance symbol fee error: ${res.status}`);
    }
    const data = await res.json();
    // Response is array of { symbol, makerCommission, takerCommission } in percent (e.g., 0.1)
    const entry = Array.isArray(data) ? data.find((d: any) => d.symbol === symbol) : null;
    const makerPct = entry ? parseFloat(String(entry.makerCommission)) : NaN;
    const takerPct = entry ? parseFloat(String(entry.takerCommission)) : NaN;
    const maker = Number.isFinite(makerPct) ? makerPct / 100 : 0.001;
    const taker = Number.isFinite(takerPct) ? takerPct / 100 : 0.001;

    symbolCache.set(cacheKey, { maker, taker, expiresAt: now + FEES_TTL_MS });
    return taker;
  } catch (error) {
    logger.error('Symbol fee lookup failed', error instanceof Error ? error : null, { userId, exchange, pair });
    // Fallback to account-level
    const fees = await getAccountFeeRates(userId, exchange);
    return fees.taker;
  }
}
