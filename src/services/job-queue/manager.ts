import { randomUUID } from 'crypto';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decrypt } from '@/lib/crypto';
import type { Job, JobType, JobStatus, JobResult } from '@/types/job-queue';
import type { EmailTemplateType } from '@/types/email';
import { getExchangeAdapter } from '@/services/exchanges/singleton';
import { withRetry } from '@/lib/resilience';

/**
 * Job Queue Manager
 * PostgreSQL-backed queue for async task processing
 * Replaces BullMQ with simpler, Railway-native solution
 */
export class JobQueueManager {
  private processingInterval: NodeJS.Timer | null = null;
  private isProcessing = false;
  private inFlightJobs = new Set<string>(); // Track in-flight job promises

  /**
   * Enqueue a job
   */
  async enqueue(
    type: JobType,
    data: any,
    options: { priority?: number; maxRetries?: number } = {}
  ): Promise<string> {
    const jobId = randomUUID();
    const priority = options.priority || 5;
    const maxRetries = options.maxRetries || 3;

    try {
      await query(
        `INSERT INTO job_queue (id, type, data, status, priority, retries, max_retries)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [jobId, type, JSON.stringify(data), 'pending', priority, 0, maxRetries]
      );

      logger.info('Job enqueued', {
        jobId,
        type,
        priority,
      });

      return jobId;
    } catch (error) {
      logger.error('Failed to enqueue job', error instanceof Error ? error : null, {
        type,
      });
      throw error;
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    try {
      const result = await query<{ status: JobStatus }>(
        `SELECT status FROM job_queue WHERE id = $1`,
        [jobId]
      );

      if (result.length === 0) {
        return null;
      }

      return result[0].status;
    } catch (error) {
      logger.error('Failed to get job status', error instanceof Error ? error : null, { jobId });
      return null;
    }
  }

  /**
   * Get pending jobs (for processing)
   */
  async getPendingJobs(limit: number = 10): Promise<Job[]> {
    try {
      const result = await query<{
        id: string;
        type: JobType;
        data: string;
        status: JobStatus;
        priority: number;
        retries: number;
        max_retries: number;
        created_at: string;
        started_at: string | null;
        completed_at: string | null;
        failed_at: string | null;
        error: string | null;
      }>(
        `SELECT id, type, data, status, priority, retries, max_retries,
                created_at, started_at, completed_at, failed_at, error
         FROM job_queue
         WHERE status IN ('pending', 'retrying')
         ORDER BY priority DESC, created_at ASC
         LIMIT $1`,
        [limit]
      );

      return result.map(row => this.parseJobRow(row));
    } catch (error) {
      logger.error('Failed to get pending jobs', error instanceof Error ? error : null);
      return [];
    }
  }

  /**
   * Mark job as processing
   */
  async markProcessing(jobId: string): Promise<void> {
    try {
      await query(
        `UPDATE job_queue
         SET status = $1, started_at = NOW()
         WHERE id = $2`,
        ['processing', jobId]
      );
    } catch (error) {
      logger.error('Failed to mark job as processing', error instanceof Error ? error : null, {
        jobId,
      });
    }
  }

  /**
   * Mark job as completed
   */
  async markCompleted(jobId: string, _result?: any): Promise<void> {
    try {
      await query(
        `UPDATE job_queue
         SET status = $1, completed_at = NOW()
         WHERE id = $2`,
        ['completed', jobId]
      );

      logger.info('Job completed', { jobId });
    } catch (error) {
      logger.error('Failed to mark job as completed', error instanceof Error ? error : null, {
        jobId,
      });
    }
  }

  /**
   * Mark job as failed and enqueue retry if applicable
   */
  async markFailed(jobId: string, error: string): Promise<void> {
    try {
      const result = await query<{ retries: number; max_retries: number }>(
        `SELECT retries, max_retries FROM job_queue WHERE id = $1`,
        [jobId]
      );

      if (result.length === 0) return;

      const { retries, max_retries } = result[0];
      const shouldRetry = retries < max_retries;

      if (shouldRetry) {
        // Retry the job
        await query(
          `UPDATE job_queue
           SET status = $1, retries = $2, error = $3
           WHERE id = $4`,
          ['retrying', retries + 1, error, jobId]
        );

        logger.warn('Job marked for retry', {
          jobId,
          attempt: retries + 1,
          maxRetries: max_retries,
          error,
        });
      } else {
        // Final failure
        await query(
          `UPDATE job_queue
           SET status = $1, failed_at = NOW(), error = $2
           WHERE id = $3`,
          ['failed', error, jobId]
        );

        logger.error('Job permanently failed', null, {
          jobId,
          attempts: retries,
          errorMsg: typeof error === 'string' ? error : (error as any)?.message || 'Unknown error',
        });
      }
    } catch (err) {
      logger.error('Failed to mark job as failed', err instanceof Error ? err : null, {
        jobId,
      });
    }
  }

  /**
   * Start job processing loop
   * Should be called once at application startup
   * Returns interval handle so caller can track it
   */
  startProcessing(intervalMs: number = 5000): NodeJS.Timer {
    if (this.processingInterval) {
      logger.warn('Job processing already started');
      return this.processingInterval;
    }

    logger.info('Starting job queue processor', { intervalMs });

    this.processingInterval = setInterval(() => {
      this.processNextBatch();
    }, intervalMs);

    // Process immediately on startup
    this.processNextBatch();

    return this.processingInterval;
  }

  /**
   * Stop job processing loop
   */
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval as any);
      this.processingInterval = null;
      logger.info('Job queue processor stopped');
    }
  }

  /**
   * Check if job processor is idle (no jobs being processed or in-flight)
   */
  isIdle(): boolean {
    return !this.isProcessing && this.inFlightJobs.size === 0;
  }

  /**
   * Get count of in-flight jobs (for monitoring)
   */
  getInFlightJobCount(): number {
    return this.inFlightJobs.size;
  }

  /**
   * Process next batch of jobs
   * Does NOT await job completion - jobs are tracked as in-flight
   * This allows multiple batches to be processed concurrently
   */
  private async processNextBatch(): Promise<void> {
    if (this.isProcessing) {
      return; // Prevent concurrent polling
    }

    this.isProcessing = true;

    try {
      const jobs = await this.getPendingJobs(5); // Poll 5 at a time

      if (jobs.length > 0) {
        console.log(`📨 Found ${jobs.length} pending jobs to process`);
      }

      for (const job of jobs) {
        // Fire off job processing without awaiting
        // This allows multiple jobs to be in-flight simultaneously
        this.processJobAsyncTracked(job).catch(error => {
          logger.error('Job processing error', error instanceof Error ? error : null, {
            jobId: job.id,
          });
        });
      }
    } catch (error) {
      logger.error('Error fetching job batch', error instanceof Error ? error : null);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process job and track it as in-flight
   */
  private async processJobAsyncTracked(job: Job): Promise<void> {
    this.inFlightJobs.add(job.id);

    try {
      await this.processJob(job);
    } finally {
      this.inFlightJobs.delete(job.id);
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job): Promise<void> {
    const startTime = Date.now();

    try {
      await this.markProcessing(job.id);

      // Route to appropriate handler based on job type
      let result: JobResult;

      switch (job.type) {
        case 'execute_trade':
          result = await this.handleExecuteTrade(job as any);
          break;
        case 'pyramid_add_order':
          result = await this.handlePyramidAddOrder(job as any);
          break;
        case 'validate_connection':
          result = await this.handleValidateConnection(job as any);
          break;
        case 'sync_market_data':
          result = await this.handleSyncMarketData(job as any);
          break;
        case 'sync_market_regime':
          result = await this.handleSyncMarketRegime(job as any);
          break;
        case 'send_email':
          result = await this.handleSendEmail(job as any);
          break;
        case 'suspend_bot':
          result = await this.handleSuspendBot(job as any);
          break;
        case 'resume_bot':
          result = await this.handleResumeBot(job as any);
          break;
        default:
          result = {
            jobId: job.id,
            success: false,
            error: `Unknown job type: ${job.type}`,
            duration: Date.now() - startTime,
          };
      }

      if (result.success) {
        await this.markCompleted(job.id, result.data);
      } else {
        await this.markFailed(job.id, result.error || 'Unknown error');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await this.markFailed(job.id, errorMsg);
    }
  }

  /**
   * Job handlers - implement actual work here
   */

  private async handleExecuteTrade(job: any): Promise<JobResult> {
    const startTime = Date.now();

    try {
      const { userId, botInstanceId, pair, side, amount, price, stopLoss, takeProfit } = job.data;

      // Calculate stop loss if not provided (hybrid approach: 1% stop loss for tighter loss control)
      const calculatedStopLoss = stopLoss || (side === 'buy' ? price * 0.99 : price * 1.01);

      // Use provided takeProfit or calculate from regime (default 5%)
      const calculatedTakeProfit = takeProfit || (side === 'buy' ? price * 1.05 : price * 0.95);

      logger.info('Executing trade from queue', {
        userId,
        botId: botInstanceId,
        pair,
        side,
        amount,
        price,
        stopLoss: calculatedStopLoss,
        takeProfit: calculatedTakeProfit,
      });

      // Idempotency check: verify this trade hasn't already been executed
      // Check for any OPEN trade on same bot+pair within last 30 minutes (regardless of price)
      // This prevents duplicate trades for the same pair signal in rapid succession
      const idempotencyKey = `${botInstanceId}_${pair}_${side}_${Date.now()}`;
      const existing = await query(
        `SELECT id FROM trades WHERE bot_instance_id = $1 AND pair = $2
         AND side = $3 AND entry_time > NOW() - INTERVAL '30 minutes'
         AND status = 'open'
         LIMIT 1`,
        [botInstanceId, pair, side]
      );

      if (existing && existing.length > 0) {
        logger.info('Trade already executed (idempotent)', {
          userId,
          botId: botInstanceId,
          pair,
          previousTradeId: existing[0].id,
          reason: 'open_trade_exists_within_30min',
        });
        return {
          jobId: job.id,
          success: true,
          data: { tradeId: existing[0].id, status: 'already_executed' },
          duration: Date.now() - startTime,
        };
      }

      // Get bot instance to determine exchange and trading mode
      const botResult = await query(
        `SELECT user_id, exchange, config, trading_mode FROM bot_instances WHERE id = $1`,
        [botInstanceId]
      );

      if (!botResult || botResult.length === 0) {
        throw new Error('Bot instance not found');
      }

      const bot = botResult[0];
      const botUserId = bot.user_id;
      const exchange = bot.exchange;
      const tradingMode = bot.trading_mode || 'paper'; // Default to paper if not set

      // Verify bot belongs to the requesting user
      if (botUserId !== userId) {
        throw new Error('Unauthorized: bot does not belong to user');
      }

      // CRITICAL: Check trading mode - paper trades are NOT executed on exchange
      let orderResult;
      if (tradingMode === 'paper') {
        // Paper trading: simulate order without touching exchange
        logger.info('PAPER TRADING MODE: Simulating trade (no real exchange order)', {
          botId: botInstanceId,
          pair,
          side,
          amount,
          price,
          tradingMode: 'paper',
        });

        // Generate fake order ID for paper trades (format: PAPER_{timestamp}_{random})
        orderResult = {
          orderId: `PAPER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          pair,
          side,
          amount,
          price,
          isPaperTrade: true,
        };
      } else {
        // Live trading: execute actual exchange order
        // Get user's API keys for this exchange
        const keysResult = await query(
          `SELECT encrypted_public_key, encrypted_secret_key FROM exchange_api_keys
           WHERE user_id = $1 AND exchange = $2
           LIMIT 1`,
          [userId, exchange]
        );

        if (!keysResult || keysResult.length === 0) {
          throw new Error(`No API keys found for ${exchange}`);
        }

        const keys = keysResult[0];

        // Keys are encrypted in database and need to be decrypted
        const decryptedPublicKey = decrypt(keys.encrypted_public_key);
        const decryptedSecretKey = decrypt(keys.encrypted_secret_key);

        // Get singleton adapter (preserves circuit breaker state across requests)
        const adapter = getExchangeAdapter(exchange);
        await adapter.connect({
          publicKey: decryptedPublicKey,
          secretKey: decryptedSecretKey,
        });

        // Place order on exchange with retry (no circuit breaker, matching nexus/nexus_binance)
        orderResult = await withRetry(
          async () => {
            return await adapter.placeOrder({
              pair,
              side,
              amount,
              price,
            });
          },
          {
            maxRetries: 2,
            baseDelay: 100,
            maxDelay: 1000,
            // Don't retry on validation/balance errors
            retryableErrors: (error) => {
              const message = error instanceof Error ? error.message : String(error);
              // Binance error codes that should NOT be retried
              if (message.includes('-2010')) return false; // NEW_ORDER_REJECTED (balance)
              if (message.includes('-1013')) return false; // Invalid quantity/price
              if (message.includes('Invalid')) return false; // Validation error
              // Retry network/transient errors and rate limits
              return true;
            },
          }
        );

        logger.info('Trade executed on LIVE exchange', {
          orderId: orderResult.orderId,
          pair,
          side,
          amount,
          price,
          tradingMode: 'live',
        });
      }

      // Record trade in database with idempotency key
      // If duplicate idempotency key exists, the unique constraint will prevent insertion
      const recordResult = await query(
        `INSERT INTO trades (id, bot_instance_id, pair, side, price, amount,
                            entry_time, status, idempotency_key, stop_loss, take_profit, trading_mode)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id`,
        [botInstanceId, pair, side, price, amount, 'open', idempotencyKey, calculatedStopLoss, calculatedTakeProfit, tradingMode]
      );

      // If ON CONFLICT triggered, the trade was already inserted
      if (!recordResult || recordResult.length === 0) {
        logger.warn('Trade already exists (idempotency key conflict)', {
          idempotencyKey: idempotencyKey,
          pair,
        });
        return {
          jobId: job.id,
          success: true,
          data: { status: 'duplicate_prevented', reason: 'idempotency_key_conflict' },
          duration: Date.now() - startTime,
        };
      }

      logger.info('Trade recorded in database', {
        tradeId: recordResult[0].id,
        orderId: orderResult.orderId,
        tradingMode,
        isPaperTrade: tradingMode === 'paper',
      });

      return {
        jobId: job.id,
        success: true,
        data: {
          tradeId: recordResult[0].id,
          orderId: orderResult.orderId,
          tradingMode,
          isPaperTrade: tradingMode === 'paper',
          status: 'executed',
        },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('Trade execution failed', error instanceof Error ? error : null, {
        botId: job.data.botInstanceId,
        pair: job.data.pair,
      });
      return {
        jobId: job.id,
        success: false,
        error: error instanceof Error ? error.message : 'Trade execution failed',
        duration: Date.now() - startTime,
      };
    }
  }

  private async handleValidateConnection(job: any): Promise<JobResult> {
    const startTime = Date.now();

    try {
      logger.info('Validating API connection from queue', {
        exchange: job.data.exchange,
        userId: job.data.userId,
      });

      // TODO: Implement connection validation using ApiKeyManager

      return {
        jobId: job.id,
        success: true,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        jobId: job.id,
        success: false,
        error: error instanceof Error ? error.message : 'Connection validation failed',
        duration: Date.now() - startTime,
      };
    }
  }

  private async handleSyncMarketData(job: any): Promise<JobResult> {
    const startTime = Date.now();

    try {
      logger.info('Syncing market data from queue', {
        pairCount: job.data.pairs?.length || 0,
      });

      // TODO: Implement market data sync using MarketDataAggregator if needed

      return {
        jobId: job.id,
        success: true,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        jobId: job.id,
        success: false,
        error: error instanceof Error ? error.message : 'Market data sync failed',
        duration: Date.now() - startTime,
      };
    }
  }

  private async handleSyncMarketRegime(job: any): Promise<JobResult> {
    const startTime = Date.now();

    try {
      const pairs = job.data.pairs || [];

      logger.info('Syncing market regime from queue', {
        pairCount: pairs.length,
      });

      if (pairs.length === 0) {
        return {
          jobId: job.id,
          success: false,
          error: 'No pairs provided for regime detection',
          duration: Date.now() - startTime,
        };
      }

      // Dynamically import to avoid circular dependencies
      const { regimeDetector } = await import('@/services/regime/detector');

      const results = await regimeDetector.detectRegimeForAllPairs(pairs);

      const successCount = Array.from(results.values()).filter(r => r !== null).length;

      logger.info('Market regime sync complete', {
        totalPairs: pairs.length,
        successCount,
        failureCount: pairs.length - successCount,
      });

      return {
        jobId: job.id,
        success: successCount > 0,
        data: { detectedCount: successCount },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('Market regime sync failed', error instanceof Error ? error : null);
      return {
        jobId: job.id,
        success: false,
        error: error instanceof Error ? error.message : 'Market regime sync failed',
        duration: Date.now() - startTime,
      };
    }
  }

  private async handleSendEmail(job: any): Promise<JobResult> {
    const startTime = Date.now();

    try {
      const { to, subject, template, variables } = job.data || {};

      if (to && template) {
        // Send a single templated email from job payload
        const { renderEmailTemplate } = await import('@/email/render');
        const { sendEmail } = await import('@/services/email/provider');

        const templateType = (template as string).replace(/-/g, '_') as EmailTemplateType;
        const rendered = renderEmailTemplate(templateType, variables || {});

        const result = await sendEmail({
          to,
          subject: subject || rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });

        logger.info('Queued email sent from job', {
          to,
          template: templateType,
          messageId: result.id,
        });

        return {
          jobId: job.id,
          success: true,
          data: { messageId: result.id },
          duration: Date.now() - startTime,
        };
      }

      // Fallback: process any pending emails in the queue table
      const { processPendingEmails } = await import('@/services/email/queue');

      logger.info('Processing pending emails from job queue');

      const count = await processPendingEmails();

      logger.info('Emails processed from job queue', {
        count,
      });

      return {
        jobId: job.id,
        success: true,
        data: { emailsProcessed: count },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('Email processing failed', error instanceof Error ? error : null);
      return {
        jobId: job.id,
        success: false,
        error: error instanceof Error ? error.message : 'Email send failed',
        duration: Date.now() - startTime,
      };
    }
  }

  private async handleSuspendBot(job: any): Promise<JobResult> {
    const startTime = Date.now();

    try {
      const { userId, botInstanceId, delaySeconds, scheduledFor } = job.data;

      logger.info('Processing suspend_bot job', {
        userId,
        botInstanceId,
        scheduledFor,
        delaySeconds,
      });

      // If delay is set and we haven't reached scheduled time yet, requeue the job
      if (scheduledFor && new Date(scheduledFor) > new Date()) {
        const delayMs = new Date(scheduledFor).getTime() - Date.now();
        logger.info('Bot suspension not yet due, requeuing', {
          userId,
          botInstanceId,
          scheduledFor,
          delayMs,
        });

        // Requeue by marking as retrying (job processor will pick it up later)
        return {
          jobId: job.id,
          success: false,
          error: `Scheduled for ${scheduledFor}, requeue`,
          duration: Date.now() - startTime,
        };
      }

      // Time to execute suspension
      // Update bot status to paused
      await query(
        `UPDATE bot_instances
         SET status = 'paused',
             updated_at = NOW()
         WHERE id = $1 AND user_id = $2`,
        [botInstanceId, userId]
      );

      // Log suspension event
      await query(
        `INSERT INTO bot_suspension_log (bot_instance_id, user_id, reason, suspended_at)
         VALUES ($1, $2, $3, NOW())`,
        [botInstanceId, userId, 'payment_failure']
      );

      logger.info('Bot suspended successfully', {
        userId,
        botInstanceId,
      });

      return {
        jobId: job.id,
        success: true,
        data: { botInstanceId, suspended: true },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('Failed to suspend bot', error instanceof Error ? error : null, {
        botInstanceId: job.data.botInstanceId,
        userId: job.data.userId,
      });
      return {
        jobId: job.id,
        success: false,
        error: error instanceof Error ? error.message : 'Bot suspension failed',
        duration: Date.now() - startTime,
      };
    }
  }

  private async handleResumeBot(job: any): Promise<JobResult> {
    const startTime = Date.now();

    try {
      const { userId, botInstanceId } = job.data;

      logger.info('Resuming bot from queue', {
        userId,
        botInstanceId,
      });

      // Update bot status back to running
      await query(
        `UPDATE bot_instances
         SET status = 'running',
             updated_at = NOW()
         WHERE id = $1 AND user_id = $2`,
        [botInstanceId, userId]
      );

      // Log resumption event
      await query(
        `INSERT INTO bot_suspension_log (bot_instance_id, user_id, reason, resumed_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (id) DO UPDATE SET resumed_at = NOW()`,
        [botInstanceId, userId, 'payment_recovered']
      );

      logger.info('Bot resumed successfully', {
        userId,
        botInstanceId,
      });

      return {
        jobId: job.id,
        success: true,
        data: { botInstanceId, resumed: true },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('Failed to resume bot', error instanceof Error ? error : null, {
        botInstanceId: job.data.botInstanceId,
        userId: job.data.userId,
      });
      return {
        jobId: job.id,
        success: false,
        error: error instanceof Error ? error.message : 'Bot resumption failed',
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Handle Pyramid Add Order job
   * Places incremental buy orders at L1 (4.5%) and L2 (8%) profit levels
   * Uses the exchange adapter dynamically (Kraken, Binance, Coinbase, etc.)
   */
  private async handlePyramidAddOrder(job: any): Promise<JobResult> {
    const startTime = Date.now();

    try {
      const { userId, botInstanceId, tradeId, pair, level, quantity, currentPrice } = job.data;

      logger.info('Processing pyramid add order', {
        userId,
        botInstanceId,
        tradeId,
        pair,
        level,
        quantity: quantity.toFixed(8),
        currentPrice: currentPrice.toFixed(2),
      });

      // Get trade and verify it exists
      const tradeResult = await query(
        `SELECT t.*, b.exchange FROM trades t
         JOIN bot_instances b ON t.bot_instance_id = b.id
         WHERE t.id = $1 AND t.bot_instance_id = $2`,
        [tradeId, botInstanceId]
      );

      if (!tradeResult || tradeResult.length === 0) {
        throw new Error('Trade not found');
      }

      const trade = tradeResult[0];
      const exchange = trade.exchange;
      const originalAmount = parseFloat(String(trade.amount));
      const originalEntryPrice = parseFloat(String(trade.price));

      // Get user's API keys for this exchange (exchange-agnostic!)
      const keysResult = await query(
        `SELECT encrypted_public_key, encrypted_secret_key FROM exchange_api_keys
         WHERE user_id = $1 AND exchange = $2
         LIMIT 1`,
        [userId, exchange]
      );

      if (!keysResult || keysResult.length === 0) {
        throw new Error(`No API keys found for ${exchange}`);
      }

      const keys = keysResult[0];
      const decryptedPublicKey = decrypt(keys.encrypted_public_key);
      const decryptedSecretKey = decrypt(keys.encrypted_secret_key);

      // Get exchange adapter dynamically (works for Kraken, Binance, Coinbase, etc.)
      const adapter = getExchangeAdapter(exchange);
      await adapter.connect({
        publicKey: decryptedPublicKey,
        secretKey: decryptedSecretKey,
      });

      // Place the incremental buy order with retry (no circuit breaker, matching nexus/nexus_binance)
      const orderResult = await withRetry(
        async () => {
          return await adapter.placeOrder({
            pair,
            side: 'buy',
            amount: quantity,
            price: currentPrice,
          });
        },
        {
          maxRetries: 2,
          baseDelay: 100,
          maxDelay: 1000,
          retryableErrors: (error) => {
            const message = error instanceof Error ? error.message : String(error);
            // Don't retry on validation/balance errors
            if (message.includes('-2010')) return false; // Balance error
            if (message.includes('-1013')) return false; // Invalid quantity/price
            if (message.includes('Invalid')) return false; // Validation error
            // Retry network/transient errors
            return true;
          },
        }
      );

      logger.info('Pyramid order executed on exchange', {
        orderId: orderResult.orderId,
        exchange,
        pair,
        quantity: quantity.toFixed(8),
        price: currentPrice.toFixed(2),
        level,
      });

      // Update trade with blended entry price and increased amount
      const newTotalAmount = originalAmount + quantity;
      const blendedEntryPrice = (originalAmount * originalEntryPrice + quantity * currentPrice) / newTotalAmount;

      // Update pyramid_levels to mark this level as executed
      let pyramidLevels = [];
      try {
        pyramidLevels = Array.isArray(trade.pyramid_levels) ? trade.pyramid_levels : [];
      } catch (e) {
        pyramidLevels = [];
      }

      // Mark this pyramid level as executed in the JSON array
      const updatedPyramidLevels = pyramidLevels.map((l: any) => {
        if (l.level === level) {
          return { ...l, status: 'executed', executedPrice: currentPrice, executedTime: new Date().toISOString(), orderId: orderResult.orderId };
        }
        return l;
      });

      // Recalculate P&L based on new blended entry price and current market price
      // P&L = (currentPrice - blendedEntryPrice) * totalAmount
      const newProfitLoss = (currentPrice - blendedEntryPrice) * newTotalAmount;
      const newProfitLossPct = ((currentPrice - blendedEntryPrice) / blendedEntryPrice) * 100;

      // Update trade record with new totals, blended price, AND recalculated P&L
      await query(
        `UPDATE trades
         SET amount = $1,
             price = $2,
             pyramid_levels = $3,
             profit_loss = $4,
             profit_loss_percent = $5,
             updated_at = NOW()
         WHERE id = $6`,
        [newTotalAmount, blendedEntryPrice, JSON.stringify(updatedPyramidLevels), newProfitLoss, newProfitLossPct, tradeId]
      );

      logger.info('Trade updated with pyramid execution', {
        tradeId,
        newAmount: newTotalAmount.toFixed(8),
        blendedEntryPrice: blendedEntryPrice.toFixed(2),
        currentPrice: currentPrice.toFixed(2),
        newProfitLoss: newProfitLoss.toFixed(2),
        newProfitLossPct: newProfitLossPct.toFixed(2),
        level,
      });

      return {
        jobId: job.id,
        success: true,
        data: {
          tradeId,
          level,
          orderId: orderResult.orderId,
          newAmount: newTotalAmount,
          blendedEntryPrice,
        },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('Failed to execute pyramid add order', error instanceof Error ? error : null, {
        tradeId: job.data.tradeId,
        pair: job.data.pair,
        level: job.data.level,
      });
      return {
        jobId: job.id,
        success: false,
        error: error instanceof Error ? error.message : 'Pyramid order execution failed',
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Parse job row from database
   */
  private parseJobRow(row: any): Job {
    // Handle both string and object data (JSONB columns return objects)
    let parsedData = row.data;
    if (typeof row.data === 'string') {
      parsedData = JSON.parse(row.data);
    }

    return {
      id: row.id,
      type: row.type,
      status: row.status,
      priority: row.priority,
      createdAt: new Date(row.created_at),
      startedAt: row.started_at ? new Date(row.started_at) : null,
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      failedAt: row.failed_at ? new Date(row.failed_at) : null,
      error: row.error,
      retries: row.retries,
      maxRetries: row.max_retries,
      data: parsedData,
    } as Job;
  }
}

// NOTE: Do not export instance here - use ./singleton.ts instead to prevent double instantiation
