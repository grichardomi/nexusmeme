import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/users
 * Get list of all users with pagination
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if ((session.user as any).role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
    const search = searchParams.get('search');

    const offset = (page - 1) * pageSize;

    // Build query with optional search
    let sql = `
      SELECT id, email, name, role, created_at, email_verified_at
      FROM users
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search) {
      sql += ` AND (email ILIKE $${params.length + 1} OR name ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(pageSize, offset);

    const users = await query<any>(sql, params);

    // Get total count
    let countSql = 'SELECT COUNT(*) as count FROM users WHERE 1=1';
    const countParams: any[] = [];

    if (search) {
      countSql += ` AND (email ILIKE $${countParams.length + 1} OR name ILIKE $${countParams.length + 1})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await query<{ count: number | string }>(countSql, countParams);
    const total = parseInt(String(countResult[0]?.count || '0'), 10);

    return NextResponse.json({
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        createdAt: new Date(u.created_at),
        emailVerified: u.email_verified_at ? true : false,
      })),
      total,
      page,
      pageSize,
    });
  } catch (error) {
    logger.error('Failed to fetch admin users', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
