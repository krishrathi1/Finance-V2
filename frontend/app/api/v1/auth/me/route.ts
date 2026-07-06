import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      tier: user.tier,
      is_admin: Boolean(user.is_admin),
      is_banned: Boolean(user.is_banned),
      verified_email: Boolean(user.verified_email),
      created_at: user.created_at,
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return NextResponse.json({ detail: 'Failed to load user' }, { status: 500 });
  }
}
