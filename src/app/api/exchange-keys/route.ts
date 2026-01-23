import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query, transaction } from '@/lib/db';
import { logger } from '@/lib/logger';
import { encrypt } from '@/lib/crypto';
import { z } from 'zod';

/**
 * GET /api/exchange-keys
 * List all connected exchange API keys for current user (without revealing secrets)
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const keys = await query(
      `SELECT id, exchange, validated_at, created_at
       FROM exchange_api_keys
       WHERE user_id = $1
       ORDER BY exchange ASC`,
      [session.user.id]
    );

    return NextResponse.json({ keys });
  } catch (error) {
    logger.error('Error fetching exchange keys', error instanceof Error ? error : null);
    return NextResponse.json(
      { error: 'Failed to fetch exchange keys' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/exchange-keys
 * Add or update API keys for an exchange
 */

const addKeySchema = z.object({
  exchange: z.enum(['kraken', 'binance']),
  publicKey: z.string().min(1, 'Public key is required'),
  secretKey: z.string().min(1, 'Secret key is required'),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = addKeySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { exchange, publicKey, secretKey } = validation.data;

    // Encrypt keys before storing (AES-256-GCM)
    let encryptedPublic: string;
    let encryptedSecret: string;

    try {
      encryptedPublic = encrypt(publicKey);
      encryptedSecret = encrypt(secretKey);

      logger.info('API keys encrypted successfully', {
        exchange,
        publicKeyLength: publicKey.length,
        secretKeyLength: secretKey.length,
      });
    } catch (encryptError) {
      logger.error('Encryption failed', encryptError instanceof Error ? encryptError : null, {
        exchange,
      });
      return NextResponse.json(
        { error: 'Failed to encrypt API keys' },
        { status: 500 }
      );
    }

    // Insert or update (upsert) using transaction
    let result;
    try {
      result = await transaction(async (client) => {
        // Check if keys already exist
        const existing = await client.query(
          `SELECT id FROM exchange_api_keys WHERE user_id = $1 AND exchange = $2`,
          [session.user.id, exchange]
        );

        if (existing.rows.length > 0) {
          // Update existing
          const updateResult = await client.query(
            `UPDATE exchange_api_keys
             SET encrypted_public_key = $1, encrypted_secret_key = $2, updated_at = NOW(), validated_at = NULL
             WHERE user_id = $3 AND exchange = $4
             RETURNING id, exchange, created_at, updated_at`,
            [encryptedPublic, encryptedSecret, session.user.id, exchange]
          );
          return { updated: true, ...updateResult.rows[0] };
        } else {
          // Insert new
          const insertResult = await client.query(
            `INSERT INTO exchange_api_keys (user_id, exchange, encrypted_public_key, encrypted_secret_key)
             VALUES ($1, $2, $3, $4)
             RETURNING id, exchange, created_at, updated_at`,
            [session.user.id, exchange, encryptedPublic, encryptedSecret]
          );
          return { created: true, ...insertResult.rows[0] };
        }
      });
    } catch (dbError) {
      const dbErrorMessage = dbError instanceof Error ? dbError.message : String(dbError);
      logger.error('Database error in exchange keys', dbError instanceof Error ? dbError : null);
      console.error('DB Error:', { exchange, userId: session.user.id, message: dbErrorMessage });
      throw dbError;
    }

    logger.info('Exchange API keys updated', {
      userId: session.user.id,
      exchange,
      action: result.updated ? 'updated' : 'created',
    });

    return NextResponse.json(
      {
        message: result.updated ? 'API keys updated successfully' : 'API keys added successfully',
        exchange,
        id: result.id,
      },
      { status: result.updated ? 200 : 201 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    logger.error('Error adding exchange keys', error instanceof Error ? error : null);
    console.error('Exchange keys error:', { message: errorMessage, stack: errorStack });
    return NextResponse.json(
      {
        error: 'Failed to add exchange keys',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}
