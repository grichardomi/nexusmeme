/**
 * Kraken Private WebSocket Stream
 *
 * Real-time order fill detection via Kraken's authenticated WebSocket.
 * Uses `openOrders` channel — fires immediately when a SELL order fills.
 *
 * Auth flow:
 *   1. POST /0/private/GetWebSocketsToken  → one-time token (valid 15 min, renew every 10)
 *   2. Connect to wss://ws-auth.kraken.com
 *   3. Subscribe: { event: 'subscribe', subscription: { name: 'ownTrades', token } }
 *   4. On fill event: close matching open trade in DB
 *
 * One stream per bot (each bot has its own API keys).
 */

import WebSocket from 'ws';
import { createHmac, createHash } from 'crypto';
import { query } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { logger } from '@/lib/logger';

const KRAKEN_WS_AUTH_URL = 'wss://ws-auth.kraken.com';
const KRAKEN_REST_URL = 'https://api.kraken.com';
const TOKEN_RENEW_MS = 10 * 60 * 1000; // renew every 10 min (token valid 15 min)

interface KrakenStream {
  ws: WebSocket;
  token: string;
  tokenTimer: NodeJS.Timeout;
  reconnectTimer?: NodeJS.Timeout;
  botId: string;
  apiKey: string;
  apiSecret: string;
}

const streams = new Map<string, KrakenStream>();

/** Kraken REST private request (HMAC-SHA512) */
async function krakenPrivateRequest(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  apiSecret: string,
): Promise<any> {
  const nonce = Date.now().toString();
  const postData = new URLSearchParams({ nonce, ...params }).toString();

  const secretBuffer = Buffer.from(apiSecret, 'base64');
  const hash = createHash('sha256').update(nonce + postData).digest();
  const hmac = createHmac('sha512', secretBuffer)
    .update(Buffer.concat([Buffer.from(path), hash]))
    .digest('base64');

  const res = await fetch(`${KRAKEN_REST_URL}${path}`, {
    method: 'POST',
    headers: {
      'API-Key': apiKey,
      'API-Sign': hmac,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: postData,
  });

  if (!res.ok) throw new Error(`Kraken REST error: ${res.status}`);
  const data = await res.json();
  if (data.error?.length) throw new Error(`Kraken API error: ${data.error.join(', ')}`);
  return data.result;
}

async function getWebSocketsToken(apiKey: string, apiSecret: string): Promise<string> {
  const result = await krakenPrivateRequest('/0/private/GetWebSocketsToken', {}, apiKey, apiSecret);
  return result.token as string;
}

/**
 * Normalize Kraken pair to internal format.
 * ownTrades sends pairs as "XBT/USD", "XBT/USDT", "ETH/USDT", etc.
 * We map Kraken's base/quote codes to our internal canonical form.
 */
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

  // ownTrades format: "XBT/USD", "ETH/USDT"
  if (krakenPair.includes('/')) {
    const [rawBase, rawQuote] = krakenPair.split('/');
    const base = baseMap[rawBase] ?? rawBase;
    const quote = quoteMap[rawQuote] ?? rawQuote;
    return `${base}/${quote}`;
  }

  // REST/legacy format: "XXBTZUSDT", "XETHZUSDT" — strip X/Z prefix then match
  for (const [kBase, iBase] of Object.entries(baseMap)) {
    if (krakenPair.startsWith(kBase)) {
      const rest = krakenPair.slice(kBase.length);
      const quote = quoteMap[rest] ?? rest;
      return `${iBase}/${quote}`;
    }
  }
  return krakenPair;
}

async function handleSellFill(
  botId: string,
  krakenPair: string,
  fillPrice: number,
  _fillVol: number,
  fee: number,
  fillTime: number,
): Promise<void> {
  const pair = krakenPairToInternal(krakenPair);

  const openTrades = await query<{
    id: string; price: string; amount: string; fee: string | null;
  }>(
    `SELECT id, price, amount, fee FROM trades
     WHERE bot_instance_id = $1 AND pair = $2 AND status = 'open'
     ORDER BY entry_time DESC LIMIT 1`,
    [botId, pair]
  );

  if (!openTrades.length) {
    logger.debug('KrakenStream: SELL fill but no open trade found', { botId, pair, fillPrice });
    return;
  }

  const trade = openTrades[0];
  const entryPrice = parseFloat(String(trade.price));
  const quantity = parseFloat(String(trade.amount));
  const entryFee = parseFloat(String(trade.fee ?? '0')) || 0;

  // Kraken always charges fees in quote currency
  const exitFee = fee;
  const grossPL = (fillPrice - entryPrice) * quantity;
  // Store GROSS P&L — /api/trades deducts fees at display time (DB P&L Rule)
  const grossPLPct = entryPrice > 0 && quantity > 0
    ? (grossPL / (entryPrice * quantity)) * 100
    : 0;

  const result = await query<{ id: string }>(
    `UPDATE trades
     SET exit_time           = TO_TIMESTAMP($1::numeric),
         exit_price          = $2,
         profit_loss         = $3,
         profit_loss_percent = $4,
         exit_reason         = 'fill_realtime',
         fee                 = $5,
         exit_fee            = $6,
         status              = 'closed'
     WHERE id = $7 AND status = 'open'
     RETURNING id`,
    [fillTime, fillPrice, grossPL, grossPLPct, entryFee + exitFee, exitFee, trade.id]
  );

  if (result.length > 0) {
    logger.info('KrakenStream: trade closed from real-time fill', {
      tradeId: trade.id, botId, pair, entryPrice, fillPrice,
      grossPL: grossPL.toFixed(4), grossPLPct: grossPLPct.toFixed(2),
    });
  }
}

function subscribe(ws: WebSocket, token: string): void {
  ws.send(JSON.stringify({
    event: 'subscribe',
    subscription: { name: 'ownTrades', token, snapshot: false },
  }));
}

function connectStream(stream: KrakenStream): void {
  logger.info('KrakenStream: connecting', { botId: stream.botId });
  const ws = new WebSocket(KRAKEN_WS_AUTH_URL);
  stream.ws = ws;

  ws.on('open', () => {
    logger.info('KrakenStream: connected', { botId: stream.botId });
    subscribe(ws, stream.token);
  });

  ws.on('message', async (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());

      // ownTrades channel: array of trade objects
      // Format: [ [{ tradeId: { pair, type, price, vol, fee, time, ... } }], 'ownTrades', { sequence } ]
      if (!Array.isArray(msg) || msg[1] !== 'ownTrades') return;

      const tradeList: Record<string, any>[] = msg[0];
      for (const tradeMap of tradeList) {
        for (const [, t] of Object.entries(tradeMap)) {
          const trade = t as any;
          if (trade.type !== 'sell') continue;
          // Only process fills with a volume — skip malformed entries
          if (trade.vol === undefined) continue;

          const fillPrice = parseFloat(trade.price);
          const fillVol = parseFloat(trade.vol);
          const fee = parseFloat(trade.fee ?? '0');
          const fillTime = parseFloat(trade.time); // Unix seconds (float)

          await handleSellFill(stream.botId, trade.pair, fillPrice, fillVol, fee, fillTime);
        }
      }
    } catch (err) {
      logger.warn('KrakenStream: error handling message', {
        botId: stream.botId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  ws.on('error', (err) => {
    logger.warn('KrakenStream: WebSocket error', { botId: stream.botId, error: err.message });
  });

  ws.on('close', (code, reason) => {
    logger.warn('KrakenStream: disconnected', {
      botId: stream.botId, code, reason: reason.toString(),
    });
    if (streams.has(stream.botId)) {
      stream.reconnectTimer = setTimeout(async () => {
        try {
          stream.token = await getWebSocketsToken(stream.apiKey, stream.apiSecret);
          connectStream(stream);
        } catch (err) {
          logger.warn('KrakenStream: reconnect failed', {
            botId: stream.botId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }, 5000);
    }
  });
}

export async function startKrakenUserDataStream(
  botId: string,
  encryptedPublicKey: string,
  encryptedSecretKey: string,
): Promise<void> {
  if (streams.has(botId)) return;

  let apiKey: string;
  let apiSecret: string;
  try {
    apiKey = decrypt(encryptedPublicKey);
    apiSecret = decrypt(encryptedSecretKey);
  } catch {
    logger.warn('KrakenStream: failed to decrypt API keys', { botId });
    return;
  }

  let token: string;
  try {
    token = await getWebSocketsToken(apiKey, apiSecret);
  } catch (err) {
    logger.warn('KrakenStream: failed to get WebSocket token', {
      botId, error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // Renew token every 10 minutes
  const tokenTimer = setInterval(async () => {
    const currentStream = streams.get(botId);
    if (!currentStream) return;
    try {
      currentStream.token = await getWebSocketsToken(apiKey, apiSecret);
      // Re-subscribe with new token on next reconnect (current session token still valid for remainder)
      logger.debug('KrakenStream: token renewed', { botId });
    } catch (err) {
      logger.warn('KrakenStream: token renewal failed', {
        botId, error: err instanceof Error ? err.message : String(err),
      });
    }
  }, TOKEN_RENEW_MS);

  const stream: KrakenStream = { ws: null as any, token, tokenTimer, botId, apiKey, apiSecret };
  streams.set(botId, stream);
  connectStream(stream);
}

export function stopKrakenUserDataStream(botId: string): void {
  const stream = streams.get(botId);
  if (!stream) return;
  streams.delete(botId);
  clearInterval(stream.tokenTimer);
  if (stream.reconnectTimer) clearTimeout(stream.reconnectTimer);
  try { stream.ws.close(); } catch {}
  logger.info('KrakenStream: stopped', { botId });
}

export async function startKrakenStreamsForAllLiveBots(): Promise<void> {
  try {
    const bots = await query<{
      id: string; encrypted_public_key: string; encrypted_secret_key: string;
    }>(
      `SELECT bi.id, ek.encrypted_public_key, ek.encrypted_secret_key
       FROM bot_instances bi
       JOIN exchange_api_keys ek ON ek.user_id = bi.user_id AND ek.exchange = bi.exchange
       WHERE bi.exchange = 'kraken'
         AND bi.status = 'running'
         AND COALESCE(bi.config->>'tradingMode', 'paper') = 'live'`
    );

    logger.info('KrakenStream: starting streams for live bots', { count: bots.length });
    for (const bot of bots) {
      await startKrakenUserDataStream(bot.id, bot.encrypted_public_key, bot.encrypted_secret_key);
    }
  } catch (err) {
    logger.warn('KrakenStream: failed to start streams on init', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
