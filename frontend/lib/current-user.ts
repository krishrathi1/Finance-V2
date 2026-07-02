import { query } from '@/lib/db';
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
