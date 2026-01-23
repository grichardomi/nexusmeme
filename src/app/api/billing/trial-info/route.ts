import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getTrialInfo } from '@/services/billing/trial-notifications';

/**
 * GET /api/billing/trial-info
 * Returns trial information for the current user
 * Includes: trial status, days remaining, capital limit/usage
 */

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const trialInfo = await getTrialInfo(session.user.id);

    // Not in trial or trial not found
    if (!trialInfo) {
      return NextResponse.json(
        {
          isTrialActive: false,
          trialInfo: null,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        isTrialActive: trialInfo.isTrialActive,
        trialInfo,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching trial info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trial information' },
      { status: 500 }
    );
  }
}
