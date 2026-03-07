/**
 * POST /api/billing/usdc/invoice/confirm
 * Verifies a submitted tx on-chain and marks the invoice paid if confirmed.
 * Used by the client polling loop instead of waiting for the Alchemy webhook.
 * Works in local dev, test, and production — no webhook dependency.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import { processIncomingUSDCTransfer, getUserActiveUSDCInvoice } from '@/services/billing/usdc-payment';

export const dynamic = 'force-dynamic';

type SessionUser = { id?: string };

function alchemyRpcUrl(chainId: number, apiKey: string): string {
  if (chainId === 8453) return `https://base-mainnet.g.alchemy.com/v2/${apiKey}`;
  if (chainId === 84532) return `https://base-sepolia.g.alchemy.com/v2/${apiKey}`;
  return `https://base-mainnet.g.alchemy.com/v2/${apiKey}`;
}

async function fetchTxReceipt(rpcUrl: string, txHash: string): Promise<{
  status: string;
  logs: Array<{ address: string; topics: string[]; data: string }>;
} | null> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    }),
  });
  const json = await res.json();
  return json.result || null;
}

// ERC-20 Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export async function POST(req: NextRequest) {
  try {
    const env = getEnvironmentConfig();

    // Mock mode — immediately return paid without hitting chain
    const mockMode =
      process.env.NEXT_PUBLIC_USDC_PAYMENT_MOCK === 'true' ||
      process.env.USDC_PAYMENT_MOCK === 'true';
    if (mockMode) {
      return NextResponse.json({ confirmed: true, mock: true });
    }

    const session = await getServerSession(authOptions);
    const userId = (session as { user?: SessionUser } | null)?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { txHash } = await req.json() as { txHash: string };
    if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return NextResponse.json({ error: 'Invalid txHash' }, { status: 400 });
    }

    if (!env.ALCHEMY_API_KEY) {
      return NextResponse.json({ error: 'Alchemy API key not configured' }, { status: 500 });
    }

    const rpcUrl = alchemyRpcUrl(env.USDC_CHAIN_ID, env.ALCHEMY_API_KEY);
    const receipt = await fetchTxReceipt(rpcUrl, txHash);

    if (!receipt) {
      // Tx not yet mined
      return NextResponse.json({ confirmed: false, reason: 'pending' });
    }

    if (receipt.status !== '0x1') {
      return NextResponse.json({ confirmed: false, reason: 'reverted' });
    }

    // Find a Transfer log from the USDC contract to our wallet
    const usdcContract = env.USDC_CONTRACT_ADDRESS?.toLowerCase();
    const ourWallet = env.USDC_WALLET_ADDRESS?.toLowerCase();

    if (!usdcContract || !ourWallet) {
      return NextResponse.json({ error: 'USDC config missing' }, { status: 500 });
    }

    const transferLog = receipt.logs.find(log =>
      log.address.toLowerCase() === usdcContract &&
      log.topics[0] === TRANSFER_TOPIC &&
      log.topics[2] &&
      `0x${log.topics[2].slice(26)}`.toLowerCase() === ourWallet
    );

    if (!transferLog) {
      return NextResponse.json({ confirmed: false, reason: 'no_matching_transfer' });
    }

    // Decode value from data field (uint256)
    const rawValue = BigInt(transferLog.data).toString();

    // Run the same reconcile logic the webhook uses
    const result = await processIncomingUSDCTransfer({
      txHash,
      fromAddress: transferLog.topics[1] ? `0x${transferLog.topics[1].slice(26)}` : '0x',
      toAddress: ourWallet,
      value: rawValue,
      blockNum: '0x0',
    });

    if (result.matched) {
      logger.info('Invoice confirmed via on-chain verify', { userId, txHash, reference: result.reference });
      return NextResponse.json({ confirmed: true });
    }

    // Already paid (duplicate) or no invoice found — check active invoice status
    const active = await getUserActiveUSDCInvoice(userId);
    if (!active) {
      // No pending invoice = already paid
      return NextResponse.json({ confirmed: true });
    }

    return NextResponse.json({ confirmed: false, reason: 'no_matching_invoice' });

  } catch (error) {
    logger.error('POST /api/billing/usdc/invoice/confirm error', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
