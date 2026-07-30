import { NextResponse } from 'next/server';
import { query } from '@/server/infrastructure/db';
import { getAccessTokenFromRequest, verifyAccessToken } from '@/lib/auth-utils';

export type CurrentUser = {
  id: number;
  email: string;
  name: string;
  tier: 'free' | 'premium';
  is_admin: number | boolean;
  is_banned: number | boolean;
  verified_email: number | boolean;
  created_at: string;
};

/**
 * Resolve the authenticated user from the access_token cookie.
 * Returns null when unauthenticated, token is invalid/expired, the user no
 * longer exists, or the account is banned.
 */
export async function getCurrentUser(request: Request): Promise<CurrentUser | null> {
  const token = getAccessTokenFromRequest(request);
  if (!token) return null;

  const payload = await verifyAccessToken(token);
  if (!payload?.sub) return null;

  const userId = Number(payload.sub);
  if (!Number.isInteger(userId)) return null;

  const rows = await query(
    'SELECT id, email, name, tier, is_admin, is_banned, verified_email, created_at FROM users WHERE id = ?',
    [userId]
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const user = rows[0] as CurrentUser;
  if (user.is_banned) return null;

  return user;
}

/**
 * Authoritative auth check for AI-consuming route handlers. Edge middleware
 * (middleware.ts) can only verify the JWT *signature* — it has no DB access
 * there (same constraint as the rate limiter; see lib/rate-limit.ts), so it
 * can't tell a banned/deleted user from a valid one as long as their token
 * hasn't expired (up to 30 minutes). This re-checks against the database,
 * inside the Node runtime, so a ban takes effect immediately instead of
 * waiting out the token's TTL.
 *
 * Usage: `const auth = await requireActiveUser(request); if ('error' in auth) return auth.error;`
 */
export async function requireActiveUser(
  request: Request
): Promise<{ user: CurrentUser } | { error: NextResponse }> {
  const user = await getCurrentUser(request);
  if (!user) {
    return { error: NextResponse.json({ detail: 'Authentication required.' }, { status: 401 }) };
  }
  return { user };
}
