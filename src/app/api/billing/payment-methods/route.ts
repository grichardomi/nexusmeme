import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { createPaymentMethod } from '@/services/billing/stripe';
import { getPool } from '@/lib/db';
import { z } from 'zod';

/**
 * Payment Methods API
 * GET - List user's payment methods
 * POST - Add new payment method
 * DELETE - Remove payment method
 */

const paymentMethodSchema = z.object({
  stripePaymentMethodId: z.string(),
  isDefault: z.boolean().optional(),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await getPool().connect();
    try {
      const result = await client.query(
        `SELECT id, type, brand, last4, exp_month, exp_year, is_default, created_at
         FROM payment_methods
         WHERE user_id = $1
         ORDER BY is_default DESC, created_at DESC`,
        [session.user.id]
      );

      return NextResponse.json({ paymentMethods: result.rows });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    return NextResponse.json({ error: 'Failed to fetch payment methods' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { stripePaymentMethodId, isDefault } = paymentMethodSchema.parse(body);

    const paymentMethod = await createPaymentMethod(
      session.user.id,
      stripePaymentMethodId,
      isDefault || false
    );

    return NextResponse.json({ paymentMethod });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('Error creating payment method:', error);
    return NextResponse.json({ error: 'Failed to save payment method' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const paymentMethodId = searchParams.get('id');

    if (!paymentMethodId) {
      return NextResponse.json({ error: 'Payment method ID required' }, { status: 400 });
    }

    const client = await getPool().connect();
    try {
      // Verify ownership and delete
      const result = await client.query(
        'DELETE FROM payment_methods WHERE id = $1 AND user_id = $2 RETURNING id',
        [paymentMethodId, session.user.id]
      );

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Payment method not found' }, { status: 404 });
      }

      return NextResponse.json({ message: 'Payment method deleted' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting payment method:', error);
    return NextResponse.json({ error: 'Failed to delete payment method' }, { status: 500 });
  }
}
