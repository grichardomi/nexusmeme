/**
 * Alchemy Webhook Handler
 * POST /api/billing/usdc/webhook
 *
 * Receives Address Activity notifications from Alchemy
 * when USDC arrives at our Base wallet
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  verifyAlchemySignature,
  processIncomingUSDCTransfer,
  isUSDCPaymentEnabled,
} from '@/services/billing/usdc-payment';
import { sendBotResumedEmail } from '@/services/email/triggers';
import { processPendingEmails } from '@/services/email/queue';
import { getEnvironmentConfig } from '@/config/environment';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Alchemy validates webhook URLs with a GET request before sending notifications
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('X-Alchemy-Signature') ?? '';

    if (!isUSDCPaymentEnabled()) {
      return NextResponse.json({ error: 'USDC payment disabled' }, { status: 400 });
    }

    if (!signature) {
      logger.warn('Alchemy webhook missing signature header');
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    if (!verifyAlchemySignature(rawBody, signature)) {
      logger.warn('Alchemy webhook signature verification failed');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(rawBody);

    // Only process token transfers (ERC-20 USDC)
    if (event.type !== 'TOKEN_TRANSFER' && event.type !== 'ADDRESS_ACTIVITY') {
      return NextResponse.json({ received: true });
    }

    const env = getEnvironmentConfig();
    const expectedContract = env.USDC_CONTRACT_ADDRESS?.toLowerCase();
    const activities: any[] = event.event?.activity ?? [];

    for (const activity of activities) {
      // Only process ERC-20 transfers (USDC)
      if (activity.category !== 'token' && activity.category !== 'erc20') continue;

      // Verify this is the correct USDC contract (not some random ERC-20)
      const contractAddress = (activity.rawContract?.address ?? '').toLowerCase();
      if (expectedContract && contractAddress !== expectedContract) {
        logger.warn('Ignoring transfer from unexpected contract', {
          contract: contractAddress,
          expected: expectedContract,
        });
        continue;
      }

      // Alchemy sends ADDRESS_ACTIVITY webhooks only after the configured
      // confirmation threshold (set in Alchemy dashboard). Manual block-delta
      // counting here was unreliable (fallback made delta always 0).
      // We trust Alchemy's delivery guarantee; unique micro-offset amounts
      // prevent double-credit if a webhook fires twice for the same tx.
      logger.info('USDC transfer received via Alchemy webhook', {
        txHash: activity.hash,
        contract: contractAddress,
        from: activity.fromAddress,
        to: activity.toAddress,
      });

      let result: Awaited<ReturnType<typeof processIncomingUSDCTransfer>>;
      try {
        result = await processIncomingUSDCTransfer({
          txHash: activity.hash,
          fromAddress: activity.fromAddress,
          toAddress: activity.toAddress,
          value: activity.rawContract?.rawValue ?? activity.value?.toString() ?? '0',
          blockNum: activity.blockNum,
        });
      } catch (transferError) {
        // DB transaction failed — log for manual recovery. Alchemy won't retry (we return 200).
        const errMsg = transferError instanceof Error ? transferError.message : String(transferError);
        logger.error('processIncomingUSDCTransfer failed — logged for recovery', transferError instanceof Error ? transferError : null, {
          txHash: activity.hash,
          fromAddress: activity.fromAddress,
        });
        try {
          await query(
            `INSERT INTO webhook_failures (tx_hash, from_address, to_address, raw_value, block_num, error_message, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (tx_hash) DO NOTHING`,
            [activity.hash, activity.fromAddress, activity.toAddress, activity.rawContract?.rawValue ?? activity.value?.toString() ?? '0', activity.blockNum, errMsg]
          );
        } catch {
          logger.error('Failed to write webhook_failures record', null, { txHash: activity.hash });
        }
        continue;
      }

      if (result.matched && result.userId) {
        // Send confirmation email with actual paid amount
        try {
          const userResult = await query(
            `SELECT u.email, u.name, r.amount_usd
             FROM users u
             JOIN usdc_payment_references r ON r.payment_reference = $2
             WHERE u.id = $1`,
            [result.userId, result.reference ?? '']
          );
          if (userResult[0]) {
            const amount = parseFloat(String(userResult[0].amount_usd)).toFixed(2);
            await sendBotResumedEmail(
              userResult[0].email,
              userResult[0].name || 'Trader',
              'all bots',
              `Payment of $${amount} USDC received for invoice ${result.reference}. Your bots are trading again.`
            );
          }
          // Flush immediately — user expects instant confirmation
          await processPendingEmails();
        } catch (emailError) {
          logger.warn('Failed to send USDC payment confirmation email', {
            userId: result.userId,
          });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('Alchemy webhook error', error instanceof Error ? error : null);
    // Return 200 to prevent Alchemy retrying on app errors
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
