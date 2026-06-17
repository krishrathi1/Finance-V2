import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  return NextResponse.json(
    { detail: `Stocks endpoint ${request.nextUrl.pathname} is not implemented` },
    { status: 404 }
  );
}

export async function POST(request: NextRequest) {
  return NextResponse.json(
    { detail: `Stocks endpoint ${request.nextUrl.pathname} is not implemented` },
    { status: 404 }
  );
}
