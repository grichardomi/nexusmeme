import { JobQueueManager } from './manager';

/**
 * Singleton instance of JobQueueManager
 * Ensures single queue processor across application
 */
export const jobQueueManager = new JobQueueManager();
