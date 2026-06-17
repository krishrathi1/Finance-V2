import { NextRequest, NextResponse } from "next/server";
import { getJson, baseSymbol } from "@/lib/backend/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface NewsItem {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  summary: string;
  imageUrl: string | null;
  sentimentScore: number;
}

const POSITIVE_WORDS = [
  "surge",
  "surges",
  "rise",
  "rises",
  "rally",
  "gain",
  "gains",
  "jump",
  "jumps",
  "soar",
  "soars",
  "profit",
  "profits",
  "growth",
  "beats",
  "beat",
  "record",
  "high",
  "strong",
  "boost",
  "upgrade",
  "outperform",
  "bullish",
  "buy",
  "expansion",
  "win",
  "wins",
  "positive",
  "dividend",
  "approval",
  "approved",
];

const NEGATIVE_WORDS = [
  "fall",
  "falls",
  "drop",
  "drops",
  "plunge",
  "plunges",
  "slump",
  "decline",
  "declines",
  "loss",
  "losses",
  "weak",
  "miss",
  "misses",
  "downgrade",
  "cut",
  "cuts",
  "bearish",
  "sell",
  "fraud",
  "probe",
  "fine",
  "penalty",
  "lawsuit",
  "default",
  "risk",
  "warning",
  "concern",
  "concerns",
  "negative",
  "crash",
  "slide",
];

/** Simple lexicon-based sentiment in the 0..1 range (0.5 = neutral). */
function computeSentiment(text: string): number {
  const lower = String(text || "").toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const w of POSITIVE_WORDS) {
    if (lower.includes(w)) pos += 1;
  }
  for (const w of NEGATIVE_WORDS) {
    if (lower.includes(w)) neg += 1;
  }
  const total = pos + neg;
  if (total === 0) return 0.5;
  // Map net polarity (-1..1) onto 0..1, centered at 0.5.
  const net = (pos - neg) / total;
  const score = 0.5 + net * 0.4;
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const sym = baseSymbol(symbol);
  const company = request.nextUrl.searchParams.get("company")?.trim();
  const timestamp = new Date().toISOString();

  try {
    const apiKey = process.env.NEWS_API_KEY;
    const articles: NewsItem[] = [];
    const seen = new Set<string>();

    if (apiKey) {
      const query = `"${company || sym} India stock"`;
      const url =
        `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}` +
        `&language=en&sortBy=publishedAt&pageSize=12&apiKey=${apiKey}`;

      const payload = await getJson<any>(url, { timeoutMs: 9000, retries: 1 });
      const raw = Array.isArray(payload?.articles) ? payload.articles : [];

      for (const a of raw) {
        const u = String(a?.url || "");
        if (!u || seen.has(u)) continue;
        seen.add(u);
        const title = String(a?.title || "").trim();
        const summary = String(a?.description || a?.content || "").trim();
        if (!title) continue;
        articles.push({
          title,
          source: String(a?.source?.name || "News"),
          publishedAt: String(a?.publishedAt || timestamp),
          url: u,
          summary,
          imageUrl: a?.urlToImage || null,
          sentimentScore: computeSentiment(`${title} ${summary}`),
        });
      }
    }

    const sorted = articles
      .sort((x, y) => new Date(y.publishedAt).getTime() - new Date(x.publishedAt).getTime())
      .slice(0, 12);

    return NextResponse.json({
      data: sorted,
      symbol: sym.toUpperCase(),
      timestamp,
    });
  } catch (error) {
    console.error("[stock news] route error:", error);
    return NextResponse.json({
      data: [] as NewsItem[],
      symbol: sym.toUpperCase(),
      timestamp,
    });
  }
}
