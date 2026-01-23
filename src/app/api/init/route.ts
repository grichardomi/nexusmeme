/**
 * Application Initialization Endpoint
 * Triggers background job processing initialization on first request
 * Called automatically on app startup or manually if needed
 */

import { NextResponse } from 'next/server';
import { jobQueueManager } from '@/services/job-queue/singleton';
import { monthlyBillingScheduler } from '@/services/cron/monthly-billing-scheduler';
import { trialNotificationsScheduler } from '@/services/cron/trial-notifications-scheduler';
import { tradeSignalOrchestrator } from '@/services/orchestration/trade-signal-orchestrator';
import { logger } from '@/lib/logger';

// Global flags to ensure processors only start once
let processorStarted = false;
let billingSchedulerStarted = false;
let trialSchedulerStarted = false;
let orchestratorStarted = false;

export async function GET() {
  try {
    // Start job processor on first request in all environments
    if (!processorStarted) {
      processorStarted = true;
      const pollInterval = process.env.NODE_ENV === 'production' ? 5000 : 5000; // 5 seconds for both
      logger.info('Starting job queue processor from init endpoint', { pollInterval });
      jobQueueManager.startProcessing(pollInterval);
    }

    // Start monthly billing scheduler on first request
    if (!billingSchedulerStarted) {
      billingSchedulerStarted = true;
      logger.info('Starting monthly billing scheduler from init endpoint');
      await monthlyBillingScheduler.initialize();
    }

    // Start trial notifications scheduler on first request
    if (!trialSchedulerStarted) {
      trialSchedulerStarted = true;
      logger.info('Starting trial notifications scheduler from init endpoint');
      await trialNotificationsScheduler.initialize();
    }

    // Start trade signal orchestrator on first request
    if (!orchestratorStarted) {
      orchestratorStarted = true;
      const orchestratorIntervalMs = parseInt(process.env.ORCHESTRATOR_INTERVAL_MS || '60000', 10);
      logger.info('Starting trade signal orchestrator from init endpoint', { intervalMs: orchestratorIntervalMs });
      tradeSignalOrchestrator.start(orchestratorIntervalMs);
    }

    const isIdle = jobQueueManager.isIdle();
    const inFlightCount = jobQueueManager.getInFlightJobCount();
    const billingSchedulerStatus = monthlyBillingScheduler.getStatus();
    const trialSchedulerStatus = trialNotificationsScheduler.getStatus();

    return NextResponse.json({
      success: true,
      message: 'Background processors running',
      status: {
        environment: process.env.NODE_ENV,
        jobProcessor: {
          started: processorStarted,
          isIdle,
          inFlightJobs: inFlightCount,
        },
        billingScheduler: {
          started: billingSchedulerStarted,
          ...billingSchedulerStatus,
        },
        trialScheduler: {
          started: trialSchedulerStarted,
          ...trialSchedulerStatus,
        },
        tradeSignalOrchestrator: {
          started: orchestratorStarted,
        },
      },
    });
  } catch (error) {
    logger.error('Init endpoint error', error instanceof Error ? error : null);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Initialization failed',
      },
      { status: 500 }
    );
  }
}
