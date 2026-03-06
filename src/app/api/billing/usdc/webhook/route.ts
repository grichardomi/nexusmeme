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
import { sendPerformanceFeeChargedEmail } from '@/services/email/triggers';
import { getEnvironmentConfig } from '@/config/environment';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (!isUSDCPaymentEnabled()) {
      return NextResponse.json({ error: 'USDC payment disabled' }, { status: 400 });
    }

    const rawBody = await req.text();
    const signature = req.headers.get('X-Alchemy-Signature') ?? '';

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

      // Enforce confirmation threshold before crediting
      // Alchemy sends blockNum as hex (e.g. "0x1a2b3c") for the tx block
      // and event.event.network contains the current synced block context.
      // We compare tx block against the block at notification time.
      const txBlockHex: string = activity.blockNum ?? '0x0';
      const txBlock = parseInt(txBlockHex, 16);
      // Alchemy ADDRESS_ACTIVITY events include a top-level block number
      // in event.event.network — not reliable. Use the activity's own
      // blockNum and trust Alchemy's confirmation_count if present, else
      // default to the env threshold check via block delta from event header.
      const eventBlock = parseInt(event.event?.blockNum ?? txBlockHex, 16);
      const confirmations = eventBlock - txBlock;
      const required = env.USDC_REQUIRED_CONFIRMATIONS;

      if (confirmations < required) {
        logger.info('USDC transfer below confirmation threshold — waiting', {
          txHash: activity.hash,
          confirmations,
          required,
        });
        continue;
      }

      const result = await processIncomingUSDCTransfer({
        txHash: activity.hash,
        fromAddress: activity.fromAddress,
        toAddress: activity.toAddress,
        value: activity.rawContract?.rawValue ?? activity.value?.toString() ?? '0',
        blockNum: activity.blockNum,
      });

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
            await sendPerformanceFeeChargedEmail(
              userResult[0].email,
              userResult[0].name || 'Trader',
              parseFloat(String(userResult[0].amount_usd)),
              result.reference ?? '',
              '',
              0
            );
          }
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
