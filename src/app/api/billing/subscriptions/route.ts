import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import {
  getUserSubscription,
  upgradeSubscription,
  cancelUserSubscription,
  getPlanUsage,
  getAvailablePlans,
} from '@/services/billing/subscription';
import { getRecentFeeTransactions } from '@/services/billing/performance-fee';
import { Subscription } from '@/types/billing';
import { z } from 'zod';
import { getEnvironmentConfig } from '@/config/environment';

/**
 * Subscription Management API
 * GET /api/billing/subscriptions - Get user's subscription details
 * POST /api/billing/subscriptions - Create or update subscription
 * DELETE /api/billing/subscriptions - Cancel subscription
 */

const subscriptionSchema = z.object({
  plan: z.enum(['free', 'live_trial', 'performance_fees']),
  period: z.enum(['monthly', 'yearly']),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get subscription details
    let subscription: Subscription | null = null;
    try {
      subscription = await getUserSubscription(session.user.id);
    } catch (err) {
      console.error('Error fetching subscription:', err);
      // Continue - subscription may not exist yet
    }

    // Get plan usage
    let planUsage: Awaited<ReturnType<typeof getPlanUsage>> | null = null;
    try {
      planUsage = await getPlanUsage(session.user.id);
      // Debug: log trading mode
      console.log('[BILLING DEBUG] tradingMode from getPlanUsage:', planUsage?.limits?.tradingMode);
    } catch (err) {
      console.error('Error fetching plan usage:', err);
      // Provide default usage if retrieval fails (default to live_trial)
      // Determine trading mode from environment (no hardcoding)
      const env = getEnvironmentConfig();
      const defaultTradingMode = env.KRAKEN_BOT_PAPER_TRADING ? 'paper' : 'live';

      planUsage = {
        plan: 'live_trial',
        subscription,
        limits: { botsPerUser: 1, tradingPairsPerBot: 5, tradingMode: defaultTradingMode },
        usage: { bots: 0, apiCalls: 0, trades: 0 },
        features: [],
      };
    }

    // Get recent fee transactions (replaces legacy invoices)
    let feeTransactions: any[] = [];
    try {
      feeTransactions = await getRecentFeeTransactions(session.user.id, 10);
    } catch (err) {
      console.error('Error fetching fee transactions:', err);
      // Continue - table may not exist
    }

    // Get available plans
    const availablePlans = getAvailablePlans();

    return NextResponse.json({
      subscription,
      planUsage,
      feeTransactions,
      availablePlans,
    });
  } catch (error) {
    console.error('Error fetching billing data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch billing data', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { plan, period } = subscriptionSchema.parse(body);

    // Get current subscription
    const currentSubscription = await getUserSubscription(session.user.id);

    // If trying to upgrade/downgrade
    if (currentSubscription && currentSubscription.plan !== plan) {
      const updatedSubscription = await upgradeSubscription(session.user.id, plan, period);
      return NextResponse.json({ subscription: updatedSubscription });
    }

    return NextResponse.json({ error: 'No changes to subscription' }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('Error updating subscription:', error);
    return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const immediate = searchParams.get('immediate') === 'true';

    await cancelUserSubscription(session.user.id, immediate);

    return NextResponse.json({ message: 'Subscription cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 });
  }
}
