import bcrypt from 'bcryptjs';
import * as jose from 'jose';
import crypto from 'crypto';

let cachedJwtSecret: Uint8Array | null = null;

// Resolved lazily (not at module load) so `next build` can evaluate route
// modules without the secret; any runtime sign/verify without a real secret
// fails loudly instead of silently using a forgeable fallback.
function getJwtSecret(): Uint8Array {
  if (!cachedJwtSecret) {
    const raw = process.env.JWT_SECRET_KEY;
    const normalized = raw?.trim() || '';
    const obviousPlaceholder = /^(change|replace|your|example|placeholder|secret|development|test)/i.test(normalized);
    const uniqueCharacters = new Set(normalized).size;
    if (normalized.length < 32 || obviousPlaceholder || uniqueCharacters < 12) {
      throw new Error(
        'JWT_SECRET_KEY must be set to a random value of at least 32 characters. ' +
          'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"'
      );
    }
    cachedJwtSecret = new TextEncoder().encode(normalized);
  }
  return cachedJwtSecret;
}

/**
 * Trim + lowercase an email before it's used in a lookup or stored.
 * MySQL's default collation is case-insensitive, so case mismatches mostly
 * don't break lookups on their own — but untrimmed whitespace does, and
 * without this, a user who registers via one path (trimmed) and later logs
 * in / resets a password via a route that queries the raw submitted value
 * (any incidental leading/trailing whitespace from copy-paste or mobile
 * autofill) can silently fail to match.
 */
export function normalizeEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createAccessToken(userId: number, isAdmin: boolean, tier: string): Promise<string> {
  const token = new jose.SignJWT({ sub: String(userId), admin: isAdmin, tier })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30m');

  return await token.sign(getJwtSecret());
}

export async function createRefreshToken(): Promise<{ raw: string; hash: string }> {
  const raw = crypto.randomBytes(48).toString('base64url');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export async function verifyAccessToken(token: string): Promise<any> {
  try {
    const verified = await jose.jwtVerify(token, getJwtSecret());
    return verified.payload;
  } catch (error) {
    return null;
  }
}

export async function createVerificationToken(userId: number): Promise<string> {
  const token = new jose.SignJWT({ sub: String(userId), type: 'email_verification' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h');

  return await token.sign(getJwtSecret());
}

export async function createPasswordResetToken(userId: number, otpRecordId: number): Promise<string> {
  return new jose.SignJWT({ sub: String(userId), type: 'password_reset', otpRecordId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('5m')
    .sign(getJwtSecret());
}

export async function verifyPasswordResetToken(
  token: string
): Promise<{ userId: number; otpRecordId: number } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getJwtSecret());
    const userId = Number(payload.sub);
    const otpRecordId = Number(payload.otpRecordId);
    if (
      payload.type !== 'password_reset' ||
      !Number.isInteger(userId) ||
      !Number.isInteger(otpRecordId)
    ) {
      return null;
    }
    return { userId, otpRecordId };
  } catch {
    return null;
  }
}

/** Returns the user id from a valid email-verification token, or null. */
export async function verifyEmailToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getJwtSecret());
    if (payload.type !== 'email_verification' || !payload.sub) return null;
    const userId = Number(payload.sub);
    return Number.isInteger(userId) ? userId : null;
  } catch (error) {
    return null;
  }
}

export function getAccessTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').reduce((acc: Record<string, string>, cookie) => {
    // Split on the FIRST '=' only — a naive split('=') truncates any value
    // containing '=' (e.g. base64 padding) at the first occurrence.
    const idx = cookie.indexOf('=');
    if (idx === -1) return acc;
    const key = cookie.slice(0, idx).trim();
    const value = cookie.slice(idx + 1).trim();
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});

  return cookies.access_token || null;
}
