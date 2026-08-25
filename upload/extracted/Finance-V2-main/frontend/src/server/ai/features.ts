/**
 * AI feature layer — a faithful port of:
 *   - backend/app/services/ai_adapter.py        (AIAdapter: prompts, parsing, fallbacks)
 *   - ai-engine/src/ai_engine/gemini_service.py (GeminiService: core prompt builders)
 *
 * Each exported function returns a structured object that includes a
 * `source: 'gemini' | 'fallback'` marker (the UI needs 'gemini' for real
 * answers). The EXACT prompt templates and the EXACT fallback structure/text
 * from the Python are preserved.
 *
 * GOLDEN RULE: none of these functions ever throw. They always return a valid
 * object, falling back to the deterministic offline structure when Gemini is
 * unavailable or fails.
 *
 * Behavioral notes vs. Python:
 *   - The Python guard `if self._gemini and settings.gemini_api_key` maps to
 *     `isGeminiConfigured()`.
 *   - `live_failed` in the Python fallbacks distinguishes "Gemini threw" (true)
 *     from "Gemini/api_key unavailable up front" (false). Here: if the key is
 *     not configured -> live_failed=false; if it is configured but the call
 *     returns null (timeout/error/empty) -> live_failed=true.
 */

import { SITE_NAME } from "@/shared/seo";

import { generateText, isGeminiConfigured } from "./gemini";

type AnyObj = Record<string, any>;

// ---------------------------------------------------------------------------
// Helpers (mirrors of Python coercion / formatting utilities)
// ---------------------------------------------------------------------------

function asObj(v: unknown): AnyObj {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyObj) : {};
}

function asArr(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}

/** Python float(x or 0.0) semantics: falsy -> 0.0, else Number or 0.0. */
function toFloatDefault(v: unknown, def = 0.0): number {
  if (v === null || v === undefined || v === "" || v === false) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/** True iff v is a finite number (Python `isinstance(x, (int, float))`). */
function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Python f"{x:.1f}" / .2f style fixed formatting. */
function fixed(n: number, digits: number): string {
  return n.toFixed(digits);
}

/** Python f"{x:,.0f}" — thousands separators, no decimals. */
function intComma(n: number): string {
  const rounded = Math.round(n);
  return rounded.toLocaleString("en-US");
}

/** Collapse all runs of whitespace to a single space (Python " ".join(s.split())). */
function collapseWs(s: string): string {
  return String(s ?? "").split(/\s+/).filter(Boolean).join(" ");
}

/**
 * Find every top-level balanced `{...}` object in `text`, honoring string
 * literals (so a `}` inside a quoted value doesn't end the match early).
 * Unlike a greedy `/\{[\s\S]*\}/` regex, each match stops at its own real
 * end instead of spanning to the last `}` in the whole response — a model
 * that appends any trailing text containing a stray `}` (a closing remark,
 * a nested example) no longer breaks parsing of an otherwise-valid reply.
 * Scanning continues after each match so multiple JSON blocks (e.g. a model
 * emitting a throwaway example before the real answer, or several fenced
 * code blocks) are all considered candidates rather than just the first.
 */
function findBalancedJsonTexts(text: string): string[] {
  const candidates: string[] = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("{", i);
    if (start === -1) break;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let j = start; j < text.length; j++) {
      const ch = text[j];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end === -1) break;
    candidates.push(text.slice(start, end + 1));
    i = end + 1;
  }
  return candidates;
}

/** First balanced `{...}` block's raw text, or null. See findBalancedJsonTexts. */
function extractBalancedJsonText(text: string): string | null {
  return findBalancedJsonTexts(text)[0] ?? null;
}

/**
 * Extract a JSON value from raw model text, then parse.
 * Without `pattern`, scans for every balanced top-level `{...}` block (the
 * common case — a possibly-nested JSON object) and returns the first one
 * that actually parses, instead of giving up when only the first block
 * happens to be malformed. `pattern` is only for the one feature that
 * intentionally expects a flat, non-nested object. Returns null when no
 * candidate parses.
 */
export function extractJson(raw: string, pattern?: RegExp): any {
  if (!raw) return null;
  if (pattern) {
    const candidate = raw.match(pattern)?.[0];
    if (!candidate) return null;
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  for (const candidate of findBalancedJsonTexts(raw)) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  return null;
}

// ===========================================================================
// FEATURE 2 — SWOT analysis
// ===========================================================================

interface SwotResult {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  bullCase: string;
  bearCase: string;
  generatedAt: string;
  source: "gemini" | "fallback";
}

export async function swotAnalysis(
  symbol: string,
  companyName: string,
  context: AnyObj = {},
): Promise<SwotResult> {
  const ctx = asObj(context);
  const generatedAt = new Date().toISOString();

  if (isGeminiConfigured()) {
    const raw = await generateText(buildSwotPrompt(symbol, companyName, ctx));
    if (raw) {
      const parsed = parseSwotJson(raw);
      if (parsed) {
        return { ...parsed, generatedAt, source: "gemini" };
      }
    }
  }
  return { ...fallbackSwot(symbol, ctx), generatedAt, source: "fallback" };
}

function buildSwotPrompt(symbol: string, companyName: string, context: AnyObj): string {
  const financials = asObj(context.financials);
  const hasFinancials = context.financials && typeof context.financials === "object" && !Array.isArray(context.financials);
  const compactContext = JSON.stringify({
    symbol: context.symbol ?? symbol,
    companyName: context.companyName ?? companyName,
    sector: context.sector ?? null,
    profile: context.profile ?? null,
    metrics: context.metrics ?? null,
    smartScore: context.smartScore ?? null,
    riskScore: context.riskScore ?? null,
    financials: hasFinancials
      ? {
          quarterly: asArr(financials.quarterly).slice(0, 4),
          yearly: asArr(financials.yearly).slice(0, 3),
        }
      : {},
    news: asArr(context.news).slice(0, 5),
  });
  return (
    // Named from SITE_NAME so the model never introduces itself to a user as a
    // product that doesn't exist — the model does echo this persona name back.
    `You are ${SITE_NAME}, a senior Indian stock market analyst.\n` +
    `Stock symbol: ${symbol}\n` +
    `Context JSON: ${compactContext}\n\n` +
    "Task: Generate a SWOT analysis and bull/bear case for this stock.\n" +
    "Return strict JSON only with these keys:\n" +
    '{"strengths": [string, ...], "weaknesses": [string, ...], ' +
    '"opportunities": [string, ...], "threats": [string, ...], ' +
    '"bullCase": string, "bearCase": string}\n' +
    "Rules:\n" +
    "1) Each SWOT list should have 2-4 concise bullet points.\n" +
    "2) bullCase and bearCase should each be 2-3 sentences.\n" +
    "3) Use simple, clear language suited for retail investors.\n" +
    "4) Base analysis on the provided context data only.\n" +
    "5) Do not give investment guarantees or specific price targets.\n" +
    "6) Return JSON only, no markdown."
  );
}

function parseSwotJson(raw: string):
  | { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[]; bullCase: string; bearCase: string }
  | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const candidate = extractBalancedJsonText(text) ?? text;
  let parsed: any;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const { strengths, weaknesses, opportunities, threats } = parsed;
  const bullCase = parsed.bullCase ?? "";
  const bearCase = parsed.bearCase ?? "";
  if (!(Array.isArray(strengths) && Array.isArray(weaknesses) && Array.isArray(opportunities) && Array.isArray(threats))) {
    return null;
  }
  return {
    strengths: strengths.map((s: any) => String(s)),
    weaknesses: weaknesses.map((w: any) => String(w)),
    opportunities: opportunities.map((o: any) => String(o)),
    threats: threats.map((t: any) => String(t)),
    bullCase: String(bullCase),
    bearCase: String(bearCase),
  };
}

function fallbackSwot(symbol: string, context: AnyObj): {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  bullCase: string;
  bearCase: string;
} {
  const smart = asObj(context.smartScore);
  const risk = asObj(context.riskScore);
  const metrics = asObj(context.metrics);
  const profile = asObj(context.profile);

  const sector = String(profile.sector ?? "its sector").trim() || "its sector";
  const pe = metrics.peRatio;
  const smartScore = toFloatDefault(smart.score, 0.0);
  const riskScore = toFloatDefault(risk.score, 0.0);

  const strengths = [
    `Established player in ${sector} with consistent market presence.`,
    "Listed on Indian exchanges with adequate trading liquidity.",
  ];
  if (smartScore >= 3.5) {
    strengths.push(`Strong Smart Score of ${fixed(smartScore, 1)}/5 indicates solid fundamentals.`);
  }

  const weaknesses = ["Detailed competitive positioning data is limited without AI analysis."];
  if (isNum(pe) && pe > 30) {
    weaknesses.push(`Valuation appears stretched with P/E of ${fixed(pe, 1)}.`);
  } else if (isNum(pe) && pe > 0) {
    weaknesses.push(`Current P/E of ${fixed(pe, 1)} needs monitoring relative to sector peers.`);
  }

  const opportunities = [
    "India's growing economy provides a positive macro backdrop.",
    "Potential for margin expansion with operational efficiency gains.",
  ];

  const threats = [
    "Macro slowdown or interest rate changes could impact performance.",
    "Sector-specific regulatory changes may affect operations.",
  ];
  if (riskScore >= 3.5) {
    threats.push(`Elevated risk score of ${fixed(riskScore, 1)}/5 suggests near-term caution.`);
  }

  const tone = smartScore >= 3.5 ? "positive" : smartScore >= 2.5 ? "neutral" : "cautious";
  const bullCase =
    `${symbol.toUpperCase()} benefits from a ${tone} fundamental picture. ` +
    "If the company sustains earnings growth and the sector cycle turns favorable, " +
    "the stock could re-rate meaningfully from current levels.";
  const bearCase =
    "If macro headwinds intensify or earnings disappoint, " +
    `${symbol.toUpperCase()} could see valuation compression. ` +
    "Monitor quarterly results and management commentary closely.";

  return { strengths, weaknesses, opportunities, threats, bullCase, bearCase };
}

// ===========================================================================
// FEATURE 4 — Smart-score explanation
// ===========================================================================

export async function explainSmartScore(
  symbol: string,
  score: number,
  dimensions: AnyObj = {},
  weakHint?: unknown,
): Promise<{ aiExplanation: string; source: "gemini" | "fallback" }> {
  // Reconstruct the context shape the Python builder expects.
  const context: AnyObj = { smartScore: { score, dimensions } };

  if (isGeminiConfigured()) {
    const raw = await generateText(buildSmartScorePrompt(symbol, context));
    if (raw) return { aiExplanation: raw, source: "gemini" };
  }

  const dims = asObj(dimensions);
  const sc = toFloatDefault(score, 0.0);
  const entries = Object.entries(dims);
  const top = [...entries].sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 2);
  const weak = [...entries].sort((a, b) => Number(a[1]) - Number(b[1])).slice(0, 1);
  const topText = top.length ? top.map(([name]) => String(name)).join(", ") : "key factors";
  const weakText = weak.length ? String(weak[0][0]) : "momentum";
  const setup = sc >= 4 ? "improving" : sc >= 2.5 ? "neutral" : "weak";

  const aiExplanation =
    `${symbol.toUpperCase()} has a Smart Score of ${fixed(sc, 1)} out of 5, so the overall picture is ${setup}. ` +
    `The stronger parts are ${topText}. ` +
    `The weak part is ${weakText}, so it is safer to invest slowly until this improves.`;
  return { aiExplanation, source: "fallback" };
}

function buildSmartScorePrompt(symbol: string, context: AnyObj): string {
  const smart = asObj(context.smartScore);
  const risk = asObj(context.riskScore);
  const metrics = asObj(context.metrics);
  const technicals = asObj(context.technicals);
  const returnsSummary = asArr(context.returnsSummary);
  const news = asArr(context.news);
  const brokerage = context.brokerageResearch;
  const compactContext = JSON.stringify({
    symbol: context.symbol ?? symbol,
    companyName: context.companyName ?? null,
    sector: context.sector ?? null,
    smartScore: {
      score: smart.score ?? null,
      score10: smart.score10 ?? null,
      dimensions: smart.dimensions ?? null,
    },
    riskScore: {
      score: risk.score ?? null,
      components: risk.components ?? null,
      label: risk.label ?? null,
    },
    brokerageSummary: brokerage && typeof brokerage === "object" && !Array.isArray(brokerage) ? (brokerage.summary ?? null) : {},
    metrics: {
      peRatio: metrics.peRatio ?? null,
      pbRatio: metrics.pbRatio ?? null,
      roe: metrics.roe ?? null,
      debtToEquity: metrics.debtToEquity ?? null,
      currentRatio: metrics.currentRatio ?? null,
    },
    technicals: {
      trend: technicals.trend ?? null,
      rsi14: technicals.rsi14 ?? null,
      macd: technicals.macd ?? null,
    },
    returnsSummary: returnsSummary.slice(0, 4),
    recentNews: news.slice(0, 4),
  });
  return (
    "You are a helpful stock explainer for beginners.\n" +
    `Stock symbol: ${symbol}\n` +
    `Context JSON: ${compactContext}\n\n` +
    "Task: Explain what this Smart Score means in very simple language.\n" +
    "Output rules:\n" +
    "1) Use simple words that a 12-year-old can understand.\n" +
    "2) 3 short sentences only.\n" +
    "3) Mention 2 good points and 1 caution.\n" +
    "3a) Use only the facts visible in the context JSON.\n" +
    "4) Replace finance jargon with simple words.\n" +
    "5) Do not use words like setup, allocation, position sizing, conviction, or drawdown.\n" +
    "6) Do not use markdown, bullets, or investment guarantees.\n" +
    "7) Keep under 70 words."
  );
}

// ===========================================================================
// FEATURE 5 — Risk-score explanation
// ===========================================================================

export async function explainRiskScore(
  symbol: string,
  score: number,
  components: AnyObj = {},
  highHint?: unknown,
): Promise<{ aiExplanation: string; source: "gemini" | "fallback" }> {
  const context: AnyObj = { riskScore: { score, components } };

  if (isGeminiConfigured()) {
    const raw = await generateText(buildRiskScorePrompt(symbol, context));
    if (raw) return { aiExplanation: raw, source: "gemini" };
  }

  const comps = asObj(components);
  const sc = toFloatDefault(score, 0.0);
  const entries = Object.entries(comps);
  const high = [...entries].sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 1);
  const low = [...entries].sort((a, b) => Number(a[1]) - Number(b[1])).slice(0, 1);
  const highText = high.length ? String(high[0][0]) : "market mood";
  const lowText = low.length ? String(low[0][0]) : "financial risk";
  const level = sc < 2 ? "low" : sc < 3.5 ? "medium" : "high";

  const aiExplanation =
    `${symbol.toUpperCase()} has a Risk Score of ${fixed(sc, 1)} out of 5, so risk is ${level}. ` +
    `The main risk now is ${highText}, while ${lowText} looks better. ` +
    "To stay safe, invest in small parts instead of all at once.";
  return { aiExplanation, source: "fallback" };
}

function buildRiskScorePrompt(symbol: string, context: AnyObj): string {
  const risk = asObj(context.riskScore);
  const smart = asObj(context.smartScore);
  const metrics = asObj(context.metrics);
  const technicals = asObj(context.technicals);
  const news = asArr(context.news);
  const brokerage = context.brokerageResearch;
  const compactContext = JSON.stringify({
    symbol: context.symbol ?? symbol,
    companyName: context.companyName ?? null,
    sector: context.sector ?? null,
    riskScore: {
      score: risk.score ?? null,
      components: risk.components ?? null,
      label: risk.label ?? null,
    },
    smartScore: {
      score: smart.score ?? null,
      dimensions: smart.dimensions ?? null,
    },
    brokerageSummary: brokerage && typeof brokerage === "object" && !Array.isArray(brokerage) ? (brokerage.summary ?? null) : {},
    metrics: {
      debtToEquity: metrics.debtToEquity ?? null,
      currentRatio: metrics.currentRatio ?? null,
      roa: metrics.roa ?? null,
    },
    technicals: {
      trend: technicals.trend ?? null,
      rsi14: technicals.rsi14 ?? null,
      macd: technicals.macd ?? null,
    },
    recentNews: news.slice(0, 4),
  });
  return (
    "You are a helpful stock explainer for beginners.\n" +
    `Stock symbol: ${symbol}\n` +
    `Context JSON: ${compactContext}\n\n` +
    "Task: Explain what this Risk Score means in very simple language.\n" +
    "Output rules:\n" +
    "1) Use simple words that a 12-year-old can understand.\n" +
    "2) 3 short sentences only.\n" +
    "3) Say if risk is low, medium, or high in plain words.\n" +
    "3a) Use only the facts visible in the context JSON.\n" +
    "4) Mention one main risk and one positive point.\n" +
    "5) Give one simple safety tip (for example: invest slowly).\n" +
    "6) Do not use markdown, bullets, or investment guarantees.\n" +
    "7) Keep under 70 words."
  );
}

// ===========================================================================
// FEATURE 6 — News analysis
// ===========================================================================

export async function newsAnalysis(
  symbol: string,
  article: AnyObj,
  context: AnyObj = {},
): Promise<{ overview: string; marketImpact: string; watchpoint: string; source: "gemini" | "fallback" }> {
  const art = asObj(article);
  const ctx = asObj(context);

  if (isGeminiConfigured()) {
    const raw = await generateText(buildNewsAnalysisPrompt(symbol, art, ctx));
    if (raw) {
      const parsed = parseNewsAnalysis(raw);
      if (parsed) {
        return { overview: parsed.overview, marketImpact: parsed.market_impact, watchpoint: parsed.watchpoint, source: "gemini" };
      }
    }
  }

  const offline = offlineNewsAnalysis(symbol, art);
  return { overview: offline.overview, marketImpact: offline.market_impact, watchpoint: offline.watchpoint, source: "fallback" };
}

function buildNewsAnalysisPrompt(symbol: string, article: AnyObj, context: AnyObj): string {
  const smart = context.smartScore;
  const risk = context.riskScore;
  const compactContext = JSON.stringify({
    symbol: context.symbol ?? symbol,
    companyName: context.companyName ?? null,
    sector: context.sector ?? null,
    smartScore: smart && typeof smart === "object" && !Array.isArray(smart) ? (smart.label ?? null) : null,
    riskScore: risk && typeof risk === "object" && !Array.isArray(risk) ? (risk.label ?? null) : null,
    article: {
      title: article.title ?? null,
      summary: article.summary ?? null,
      source: article.source ?? null,
      publishedAt: article.publishedAt ?? null,
      sentimentScore: article.sentimentScore ?? null,
    },
  });
  return (
    `You are ${SITE_NAME}, summarizing one stock news item for a retail investor.\n` +
    `Stock symbol: ${symbol}\n` +
    `Context JSON: ${compactContext}\n\n` +
    "Task: Return strict JSON only with these keys:\n" +
    '{"overview": string, "marketImpact": string, "watchpoint": string}\n' +
    "Rules:\n" +
    "1) Use only the facts visible in the context JSON.\n" +
    "2) Keep each field to 1 short sentence.\n" +
    "3) Use simple, clear language.\n" +
    "4) Do not give guarantees or price targets.\n" +
    "5) If the article is vague, say what is still unclear.\n" +
    "6) Return JSON only, no markdown."
  );
}

function parseNewsAnalysis(raw: string): { overview: string; market_impact: string; watchpoint: string } | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const candidate = extractBalancedJsonText(text) ?? text;
  let parsed: any;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const overview = collapseWs(String(parsed.overview ?? ""));
  const marketImpact = collapseWs(String(parsed.marketImpact ?? parsed.market_impact ?? ""));
  const watchpoint = collapseWs(String(parsed.watchpoint ?? ""));
  if (!(overview && marketImpact && watchpoint)) return null;
  return { overview, market_impact: marketImpact, watchpoint };
}

function offlineNewsAnalysis(symbol: string, article: AnyObj): { overview: string; market_impact: string; watchpoint: string } {
  const title = collapseWs(String(article.title ?? ""));
  const summary = collapseWs(String(article.summary ?? ""));
  const source = String(article.source ?? "the article").trim() || "the article";
  const sentimentValue = toFloatDefault(article.sentimentScore, 0.5);

  let tone: string;
  if (sentimentValue >= 0.6) {
    tone = "The tone looks broadly positive for the stock, but it still needs confirmation in future updates.";
  } else if (sentimentValue <= 0.45) {
    tone = "The tone looks cautious, so the market may focus on risks until management or results add clarity.";
  } else {
    tone = "The tone looks mixed, so this news alone is not enough to change the full stock view.";
  }

  let overview: string;
  if (summary) {
    overview = summary.length <= 180 ? summary : `${summary.slice(0, 177).replace(/\s+$/, "")}...`;
  } else if (title) {
    overview = `${source} reports: ${title}.`;
  } else {
    overview = `This update on ${symbol.toUpperCase()} is available, but the article details are limited.`;
  }

  const watchpoint =
    "Watch the next company filing, management comment, or quarterly result to see whether this headline changes earnings or risk.";

  return { overview, market_impact: tone, watchpoint };
}

// ===========================================================================
// FEATURE 7 — Competitor verdict
// ===========================================================================

export async function competitorVerdict(
  symbol: string,
  context: AnyObj = {},
): Promise<{ verdict: string; analysis: AnyObj; source: "gemini" | "fallback" }> {
  const ctx = asObj(context);
  const stockMetrics = asObj(ctx.stockMetrics ?? ctx.metrics);
  const peers = asArr(ctx.peers);

  const fmtPeer = (p: AnyObj): string =>
    `${p.name ?? p.symbol ?? "?"}: PE=${p.pe ?? "N/A"}, PB=${p.pb ?? "N/A"}, ROE=${p.roe ?? "N/A"}%, MCap=${p.marketCap ?? "N/A"}`;

  const peersText = peers.length
    ? peers
        .slice(0, 6)
        .map((p) => `- ${fmtPeer(asObj(p))}`)
        .join("\n")
    : "No peer data";
  const ownPe = stockMetrics.pe ?? stockMetrics.peRatio;
  const ownRoe = stockMetrics.roe ?? stockMetrics.returnOnEquity;
  const ownPb = stockMetrics.pb ?? stockMetrics.priceToBook;

  const question =
    `You are an expert Indian equity analyst. Compare ${symbol.toUpperCase()} against its peers.\n` +
    `${symbol.toUpperCase()}: PE=${ownPe}, PB=${ownPb}, ROE=${ownRoe}%\n` +
    `Peers:\n${peersText}\n\n` +
    "Respond with ONLY a JSON object with keys:\n" +
    "  winner (str: company name that looks best value right now),\n" +
    "  winnerReason (str: 1-2 sentences why),\n" +
    "  verdict (str: 2-3 sentence AI summary of the competitive landscape),\n" +
    "  subjectRating (str: 'Overvalued'|'Fairly Valued'|'Undervalued'),\n" +
    "  watchOut (str: 1 key risk for the subject stock vs peers).\n" +
    "Be direct and opinionated. No markdown.";

  if (isGeminiConfigured()) {
    const raw = await generateText(question);
    if (raw) {
      const parsed = extractJson(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.verdict) {
        return { verdict: String(parsed.verdict), analysis: parsed, source: "gemini" };
      }
    }
  }

  // Fallback: peer with the lowest PE (missing treated as 9999).
  let bestPeer: AnyObj | null = null;
  if (peers.length) {
    bestPeer = asObj(
      peers.reduce((best: AnyObj, p: AnyObj) => {
        const bestPe = toFloatDefault(asObj(best).pe, 9999);
        const pPe = toFloatDefault(asObj(p).pe, 9999);
        return pPe < bestPe ? p : best;
      }),
    );
  }
  const winner = bestPeer ? String(bestPeer.name ?? symbol) : symbol;
  const analysis = {
    winner,
    winnerReason: `${winner} shows the most attractive valuation metrics among peers.`,
    verdict:
      `${symbol.toUpperCase()} competes in a sector with ${peers.length} peers. ` +
      "AI analysis is offline — compare PE, ROE, and PB ratios manually to identify the best value.",
    subjectRating: "Fairly Valued",
    watchOut: "Monitor quarterly earnings and margin trends relative to peers.",
  };
  return { verdict: analysis.verdict, analysis, source: "fallback" };
}

// ===========================================================================
// FEATURE 8 — Earnings TL;DR
// ===========================================================================

export async function earningsTldr(
  symbol: string,
  context: AnyObj = {},
): Promise<{ summary: string; highlights: string[]; source: "gemini" | "fallback" }> {
  const ctx = asObj(context);
  const quarterlyData = asArr(ctx.quarterlyData ?? ctx.quarterly);
  const companyName = String(ctx.companyName ?? "");

  if (!quarterlyData.length) {
    return { summary: "No quarterly data available", highlights: [], source: "fallback" };
  }

  const recent = quarterlyData.slice(0, 4);

  const fmtQ = (q: AnyObj): string => {
    const rev = q.revenue ?? q.totalRevenue ?? 0;
    const profit = q.netProfit ?? q.profit ?? q.netIncome ?? 0;
    const period = q.period ?? q.date ?? "?";
    const revG = q.totalRevenueGrowthPct ?? q.revenueGrowth;
    const niG = q.netProfitGrowthPct ?? q.niGrowthPct ?? q.netIncomeGrowth;
    let gText = "";
    if (revG !== null && revG !== undefined) {
      const v = Number(revG);
      const shown = Math.round(v * 10) / 10;
      gText += ` RevGrowth=${shown}%`;
    }
    if (niG !== null && niG !== undefined) {
      const v = Number(niG);
      const shown = Math.round(v * 10) / 10;
      gText += ` ProfitGrowth=${shown}%`;
    }
    return `${period}: Revenue=${intComma(Number(rev) || 0)}, NetProfit=${intComma(Number(profit) || 0)}${gText}`;
  };

  const quartersText = recent.map((q) => `- ${fmtQ(asObj(q))}`).join("\n");
  const name = companyName || symbol;

  const question =
    `You are a senior equity research analyst. Summarize ${name}'s recent earnings for a retail investor.\n` +
    `Last 4 quarters:\n${quartersText}\n\n` +
    "Respond with ONLY a JSON object with keys:\n" +
    "  headline (str: punchy 10-word verdict on earnings quality),\n" +
    "  trend (str: 'Accelerating'|'Stable'|'Decelerating'|'Recovering'|'Declining'),\n" +
    "  toneColor (str: 'green'|'amber'|'red'),\n" +
    "  bullets (list of exactly 4 strings: key takeaways a retail investor needs to know),\n" +
    "  ceoSignal (str: what management's numbers are signalling — optimistic, cautious, or mixed),\n" +
    "  watchNext (str: the ONE thing to watch in the next quarterly result).\n" +
    "Be direct. No markdown. Numbers in Indian format (Cr, L).";

  if (isGeminiConfigured()) {
    const raw = await generateText(question);
    if (raw) {
      const parsed = extractJson(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.bullets) {
        const highlights = asArr(parsed.bullets).map((b: any) => String(b));
        return { summary: String(parsed.headline ?? ""), highlights, source: "gemini" };
      }
    }
  }

  // Rule-based fallback.
  const revenues = recent.map((q) => toFloatDefault(asObj(q).revenue ?? asObj(q).totalRevenue, 0));
  const profits = recent.map((q) => toFloatDefault(asObj(q).netProfit ?? asObj(q).profit ?? asObj(q).netIncome, 0));
  const revTrend = revenues.length >= 2 && revenues[0] > revenues[revenues.length - 1] ? "growing" : "declining";
  const profitTrend = profits.length >= 2 && profits[0] > profits[profits.length - 1] ? "improving" : "under pressure";
  // toneColor / trend retained for parity with Python output, surfaced via the object below.
  void (revTrend === "growing" && profitTrend === "improving" ? "green" : revTrend === "growing" ? "amber" : "red");

  const highlights = [
    `Revenue trend is ${revTrend} over the last 4 reported quarters.`,
    `Net profit is ${profitTrend} over the same period.`,
    "Check operating margins for business quality signals.",
    "Compare with sector peers before drawing conclusions.",
  ];
  const summary = `${name} revenue ${revTrend}, profits ${profitTrend}`;
  return { summary, highlights, source: "fallback" };
}

// ===========================================================================
// FEATURE 9 — Watchlist analysis
// ===========================================================================

export async function watchlistAnalysis(
  symbol: string,
  context: AnyObj = {},
): Promise<{ answer: string; source: "gemini" | "fallback" }> {
  const ctx = asObj(context);
  if (isGeminiConfigured()) {
    const raw = await generateText(buildWatchlistReviewPrompt(symbol, ctx));
    if (raw) return { answer: raw, source: "gemini" };
    return { answer: fallbackWatchlistReview(symbol, ctx, true), source: "fallback" };
  }
  return { answer: fallbackWatchlistReview(symbol, ctx, false), source: "fallback" };
}

function buildWatchlistReviewPrompt(symbol: string, context: AnyObj): string {
  const smart = asObj(context.smartScore);
  const risk = asObj(context.riskScore);
  const metrics = asObj(context.metrics);
  const technicals = asObj(context.technicals);
  const financials = asObj(context.financials);
  const brokerage = context.brokerageResearch;
  const compactContext = JSON.stringify({
    symbol: context.symbol ?? symbol,
    companyName: context.companyName ?? null,
    sector: context.sector ?? null,
    profile: context.profile ?? null,
    smartScore: { score: smart.score ?? null, label: smart.label ?? null, dimensions: smart.dimensions ?? null },
    riskScore: { score: risk.score ?? null, label: risk.label ?? null, components: risk.components ?? null },
    metrics: {
      peRatio: metrics.peRatio ?? null,
      pbRatio: metrics.pbRatio ?? null,
      roe: metrics.roe ?? null,
      roce: metrics.roce ?? null,
      debtToEquity: metrics.debtToEquity ?? null,
      currentRatio: metrics.currentRatio ?? null,
      dividendYield: metrics.dividendYield ?? null,
    },
    technicals: {
      trend: technicals.trend ?? null,
      rsi14: technicals.rsi14 ?? null,
      macd: technicals.macd ?? null,
      ema20: technicals.ema20 ?? null,
      ema50: technicals.ema50 ?? null,
    },
    financials:
      context.financials && typeof context.financials === "object" && !Array.isArray(context.financials)
        ? { quarterly: asArr(financials.quarterly).slice(0, 4), yearly: asArr(financials.yearly).slice(0, 3) }
        : {},
    news: asArr(context.news).slice(0, 5),
    brokerageSummary: brokerage && typeof brokerage === "object" && !Array.isArray(brokerage) ? (brokerage.summary ?? null) : {},
  });
  return (
    "You are the lead quantamental researcher at an elite investment fund covering Indian equities.\n" +
    "Think like a high-end buy-side analyst: skeptical, evidence-driven, and concise.\n" +
    "Use only the facts in the context JSON. Do not invent missing numbers. Do not give price targets or guarantees.\n" +
    `Stock symbol: ${symbol}\n` +
    `Context JSON: ${compactContext}\n\n` +
    "Task: Write a short watchlist review of what you think about this stock right now.\n" +
    "Output rules:\n" +
    "1) Plain text only, no markdown bullets or tables.\n" +
    "2) Use exactly these section labels on separate lines: Core view:, What supports it:, What can go wrong:, What changes my mind:, Bottom line:.\n" +
    "3) Each section must be 1-2 sentences.\n" +
    "4) Focus on quality, valuation regime, balance-sheet risk, factor profile, news flow, and trend confirmation.\n" +
    "5) If evidence is mixed, say so directly.\n" +
    "6) Keep the whole response under 220 words."
  );
}

function fallbackWatchlistReview(symbol: string, context: AnyObj, liveFailed: boolean): string {
  const smart = asObj(context.smartScore);
  const risk = asObj(context.riskScore);
  const metrics = asObj(context.metrics);
  const technicals = asObj(context.technicals);
  const news = asArr(context.news);

  const smartScore = toFloatDefault(smart.score, 0.0);
  const riskScore = toFloatDefault(risk.score, 0.0);
  const peRatio = metrics.peRatio;
  const roe = metrics.roe;
  const debtToEquity = metrics.debtToEquity;
  const trend = String(technicals.trend ?? "Neutral") || "Neutral";
  const rsi = technicals.rsi14;
  const recentNews = news.length;

  const qualityView = smartScore >= 3.5 ? "above average" : smartScore >= 2.5 ? "mixed" : "weak";
  const riskView = riskScore < 2.0 ? "contained" : riskScore < 3.5 ? "watchable" : "elevated";
  const valuationView =
    isNum(peRatio) && peRatio > 0
      ? `valuation is not obviously cheap with P/E near ${fixed(peRatio, 1)}`
      : "valuation needs more work because P/E context is incomplete";
  const qualityMetric = isNum(roe) ? `ROE is around ${fixed(roe, 1)}%` : "profit quality metrics are incomplete";
  const leverageView = isNum(debtToEquity)
    ? `debt-to-equity is about ${fixed(debtToEquity, 2)}`
    : "balance-sheet leverage needs confirmation";
  const momentumView = isNum(rsi)
    ? `trend reads ${trend.toLowerCase()} with RSI near ${fixed(rsi, 1)}`
    : `trend reads ${trend.toLowerCase()}`;
  const lead = liveFailed ? "Live quant review is temporarily unavailable." : "Fallback quant review.";

  return (
    `${lead}\n\n` +
    `Core view: ${symbol.toUpperCase()} screens as a ${qualityView} name with Smart Score ${fixed(smartScore, 1)}/5 and risk ${riskView} at ${fixed(riskScore, 1)}/5. ` +
    `My first read is that ${valuationView}.\n\n` +
    `What stands out: ${qualityMetric}, ${leverageView}, and ${momentumView}. ` +
    `News flow coverage is ${recentNews >= 3 ? "active" : "limited"}, which affects short-term conviction.\n\n` +
    "What can break the thesis: any slowdown in earnings quality, weaker margins, or a rise in balance-sheet stress will matter more than narrative. " +
    "If the stock is already expensive, even decent execution may not protect downside.\n\n" +
    "Bottom line: keep it on the watchlist if you can justify both valuation and business durability on the next review. " +
    "I would want stronger evidence on earnings consistency before treating it as a high-conviction position."
  );
}

// ===========================================================================
// FEATURE 10 — Compare analysis
// ===========================================================================

export async function compareAnalysis(
  symbolA: string,
  symbolB: string,
  context: AnyObj = {},
): Promise<{ answer: string; source: "gemini" | "fallback" }> {
  const ctx = asObj(context);
  const contextA = asObj(ctx.contextA ?? ctx.stockA ?? ctx.a);
  const contextB = asObj(ctx.contextB ?? ctx.stockB ?? ctx.b);

  if (isGeminiConfigured()) {
    const raw = await generateText(buildCompareAnalysisPrompt(symbolA, symbolB, contextA, contextB));
    if (raw) return { answer: raw, source: "gemini" };
    return { answer: fallbackCompareAnalysis(symbolA, symbolB, contextA, contextB, true), source: "fallback" };
  }
  return { answer: fallbackCompareAnalysis(symbolA, symbolB, contextA, contextB, false), source: "fallback" };
}

function compactCompare(ctx: AnyObj, fallbackSymbol: string): AnyObj {
  const smart = asObj(ctx.smartScore);
  const risk = asObj(ctx.riskScore);
  const metrics = asObj(ctx.metrics);
  const technicals = asObj(ctx.technicals);
  const financials = asObj(ctx.financials);
  const brokerage = ctx.brokerageResearch;
  return {
    symbol: ctx.symbol ?? fallbackSymbol,
    companyName: ctx.companyName ?? null,
    sector: ctx.sector ?? null,
    profile: ctx.profile ?? null,
    smartScore: { score: smart.score ?? null, label: smart.label ?? null, dimensions: smart.dimensions ?? null },
    riskScore: { score: risk.score ?? null, label: risk.label ?? null, components: risk.components ?? null },
    metrics: {
      peRatio: metrics.peRatio ?? null,
      pbRatio: metrics.pbRatio ?? null,
      roe: metrics.roe ?? null,
      roce: metrics.roce ?? null,
      debtToEquity: metrics.debtToEquity ?? null,
      currentRatio: metrics.currentRatio ?? null,
      dividendYield: metrics.dividendYield ?? null,
      marketCap: metrics.marketCap ?? null,
      revenueGrowth: metrics.revenueGrowth ?? null,
      profitGrowth: metrics.profitGrowth ?? null,
      operatingMargin: metrics.operatingMargin ?? null,
      netMargin: metrics.netMargin ?? null,
    },
    technicals: {
      trend: technicals.trend ?? null,
      rsi14: technicals.rsi14 ?? null,
      macd: technicals.macd ?? null,
      ema20: technicals.ema20 ?? null,
      ema50: technicals.ema50 ?? null,
    },
    financials:
      ctx.financials && typeof ctx.financials === "object" && !Array.isArray(ctx.financials)
        ? { quarterly: asArr(financials.quarterly).slice(0, 4), yearly: asArr(financials.yearly).slice(0, 3) }
        : {},
    news: asArr(ctx.news).slice(0, 4),
    brokerageSummary: brokerage && typeof brokerage === "object" && !Array.isArray(brokerage) ? (brokerage.summary ?? null) : {},
  };
}

function buildCompareAnalysisPrompt(symbolA: string, symbolB: string, contextA: AnyObj, contextB: AnyObj): string {
  const compactContext = JSON.stringify({
    stockA: compactCompare(contextA, symbolA),
    stockB: compactCompare(contextB, symbolB),
  });
  return (
    "You are the lead quantamental researcher at an elite investment fund covering Indian equities.\n" +
    "Write like a high-end buy-side analyst: direct, skeptical, evidence-based, and decisive.\n" +
    "Use only the facts in the context JSON. Do not invent numbers. Do not give price targets or guarantees.\n" +
    `Compare ${symbolA.toUpperCase()} versus ${symbolB.toUpperCase()}.\n` +
    `Context JSON: ${compactContext}\n\n` +
    "Task: Produce a short comparative AI summary for the user.\n" +
    "Output rules:\n" +
    "1) Plain text only, no markdown bullets or tables.\n" +
    "2) Use exactly these section labels on separate lines: Winner right now:, Why:, What still worries me:, Best fit for:, Bottom line:.\n" +
    "3) Each section must be 1-2 sentences.\n" +
    "4) Judge on quality, valuation regime, risk, trend confirmation, and resilience of the setup.\n" +
    "5) If the answer is close, say it is close instead of forcing a strong winner.\n" +
    "6) Keep the full response under 230 words."
  );
}

function fallbackCompareAnalysis(
  symbolA: string,
  symbolB: string,
  contextA: AnyObj,
  contextB: AnyObj,
  liveFailed: boolean,
): string {
  const scoreBundle = (ctx: AnyObj) => {
    const metrics = asObj(ctx.metrics);
    const smart = asObj(ctx.smartScore);
    const risk = asObj(ctx.riskScore);
    const technicals = asObj(ctx.technicals);
    const trendStr = String(technicals.trend ?? "").toLowerCase();
    return {
      smart: toFloatDefault(smart.score, 0.0),
      risk: toFloatDefault(risk.score, 0.0),
      roe: toFloatDefault(metrics.roe, 0.0),
      roce: toFloatDefault(metrics.roce, 0.0),
      pe: toFloatDefault(metrics.peRatio, 0.0),
      debt: toFloatDefault(metrics.debtToEquity, 0.0),
      rev_growth: toFloatDefault(metrics.revenueGrowth, 0.0),
      profit_growth: toFloatDefault(metrics.profitGrowth, 0.0),
      trend_up: ["bullish", "uptrend", "positive"].includes(trendStr) ? 1.0 : 0.0,
    };
  };

  const a = scoreBundle(contextA);
  const b = scoreBundle(contextB);

  const composite = (s: ReturnType<typeof scoreBundle>): number => {
    const quality = s.smart * 1.6 + s.roe * 0.04 + s.roce * 0.04;
    const growth = s.rev_growth * 0.04 + s.profit_growth * 0.04;
    const riskPenalty = s.risk * 0.8 + Math.max(s.debt, 0.0) * 0.15;
    const valuationPenalty = s.pe > 0 ? s.pe * 0.02 : 0.0;
    const trendBonus = s.trend_up * 0.5;
    return quality + growth + trendBonus - riskPenalty - valuationPenalty;
  };

  const scoreA = composite(a);
  const scoreB = composite(b);
  const winner = scoreA > scoreB + 0.35 ? symbolA.toUpperCase() : scoreB > scoreA + 0.35 ? symbolB.toUpperCase() : "Close call";
  const lead = liveFailed ? "Live compare analysis is temporarily unavailable." : "Fallback compare analysis.";

  let why: string;
  let fit: string;
  if (winner === "Close call") {
    why =
      `Both names screen close on the current factor mix. ${symbolA.toUpperCase()} looks better on some quality or trend inputs, ` +
      `while ${symbolB.toUpperCase()} offsets that on valuation or risk.`;
    fit = `${symbolA.toUpperCase()} suits a user leaning toward relative quality, while ${symbolB.toUpperCase()} may suit someone prioritizing cheaper entry or lower explicit risk.`;
  } else if (winner === symbolA.toUpperCase()) {
    why =
      `${symbolA.toUpperCase()} has the cleaner combined profile on Smart Score, quality, growth support, and near-term setup, ` +
      `while ${symbolB.toUpperCase()} needs more justification on either valuation or resilience.`;
    fit = `${symbolA.toUpperCase()} fits a higher-conviction watchlist slot right now. ${symbolB.toUpperCase()} is still usable for value hunters if they have a specific thesis.`;
  } else {
    why =
      `${symbolB.toUpperCase()} has the cleaner combined profile on quality, valuation discipline, risk control, or setup, ` +
      `while ${symbolA.toUpperCase()} looks less efficient on the current evidence.`;
    fit = `${symbolB.toUpperCase()} fits a higher-conviction watchlist slot right now. ${symbolA.toUpperCase()} is more suited to users willing to underwrite extra uncertainty.`;
  }

  const riskLine =
    "The main uncertainty is that one or both setups may be paying up for quality without enough earnings confirmation. " +
    "I would also want to re-check balance-sheet stress and whether the recent trend is durable rather than just noisy.";
  const bottom =
    winner !== "Close call"
      ? `If I had to rank them today, I would place ${winner} first.`
      : `I would not force a strong winner between ${symbolA.toUpperCase()} and ${symbolB.toUpperCase()} until the next fundamental or trend confirmation comes through.`;

  return (
    `${lead}\n\n` +
    `Winner right now: ${winner}.\n` +
    `Why: ${why}\n` +
    `What still worries me: ${riskLine}\n` +
    `Best fit for: ${fit}\n` +
    `Bottom line: ${bottom}`
  );
}

// ===========================================================================
// FEATURE 11 — Portfolio risk
// ===========================================================================

export async function portfolioRisk(
  holdings: AnyObj[],
): Promise<{
  overallRisk: string;
  riskScore: number;
  diversificationScore: number;
  sectorConcentration: string;
  topRisks: string[];
  recommendations: string[];
  summary: string;
  source: "gemini" | "fallback";
}> {
  const list = asArr(holdings).slice(0, 20);
  if (!list.length) {
    return {
      overallRisk: "",
      riskScore: 0,
      diversificationScore: 0,
      sectorConcentration: "",
      topRisks: [],
      recommendations: [],
      summary: "No holdings provided",
      source: "fallback",
    };
  }

  const totalValue = list.reduce((sum, h) => sum + toFloatDefault(asObj(h).currentValue || asObj(h).investedValue, 0), 0);
  const holdingsText = list
    .map((h) => {
      const obj = asObj(h);
      const value = toFloatDefault(obj.currentValue || obj.investedValue, 0);
      const weight = toFloatDefault(obj.weight, 0);
      return `- ${obj.symbol}: ₹${intComma(value)} (${fixed(weight, 1)}%), sector=${obj.sector ?? "Unknown"}, beta=${obj.beta ?? "N/A"}`;
    })
    .join("\n");

  const prompt =
    "You are a portfolio risk analyst for Indian equity markets. " +
    "Analyze this portfolio and respond with a JSON object with these keys:\n" +
    "  overallRisk (str: Low/Medium/High), riskScore (float 0-10), " +
    "diversificationScore (float 0-10), " +
    "sectorConcentration (str: brief description), " +
    "topRisks (list of 3 str), " +
    "recommendations (list of 3 str), " +
    "summary (str: 2-3 sentences).\n" +
    `Portfolio (total ₹${intComma(totalValue)}):\n${holdingsText}\n` +
    "Respond with ONLY raw JSON, no markdown.";

  if (isGeminiConfigured()) {
    const raw = await generateText(prompt);
    if (raw) {
      const parsed = extractJson(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.summary) {
        return {
          overallRisk: String(parsed.overallRisk ?? ""),
          riskScore: isNum(parsed.riskScore) ? parsed.riskScore : 0,
          diversificationScore: isNum(parsed.diversificationScore) ? parsed.diversificationScore : 0,
          sectorConcentration: String(parsed.sectorConcentration ?? ""),
          topRisks: asArr(parsed.topRisks).map((r: any) => String(r)),
          recommendations: asArr(parsed.recommendations).map((r: any) => String(r)),
          summary: String(parsed.summary ?? ""),
          source: "gemini",
        };
      }
    }
  }

  const fb = fallbackPortfolioRisk(list);
  return { ...fb, source: "fallback" };
}

function fallbackPortfolioRisk(holdings: AnyObj[]): {
  overallRisk: string;
  riskScore: number;
  diversificationScore: number;
  sectorConcentration: string;
  topRisks: string[];
  recommendations: string[];
  summary: string;
} {
  const sectors = holdings.map((h) => String(asObj(h).sector ?? "Unknown"));
  const uniqueSectors = new Set(sectors).size;
  const n = holdings.length;
  const largestWeight = holdings.reduce((max, h) => Math.max(max, toFloatDefault(asObj(h).weight, 0)), 0);
  const concentration = largestWeight > 40 ? "concentrated" : largestWeight > 25 ? "moderate" : "diversified";

  const divScore = Math.min(10, uniqueSectors * 1.5 + n * 0.5);
  const riskScore = largestWeight > 40 ? 10 - divScore : 5.0;

  // most-common sector (Python max(set(sectors), key=sectors.count))
  let topSector = "Unknown";
  let topCount = -1;
  for (const s of new Set(sectors)) {
    const c = sectors.filter((x) => x === s).length;
    if (c > topCount) {
      topCount = c;
      topSector = s;
    }
  }

  const round1 = (x: number) => Math.round(x * 10) / 10;

  return {
    overallRisk: riskScore > 7 ? "High" : riskScore > 4 ? "Medium" : "Low",
    riskScore: round1(riskScore),
    diversificationScore: round1(divScore),
    sectorConcentration:
      sectors.filter((x) => x === topSector).length > Math.floor(n / 2) ? `Heavy in ${topSector}` : `${uniqueSectors} sectors`,
    topRisks: [
      `Portfolio is ${concentration} — top holding is ${fixed(largestWeight, 0)}% of total`,
      "Sector correlation may amplify drawdowns in a market downturn",
      "Monitor quarterly earnings for all holdings regularly",
    ],
    recommendations: [
      `Consider diversifying across ${Math.max(0, 5 - uniqueSectors)} more sectors`,
      "Add defensive sectors (FMCG/Pharma) if not already present",
      "Review any holding above 30% weight for trimming opportunity",
    ],
    summary:
      `Your portfolio of ${n} stocks spans ${uniqueSectors} sector(s) with a ` +
      `${concentration} allocation profile. The largest holding is ${fixed(largestWeight, 0)}% of the total. ` +
      "Consider rebalancing to reduce concentration risk and improve long-term resilience.",
  };
}

// ===========================================================================
// FEATURE 12 — Portfolio roast
// ===========================================================================

export async function portfolioRoast(
  holdings: AnyObj[],
  totalValue?: number,
): Promise<{
  grade: string;
  gradeBadge: string;
  roast: string;
  praiseOne: string;
  topRed: string;
  topGreen: string;
  fixes: string[];
  verdict: string;
  source: "gemini" | "fallback";
}> {
  const list = asArr(holdings);
  if (!list.length) {
    return {
      grade: "",
      gradeBadge: "",
      roast: "No holdings to analyse",
      praiseOne: "",
      topRed: "",
      topGreen: "",
      fixes: [],
      verdict: "",
      source: "fallback",
    };
  }

  const n = list.length;
  const total = toFloatDefault(totalValue, 0);
  const holdingsText = list
    .slice(0, 20)
    .map((h) => {
      const obj = asObj(h);
      const cv = obj.currentValue;
      const cvText = isNum(cv) ? intComma(cv) : String(cv ?? "?");
      const pnl = toFloatDefault(obj.pnl, 0);
      const sign = pnl >= 0 ? "+" : "";
      return (
        `- ${obj.symbol}: ${obj.quantity ?? "?"} shares @ avg ₹${obj.avgPrice ?? "?"}, ` +
        `current value ₹${cvText}, ` +
        `P&L: ${sign}${obj.pnl ?? "?"}`
      );
    })
    .join("\n");

  const prompt =
    "You are a witty but expert Indian stock market analyst. " +
    `The user has ${n} stocks worth ₹${intComma(total)} total. ` +
    "Analyse their portfolio and give honest, slightly roast-y but constructive feedback.\n" +
    `Holdings:\n${holdingsText}\n\n` +
    "Respond with ONLY a JSON object with these keys:\n" +
    "  grade (str: 'S'|'A'|'B'|'C'|'D'|'F'),\n" +
    "  gradeBadge (str: e.g. 'Balanced Beginner' or 'Concentration King' or 'Value Hunter'),\n" +
    "  roast (str: 1-2 funny but true sentences about what's wrong — be honest but not cruel),\n" +
    "  praiseOne (str: 1 thing they did right),\n" +
    "  topRed (str: the single most dangerous holding and why),\n" +
    "  topGreen (str: the single best holding and why),\n" +
    "  fixes (list of 3 str: specific actionable improvements),\n" +
    "  verdict (str: 2-sentence overall portfolio health summary).\n" +
    "Be opinionated, specific, and direct. No markdown.";

  if (isGeminiConfigured()) {
    const raw = await generateText(prompt);
    if (raw) {
      const parsed = extractJson(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.roast) {
        return {
          grade: String(parsed.grade ?? ""),
          gradeBadge: String(parsed.gradeBadge ?? ""),
          roast: String(parsed.roast ?? ""),
          praiseOne: String(parsed.praiseOne ?? ""),
          topRed: String(parsed.topRed ?? ""),
          topGreen: String(parsed.topGreen ?? ""),
          fixes: asArr(parsed.fixes).map((f: any) => String(f)),
          verdict: String(parsed.verdict ?? ""),
          source: "gemini",
        };
      }
    }
  }

  // Fallback
  const losers = list.filter((h) => toFloatDefault(asObj(h).pnl, 0) < 0);
  const winners = list.filter((h) => toFloatDefault(asObj(h).pnl, 0) > 0);
  const grade = losers.length < n * 0.2 ? "A" : losers.length < n * 0.4 ? "B" : "C";
  const gradeBadges: Record<string, string> = {
    A: "Balanced Beginner", B: "Steady Holder", C: "Value Hunter", D: "Concentration King", F: "Chaos Agent",
  };

  const byPnlAsc = [...list].sort((a, b) => toFloatDefault(asObj(a).pnl, 0) - toFloatDefault(asObj(b).pnl, 0));
  const byPnlDesc = [...list].sort((a, b) => toFloatDefault(asObj(b).pnl, 0) - toFloatDefault(asObj(a).pnl, 0));
  const topRedSym = byPnlAsc.length ? String(asObj(byPnlAsc[0]).symbol ?? "N/A") : "N/A";
  const topGreenSym = byPnlDesc.length ? String(asObj(byPnlDesc[0]).symbol ?? "N/A") : "N/A";

  return {
    grade,
    gradeBadge: gradeBadges[grade] ?? "Portfolio Holder",
    roast: `You have ${losers.length} losers out of ${n} stocks. Either the market hates you, or you have a gift for buying tops.`,
    praiseOne: `You have ${winners.length} winning positions — not bad.`,
    topRed: `${topRedSym} — largest drag on portfolio.`,
    topGreen: `${topGreenSym} — your top performer.`,
    fixes: [
      "Review your losing positions — cut or average down with conviction, not hope.",
      "Ensure no single stock exceeds 20% of portfolio value.",
      "Add 1-2 defensive plays (FMCG/Pharma) to reduce beta.",
    ],
    verdict: `${n} stocks, ${winners.length} winners and ${losers.length} losers. Grade: ${grade}.`,
    source: "fallback",
  };
}

// ===========================================================================
// FEATURE 13 — Profile enrichment
// ===========================================================================

export async function extractProfileDetails(
  symbol: string,
  companyName: string,
  description: string,
): Promise<{
  incorporationYear: number | null;
  headquarters: string | null;
  chairman: string | null;
  previousName: string | null;
  source: "gemini" | "fallback";
}> {
  const empty = {
    incorporationYear: null,
    headquarters: null,
    chairman: null,
    previousName: null,
  };

  if (isGeminiConfigured()) {
    const context: AnyObj = { companyName, profile: { description } };
    const raw = await generateText(buildProfilePrompt(symbol, context));
    if (raw) {
      // Mirror Python: extract_profile_details returns the RAW string; caller
      // parses. Here we parse leniently and emit the typed fields.
      const candidate = extractBalancedJsonText(raw) ?? raw;
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return {
            incorporationYear: isNum(parsed.incorporationYear) ? parsed.incorporationYear : null,
            headquarters: parsed.headquarters != null ? String(parsed.headquarters) : null,
            chairman: parsed.chairman != null ? String(parsed.chairman) : null,
            previousName: parsed.previousName != null ? String(parsed.previousName) : null,
            source: "gemini",
          };
        }
      } catch {
        // fall through to fallback
      }
    }
  }
  return { ...empty, source: "fallback" };
}

function buildProfilePrompt(symbol: string, context: AnyObj): string {
  const profile = context.profile;
  const compactContext = JSON.stringify({
    symbol: context.symbol ?? symbol,
    companyName: context.companyName ?? null,
    sector: context.sector ?? null,
    profile: context.profile ?? null,
    description: profile && typeof profile === "object" && !Array.isArray(profile) ? (profile.description ?? "") : "",
  });
  return (
    "You are extracting company profile facts for an Indian listed stock.\n" +
    `Stock symbol: ${symbol}\n` +
    `Context JSON: ${compactContext}\n\n` +
    "Task: Return only strict JSON with these keys:\n" +
    '{"incorporationYear": number|null, "headquarters": string|null, "chairman": string|null, "previousName": string|null}\n' +
    "Rules:\n" +
    "1) Use the existing context first.\n" +
    "2) If a field is uncertain, use null.\n" +
    "3) Do not invent facts.\n" +
    "4) Return JSON only, no markdown."
  );
}

// ===========================================================================
// FEATURE 14 — IPO ai-analysis
// ===========================================================================

export async function ipoAiAnalysis(
  symbol: string,
  context: AnyObj = {},
): Promise<{
  verdict: string;
  verdictColor: string;
  summary: string;
  keyStrengths: string[];
  keyRisks: string[];
  valuation: string;
  listingOutlook: string;
  whoShouldApply: string;
  quickTake: string;
  source: "gemini" | "fallback";
}> {
  const ctx = asObj(context);
  const ipoData = asObj(ctx.ipoData ?? ctx);
  const company = String(ctx.company ?? ipoData.company ?? "");

  const priceRange = ipoData.priceRange || "N/A";
  const marketCap = ipoData.marketCap || "N/A";
  const exchange = ipoData.exchange || "NSE/BSE";
  const actions = ipoData.actions || "";
  const date = ipoData.date || "N/A";
  const shares = ipoData.shares || "N/A";

  const prompt =
    "You are an expert Indian equity analyst. Analyse this IPO and give a concise verdict.\n\n" +
    "IPO Details:\n" +
    `- Company: ${company}\n` +
    `- Symbol: ${symbol}\n` +
    `- Exchange: ${exchange}\n` +
    `- Listing Date: ${date}\n` +
    `- Price Range: ${priceRange}\n` +
    `- Issue Size: ${marketCap}\n` +
    `- Total Shares: ${shares}\n` +
    `- Issue Type: ${actions}\n\n` +
    "Respond ONLY with valid JSON in this exact structure:\n" +
    "{\n" +
    '  "verdict": "Subscribe / Avoid / Neutral",\n' +
    '  "verdictColor": "green / red / yellow",\n' +
    '  "summary": "2-3 sentence plain English overview of this IPO",\n' +
    '  "keyStrengths": ["strength 1", "strength 2", "strength 3"],\n' +
    '  "keyRisks": ["risk 1", "risk 2", "risk 3"],\n' +
    '  "valuation": "Brief comment on whether the IPO pricing looks fair, expensive, or cheap based on the price range",\n' +
    '  "listingOutlook": "Short-term listing gain expectation — bullish / neutral / cautious",\n' +
    '  "whoShouldApply": "Type of investor this suits — long-term / listing gain / avoid",\n' +
    '  "quickTake": "One punchy sentence that sums up the entire IPO for a busy investor"\n' +
    "}";

  if (isGeminiConfigured()) {
    const raw = await generateText(prompt);
    if (raw) {
      const parsed = extractJson(raw);
      const required = ["verdict", "summary", "keyStrengths", "keyRisks", "listingOutlook", "quickTake"];
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && required.every((k) => k in parsed)) {
        return {
          verdict: String(parsed.verdict ?? ""),
          verdictColor: String(parsed.verdictColor ?? ""),
          summary: String(parsed.summary ?? ""),
          keyStrengths: asArr(parsed.keyStrengths).map((s: any) => String(s)),
          keyRisks: asArr(parsed.keyRisks).map((r: any) => String(r)),
          valuation: String(parsed.valuation ?? ""),
          listingOutlook: String(parsed.listingOutlook ?? ""),
          whoShouldApply: String(parsed.whoShouldApply ?? ""),
          quickTake: String(parsed.quickTake ?? ""),
          source: "gemini",
        };
      }
    }
  }

  // Fallback
  return {
    verdict: "Neutral",
    verdictColor: "yellow",
    summary: `${company} is coming to market at ${priceRange}. Investors should review the DRHP for business fundamentals before subscribing.`,
    keyStrengths: [
      "Accessing public capital markets for growth",
      "Exchange listing improves liquidity and price discovery",
      "Brand visibility increases post-listing",
    ],
    keyRisks: [
      "Market conditions may affect listing performance",
      "Post-IPO lock-in expiry could cause price volatility",
      "Limited trading history as a listed entity",
    ],
    valuation: `Price range ${priceRange} needs to be evaluated against sector peers and growth prospects before drawing conclusions.`,
    listingOutlook: "neutral",
    whoShouldApply: "Investors with medium-to-long term horizon who have reviewed the business fundamentals",
    quickTake: `Approach ${company}'s IPO with caution — do your own research before subscribing.`,
    source: "fallback",
  };
}

// ===========================================================================
// FEATURE 15 — AI screener parsing
// ===========================================================================

export async function parseScreenerQuery(
  query: string,
): Promise<{ filters: AnyObj; source: "gemini" | "fallback" }> {
  const prompt =
    "You are a stock screener assistant for Indian markets (NSE/BSE). " +
    "Convert the user's natural language query into a JSON object with ONLY these optional keys:\n" +
    "  exchange (str, default 'NSE'), sector (str), market_cap_min (float, in USD), " +
    "market_cap_max (float, in USD), pe_min (float), pe_max (float), " +
    "price_min (float), price_max (float), dividend_min (float, percent), " +
    "volume_min (float), limit (int, default 50).\n" +
    "Rules: Market cap 500 Cr ≈ 60000000 USD. Only include keys the user mentions. " +
    "Sector must be one of: Technology, Finance, Healthcare, Consumer, Energy, " +
    "Industrials, Materials, Utilities, Real Estate, Telecom, Auto.\n" +
    "Respond with ONLY raw JSON, no markdown, no explanation.\n" +
    `Query: "${query}"`;

  if (isGeminiConfigured()) {
    const raw = await generateText(prompt);
    if (raw) {
      const parsed = extractJson(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        Object.keys(parsed).length > 0
      ) {
        return { filters: parsed, source: "gemini" };
      }
    }
  }
  return { filters: ruleBasedScreenerParse(query), source: "fallback" };
}

function ruleBasedScreenerParse(query: string): AnyObj {
  const q = String(query ?? "").toLowerCase();
  const params: AnyObj = {};
  const sectorMap: Array<[string, string]> = [
    ["it", "Technology"],
    ["tech", "Technology"],
    ["software", "Technology"],
    ["bank", "Finance"],
    ["banking", "Finance"],
    ["finance", "Finance"],
    ["nbfc", "Finance"],
    ["pharma", "Healthcare"],
    ["health", "Healthcare"],
    ["hospital", "Healthcare"],
    ["fmcg", "Consumer"],
    ["consumer", "Consumer"],
    ["energy", "Energy"],
    ["power", "Energy"],
    ["oil", "Energy"],
    ["auto", "Auto"],
    ["automobile", "Auto"],
    ["real estate", "Real Estate"],
    ["realty", "Real Estate"],
    ["telecom", "Telecom"],
  ];
  for (const [kw, sector] of sectorMap) {
    if (q.includes(kw)) {
      params.sector = sector;
      break;
    }
  }
  const peMatch = q.match(/pe\s*(under|below|less\s*than|<)\s*(\d+)/);
  if (peMatch) params.pe_max = parseFloat(peMatch[2]);
  const divMatch = q.match(/dividend\s*(above|over|>|greater\s*than)\s*(\d+(?:\.\d+)?)\s*%?/);
  if (divMatch) params.dividend_min = parseFloat(divMatch[2]);
  if (q.includes("large cap") || q.includes("largecap")) {
    params.market_cap_min = 2_400_000_000;
  } else if (q.includes("mid cap") || q.includes("midcap")) {
    params.market_cap_min = 600_000_000;
    params.market_cap_max = 2_400_000_000;
  } else if (q.includes("small cap") || q.includes("smallcap")) {
    params.market_cap_min = 60_000_000;
    params.market_cap_max = 600_000_000;
  }
  return params;
}

// ===========================================================================
// FEATURE 16 — Watchlist digest
// ===========================================================================

export type WatchlistDigestEntry = {
  symbol: string;
  companyName?: string | null;
  cmp?: number | null;
  changePercent?: number | null;
  peRatio?: number | null;
};

export interface WatchlistDigestResult {
  headline: string;
  movers: Array<{ symbol: string; note: string }>;
  themes: string[];
  focusList: Array<{ symbol: string; reason: string }>;
  summary: string;
  source: "gemini" | "fallback";
}

/**
 * A single AI brief across an entire watchlist, rather than one stock at a
 * time (see FEATURE 9). Surfaces what moved and why, cross-stock themes, and
 * a ranked shortlist of what deserves attention right now — the read a buy-
 * side analyst would give before a desk stand-up, not N separate reports.
 */
export async function watchlistDigest(
  listName: string,
  entries: WatchlistDigestEntry[],
): Promise<WatchlistDigestResult> {
  const list = asArr(entries)
    .map((e) => asObj(e))
    .filter((e) => typeof e.symbol === "string" && e.symbol)
    .slice(0, 25) as WatchlistDigestEntry[];

  if (!list.length) {
    return {
      headline: "Your watchlist is empty",
      movers: [],
      themes: [],
      focusList: [],
      summary: "Add a few stocks to this list to get an AI digest of what's moving and what to check first.",
      source: "fallback",
    };
  }

  if (isGeminiConfigured()) {
    const raw = await generateText(buildWatchlistDigestPrompt(listName, list));
    if (raw) {
      const parsed = parseWatchlistDigest(raw);
      if (parsed) return { ...parsed, source: "gemini" };
    }
  }
  return { ...fallbackWatchlistDigest(list), source: "fallback" };
}

function buildWatchlistDigestPrompt(listName: string, entries: WatchlistDigestEntry[]): string {
  const rows = entries
    .map((e) => {
      const parts = [`${e.symbol.toUpperCase()}`];
      if (e.companyName) parts.push(`name=${e.companyName}`);
      if (isNum(e.cmp)) parts.push(`cmp=${fixed(e.cmp, 2)}`);
      if (isNum(e.changePercent)) parts.push(`change=${e.changePercent >= 0 ? "+" : ""}${fixed(e.changePercent, 2)}%`);
      if (isNum(e.peRatio)) parts.push(`pe=${fixed(e.peRatio, 1)}`);
      return `- ${parts.join(", ")}`;
    })
    .join("\n");

  return (
    "You are the lead quantamental researcher at an elite investment fund, giving a short pre-market " +
    "briefing to a colleague on their personal watchlist. Be direct, skeptical, and concise. " +
    "Use only the facts given below. Do not invent numbers, news, or price targets, and do not give guarantees.\n" +
    `Watchlist: "${listName}" (${entries.length} stocks)\n${rows}\n\n` +
    "Task: Return strict JSON only with these keys:\n" +
    '{"headline": string, ' +
    '"movers": [{"symbol": string, "note": string}, ...], ' +
    '"themes": [string, ...], ' +
    '"focusList": [{"symbol": string, "reason": string}, ...], ' +
    '"summary": string}\n' +
    "Rules:\n" +
    "1) headline: one punchy sentence capturing the state of this watchlist right now.\n" +
    "2) movers: the 2-4 stocks with the largest moves, each with a one-sentence note on likely why (price action only, no invented news).\n" +
    "3) themes: 1-3 short bullet phrases on what the list has in common (sector tilt, valuation stance, risk-on/off skew) — omit if the list is too small or mixed to say anything meaningful.\n" +
    "4) focusList: rank up to 3 symbols worth checking first today, each with a one-sentence reason.\n" +
    "5) summary: 2-3 sentences tying it together, written for someone about to open the app.\n" +
    "6) Return JSON only, no markdown."
  );
}

function parseWatchlistDigest(raw: string): Omit<WatchlistDigestResult, "source"> | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const candidate = extractBalancedJsonText(text) ?? text;
  let parsed: any;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const headline = collapseWs(String(parsed.headline ?? ""));
  const summary = collapseWs(String(parsed.summary ?? ""));
  if (!headline || !summary) return null;
  const movers = asArr(parsed.movers)
    .map((m) => asObj(m))
    .filter((m) => m.symbol)
    .map((m) => ({ symbol: String(m.symbol), note: collapseWs(String(m.note ?? "")) }));
  const focusList = asArr(parsed.focusList)
    .map((f) => asObj(f))
    .filter((f) => f.symbol)
    .map((f) => ({ symbol: String(f.symbol), reason: collapseWs(String(f.reason ?? "")) }));
  const themes = asArr(parsed.themes).map((t) => collapseWs(String(t))).filter(Boolean);
  return { headline, movers, themes, focusList, summary };
}

function fallbackWatchlistDigest(entries: WatchlistDigestEntry[]): Omit<WatchlistDigestResult, "source"> {
  const withMoves = entries.filter((e) => isNum(e.changePercent));
  const ranked = [...withMoves].sort((a, b) => Math.abs(b.changePercent!) - Math.abs(a.changePercent!));

  const movers = ranked.slice(0, 3).map((e) => ({
    symbol: e.symbol.toUpperCase(),
    note: `${e.changePercent! >= 0 ? "Up" : "Down"} ${fixed(Math.abs(e.changePercent!), 2)}% today.`,
  }));

  const gainers = withMoves.filter((e) => e.changePercent! > 0).length;
  const losers = withMoves.filter((e) => e.changePercent! < 0).length;
  const tone = gainers > losers ? "mostly green" : losers > gainers ? "mostly red" : "mixed";

  const highPe = entries.filter((e) => isNum(e.peRatio) && e.peRatio! > 40).length;
  const themes: string[] = [];
  if (highPe >= Math.max(2, Math.ceil(entries.length / 2))) {
    themes.push("Several names are trading at rich valuations (P/E above 40).");
  }

  const focusList = ranked.slice(0, 3).map((e) => ({
    symbol: e.symbol.toUpperCase(),
    reason: `Largest move on the list today (${e.changePercent! >= 0 ? "+" : ""}${fixed(e.changePercent!, 2)}%).`,
  }));

  const headline = `Your list is ${tone} today across ${entries.length} stock${entries.length === 1 ? "" : "s"}.`;
  const summary =
    `${gainers} up, ${losers} down out of ${entries.length} tracked. ` +
    (movers.length
      ? `${movers[0].symbol} is moving the most — check it first, then confirm the rest against news before acting.`
      : "No live price moves are available right now — check back once the market data loads.");

  return { headline, movers, themes, focusList, summary };
}

// ===========================================================================
// FEATURE 16 — Research report
// ===========================================================================

/**
 * Long-form research note for a single stock.
 *
 * The `/api/v1/stocks/[symbol]/research-report` route has imported this since
 * it was added, but the function was never written — so the module failed to
 * typecheck and CI could not go green on main. The route only ever supplies a
 * light context (`symbol`, optional `companyName`, optional
 * `metrics.peRatio`), so this stays deliberately undemanding about input and
 * always returns a usable shape, matching the "never 500" contract the route
 * documents.
 */
export async function researchReport(
  symbol: string,
  context: AnyObj = {},
): Promise<{
  title: string;
  report: string;
  recommendations: string[];
  targetPrice: number | null;
  riskLevel: "low" | "medium" | "high";
  source: "gemini" | "fallback";
}> {
  const ctx = asObj(context);
  const companyName = String(ctx.companyName ?? "").trim();
  const name = companyName || symbol.toUpperCase();
  const metrics = asObj(ctx.metrics);
  const peRatio = metrics.peRatio === null || metrics.peRatio === undefined ? null : toFloatDefault(metrics.peRatio, 0);
  const title = `${name} Research Report`;

  const peLine = peRatio !== null && peRatio > 0 ? `Trailing P/E is ${fixed(peRatio, 2)}.` : "Trailing P/E is unavailable.";

  const question =
    `You are a senior equity research analyst writing a note on ${name} (${symbol.toUpperCase()}), listed in India.\n` +
    `Known context: ${peLine}\n\n` +
    "Respond with ONLY a JSON object with keys:\n" +
    "  report (str: 3 short paragraphs — business overview, what the valuation implies, what to watch),\n" +
    "  recommendations (list of 3-5 strings: concrete, actionable checks for a retail investor),\n" +
    "  targetPrice (number or null: only if you can justify one from the context, else null),\n" +
    "  riskLevel (str: 'low'|'medium'|'high').\n" +
    "Be specific and balanced — no hype, no markdown. Numbers in Indian format (Cr, L).";

  if (isGeminiConfigured()) {
    const raw = await generateText(question);
    if (raw) {
      const parsed = extractJson(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.report) {
        const level = String(parsed.riskLevel ?? "").toLowerCase();
        return {
          title,
          report: String(parsed.report),
          recommendations: asArr(parsed.recommendations).map((r: any) => String(r)),
          targetPrice:
            parsed.targetPrice === null || parsed.targetPrice === undefined
              ? null
              : toFloatDefault(parsed.targetPrice, 0) || null,
          riskLevel: level === "low" || level === "high" ? level : "medium",
          source: "gemini",
        };
      }
    }
  }

  // Rule-based fallback. P/E is the only quantitative input the route passes,
  // so it is the only thing this claims anything about.
  const valuation =
    peRatio === null || peRatio <= 0
      ? "Valuation cannot be assessed without a trailing P/E."
      : peRatio > 40
        ? `At a P/E of ${fixed(peRatio, 2)} the market is pricing in sustained high growth, which leaves little room for disappointment.`
        : peRatio < 15
          ? `A P/E of ${fixed(peRatio, 2)} is undemanding — worth checking whether it reflects value or a structural problem.`
          : `A P/E of ${fixed(peRatio, 2)} is broadly in line with the market, so returns likely track earnings delivery.`;

  const report = [
    `${name} trades on the Indian market under ${symbol.toUpperCase()}.`,
    valuation,
    "Read this alongside the quarterly results, peer comparison, and shareholding sections on this page before acting — an automated note is a starting point, not a recommendation.",
  ].join("\n\n");

  return {
    title,
    report,
    recommendations: [
      "Compare the P/E against sector peers rather than the broad index.",
      "Check revenue and profit direction across the last four quarters.",
      "Review debt and interest cover before sizing any position.",
      "Confirm promoter and institutional holding trends for conviction.",
    ],
    targetPrice: null,
    riskLevel: peRatio !== null && peRatio > 40 ? "high" : "medium",
    source: "fallback",
  };
}
