import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

type PremiumRequestRow = {
  id: number;
  user_id: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  updated_at: string;
};

function toResponseShape(row: PremiumRequestRow) {
  return {
    id: row.id,
    status: row.status,
    reason: row.reason,
    requested_at: row.requested_at,
    processed_at: row.status === 'pending' ? null : row.updated_at,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
    }

    const rows = await query(
      'SELECT * FROM premium_requests WHERE user_id = ? ORDER BY requested_at DESC LIMIT 1',
      [user.id]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(null);
    }

    return NextResponse.json(toResponseShape(rows[0] as PremiumRequestRow));
  } catch (error) {
    console.error('Get premium request error:', error);
    return NextResponse.json({ detail: 'Failed to load premium request' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
    }

    if (!Boolean(user.verified_email)) {
      return NextResponse.json(
        { detail: 'Verify your email before requesting premium access' },
        { status: 403 }
      );
    }

    if (user.tier === 'premium') {
      return NextResponse.json({ detail: 'Account is already premium' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 10) {
      return NextResponse.json(
        { detail: 'Please provide at least 10 characters explaining why you need premium' },
        { status: 400 }
      );
    }

    const pending = await query(
      "SELECT id FROM premium_requests WHERE user_id = ? AND status = 'pending' LIMIT 1",
      [user.id]
    );
    if (Array.isArray(pending) && pending.length > 0) {
      return NextResponse.json(
        { detail: 'You already have a pending premium request' },
        { status: 400 }
      );
    }

    const result = await query(
      "INSERT INTO premium_requests (user_id, reason, status) VALUES (?, ?, 'pending')",
      [user.id, reason]
    );

    const rows = await query('SELECT * FROM premium_requests WHERE id = ?', [
      (result as any).insertId,
    ]);
    return NextResponse.json(toResponseShape(rows[0] as PremiumRequestRow), { status: 201 });
  } catch (error) {
    console.error('Create premium request error:', error);
    return NextResponse.json({ detail: 'Failed to submit premium request' }, { status: 500 });
  }
}
