/**
 * Binance WebSocket Client for real-time price streaming
 * Connects to Binance combined streams and broadcasts ticker updates
 *
 * Multi-instance support:
 * - Only leader instance connects to Binance (elected via Redis)
 * - Publishes prices to Redis for other instances to consume
 * - Followers read from Redis cache as fallback
 */

import WebSocket from 'ws';
import { logger } from '@/lib/logger';
import { WebSocketHeartbeat, ExponentialBackoff } from '@/lib/websocket-heartbeat';
import { CircuitBreaker, CircuitBreakerState } from '@/lib/circuit-breaker';
import type { PriceUpdate, BinanceTickerEvent, PriceSubscriber, WebSocketState } from '@/types/market-data';
import { WebSocketState as StateEnum } from '@/types/market-data';
import { publishPriceToRedis } from './redis-price-distribution';
import { getPriceLeaderElection } from './leader-election';

/**
 * Maps trading pairs to Binance stream names
 * BTC/USD -> btcusdt@ticker (Binance uses USDT, we normalize to USD/USDT in response)
 */
function getPairStreamName(pair: string): string {
  const [base, quoteRaw] = pair.split('/');
  const quote = quoteRaw === 'USD' ? 'USDT' : quoteRaw; // Map app default USD to Binance USDT
  const normalized = `${base}${quote}`.toLowerCase();
  return `${normalized}@ticker`;
}

/**
 * Normalizes Binance symbol to our internal pair format
 * BTCUSDT -> BTC/USDT
 */
function normalizePair(symbol: string, subscribedPairs: Set<string>): string {
  const mapWithPreference = (base: string, primaryQuote: string, aliases: string[]): string => {
    const primary = `${base}/${primaryQuote}`;
    if (subscribedPairs.has(primary)) return primary;
    for (const alias of aliases) {
      const candidate = `${base}/${alias}`;
      if (subscribedPairs.has(candidate)) return candidate;
    }
    return primary;
  };

  if (symbol.endsWith('USDT')) {
    const base = symbol.slice(0, -4);
    return mapWithPreference(base, 'USDT', ['USD']);
  }
  if (symbol.endsWith('BUSD')) {
    const base = symbol.slice(0, -4);
    return mapWithPreference(base, 'BUSD', ['USD']);
  }
  if (symbol.endsWith('USDC')) {
    const base = symbol.slice(0, -4);
    return mapWithPreference(base, 'USDC', ['USD']);
  }
  // Fallback for other cases
  return symbol;
}

interface SubscriberEntry {
  callback: PriceSubscriber;
  pair: string;
}

export class BinanceWebSocketClient {
  private ws: WebSocket | null = null;
  private state: WebSocketState = StateEnum.DISCONNECTED;
  private subscribers: Map<string, SubscriberEntry[]> = new Map();
  private subscribedPairs: Set<string> = new Set();
  private heartbeat: WebSocketHeartbeat;
  private backoff: ExponentialBackoff;
  private circuitBreaker: CircuitBreaker;
  private connectionAttempts = 0;
  private lastSuccessfulConnectionTime = 0;
  private consecutiveErrors = 0;
  private readonly binanceWsUrl = 'wss://stream.binance.com:9443';
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isLeader = false;
  private leaderElection: any; // Lazy loaded
  private intentionalDisconnect = false; // Track if disconnect is intentional

  constructor() {
    this.heartbeat = new WebSocketHeartbeat(180000); // 3 minutes
    this.backoff = new ExponentialBackoff(1000, 60000);
    this.circuitBreaker = new CircuitBreaker('binance-websocket', {
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 60000,
      onStateChange: (state) => {
        logger.warn('WebSocket circuit breaker state changed', { state });
      },
    });
  }

  /**
   * Initialize leader election for multi-instance support
   */
  private async initializeLeaderElection(): Promise<void> {
    if (this.leaderElection) return;

    try {
      this.leaderElection = getPriceLeaderElection();
      this.leaderElection.startLeadershipCheck((isLeader: boolean) => {
        // Use the dedicated handler for leadership transitions
        this.handleLeadershipChange(isLeader).catch(error => {
          logger.error('Failed to handle leadership change', error instanceof Error ? error : undefined);
        });
      });
    } catch (error) {
      logger.error('Failed to initialize leader election', error instanceof Error ? error : undefined);
      // Continue without leader election (single instance mode)
      this.isLeader = true;
    }
  }

  /**
   * Get current connection state
   */
  getState(): WebSocketState {
    return this.state;
  }

  /**
   * Connect to Binance WebSocket and subscribe to pairs
   * Only connects if this instance is the leader in multi-instance setup
   * Uses circuit breaker to prevent cascading failures
   */
  async connect(pairs: string[]): Promise<void> {
    if (this.state === StateEnum.CONNECTING || this.state === StateEnum.CONNECTED) {
      logger.debug('WebSocket already connecting or connected', { currentState: this.state });
      return;
    }

    if (pairs.length === 0) {
      logger.warn('No pairs to subscribe to');
      return;
    }

    // Check circuit breaker before attempting connection
    if (this.circuitBreaker.getState() === CircuitBreakerState.OPEN) {
      logger.warn('WebSocket circuit breaker is OPEN, waiting for recovery', {
        stats: this.circuitBreaker.getStats(),
      });
      this.setState(StateEnum.FAILED);
      this.scheduleReconnect();
      return;
    }

    // Initialize leader election (no-op if already done)
    await this.initializeLeaderElection();

    // Attempt to become leader
    try {
      this.isLeader = await this.leaderElection.becomeLeader();
    } catch (error) {
      logger.warn('Leader election check failed, continuing in single-instance mode', error instanceof Error ? error : undefined);
      this.isLeader = true; // Assume we're leader if check fails
    }

    // Only connect to Binance if we're the leader
    if (!this.isLeader) {
      logger.info('Not the leader, skipping Binance WebSocket connection', { pairs: pairs.length });
      return;
    }

    this.setState(StateEnum.CONNECTING);
    this.subscribedPairs = new Set(pairs);

    try {
      // Execute connection attempt through circuit breaker
      await this.circuitBreaker.execute(async () => {
        // Build combined streams URL
        // https://binance-docs.github.io/apidocs/spot/en/#live-subscribing-unsubscribing-to-streams
        const streams = pairs.map(pair => getPairStreamName(pair)).join('/');
        const url = `${this.binanceWsUrl}/stream?streams=${streams}`;

        logger.info('Connecting to Binance WebSocket (as leader)', {
          url: this.binanceWsUrl,
          pairCount: pairs.length,
        });

        this.ws = new WebSocket(url);

        this.ws.on('open', () => this.onOpen());
        this.ws.on('message', (data) => {
          const messageStr = typeof data === 'string' ? data : data.toString();
          this.onMessage(messageStr);
        });
        this.ws.on('error', (error) => this.onError(error));
        this.ws.on('close', () => this.onClose());

        // Wait for connection to establish
        return this.waitForConnection(5000);
      });

      this.consecutiveErrors = 0;
    } catch (error) {
      this.consecutiveErrors++;
      this.setState(StateEnum.FAILED);
      logger.error('Failed to connect to Binance WebSocket', error instanceof Error ? error : undefined, {
        consecutiveErrors: this.consecutiveErrors,
        circuitBreakerState: this.circuitBreaker.getState(),
      });
      this.scheduleReconnect();
    }
  }

  /**
   * Subscribe to price updates for a specific pair
   */
  subscribe(pair: string, callback: PriceSubscriber): () => void {
    if (!this.subscribers.has(pair)) {
      this.subscribers.set(pair, []);
    }

    const entry: SubscriberEntry = { pair, callback };
    this.subscribers.get(pair)!.push(entry);

    logger.debug('Subscriber added', { pair, totalSubscribers: this.subscribers.get(pair)!.length });

    // Return unsubscribe function
    return () => {
      const subscribers = this.subscribers.get(pair);
      if (subscribers) {
        const index = subscribers.indexOf(entry);
        if (index > -1) {
          subscribers.splice(index, 1);
          logger.debug('Subscriber removed', { pair, remainingSubscribers: subscribers.length });
        }
      }
    };
  }

  /**
   * Get currently subscribed pairs
   */
  getSubscribedPairs(): string[] {
    return Array.from(this.subscribedPairs);
  }

  /**
   * Dynamically add new pairs to existing subscription
   * Called when new trading pairs are added after initial connection
   */
  async addPairs(newPairs: string[]): Promise<void> {
    // Filter out already-subscribed pairs
    const pairsToAdd = newPairs.filter(p => !this.subscribedPairs.has(p));

    if (pairsToAdd.length === 0) {
      logger.debug('No new pairs to add', { newPairs });
      return;
    }

    // Add to our set
    pairsToAdd.forEach(p => this.subscribedPairs.add(p));
    logger.info('Adding new pairs to subscription', { pairsToAdd: pairsToAdd.length, pairs: pairsToAdd });

    // If we're connected and can update subscription, reconnect with new pairs
    if (this.state === StateEnum.CONNECTED && this.ws && this.isLeader) {
      try {
        // Close old connection
        this.ws.close();
        this.ws = null;

        // Reconnect with all pairs (including new ones)
        const allPairs = Array.from(this.subscribedPairs);
        const streams = allPairs.map(pair => getPairStreamName(pair)).join('/');
        const url = `${this.binanceWsUrl}/stream?streams=${streams}`;

        logger.info('Reconnecting with updated pair list', { pairCount: allPairs.length });

        this.ws = new WebSocket(url);
        this.ws.on('open', () => this.onOpen());
        this.ws.on('message', (data) => {
          const messageStr = typeof data === 'string' ? data : data.toString();
          this.onMessage(messageStr);
        });
        this.ws.on('error', (error) => this.onError(error));
        this.ws.on('close', () => this.onClose());
      } catch (error) {
        logger.error('Failed to add pairs to subscription', error instanceof Error ? error : undefined, { pairsToAdd });
        throw error;
      }
    } else if (!this.isLeader) {
      logger.info('Not the leader, pairs will not be added to WebSocket', { pairsToAdd });
    }
  }

  /**
   * Handle leadership transitions
   * Called by leader election to notify when leadership status changes
   */
  async handleLeadershipChange(isLeader: boolean): Promise<void> {
    if (isLeader && !this.isLeader && this.subscribedPairs.size > 0) {
      // Gained leadership - reconnect to Binance
      logger.warn('Gained price stream leadership, reconnecting to Binance WebSocket');
      this.isLeader = true;
      this.intentionalDisconnect = false; // Reset flag
      const pairs = Array.from(this.subscribedPairs);
      try {
        await this.connect(pairs);
      } catch (error) {
        logger.error('Failed to reconnect after gaining leadership', error instanceof Error ? error : undefined);
      }
    } else if (!isLeader && this.isLeader) {
      // Lost leadership - disconnect gracefully
      logger.warn('Lost price stream leadership, disconnecting from Binance WebSocket');
      this.isLeader = false;
      this.intentionalDisconnect = true; // Mark as intentional
      this.disconnect();
    }
  }

  /**
   * Disconnect from Binance WebSocket
   * Note: Preserves subscribers so they remain active across reconnections
   */
  disconnect(): void {
    logger.info('Disconnecting from Binance WebSocket');
    this.intentionalDisconnect = true; // Mark as intentional disconnect

    this.heartbeat.stop();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setState(StateEnum.DISCONNECTED);
    // Preserve subscribers - they'll be reconnected when leadership is regained
    // Only clear if doing a permanent shutdown (managed by caller)
  }

  /**
   * Handle WebSocket open event
   */
  private onOpen(): void {
    logger.info('Connected to Binance WebSocket');
    this.setState(StateEnum.CONNECTED);
    this.connectionAttempts = 0;
    this.lastSuccessfulConnectionTime = Date.now();
    this.backoff.reset();

    // Start heartbeat to keep connection alive
    this.heartbeat.start(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Binance doesn't require explicit ping, but we can send one if needed
        logger.debug('WebSocket heartbeat check', { state: this.ws.readyState });
      }
    });
  }

  /**
   * Handle WebSocket message event
   */
  private onMessage(data: string): void {
    try {
      const payload = JSON.parse(data);

      // Handle stream data format from combined streams
      // https://binance-docs.github.io/apidocs/spot/en/#subscribe-to-a-stream
      if (payload.stream && payload.data) {
        const tickerEvent: BinanceTickerEvent = payload.data;

        if (tickerEvent.e === '24hrTicker') {
          this.processTicker(tickerEvent);
        }
      }
    } catch (error) {
      logger.error('Failed to parse WebSocket message', error instanceof Error ? error : null);
    }
  }

  /**
   * Process ticker event and emit to subscribers
   * Also publishes to Redis for multi-instance distribution
   */
  private processTicker(ticker: BinanceTickerEvent): void {
    try {
      const pair = normalizePair(ticker.s, this.subscribedPairs);
      const price = parseFloat(ticker.c); // Last price
      const bid = parseFloat(ticker.b);
      const ask = parseFloat(ticker.a);
      const high24h = parseFloat(ticker.h);
      const low24h = parseFloat(ticker.l);
      const change24h = parseFloat(ticker.p); // Price change
      const changePercent24h = parseFloat(ticker.P); // Price change percent
      const volume24h = parseFloat(ticker.q); // Quote asset volume (in USD value)
      const timestamp = ticker.E; // Event time in milliseconds

      const update: PriceUpdate = {
        pair,
        price,
        bid,
        ask,
        high24h,
        low24h,
        change24h,
        changePercent24h,
        volume24h,
        timestamp,
      };

      // Publish to Redis for multi-instance distribution and fallback
      publishPriceToRedis(update).catch(error => {
        logger.error('Failed to publish price to Redis', error instanceof Error ? error : null, { pair });
      });

      // Emit to local subscribers (same instance)
      const subscribers = this.subscribers.get(pair) || [];
      subscribers.forEach(entry => {
        try {
          entry.callback(update);
        } catch (error) {
          logger.error('Subscriber callback failed', error instanceof Error ? error : null, { pair });
        }
      });
    } catch (error) {
      logger.error('Failed to process ticker', error instanceof Error ? error : null);
    }
  }

  /**
   * Handle WebSocket error event
   */
  private onError(error: Error): void {
    this.consecutiveErrors++;
    logger.error('Binance WebSocket error', error, {
      consecutiveErrors: this.consecutiveErrors,
      state: this.state,
    });
    this.setState(StateEnum.FAILED);

    // Don't schedule reconnect here - let onClose handle it
  }

  /**
   * Handle WebSocket close event
   * Determines if this was intentional or an error, and whether to reconnect
   */
  private onClose(): void {
    logger.info('Binance WebSocket closed', {
      state: this.state,
      isLeader: this.isLeader,
      intentionalDisconnect: this.intentionalDisconnect,
      consecutiveErrors: this.consecutiveErrors,
      circuitBreakerState: this.circuitBreaker.getState(),
    });

    this.heartbeat.stop();

    // Only schedule reconnect if:
    // 1. NOT an intentional disconnect
    // 2. We're the leader (followers don't connect)
    // 3. We have subscribers waiting for prices
    if (!this.intentionalDisconnect && this.isLeader && this.subscribedPairs.size > 0) {
      if (this.state !== StateEnum.DISCONNECTED) {
        this.setState(StateEnum.RECONNECTING);
        this.scheduleReconnect();
      }
    }

    // Reset intentional disconnect flag for next cycle
    this.intentionalDisconnect = false;
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = this.backoff.next();
    this.connectionAttempts++;

    logger.info('Scheduling WebSocket reconnect', {
      attempt: this.connectionAttempts,
      delayMs: delay,
    });

    this.reconnectTimer = setTimeout(() => {
      const pairs = Array.from(this.subscribedPairs);
      if (pairs.length > 0) {
        this.connect(pairs).catch(error => {
          logger.error('Reconnection failed', error instanceof Error ? error : null);
        });
      }
    }, delay);
  }

  /**
   * Wait for WebSocket connection to establish
   */
  private waitForConnection(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const check = () => {
        if (this.state === StateEnum.CONNECTED) {
          resolve();
        } else if (this.state === StateEnum.FAILED) {
          reject(new Error('Failed to connect to Binance WebSocket'));
        } else if (Date.now() - startTime > timeoutMs) {
          reject(new Error('WebSocket connection timeout'));
        } else {
          setTimeout(check, 100);
        }
      };

      check();
    });
  }

  /**
   * Set internal state and log transition
   */
  private setState(newState: WebSocketState): void {
    if (newState !== this.state) {
      logger.debug('WebSocket state changed', { from: this.state, to: newState });
      this.state = newState;
    }
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    state: WebSocketState;
    isLeader: boolean;
    connectionAttempts: number;
    consecutiveErrors: number;
    lastSuccessfulConnectionTime: number;
    uptime: number;
    subscribedPairs: number;
    totalSubscribers: number;
    circuitBreaker: {
      state: string;
      failureCount: number;
      successCount: number;
      timeSinceLastFailure: number;
    };
  } {
    const cbStats = this.circuitBreaker.getStats();
    return {
      state: this.state,
      isLeader: this.isLeader,
      connectionAttempts: this.connectionAttempts,
      consecutiveErrors: this.consecutiveErrors,
      lastSuccessfulConnectionTime: this.lastSuccessfulConnectionTime,
      uptime: this.lastSuccessfulConnectionTime > 0 ? Date.now() - this.lastSuccessfulConnectionTime : 0,
      subscribedPairs: this.subscribedPairs.size,
      totalSubscribers: Array.from(this.subscribers.values()).reduce((sum, subs) => sum + subs.length, 0),
      circuitBreaker: {
        state: cbStats.state,
        failureCount: cbStats.failureCount,
        successCount: cbStats.successCount,
        timeSinceLastFailure: cbStats.timeSinceLastFailure,
      },
    };
  }
}

/**
 * Singleton instance
 */
let instance: BinanceWebSocketClient | null = null;

export function getBinanceWebSocketClient(): BinanceWebSocketClient {
  if (!instance) {
    instance = new BinanceWebSocketClient();
  }
  return instance;
}
