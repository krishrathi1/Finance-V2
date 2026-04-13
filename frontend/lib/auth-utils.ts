import bcrypt from 'bcryptjs';
import * as jose from 'jose';
import crypto from 'crypto';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET_KEY || 'your-secret-key-change-in-production-32-chars-minimum'
);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createAccessToken(userId: number, isAdmin: boolean, tier: string): string {
  const token = jose.SignJWT({ sub: String(userId), admin: isAdmin, tier })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30m');

  return token.sign(JWT_SECRET);
}

export async function createRefreshToken(): Promise<{ raw: string; hash: string }> {
  const raw = crypto.randomBytes(48).toString('base64url');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export async function verifyAccessToken(token: string): Promise<any> {
  try {
    const verified = await jose.jwtVerify(token, JWT_SECRET);
    return verified.payload;
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
