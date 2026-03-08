/**
 * Test Email Send Endpoint
 * POST - Queue a test email of any template type (dev only)
 *
 * Body: { to: string, type: EmailTemplateType, context: EmailContext }
 */

import { NextRequest, NextResponse } from 'next/server';
import { queueEmail } from '@/services/email/queue';
import { EmailTemplateType, EmailContext } from '@/types/email';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Only available in development' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { to, type, context } = body as {
      to: string;
      type: EmailTemplateType;
      context: EmailContext;
    };

    if (!to || !type || !context) {
      return NextResponse.json({ error: 'to, type, and context are required' }, { status: 400 });
    }

    const emailId = await queueEmail(type, to, context);
    return NextResponse.json({ success: true, emailId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
