import { NextRequest, NextResponse } from 'next/server';

import { requireActiveUser } from '@/lib/current-user';
import { query } from '@/server/infrastructure/db';

export const dynamic = 'force-dynamic';

/**
 * Data portability export (DPDP Act, 2023 — right of access).
 *
 * Returns everything we hold that is tied to the requesting account, as a
 * downloadable JSON file. The privacy policy commits to this, so it exists as
 * a real endpoint rather than a mailto: promise a user has to trust.
 *
 * Deliberately excluded: `password_hash` and the refresh/reset token hashes.
 * Exporting them would hand an attacker who obtains one export file the
 * material to attack the password offline or replay a live session — and none
 * of it is data the user supplied or can act on.
 */
export async function GET(request: NextRequest) {
  const auth = await requireActiveUser(request);
  if ('error' in auth) return auth.error;

  const { user } = auth;

  try {
    const [portfolios, watchlists, premiumRequests] = await Promise.all([
      query(
        'SELECT symbol, quantity, buy_price, sector, added_at, updated_at FROM portfolios WHERE user_id = ? ORDER BY added_at',
        [user.id]
      ),
      query(
        'SELECT symbol, exchange, added_at FROM watchlists WHERE user_id = ? ORDER BY added_at',
        [user.id]
      ),
      query(
        'SELECT status, reason, requested_at, updated_at FROM premium_requests WHERE user_id = ? ORDER BY requested_at',
        [user.id]
      ),
    ]);

    const payload = {
      exported_at: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email,
        name: user.name,
        tier: user.tier,
        email_verified: Boolean(user.verified_email),
        created_at: user.created_at,
      },
      portfolio: Array.isArray(portfolios) ? portfolios : [],
      watchlist: Array.isArray(watchlists) ? watchlists : [],
      premium_requests: Array.isArray(premiumRequests) ? premiumRequests : [],
      notes:
        'Price alerts are stored only in your browser and are not included here. ' +
        'Security credentials (password hash, session tokens) are intentionally excluded.',
    };

    // Content-Disposition makes the browser save this rather than render it,
    // so a plain link works as a download without any client-side blob juggling.
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="mystockvision-data-${user.id}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Data export error:', error);
    return NextResponse.json({ detail: 'Could not export your data. Please try again.' }, { status: 500 });
  }
}
