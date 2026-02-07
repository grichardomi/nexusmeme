#!/usr/bin/env tsx
/**
 * Event-Driven Trading System Launcher
 * Starts price stream and trade workers for horizontal scalability
 *
 * Usage:
 *   pnpm event-system price-stream   # Start price broadcaster
 *   pnpm event-system worker 1       # Start worker #1
 *   pnpm event-system worker 2       # Start worker #2
 *   pnpm event-system all            # Start price stream + 1 worker (dev mode)
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { logger } from '@/lib/logger';
import { priceStreamService } from '@/services/events/price-stream';
import { TradeWorkerService } from '@/services/events/trade-worker';
import { pgNotifyManager } from '@/services/events/pg-notify-manager';

const command = process.argv[2];
const workerId = process.argv[3] || '1';

async function startPriceStream() {
  logger.info('📡 Starting Price Stream Service...');
  await priceStreamService.start();
}

async function startWorker(id: string) {
  logger.info(`🔧 Starting Trade Worker #${id}...`);
  const worker = new TradeWorkerService(id);
  await worker.start();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down worker...');
    await worker.stop();
    await pgNotifyManager.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down worker...');
    await worker.stop();
    await pgNotifyManager.close();
    process.exit(0);
  });
}

async function startAll() {
  logger.info('🚀 Starting Event-Driven Trading System (Price Stream + Worker)...');
  await startPriceStream();
  await startWorker('1');
}

async function main() {
  try {
    switch (command) {
      case 'price-stream':
        await startPriceStream();
        break;

      case 'worker':
        await startWorker(workerId);
        break;

      case 'all':
        await startAll();
        break;

      default:
        console.error('Usage: pnpm event-system <price-stream|worker|all> [worker-id]');
        console.error('');
        console.error('Examples:');
        console.error('  pnpm event-system price-stream    # Start price broadcaster');
        console.error('  pnpm event-system worker 1         # Start worker #1');
        console.error('  pnpm event-system worker 2         # Start worker #2');
        console.error('  pnpm event-system all              # Start both (dev mode)');
        process.exit(1);
    }

    // Keep process alive
    logger.info('✅ System running. Press Ctrl+C to stop.');

    // Graceful shutdown for price stream
    if (command === 'price-stream' || command === 'all') {
      process.on('SIGINT', async () => {
        logger.info('Received SIGINT, shutting down...');
        await priceStreamService.stop();
        await pgNotifyManager.close();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM, shutting down...');
        await priceStreamService.stop();
        await pgNotifyManager.close();
        process.exit(0);
      });
    }

  } catch (error) {
    logger.error('Fatal error in event trading system', error instanceof Error ? error : null);
    process.exit(1);
  }
}

main();

// Export for use in other files
export { TradeWorkerService };
