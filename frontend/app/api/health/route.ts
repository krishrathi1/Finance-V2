import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'financial-forensics-frontend' });
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}
