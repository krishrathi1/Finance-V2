import { NextRequest, NextResponse } from 'next/server';

import { verifyPassword } from '@/lib/auth-utils';
import { requireActiveUser } from '@/lib/current-user';
import { query, ResultSetHeader } from '@/server/infrastructure/db';
import { rateLimit } from '@/server/infrastructure/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Permanent account deletion (DPDP Act, 2023 — right to erasure).
 *
 * POST rather than DELETE: the request carries the user's password in a body,
 * and bodies on DELETE are legal but unreliable — some proxies and clients
 * drop them, which would turn "confirm your password" into "deleted without
 * confirmation".
 */
export async function POST(request: NextRequest) {
  const auth = await requireActiveUser(request);
  if ('error' in auth) return auth.error;

  const { user } = auth;

  try {
    // This endpoint compares a submitted password against the stored hash, which
    // makes it a credential oracle exactly like /login — an attacker with a
    // stolen session cookie could otherwise brute-force the password here to
    // reuse it elsewhere. Keyed by account, not IP, so rotating IPs doesn't
    // reset the budget.
    const limit = await rateLimit(`delete-account:${user.id}`, 5, 15 * 60_000);
    if (!limit.ok) {
      return NextResponse.json(
        { detail: 'Too many attempts. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      );
    }

    const body = await request.json().catch(() => null);
    const password = body?.password;

    if (typeof password !== 'string' || !password) {
      return NextResponse.json({ detail: 'Enter your password to confirm.' }, { status: 400 });
    }

    // Re-read the hash rather than trusting the session: requireActiveUser
    // deliberately does not select password_hash.
    const rows = await query('SELECT password_hash FROM users WHERE id = ?', [user.id]);
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ detail: 'Account not found.' }, { status: 404 });
    }

    const valid = await verifyPassword(password, (rows[0] as { password_hash: string }).password_hash);
    if (!valid) {
      return NextResponse.json({ detail: 'Incorrect password.' }, { status: 401 });
    }

    // portfolios, watchlists, watchlist_lists, price_alerts, premium_requests,
    // refresh_tokens and password_reset_tokens all declare ON DELETE CASCADE
    // against users.id, so this single statement removes the account and every
    // row belonging to it.
    const result = await query<ResultSetHeader>('DELETE FROM users WHERE id = ?', [user.id]);
    if (!result || result.affectedRows !== 1) {
      return NextResponse.json({ detail: 'Could not delete the account.' }, { status: 500 });
    }

    // Clear the session cookies. The refresh_token row is already gone with the
    // user, but the browser would otherwise keep sending a cookie whose account
    // no longer exists.
    const response = NextResponse.json({ deleted: true }, { status: 200 });
    response.cookies.set('access_token', '', { expires: new Date(0), path: '/' });
    response.cookies.set('refresh_token', '', { expires: new Date(0), path: '/api/v1/auth/refresh' });
    return response;
  } catch (error) {
    console.error('Account deletion error:', error);
    return NextResponse.json({ detail: 'Could not delete the account. Please try again.' }, { status: 500 });
  }
}
