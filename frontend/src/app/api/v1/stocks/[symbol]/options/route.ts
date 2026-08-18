import { NextRequest, NextResponse } from "next/server";
import { generateOptionChain } from "@/server/domain/options-chain";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  try {
    const symbol = params.symbol || "NIFTY";
    const { searchParams } = new URL(request.url);
    const spot = parseFloat(searchParams.get("spot") || "0") || 2400;

    const data = generateOptionChain(symbol, spot);
    return NextResponse.json({
      status: "success",
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: error?.message || "Failed to generate option chain" },
      { status: 500 }
    );
  }
}
