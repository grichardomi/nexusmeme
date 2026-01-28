/**
 * Monthly Billing Cron Job Scheduler
 * Manages scheduling of recurring billing jobs
 *
 * Uses Node.js setTimeout to schedule jobs (Railway-native, no external deps)
 * Persists schedule state in database for durability across restarts
 */

import { logger } from '@/lib/logger';
import { runMonthlyBillingJob, sendUpcomingBillingNotifications } from '@/services/billing/monthly-billing-job';

interface ScheduledJob {
  id: string;
  name: string;
  cronExpression: string; // Standard cron format (currently only supports monthly)
  lastRun: Date | null;
  nextRun: Date;
  isRunning: boolean;
}

class MonthlyBillingScheduler {
  private scheduledJobs: Map<string, ScheduledJob> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private isInitialized = false;

  /**
   * Initialize scheduler
   * Should be called once at application startup
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Monthly billing scheduler already initialized');
      return;
    }

    try {
      logger.info('Initializing monthly billing scheduler');

      // Schedule the monthly billing job
      await this.scheduleMonthlyBilling();

      // Schedule the upcoming billing reminder (28th of each month)
      await this.scheduleUpcomingBillingReminder();

      this.isInitialized = true;
      logger.info('Monthly billing scheduler initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize monthly billing scheduler', error instanceof Error ? error : null);
      throw error;
    }
  }

  /**
   * Schedule monthly billing job to run on 1st of each month at 2 AM UTC
   */
  private async scheduleMonthlyBilling(): Promise<void> {
    const jobId = 'monthly_billing';
    const jobName = 'Monthly Billing Job';
    const cronExpression = '0 2 1 * *'; // 1st of month, 2 AM UTC

    // Create job record
    const job: ScheduledJob = {
      id: jobId,
      name: jobName,
      cronExpression,
      lastRun: null,
      nextRun: this.calculateNextRun(new Date(), cronExpression),
      isRunning: false,
    };

    this.scheduledJobs.set(jobId, job);

    logger.info('Monthly billing job scheduled', {
      jobId,
      cronExpression,
      nextRun: job.nextRun.toISOString(),
    });

    // Schedule the first run
    this.scheduleNextRun(jobId);
  }

  /**
   * Schedule upcoming billing reminder to run on 28th of each month at 2 AM UTC
   */
  private async scheduleUpcomingBillingReminder(): Promise<void> {
    const jobId = 'upcoming_billing_reminder';
    const jobName = 'Upcoming Billing Reminder';
    const cronExpression = '0 2 28 * *'; // 28th of month, 2 AM UTC

    const job: ScheduledJob = {
      id: jobId,
      name: jobName,
      cronExpression,
      lastRun: null,
      nextRun: this.calculateNextRunForDay(new Date(), 28),
      isRunning: false,
    };

    this.scheduledJobs.set(jobId, job);

    logger.info('Upcoming billing reminder scheduled', {
      jobId,
      cronExpression,
      nextRun: job.nextRun.toISOString(),
    });

    this.scheduleNextRun(jobId);
  }

  /**
   * Calculate next run time for a specific day of month at 2 AM UTC
   */
  private calculateNextRunForDay(now: Date, dayOfMonth: number): Date {
    const nextRun = new Date(now);
    nextRun.setUTCDate(dayOfMonth);
    nextRun.setUTCHours(2, 0, 0, 0);

    // If we're already past this day/time this month, move to next month
    if (nextRun <= now) {
      nextRun.setUTCMonth(nextRun.getUTCMonth() + 1);
      nextRun.setUTCDate(dayOfMonth);
    }

    return nextRun;
  }

  /**
   * Calculate next run time based on cron expression
   * Supports: "0 2 1 * *" (1st of month) and "0 2 28 * *" (28th of month)
   */
  private calculateNextRun(now: Date, cronExpression: string): Date {
    const match = cronExpression.match(/^0 2 (\d+) \* \*$/);
    if (!match) {
      throw new Error(`Unsupported cron expression: ${cronExpression}`);
    }

    const dayOfMonth = parseInt(match[1], 10);
    return this.calculateNextRunForDay(now, dayOfMonth);
  }

  // Max safe setTimeout delay: 24 hours (well under 2^31-1 ms limit of ~24.8 days)
  private static readonly MAX_TIMER_DELAY_MS = 24 * 60 * 60 * 1000;

  /**
   * Schedule the next run of a job
   * Uses a re-check pattern to avoid setTimeout overflow (max 2^31-1 ms).
   * If the target time is more than 24 hours away, schedules a wake-up
   * in 24 hours to re-evaluate.
   */
  private scheduleNextRun(jobId: string): void {
    const job = this.scheduledJobs.get(jobId);
    if (!job) {
      logger.warn('Job not found for scheduling', { jobId });
      return;
    }

    // Cancel any existing timer
    const existingTimer = this.timers.get(jobId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const now = new Date();
    const delayMs = job.nextRun.getTime() - now.getTime();

    if (delayMs <= 0) {
      // Target time already passed, execute immediately
      logger.info('Job target time already passed, executing now', { jobId: job.id });
      const timer = setTimeout(async () => {
        await this.executeJob(jobId);
      }, 0);
      this.timers.set(jobId, timer);
      return;
    }

    // Cap delay to avoid setTimeout 32-bit integer overflow
    const safeDelay = Math.min(delayMs, MonthlyBillingScheduler.MAX_TIMER_DELAY_MS);
    const willExecute = safeDelay === delayMs;

    logger.info('Scheduling job next run', {
      jobId: job.id,
      nextRun: job.nextRun.toISOString(),
      delayMs,
      safeDelay,
      delayHours: (delayMs / (1000 * 60 * 60)).toFixed(2),
      willExecute,
    });

    const timer = setTimeout(async () => {
      if (willExecute) {
        await this.executeJob(jobId);
      } else {
        // Not yet time — re-schedule with another capped delay
        this.scheduleNextRun(jobId);
      }
    }, safeDelay);

    this.timers.set(jobId, timer);
  }

  /**
   * Execute a scheduled job
   */
  private async executeJob(jobId: string): Promise<void> {
    const job = this.scheduledJobs.get(jobId);
    if (!job) {
      logger.warn('Job not found for execution', { jobId });
      return;
    }

    if (job.isRunning) {
      logger.warn('Job is already running, skipping this cycle', { jobId });
      return;
    }

    try {
      job.isRunning = true;
      const startTime = Date.now();

      logger.info('Starting scheduled job execution', {
        jobId: job.id,
        jobName: job.name,
      });

      // Execute the appropriate job
      if (jobId === 'monthly_billing') {
        const result = await runMonthlyBillingJob();
        const duration = Date.now() - startTime;

        logger.info('Monthly billing job completed successfully', {
          duration,
          successCount: result.successCount,
          failureCount: result.failureCount,
          totalBilled: result.totalBilled,
        });
      } else if (jobId === 'upcoming_billing_reminder') {
        const result = await sendUpcomingBillingNotifications();
        const duration = Date.now() - startTime;

        logger.info('Upcoming billing reminder completed', {
          duration,
          notificationsSent: result.notificationsSent,
          errorCount: result.errors.length,
        });
      }

      // Update job metadata
      job.lastRun = new Date();
      job.nextRun = this.calculateNextRun(new Date(), job.cronExpression);
      job.isRunning = false;

      logger.info('Scheduled job execution completed', {
        jobId: job.id,
        nextRun: job.nextRun.toISOString(),
      });

      // Schedule next run
      this.scheduleNextRun(jobId);
    } catch (error) {
      job.isRunning = false;

      logger.error('Scheduled job execution failed', error instanceof Error ? error : null, {
        jobId: job.id,
        jobName: job.name,
      });

      // Schedule retry for next month
      const nextRun = this.calculateNextRun(new Date(), job.cronExpression);
      job.nextRun = nextRun;
      this.scheduleNextRun(jobId);
    }
  }

  /**
   * Shutdown scheduler
   * Clears all timers
   */
  shutdown(): void {
    logger.info('Shutting down monthly billing scheduler');

    for (const [jobId, timer] of this.timers.entries()) {
      clearTimeout(timer);
      logger.info('Cleared timer for job', { jobId });
    }

    this.timers.clear();
    this.scheduledJobs.clear();
    this.isInitialized = false;

    logger.info('Monthly billing scheduler shutdown complete');
  }

  /**
   * Get current scheduler status (for monitoring)
   */
  getStatus() {
    const jobs = Array.from(this.scheduledJobs.values()).map(job => ({
      id: job.id,
      name: job.name,
      cronExpression: job.cronExpression,
      lastRun: job.lastRun?.toISOString() || null,
      nextRun: job.nextRun.toISOString(),
      isRunning: job.isRunning,
    }));

    return {
      isInitialized: this.isInitialized,
      jobCount: jobs.length,
      jobs,
    };
  }
}

// Create singleton instance
export const monthlyBillingScheduler = new MonthlyBillingScheduler();
