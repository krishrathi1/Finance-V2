import { NextRequest, NextResponse } from "next/server";
import { ipoAiAnalysis } from "@/lib/backend/ai/features";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const sym = String(symbol || "").trim();

  try {
    // Optional context hints from the query string (company name, price range, etc.)
    const sp = request.nextUrl.searchParams;
    const context: Record<string, any> = {};
    const company = sp.get("company");
    const priceRange = sp.get("priceRange");
    const marketCap = sp.get("marketCap");
    const exchange = sp.get("exchange");
    const date = sp.get("date");
    if (company) context.company = company;
    if (priceRange) context.priceRange = priceRange;
    if (marketCap) context.marketCap = marketCap;
    if (exchange) context.exchange = exchange;
    if (date) context.date = date;

    const result = await ipoAiAnalysis(sym, context);

    return NextResponse.json({
      verdict: result.verdict,
      verdictColor: result.verdictColor,
      summary: result.summary,
      keyStrengths: result.keyStrengths,
      keyRisks: result.keyRisks,
      valuation: result.valuation,
      listingOutlook: result.listingOutlook,
      whoShouldApply: result.whoShouldApply,
      quickTake: result.quickTake,
      source: result.source,
    });
  } catch (error) {
    console.error("[ipo ai-analysis] route error:", error);
    return NextResponse.json({
      verdict: "Neutral",
      verdictColor: "yellow",
      summary:
        "AI analysis unavailable. Please review the DRHP and sector peers before making a subscription decision.",
      keyStrengths: ["Public listing improves brand visibility", "Access to growth capital"],
      keyRisks: [
        "Market volatility may affect listing performance",
        "Post-listing lock-in expiry risk",
      ],
      valuation: "Compare price-to-earnings with listed sector peers to assess fairness.",
      listingOutlook: "neutral",
      whoShouldApply: "Long-term investors with high risk tolerance",
      quickTake: "Do thorough research before subscribing to this IPO.",
      source: "fallback",
    });
  }
}
