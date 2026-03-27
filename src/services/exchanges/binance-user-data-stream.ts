/**
 * Binance User Data Stream
 *
 * Real-time order fill detection via WebSocket (not polling).
 * When a SELL order fills on Binance — whether via the bot or manually —
 * this closes the corresponding open trade in the DB within ~100ms.
 *
 * One stream per bot (each bot has its own API keys).
 * ListenKey is kept alive every 25 minutes (Binance expires after 60m).
 */

import WebSocket from 'ws';
import { query } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { getCachedTakerFee } from '@/services/billing/fee-rate';
import { getEnvironmentConfig } from '@/config/environment';

interface ExecutionReport {
  e: 'executionReport';
  E: number;   // event time
  s: string;   // symbol e.g. "ETHUSDT"
  S: 'BUY' | 'SELL';
  X: string;   // order status: FILLED, PARTIALLY_FILLED, etc.
  x: string;   // execution type: TRADE, NEW, CANCELED, etc.
  L: string;   // last executed price
  l: string;   // last executed qty
  Z: string;   // cumulative filled quote qty
  z: string;   // cumulative filled base qty
  n: string;   // commission amount
  N: string | null; // commission asset
  T: number;   // transaction time
  i: number;   // order ID
}

interface BotStream {
  ws: WebSocket;
  listenKey: string;
  keepaliveTimer: NodeJS.Timeout;
  reconnectTimer?: NodeJS.Timeout;
  botId: string;
  apiKey: string;
  apiSecret: string;
  baseUrl: string;  // REST base URL
  wsBaseUrl: string; // WebSocket base URL
}

const streams = new Map<string, BotStream>(); // botId -> stream

function getWsBaseUrl(apiBaseUrl: string): string {
  // api.binance.us -> stream.binance.us, api.binance.com -> stream.binance.com
  return apiBaseUrl
    .replace('https://api.', 'wss://stream.')
    .replace(/\/api$/, '') + ':9443';
}

/** Create a listenKey via REST (no signature needed, only API key header) */
async function createListenKey(apiBaseUrl: string, apiKey: string): Promise<string> {
  const url = `${apiBaseUrl}/v3/userDataStream`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'X-MBX-APIKEY': apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create listenKey: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.listenKey as string;
}

/** Renew a listenKey (PUT) to prevent expiry */
async function renewListenKey(apiBaseUrl: string, apiKey: string, listenKey: string): Promise<void> {
  const url = `${apiBaseUrl}/v3/userDataStream?listenKey=${listenKey}`;
  await fetch(url, {
    method: 'PUT',
    headers: { 'X-MBX-APIKEY': apiKey },
  });
}

/** Normalize Binance symbol to internal pair format: ETHUSDT -> ETH/USDT */
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

/** Find and close an open trade when a SELL fill arrives */
async function handleSellFill(
  botId: string,
  symbol: string,
  fillPrice: number,
  fillQty: number,
  commission: number,
  commissionAsset: string,
  fillTime: number,
): Promise<void> {
  const pair = normalizeSymbolToPair(symbol);
  const [, quote] = pair.split('/');

  // Find the open trade for this bot + pair
  const openTrades = await query<{
    id: string; price: string; amount: string; fee: string | null;
  }>(
    `SELECT id, price, amount, fee FROM trades
     WHERE bot_instance_id = $1 AND pair = $2 AND status = 'open'
     ORDER BY entry_time DESC LIMIT 1`,
    [botId, pair]
  );

  if (!openTrades.length) {
    logger.debug('UserDataStream: SELL fill received but no open trade found', { botId, pair, fillPrice });
    return;
  }

  const trade = openTrades[0];
  const entryPrice = parseFloat(String(trade.price));
  const quantity = parseFloat(String(trade.amount));
  // Convert commission to quote if needed
  let exitFee = 0;
  if (commission > 0) {
    if (commissionAsset.toUpperCase() === quote.toUpperCase()) {
      exitFee = commission;
    } else {
      // Commission in BNB or other asset — estimate via admin-configured taker rate
      exitFee = fillPrice * fillQty * getCachedTakerFee('binance');
    }
  }

  const grossPL = (fillPrice - entryPrice) * quantity;
  // Store GROSS P&L in DB — /api/trades deducts fees at display time (DB P&L Rule)
  const grossPLPct = entryPrice > 0 && quantity > 0
    ? (grossPL / (entryPrice * quantity)) * 100
    : 0;

  const result = await query<{ id: string }>(
    `UPDATE trades
     SET exit_time           = TO_TIMESTAMP($1::bigint / 1000.0),
         exit_price          = $2,
         profit_loss         = $3,
         profit_loss_percent = $4,
         exit_reason         = 'fill_realtime',
         fee                 = COALESCE(fee, 0) + $5,
         exit_fee            = $5,
         status              = 'closed'
     WHERE id = $6 AND status = 'open'
     RETURNING id`,
    [fillTime, fillPrice, grossPL, grossPLPct, exitFee, trade.id]
  );

  if (result.length > 0) {
    logger.info('UserDataStream: trade closed from real-time fill', {
      tradeId: trade.id,
      botId,
      pair,
      entryPrice,
      fillPrice,
      grossPL: grossPL.toFixed(4),
      grossPLPct: grossPLPct.toFixed(2),
    });
  }
}

function connectStream(stream: BotStream): void {
  const url = `${stream.wsBaseUrl}/ws/${stream.listenKey}`;
  logger.info('UserDataStream: connecting', { botId: stream.botId, url });

  const ws = new WebSocket(url);
  stream.ws = ws;

  ws.on('open', () => {
    logger.info('UserDataStream: connected', { botId: stream.botId });
  });

  ws.on('message', async (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.e !== 'executionReport') return;
      const report = msg as ExecutionReport;

      // Only act on completed SELL fills
      if (report.S !== 'SELL') return;
      if (report.X !== 'FILLED' && report.X !== 'PARTIALLY_FILLED') return;
      if (report.x !== 'TRADE') return;

      // Use avg fill price for multi-fill orders: cumQuoteQty / cumBaseQty
      const cumQuote = parseFloat(report.Z);
      const cumBase = parseFloat(report.z);
      const avgPrice = cumBase > 0 ? cumQuote / cumBase : parseFloat(report.L);
      const commission = parseFloat(report.n);
      const commissionAsset = report.N ?? '';

      await handleSellFill(
        stream.botId,
        report.s,
        avgPrice,
        cumBase,
        commission,
        commissionAsset,
        report.T,
      );
    } catch (err) {
      logger.warn('UserDataStream: error handling message', {
        botId: stream.botId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  ws.on('error', (err) => {
    logger.warn('UserDataStream: WebSocket error', { botId: stream.botId, error: err.message });
  });

  ws.on('close', (code, reason) => {
    logger.warn('UserDataStream: disconnected', {
      botId: stream.botId, code, reason: reason.toString(),
    });
    // Reconnect after 5 seconds (unless stream was intentionally stopped)
    if (streams.has(stream.botId)) {
      stream.reconnectTimer = setTimeout(async () => {
        try {
          // Re-create listenKey on reconnect (old one may have expired)
          stream.listenKey = await createListenKey(stream.baseUrl, stream.apiKey);
          connectStream(stream);
        } catch (err) {
          logger.warn('UserDataStream: reconnect failed', {
            botId: stream.botId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }, 5000);
    }
  });
}

/**
 * Start a User Data Stream for a specific bot.
 * Safe to call multiple times — skips if stream already active.
 */
export async function startUserDataStream(
  botId: string,
  encryptedPublicKey: string,
  encryptedSecretKey: string,
): Promise<void> {
  if (streams.has(botId)) return; // Already running

  let apiKey: string;
  let apiSecret: string;
  try {
    apiKey = decrypt(encryptedPublicKey);
    apiSecret = decrypt(encryptedSecretKey);
  } catch {
    logger.warn('UserDataStream: failed to decrypt API keys', { botId });
    return;
  }

  const env = getEnvironmentConfig();
  const baseUrl = `${env.BINANCE_API_BASE_URL}/api`;
  const wsBaseUrl = getWsBaseUrl(env.BINANCE_API_BASE_URL);

  let listenKey: string;
  try {
    listenKey = await createListenKey(baseUrl, apiKey);
  } catch (err) {
    logger.warn('UserDataStream: failed to create listenKey', {
      botId,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // Renew listenKey every 25 minutes (use stream.listenKey so reconnect's new key is renewed)
  const keepaliveTimer = setInterval(async () => {
    const currentStream = streams.get(botId);
    if (!currentStream) return;
    try {
      await renewListenKey(baseUrl, apiKey, currentStream.listenKey);
      logger.debug('UserDataStream: listenKey renewed', { botId });
    } catch (err) {
      logger.warn('UserDataStream: listenKey renewal failed', {
        botId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, 25 * 60 * 1000);

  const stream: BotStream = {
    ws: null as any,
    listenKey,
    keepaliveTimer,
    botId,
    apiKey,
    apiSecret,
    baseUrl,
    wsBaseUrl,
  };
  streams.set(botId, stream);
  connectStream(stream);
}

/** Stop and clean up the stream for a bot */
export function stopUserDataStream(botId: string): void {
  const stream = streams.get(botId);
  if (!stream) return;
  streams.delete(botId);
  clearInterval(stream.keepaliveTimer);
  if (stream.reconnectTimer) clearTimeout(stream.reconnectTimer);
  try {
    stream.ws.close();
  } catch {}
  logger.info('UserDataStream: stopped', { botId });
}

/**
 * Start streams for all live running bots.
 * Called once on orchestrator startup.
 */
export async function startUserDataStreamsForAllLiveBots(): Promise<void> {
  try {
    const bots = await query<{
      id: string;
      encrypted_public_key: string;
      encrypted_secret_key: string;
    }>(
      `SELECT bi.id, ek.encrypted_public_key, ek.encrypted_secret_key
       FROM bot_instances bi
       JOIN exchange_api_keys ek ON ek.user_id = bi.user_id AND ek.exchange = bi.exchange
       WHERE bi.exchange = 'binance'
         AND bi.status = 'running'
         AND COALESCE(bi.config->>'tradingMode', 'paper') = 'live'`
    );

    logger.info('UserDataStream: starting streams for live bots', { count: bots.length });

    for (const bot of bots) {
      await startUserDataStream(bot.id, bot.encrypted_public_key, bot.encrypted_secret_key);
    }
  } catch (err) {
    logger.warn('UserDataStream: failed to start streams on init', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
