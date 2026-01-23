/**
 * Trial Notifications Cron Job Scheduler
 * Manages scheduling of recurring trial expiration notification jobs
 *
 * Uses Node.js setTimeout to schedule jobs (Railway-native, no external deps)
 * Runs every 6-12 hours to check for and send trial expiration notifications
 */

import { logger } from '@/lib/logger';
import { processTrialNotifications } from '@/services/billing/trial-notifications';

interface ScheduledJob {
  id: string;
  name: string;
  intervalHours: number; // 6 or 12 hours
  lastRun: Date | null;
  nextRun: Date;
  isRunning: boolean;
}

class TrialNotificationsScheduler {
  private scheduledJobs: Map<string, ScheduledJob> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private isInitialized = false;
  private intervalHours: number = 6; // Default 6 hours

  /**
   * Initialize scheduler
   * Should be called once at application startup
   *
   * @param intervalHours - How often to run (6 or 12 hours), default 6
   */
  async initialize(intervalHours: number = 6): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Trial notifications scheduler already initialized');
      return;
    }

    try {
      this.intervalHours = intervalHours;
      logger.info('Initializing trial notifications scheduler', { intervalHours });

      // Schedule the trial notifications job
      await this.scheduleTrialNotifications();

      this.isInitialized = true;
      logger.info('Trial notifications scheduler initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize trial notifications scheduler', error instanceof Error ? error : null);
      throw error;
    }
  }

  /**
   * Schedule trial notifications job to run every 6-12 hours
   */
  private async scheduleTrialNotifications(): Promise<void> {
    const jobId = 'trial_notifications';
    const jobName = 'Trial Notifications Job';

    // Create job record
    const job: ScheduledJob = {
      id: jobId,
      name: jobName,
      intervalHours: this.intervalHours,
      lastRun: null,
      nextRun: this.calculateNextRun(new Date()),
      isRunning: false,
    };

    this.scheduledJobs.set(jobId, job);

    logger.info('Trial notifications job scheduled', {
      jobId,
      intervalHours: this.intervalHours,
      nextRun: job.nextRun.toISOString(),
    });

    // Schedule the first run
    this.scheduleNextRun(jobId);
  }

  /**
   * Calculate next run time based on interval
   */
  private calculateNextRun(now: Date): Date {
    const nextRun = new Date(now);
    nextRun.setHours(nextRun.getHours() + this.intervalHours);
    return nextRun;
  }

  /**
   * Schedule the next run of a job
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

    logger.info('Scheduling job next run', {
      jobId: job.id,
      nextRun: job.nextRun.toISOString(),
      delayMs,
      delayHours: (delayMs / (1000 * 60 * 60)).toFixed(2),
    });

    // Schedule the job
    const timer = setTimeout(async () => {
      await this.executeJob(jobId);
    }, Math.max(0, delayMs));

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

      // Execute the trial notifications job
      if (jobId === 'trial_notifications') {
        const result = await processTrialNotifications();
        const duration = Date.now() - startTime;

        logger.info('Trial notifications job completed successfully', {
          duration,
          processed: result.processed,
          sent: result.sent,
          transitioned: result.transitioned,
          failed: result.failed,
        });
      }

      // Update job metadata
      job.lastRun = new Date();
      job.nextRun = this.calculateNextRun(new Date());
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

      // Schedule retry for next interval
      const nextRun = this.calculateNextRun(new Date());
      job.nextRun = nextRun;
      this.scheduleNextRun(jobId);
    }
  }

  /**
   * Shutdown scheduler
   * Clears all timers
   */
  shutdown(): void {
    logger.info('Shutting down trial notifications scheduler');

    for (const [jobId, timer] of this.timers.entries()) {
      clearTimeout(timer);
      logger.info('Cleared timer for job', { jobId });
    }

    this.timers.clear();
    this.scheduledJobs.clear();
    this.isInitialized = false;

    logger.info('Trial notifications scheduler shutdown complete');
  }

  /**
   * Get current scheduler status (for monitoring)
   */
  getStatus() {
    const jobs = Array.from(this.scheduledJobs.values()).map(job => ({
      id: job.id,
      name: job.name,
      intervalHours: job.intervalHours,
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
export const trialNotificationsScheduler = new TrialNotificationsScheduler();
