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
    if (!raw || raw.trim().length < 32) {
      throw new Error(
        'JWT_SECRET_KEY must be set to a random value of at least 32 characters. ' +
          'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"'
      );
    }
    cachedJwtSecret = new TextEncoder().encode(raw);
  }
  return cachedJwtSecret;
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
    const [key, value] = cookie.trim().split('=');
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});

  return cookies.access_token || null;
}
