import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  return NextResponse.json(
    { detail: `Auth endpoint ${pathname} not found` },
    { status: 404 }
  );
}

export async function POST(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  return NextResponse.json(
    { detail: `Auth endpoint ${pathname} not found` },
    { status: 404 }
  );
}
