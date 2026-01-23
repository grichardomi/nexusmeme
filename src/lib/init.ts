/**
 * Application Initialization
 * Runs once when the Next.js server starts
 * Handles background job processing and startup validation
 */

import { logger } from './logger';
import { requireStartupValidation } from '@/services/startup-validation';

// Track if initialization has run
let initialized = false;
let jobProcessorInterval: NodeJS.Timer | null = null;
let orchestratorStarted = false;
let shutdownHandlersRegistered = false;

/**
 * Initialize background job processing for development mode
 * In production, use the dedicated worker process (worker.ts)
 */
export async function initializeApp() {
  if (initialized) {
    console.log('ℹ️ App already initialized, skipping...');
    return;
  }

  try {
    initialized = true;
    console.log('🚀 Initializing app...');

    // Validate startup configuration (Stripe, database, auth, etc.)
    console.log('🔐 Validating startup configuration...');
    try {
      await requireStartupValidation();
      console.log('✅ Startup validation passed!');
    } catch (validationError) {
      console.error('❌ Startup validation failed:', validationError);
      throw validationError;
    }

    // Start market data background fetcher (ALWAYS - regardless of worker/processor mode)
    // This populates the Redis cache every 4 seconds for all clients to use
    console.log('📊 Starting background market data fetcher...');
    try {
      const { initializeBackgroundFetcher } = await import('@/services/market-data/background-fetcher');
      await initializeBackgroundFetcher();
      console.log('✅ Background market data fetcher started!');
      logger.info('Background market data fetcher initialized');
    } catch (fetcherError) {
      console.error('❌ Failed to initialize market data fetcher:', fetcherError);
      logger.error(
        'Failed to initialize market data fetcher',
        fetcherError instanceof Error ? fetcherError : new Error(String(fetcherError))
      );
      // Don't throw - app can continue without cached prices initially
    }

    // Start job processor if not already running via worker process
    // In production, prefer separate worker.ts process (node dist/worker.js)
    // But start in-app processor as fallback to ensure email queue works
    const isProductionWorker = process.env.WORKER_PROCESS === 'true';
    const shouldStartProcessor = !isProductionWorker; // Skip if dedicated worker is running

    console.log('🔍 Processor check:', {
      WORKER_PROCESS: process.env.WORKER_PROCESS,
      isProductionWorker,
      shouldStartProcessor,
      NODE_ENV: process.env.NODE_ENV,
    });

    if (shouldStartProcessor) {
      console.log('📋 Starting background job processor...');
      logger.info('Starting background job processor', {
        environment: process.env.NODE_ENV,
        isWorkerProcess: false,
      });

      // Dynamically import to avoid circular dependencies
      const { jobQueueManager } = await import('@/services/job-queue/singleton');
      const { monthlyBillingScheduler } = await import('@/services/cron/monthly-billing-scheduler');
      const { trialNotificationsScheduler } = await import('@/services/cron/trial-notifications-scheduler');

      // Use 5 second interval for all environments (production usually uses worker process)
      const pollInterval = 5000;
      jobProcessorInterval = jobQueueManager.startProcessing(pollInterval);

      console.log('✅ Job processor started successfully! Polling every 5 seconds for jobs.');
      logger.info('Background job processor started', {
        pollIntervalMs: pollInterval,
        environment: process.env.NODE_ENV,
      });

      // Start monthly billing scheduler
      console.log('💳 Starting monthly billing scheduler...');
      try {
        await monthlyBillingScheduler.initialize();
        console.log('✅ Monthly billing scheduler initialized!');
        logger.info('Monthly billing scheduler initialized');
      } catch (schedulerError) {
        console.error('❌ Failed to initialize monthly billing scheduler:', schedulerError);
        logger.error(
          'Failed to initialize monthly billing scheduler',
          schedulerError instanceof Error ? schedulerError : new Error(String(schedulerError))
        );
        // Don't throw - app can continue without scheduler
      }

      // Start trial notifications scheduler
      console.log('📧 Starting trial notifications scheduler...');
      try {
        await trialNotificationsScheduler.initialize();
        console.log('✅ Trial notifications scheduler initialized!');
        logger.info('Trial notifications scheduler initialized');
      } catch (schedulerError) {
        console.error('❌ Failed to initialize trial notifications scheduler:', schedulerError);
        logger.error(
          'Failed to initialize trial notifications scheduler',
          schedulerError instanceof Error ? schedulerError : new Error(String(schedulerError))
        );
        // Don't throw - app can continue without scheduler
      }

      // Start trade signal orchestrator to convert signals into trades
      console.log('🤖 Starting trade signal orchestrator...');
      const { tradeSignalOrchestrator } = await import('@/services/orchestration/trade-signal-orchestrator');
      const orchestratorIntervalMs = parseInt(process.env.ORCHESTRATOR_INTERVAL_MS || '60000', 10);
      tradeSignalOrchestrator.start(orchestratorIntervalMs);
      orchestratorStarted = true;
      console.log('✅ Trade signal orchestrator started!');
      logger.info('Trade signal orchestrator started', {
        intervalMs: orchestratorIntervalMs,
      });

      // Cleanup on exit (register once per process)
      if (!shutdownHandlersRegistered) {
        shutdownHandlersRegistered = true;

        // Increase max listeners to prevent warning in development mode
        // Default is 10, we need more for background jobs, fetchers, schedulers, etc.
        process.setMaxListeners(20);

        const shutdownHandler = async () => {
          console.log('⛔ Shutting down job processor, orchestrator, scheduler, and market data fetcher...');
          if (jobProcessorInterval) {
            clearInterval(jobProcessorInterval as NodeJS.Timeout);
            jobProcessorInterval = null;
          }
          if (jobQueueManager) {
            jobQueueManager.stopProcessing();
          }
          if (orchestratorStarted) {
            const { tradeSignalOrchestrator: orchestrator } = await import('@/services/orchestration/trade-signal-orchestrator');
            orchestrator.stop();
          }
          // Shutdown schedulers
          try {
            const { monthlyBillingScheduler: scheduler } = await import('@/services/cron/monthly-billing-scheduler');
            scheduler.shutdown();
          } catch (error) {
            console.error('Error shutting down monthly billing scheduler:', error);
          }
          try {
            const { trialNotificationsScheduler: scheduler } = await import('@/services/cron/trial-notifications-scheduler');
            scheduler.shutdown();
          } catch (error) {
            console.error('Error shutting down trial notifications scheduler:', error);
          }
          // Shutdown background fetcher
          try {
            const { shutdownBackgroundFetcher } = await import('@/services/market-data/background-fetcher');
            shutdownBackgroundFetcher();
          } catch (error) {
            console.error('Error shutting down background fetcher:', error);
          }
        };

        process.on('SIGTERM', shutdownHandler);
        process.on('SIGINT', shutdownHandler);
      }
    } else {
      console.log('⚠️ Skipping in-app processor (WORKER_PROCESS=true)');
      logger.info('Dedicated worker process running - skipping in-app job processor');
    }
  } catch (error) {
    console.error('❌ Failed to initialize app:', error);
    logger.error('Failed to initialize app', error instanceof Error ? error : new Error(String(error)));
    // Don't throw - allow app to continue even if initialization fails
  }
}

/**
 * Get job processor status (for diagnostics)
 */
export function getJobProcessorStatus() {
  return {
    initialized,
    running: jobProcessorInterval !== null,
    environment: process.env.NODE_ENV,
  };
}
