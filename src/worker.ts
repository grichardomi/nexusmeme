/**
 * Dedicated Worker Process for NexusMeme
 * Runs separately from the Next.js web server
 * Handles async job processing (trades, regime sync, email, etc.)
 *
 * Usage: node dist/worker.js
 * Railway: Set as separate service with startCommand "node dist/worker.js"
 */

import { logger } from './lib/logger';
import { jobQueueManager } from './services/job-queue/singleton';
import { tradeSignalOrchestrator } from './services/orchestration/trade-signal-orchestrator';
import { monthlyBillingScheduler } from './services/cron/monthly-billing-scheduler';
import { trialNotificationsScheduler } from './services/cron/trial-notifications-scheduler';

let isShuttingDown = false;
let monitoringInterval: NodeJS.Timer | null = null;

async function startWorker() {
  let processingInterval: NodeJS.Timer | null = null;

  try {
    logger.info('Starting NexusMeme Job Queue Worker', { pid: process.pid });

    // Start processing jobs from the queue
    // Polls database every 5 seconds for pending jobs
    // Save interval handle for shutdown
    processingInterval = jobQueueManager.startProcessing(5000);

    logger.info('Worker started successfully - processing jobs', {
      pollIntervalMs: 5000,
      pid: process.pid,
    });

    // Start trade signal orchestrator
    const orchestratorIntervalMs = parseInt(process.env.ORCHESTRATOR_INTERVAL_MS || '60000', 10);
    tradeSignalOrchestrator.start(orchestratorIntervalMs);
    logger.info('Trade signal orchestrator started', { intervalMs: orchestratorIntervalMs });

    // Start monthly billing scheduler
    try {
      await monthlyBillingScheduler.initialize();
      logger.info('Monthly billing scheduler initialized in worker process');
    } catch (schedulerError) {
      logger.error(
        'Failed to initialize monthly billing scheduler',
        schedulerError instanceof Error ? schedulerError : new Error(String(schedulerError))
      );
      // Don't throw - worker can continue without scheduler
    }

    // Start trial notifications scheduler
    try {
      await trialNotificationsScheduler.initialize();
      logger.info('Trial notifications scheduler initialized in worker process');
    } catch (schedulerError) {
      logger.error(
        'Failed to initialize trial notifications scheduler',
        schedulerError instanceof Error ? schedulerError : new Error(String(schedulerError))
      );
      // Don't throw - worker can continue without scheduler
    }

    // Start monitoring hook (logs health periodically)
    monitoringInterval = setInterval(() => {
      const inFlightCount = jobQueueManager.getInFlightJobCount();

      // Alert if too many jobs in-flight
      if (inFlightCount > 50) {
        logger.warn('High in-flight job count', { count: inFlightCount });
      }
    }, 30000); // Every 30 seconds

    // Handle graceful shutdown
    const shutdownSignals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

    shutdownSignals.forEach(signal => {
      process.on(signal, async () => {
        if (isShuttingDown) {
          logger.warn('Shutdown already in progress, forcing exit');
          process.exit(1);
        }

        isShuttingDown = true;
        logger.info(`${signal} received, starting graceful shutdown`);

        // Stop processing new jobs
        jobQueueManager.stopProcessing();

        // Stop orchestrator
        tradeSignalOrchestrator.stop();

        // Stop schedulers
        try {
          monthlyBillingScheduler.shutdown();
          logger.info('Monthly billing scheduler shut down');
        } catch (schedulerError) {
          logger.error('Error shutting down monthly billing scheduler', schedulerError instanceof Error ? schedulerError : new Error(String(schedulerError)));
        }
        try {
          trialNotificationsScheduler.shutdown();
          logger.info('Trial notifications scheduler shut down');
        } catch (schedulerError) {
          logger.error('Error shutting down trial notifications scheduler', schedulerError instanceof Error ? schedulerError : new Error(String(schedulerError)));
        }

        // Clear intervals
        if (processingInterval) {
          clearInterval(processingInterval as NodeJS.Timeout);
          processingInterval = null;
        }

        if (monitoringInterval) {
          clearInterval(monitoringInterval as NodeJS.Timeout);
          monitoringInterval = null;
        }

        // Wait for in-flight jobs to complete (with timeout)
        const shutdownTimeout = 30000; // 30 seconds
        const shutdownDeadline = Date.now() + shutdownTimeout;
        const logInterval = setInterval(() => {
          const inFlightCount = jobQueueManager.getInFlightJobCount();
          const secondsRemaining = Math.ceil((shutdownDeadline - Date.now()) / 1000);
          logger.info('Waiting for in-flight jobs to complete', {
            inFlightCount,
            secondsRemaining,
          });
        }, 2000);

        // Poll until idle or timeout
        while (!jobQueueManager.isIdle() && Date.now() < shutdownDeadline) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        clearInterval(logInterval);

        if (jobQueueManager.isIdle()) {
          logger.info('All in-flight jobs completed, exiting gracefully');
        } else {
          const remaining = jobQueueManager.getInFlightJobCount();
          logger.warn('Shutdown timeout reached, forcing exit with in-flight jobs', {
            inFlightCount: remaining,
          });
        }

        process.exit(0);
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', error => {
      logger.error('Uncaught exception in worker', error);
      // Attempt to shutdown gracefully, then exit
      jobQueueManager.stopProcessing();
      tradeSignalOrchestrator.stop();

      try {
        monthlyBillingScheduler.shutdown();
      } catch (schedulerError) {
        logger.error('Error shutting down monthly billing scheduler on exception', schedulerError instanceof Error ? schedulerError : new Error(String(schedulerError)));
      }
      try {
        trialNotificationsScheduler.shutdown();
      } catch (schedulerError) {
        logger.error('Error shutting down trial notifications scheduler on exception', schedulerError instanceof Error ? schedulerError : new Error(String(schedulerError)));
      }

      if (processingInterval) clearInterval(processingInterval as NodeJS.Timeout);
      if (monitoringInterval) clearInterval(monitoringInterval as NodeJS.Timeout);

      setTimeout(() => process.exit(1), 5000);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection in worker', new Error(String(reason)));
    });
  } catch (error) {
    logger.error('Worker failed to start', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}

// Start the worker
startWorker();
