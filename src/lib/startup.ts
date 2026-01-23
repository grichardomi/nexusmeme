import { logger } from '@/lib/logger';

/**
 * Application startup initialization
 * Called once when the application starts
 *
 * NOTE: Job queue processing is now handled by a separate worker process (src/worker.ts)
 * The web server should NOT process jobs to avoid duplicate processing and resource contention
 */
export async function initializeApp(): Promise<void> {
  logger.info('Initializing application (web server)');

  try {
    // Job queue processing moved to dedicated worker process
    // This separation ensures:
    // 1. Web server remains responsive to user requests
    // 2. Worker process can be scaled independently
    // 3. No duplicate job processing across multiple web instances

    logger.info('✓ Web server initialization complete');
  } catch (error) {
    logger.error('Application initialization failed', error instanceof Error ? error : null);
    throw error;
  }
}

/**
 * Application shutdown cleanup
 * Called when the application shuts down
 */
export async function shutdownApp(): Promise<void> {
  logger.info('Shutting down application (web server)');

  try {
    // Job queue worker is handled separately in dedicated worker process
    // Nothing to clean up here for web server

    logger.info('✓ Application shutdown complete');
  } catch (error) {
    logger.error('Application shutdown failed', error instanceof Error ? error : null);
  }
}
