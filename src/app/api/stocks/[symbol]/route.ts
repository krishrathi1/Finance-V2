import { NextRequest, NextResponse } from "next/server";
import { loadDashboard } from "@/server/analytics/dashboard";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const data = loadDashboard(symbol);
    if (!data) {
      return NextResponse.json(
        { success: false, error: `Stock "${symbol}" not found in the universe` },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[api/stocks/[symbol]]", err);
    return NextResponse.json({ success: false, error: "Failed to load dashboard" }, { status: 500 });
  }
}
