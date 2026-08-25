import { NextRequest, NextResponse } from "next/server";
import {
  researchReport,
  swotAnalysis,
  compareAnalysis,
  portfolioRiskAnalysis,
  watchlistDigest,
} from "@/server/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const type = body.type as string;

    switch (type) {
      case "report": {
        if (!body.symbol) return bad("symbol required");
        const result = await researchReport(String(body.symbol).toUpperCase());
        return ok(result);
      }
      case "swot": {
        if (!body.symbol) return bad("symbol required");
        const result = await swotAnalysis(String(body.symbol).toUpperCase());
        return ok(result);
      }
      case "compare": {
        if (!body.a || !body.b) return bad("a and b required");
        const result = await compareAnalysis(String(body.a).toUpperCase(), String(body.b).toUpperCase());
        return ok(result);
      }
      case "portfolio-risk": {
        if (!Array.isArray(body.holdings)) return bad("holdings required");
        const result = await portfolioRiskAnalysis(body.holdings);
        return ok(result);
      }
      case "watchlist-digest": {
        if (!Array.isArray(body.symbols)) return bad("symbols required");
        const result = await watchlistDigest(body.symbols.map((s: string) => String(s).toUpperCase()));
        return ok(result);
      }
      default:
        return bad("unknown analysis type");
    }
  } catch (err) {
    console.error("[api/ai/analysis]", err);
    return NextResponse.json({ success: false, error: "Analysis failed" }, { status: 500 });
  }
}

function ok(data: unknown) {
  return NextResponse.json({ success: true, data, updatedAt: new Date().toISOString() });
}

function bad(msg: string) {
  return NextResponse.json({ success: false, error: msg }, { status: 400 });
}
