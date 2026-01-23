import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getUserEmailHistory, getEmailStatus } from '@/services/email/queue';

/**
 * Email Status API
 * GET - Get email status and history
 */

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const emailId = searchParams.get('id');

    if (emailId) {
      // Get specific email status
      const email = await getEmailStatus(emailId);
      if (!email) {
        return NextResponse.json({ error: 'Email not found' }, { status: 404 });
      }

      // Verify ownership
      if (email.to !== session.user.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      return NextResponse.json(email);
    } else {
      // Get email history for user
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const emails = await getUserEmailHistory(session.user.email, limit);
      return NextResponse.json({ emails });
    }
  } catch (error) {
    console.error('Error fetching email status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email status' },
      { status: 500 }
    );
  }
}
