import { NextResponse } from 'next/server';
import { processPendingEmails } from '@/services/email/queue';

/**
 * Email Processing API
 * POST - Process pending emails from queue
 * Internal use only (protected by authorization header)
 */

export async function POST(req: Request) {
  try {
    // Verify authorization header (internal endpoint)
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.INTERNAL_API_KEY}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Process pending emails
    const processedCount = await processPendingEmails();

    return NextResponse.json({
      success: true,
      processedCount,
      message: `Processed ${processedCount} email(s)`,
    });
  } catch (error) {
    console.error('Error processing emails:', error);
    return NextResponse.json(
      { error: 'Failed to process emails' },
      { status: 500 }
    );
  }
}
