import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Docker's healthcheck (docker-compose.prod.yml) relies on this to decide
// whether to keep routing traffic to a container — returning "ok"
// unconditionally meant a DB outage or missing required config would never
// mark the container unhealthy.
async function isDatabaseReachable(): Promise<boolean> {
  try {
    await Promise.race([
      getPool().query('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('db health check timed out')), 3000)),
    ]);
    return true;
  } catch {
    return false;
  }
}

function hasRequiredConfig(): boolean {
  return (process.env.JWT_SECRET_KEY?.trim().length ?? 0) >= 32;
}

export async function GET() {
  const [dbOk, configOk] = [await isDatabaseReachable(), hasRequiredConfig()];
  if (!dbOk || !configOk) {
    return NextResponse.json(
      {
        status: 'error',
        service: 'financial-forensics-frontend',
        database: dbOk ? 'ok' : 'unreachable',
        config: configOk ? 'ok' : 'missing/invalid JWT_SECRET_KEY',
      },
      { status: 503 }
    );
  }
  return NextResponse.json({ status: 'ok', service: 'financial-forensics-frontend' });
}

export async function HEAD() {
  const ok = (await isDatabaseReachable()) && hasRequiredConfig();
  return new Response(null, { status: ok ? 200 : 503 });
}
