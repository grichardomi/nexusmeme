/**
 * PostgreSQL NOTIFY/LISTEN Manager
 * Handles pub/sub messaging using PostgreSQL (zero cost, already have it)
 */

import { Pool, PoolClient } from 'pg';
import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';

type MessageHandler = (channel: string, payload: any) => void | Promise<void>;

class PgNotifyManager {
  private pool: Pool | null = null;
  private listenerClient: PoolClient | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private isConnected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly RECONNECT_DELAY_MS = 5000;

  /**
   * Connect to PostgreSQL
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.listenerClient) {
      logger.debug('PgNotify: Already connected');
      return;
    }

    try {
      const env = getEnvironmentConfig();
      const databaseUrl = env.DATABASE_URL;

      logger.info('PgNotify: Connecting to PostgreSQL...');

      // Create connection pool for publishing
      this.pool = new Pool({
        connectionString: databaseUrl,
        max: 20,
      });

      // Create dedicated client for listening (LISTEN requires persistent connection)
      this.listenerClient = await this.pool.connect();

      // Setup error handlers
      this.listenerClient.on('error', (err) => {
        logger.error('PgNotify: Listener client error', err);
        this.scheduleReconnect();
      });

      this.listenerClient.on('end', () => {
        logger.warn('PgNotify: Listener connection ended');
        this.listenerClient = null;
        this.isConnected = false;
        this.scheduleReconnect();
      });

      // Setup notification handler
      this.listenerClient.on('notification', (msg) => {
        this.handleNotification(msg.channel, msg.payload);
      });

      this.isConnected = true;
      logger.info('✅ PgNotify: Connected successfully');

      // Re-subscribe to all channels after reconnect
      await this.resubscribeAll();
    } catch (error) {
      logger.error('PgNotify: Connection failed', error instanceof Error ? error : null);
      this.scheduleReconnect();
      throw error;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    logger.info(`PgNotify: Scheduling reconnect in ${this.RECONNECT_DELAY_MS}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) => {
        logger.error('PgNotify: Reconnect failed', err);
      });
    }, this.RECONNECT_DELAY_MS);
  }

  /**
   * Re-subscribe to all channels after reconnect
   */
  private async resubscribeAll(): Promise<void> {
    if (!this.listenerClient) return;

    const channels = Array.from(this.handlers.keys());
    if (channels.length === 0) return;

    logger.info('PgNotify: Re-subscribing to channels after reconnect', { count: channels.length });

    for (const channel of channels) {
      try {
        await this.listenerClient.query(`LISTEN ${channel}`);
        logger.debug('PgNotify: Re-subscribed', { channel });
      } catch (error) {
        logger.error('PgNotify: Failed to re-subscribe', error instanceof Error ? error : null, { channel });
      }
    }
  }

  /**
   * Handle incoming notification
   */
  private handleNotification(channel: string, payload: string | undefined): void {
    const handlers = this.handlers.get(channel);
    if (!handlers || handlers.size === 0) {
      return;
    }

    try {
      const data = payload ? JSON.parse(payload) : null;
      handlers.forEach((handler) => {
        Promise.resolve(handler(channel, data)).catch((err) => {
          logger.error('PgNotify: Handler error', err, { channel });
        });
      });
    } catch (error) {
      logger.error('PgNotify: Failed to parse notification payload', error instanceof Error ? error : null, {
        channel,
        payload,
      });
    }
  }

  /**
   * Sanitize and normalize channel name
   * PostgreSQL identifiers are case-insensitive and fold to lowercase
   */
  private sanitizeChannel(channel: string): string {
    // Lowercase and replace special chars
    const sanitized = channel.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    // Validate format
    if (!/^[a-z0-9_]+$/.test(sanitized)) {
      throw new Error(`Invalid channel name: ${channel}`);
    }

    return sanitized;
  }

  /**
   * Publish message to channel
   */
  async publish(channel: string, data: any): Promise<void> {
    if (!this.pool) {
      throw new Error('PgNotify: Not connected - call connect() first');
    }

    try {
      const sanitizedChannel = this.sanitizeChannel(channel);
      const payload = JSON.stringify(data);

      // PostgreSQL NOTIFY has 8KB payload limit
      if (Buffer.byteLength(payload, 'utf8') > 8000) {
        throw new Error('PgNotify: Payload exceeds 8KB limit');
      }

      await this.pool.query('SELECT pg_notify($1, $2)', [sanitizedChannel, payload]);

      logger.debug('PgNotify: Published', { channel: sanitizedChannel, payloadSize: payload.length });
    } catch (error) {
      logger.error('PgNotify: Publish failed', error instanceof Error ? error : null, {
        channel,
      });
      throw error;
    }
  }

  /**
   * Subscribe to channel
   */
  async subscribe(channel: string, handler: MessageHandler): Promise<void> {
    if (!this.listenerClient) {
      throw new Error('PgNotify: Not connected - call connect() first');
    }

    const sanitizedChannel = this.sanitizeChannel(channel);

    // Add handler to map
    if (!this.handlers.has(sanitizedChannel)) {
      this.handlers.set(sanitizedChannel, new Set());

      // Send LISTEN command (unquoted identifier, PostgreSQL folds to lowercase)
      await this.listenerClient.query(`LISTEN ${sanitizedChannel}`);
      logger.info('PgNotify: Subscribed to channel', { channel: sanitizedChannel });
    }

    this.handlers.get(sanitizedChannel)!.add(handler);
  }

  /**
   * Unsubscribe from channel
   */
  async unsubscribe(channel: string, handler: MessageHandler): Promise<void> {
    const sanitizedChannel = this.sanitizeChannel(channel);
    const handlers = this.handlers.get(sanitizedChannel);
    if (!handlers) return;

    handlers.delete(handler);

    // If no more handlers, unlisten
    if (handlers.size === 0) {
      this.handlers.delete(sanitizedChannel);

      if (this.listenerClient) {
        await this.listenerClient.query(`UNLISTEN ${sanitizedChannel}`);
        logger.info('PgNotify: Unsubscribed from channel', { channel: sanitizedChannel });
      }
    }
  }

  /**
   * Check if connected
   */
  isActive(): boolean {
    return this.isConnected && this.listenerClient !== null;
  }

  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    logger.info('PgNotify: Closing connection...');

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      if (this.listenerClient) {
        this.listenerClient.release();
        this.listenerClient = null;
      }
      if (this.pool && !this.pool.ending && !this.pool.ended) {
        await this.pool.end();
        this.pool = null;
      }
      this.isConnected = false;
      logger.info('✅ PgNotify: Closed gracefully');
    } catch (error) {
      logger.error('PgNotify: Error during close', error instanceof Error ? error : null);
    }
  }
}

// Singleton instance
export const pgNotifyManager = new PgNotifyManager();
