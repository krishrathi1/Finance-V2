// AI layer — all features powered by z-ai-web-dev-sdk (server-side only),
// each with a deterministic fallback so the UI never breaks.

import ZAI from "z-ai-web-dev-sdk";
import { loadDashboard } from "../analytics/dashboard";
import { getMarketNews } from "../market/news";

async function complete(system: string, user: string): Promise<string | null> {
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: system },
        { role: "user", content: user },
      ],
      thinking: { type: "disabled" },
    });
    const content = completion.choices[0]?.message?.content;
    if (!content || content.trim().length === 0) return null;
    return content;
  } catch (err) {
    console.error("[ai] completion failed:", err);
    return null;
  }
}

export interface CopilotMessage {
  role: "user" | "assistant";
  content: string;
}

const COPILOT_SYSTEM = `You are the Forensic Copilot on MyStockVision, an institutional-grade Indian equity research platform.
You analyse NSE/BSE stocks with a forensic, numbers-first approach. Use ₹, Cr and Lakh units naturally.
Answer in crisp markdown: short paragraphs, bold key numbers, bullet lists where useful. Never give financial advice
without caveats. If the user asks about a stock outside the provided context, reason from general knowledge but say
you lack live data for it. Keep answers under 300 words unless asked for depth.`;

export async function copilotReply(
  history: CopilotMessage[],
  contextSymbol?: string | null
): Promise<{ answer: string; source: "ai" | "fallback" }> {
  let contextBlock = "";
  if (contextSymbol) {
    const d = loadDashboard(contextSymbol);
    if (d) {
      contextBlock = `\n\n[Live context — ${d.symbol} (${d.companyName})]
Price: ₹${d.quote.price} (${d.quote.changePercent >= 0 ? "+" : ""}${d.quote.changePercent}% today)
Market Cap: ₹${(d.metrics.marketCapCr / 100000).toFixed(2)}L Cr | PE: ${d.metrics.pe ?? "n/a"} | PB: ${d.metrics.pb} | ROE: ${d.metrics.roe}% | D/E: ${d.metrics.debtEquity}
52W range: ₹${d.quote.low52}–₹${d.quote.high52} | 1Y return: ${d.technicals.return1Y}%
Smart Score: ${d.smartScore.score}/5 (${d.smartScore.label}) | dimensions: ${JSON.stringify(d.smartScore.dimensions)}
Risk Score: ${d.riskScore.score}/5 (${d.riskScore.label}) | components: ${JSON.stringify(d.riskScore.components)}
Forensics: M-Score ${d.forensics.mScore} (${d.forensics.mScoreRisk}), Altman Z ${d.forensics.zScore} (${d.forensics.zZone}), Piotroski F ${d.forensics.fScore}/9
Technicals: RSI ${d.technicals.rsi14}, trend ${d.technicals.trend}, vol(3M) ${d.technicals.volatility3M}%
Recent news headlines: ${d.news.slice(0, 4).map((n) => `"${n.title}"`).join("; ")}`;
    }
  }

  const messages = [...history].slice(-10);
  const userTurn = messages[messages.length - 1]?.content ?? "";
  const priorTurns = messages.slice(0, -1).map((m) => `${m.role === "user" ? "User" : "You"}: ${m.content}`).join("\n");

  const prompt = `${priorTurns ? priorTurns + "\n\n" : ""}User: ${userTurn}${contextBlock}`;

  const answer = await complete(COPILOT_SYSTEM, prompt);
  if (answer) return { answer, source: "ai" };

  return {
    answer:
      `I couldn't reach the AI service just now, but here's the deterministic read:\n\n` +
      (contextSymbol
        ? `**${contextSymbol}** context is loaded — ask me about scores, forensics or technicals and I'll answer from the local engine once the AI link is back.`
        : `Ask me anything about NSE/BSE stocks — Smart Scores, forensic flags, portfolio construction or market breadth — and I'll answer once the AI link is back.`),
    source: "fallback",
  };
}

export async function researchReport(symbol: string): Promise<{ report: string; source: "ai" | "fallback" }> {
  const d = loadDashboard(symbol);
  if (!d) return { report: "Stock not found.", source: "fallback" };

  const system = `You are an equity research analyst at a tier-1 Indian brokerage. Write a compact research note in markdown
with sections: ## Investment View, ## Business Snapshot, ## Score Card (Smart Score + Risk with one-line reads), ## Forensic Check (M-Score/Z-Score/F-Score interpretation),
## Valuation, ## Key Risks, ## Verdict (one paragraph, include a clear stance: Constructive / Neutral / Cautious). Use the provided live data. Be specific with numbers. Max ~450 words.`;

  const user = `Write the research note for ${d.companyName} (${d.symbol}).
Price ₹${d.quote.price} (${d.quote.changePercent}%), market cap ₹${(d.metrics.marketCapCr / 100000).toFixed(2)}L Cr, sector ${d.sector}/${d.industry}.
PE ${d.metrics.pe}, PB ${d.metrics.pb}, ROE ${d.metrics.roe}%, ROCE ${d.metrics.roce}%, D/E ${d.metrics.debtEquity}, div yield ${d.metrics.dividendYield}%.
Smart Score ${d.smartScore.score}/5 ${d.smartScore.label} (dims: ${JSON.stringify(d.smartScore.dimensions)}).
Risk Score ${d.riskScore.score}/5 ${d.riskScore.label}.
Forensics: M-Score ${d.forensics.mScore} (${d.forensics.mScoreRisk}), Altman Z ${d.forensics.zScore} (${d.forensics.zZone}), Piotroski F ${d.forensics.fScore}/9.
Technicals: RSI ${d.technicals.rsi14}, trend ${d.technicals.trend}, 1Y return ${d.technicals.return1Y}%, drawdown from 1Y peak ${d.technicals.drawdown1Y}%.
52W ₹${d.quote.low52}–₹${d.quote.high52}. AI target ₹${d.aiTarget}.
Yearly: revenue ₹${d.yearly[d.yearly.length - 1].revenue} Cr, net profit ₹${d.yearly[d.yearly.length - 1].netProfit} Cr, growth: sales ${d.metrics.salesGrowth}%, profit ${d.metrics.profitGrowth}%.
Governance flags: ${d.forensics.governanceFlags.join(" | ")}`;

  const report = await complete(system, user);
  if (report) return { report, source: "ai" };

  // Deterministic fallback report
  const stance = d.smartScore.score >= 4 ? "Constructive" : d.smartScore.score >= 2.5 ? "Neutral" : "Cautious";
  return {
    report: `## Investment View\n**${stance}.** ${d.companyName} scores **${d.smartScore.score}/5** on Smart Score (${d.smartScore.label}) with risk at **${d.riskScore.score}/5** (${d.riskScore.label}).\n\n## Business Snapshot\n${d.profile.description}\n\n## Score Card\n- Profitability ${d.smartScore.dimensions.profitability}/5, Growth ${d.smartScore.dimensions.growth}/5, Valuation ${d.smartScore.dimensions.valuation}/5, Momentum ${d.smartScore.dimensions.momentum}/5, Health ${d.smartScore.dimensions.financialHealth}/5\n- Risk components: sentiment ${d.riskScore.components.sentiment}/5, financial ${d.riskScore.components.financialRisk}/5, narrative ${d.riskScore.components.narrativeRisk}/5, technical ${d.riskScore.components.technicalRisk}/5\n\n## Forensic Check\nM-Score ${d.forensics.mScore} (${d.forensics.mScoreRisk} manipulation risk), Altman Z ${d.forensics.zScore} (${d.forensics.zZone} zone), Piotroski F ${d.forensics.fScore}/9 (${d.forensics.fStrength}).\n\n## Valuation\nTrades at PE ${d.metrics.pe ?? "n/a"}, PB ${d.metrics.pb}, with ROE ${d.metrics.roe}% and D/E ${d.metrics.debtEquity}. AI fair-value estimate: ₹${d.aiTarget} vs CMP ₹${d.quote.price}.\n\n## Key Risks\n${d.forensics.governanceFlags.slice(0, 3).map((f) => `- ${f}`).join("\n")}\n\n## Verdict\n${stance === "Constructive" ? "Quality bias in the numbers supports accumulation on weakness." : stance === "Neutral" ? "Wait for a better entry or clearer catalysts before adding." : "The score profile argues for caution — size positions accordingly."} This is generated analysis, not investment advice.`,
    source: "fallback",
  };
}

export async function swotAnalysis(symbol: string): Promise<{ swot: string; source: "ai" | "fallback" }> {
  const d = loadDashboard(symbol);
  if (!d) return { swot: "Stock not found.", source: "fallback" };

  const system = `Return ONLY valid JSON (no markdown fences) with this exact shape:
{"strengths":["..."],"weaknesses":["..."],"opportunities":["..."],"threats":["..."],"bullCase":"...","bearCase":"..."}
Each array has exactly 3 short strings (max 12 words each). bullCase/bearCase are one sentence each.`;

  const user = `SWOT for ${d.companyName} (${d.symbol}), ${d.sector}/${d.industry}.
PE ${d.metrics.pe}, ROE ${d.metrics.roe}%, ROCE ${d.metrics.roce}%, D/E ${d.metrics.debtEquity}, growth: sales ${d.metrics.salesGrowth}% profit ${d.metrics.profitGrowth}%.
Smart Score ${d.smartScore.score}/5 with dims ${JSON.stringify(d.smartScore.dimensions)}. Risk ${d.riskScore.score}/5.
Trend ${d.technicals.trend}, RSI ${d.technicals.rsi14}, 1Y return ${d.technicals.return1Y}%.
F-Score ${d.forensics.fScore}/9, Z-Score ${d.forensics.zScore}.`;

  const raw = await complete(system, user);
  if (raw) {
    try {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return { swot: JSON.stringify(parsed), source: "ai" };
    } catch {
      // fall through to fallback
    }
  }

  const s = d.smartScore.dimensions;
  const swot = {
    strengths: [
      `ROE of ${d.metrics.roe}% with ROCE ${d.metrics.roce}%`,
      s.profitability >= 3 ? "Consistently profitable operations" : "Established market position",
      s.financialHealth >= 3 ? "Comfortable balance sheet cover" : `Dividend yield ${d.metrics.dividendYield}%`,
    ],
    weaknesses: [
      d.metrics.pe && d.metrics.pe > 45 ? "Premium valuation leaves little room for error" : `PE of ${d.metrics.pe ?? "n/a"} vs sector peers`,
      s.momentum < 2.5 ? "Soft price momentum over the past quarter" : `D/E at ${d.metrics.debtEquity}`,
      d.forensics.fScore < 6 ? `Piotroski F-Score only ${d.forensics.fScore}/9` : "Growth decelerating from peak",
    ],
    opportunities: [
      `${d.industry} demand tailwinds in India`,
      `Sales growing ${d.metrics.salesGrowth}% YoY`,
      "Margin expansion from operating leverage",
    ],
    threats: [
      "Input-cost and commodity cycles",
      "Regulatory or policy shifts",
      "Competitive intensity from peers",
    ],
    bullCase: `If ${d.metrics.salesGrowth}% sales growth holds and margins expand, the Smart Score of ${d.smartScore.score}/5 could re-rate toward the ₹${d.aiTarget} estimate.`,
    bearCase: `A growth miss or another leg of derating from PE ${d.metrics.pe ?? "n/a"} would expose the stock toward ₹${Math.round(d.quote.price * 0.82)}.`,
  };
  return { swot: JSON.stringify(swot), source: "fallback" };
}

export async function compareAnalysis(symbolA: string, symbolB: string): Promise<{ answer: string; source: "ai" | "fallback" }> {
  const a = loadDashboard(symbolA);
  const b = loadDashboard(symbolB);
  if (!a || !b) return { answer: "One of the stocks was not found.", source: "fallback" };

  const system = `You are comparing two Indian stocks. Answer in markdown, max 200 words: a one-line verdict naming the stronger pick (or "too close to call"),
then 3 bullets on why, then 1 bullet on the key risk of your pick. Use numbers from the data provided.`;

  const user = `A = ${a.companyName} (${a.symbol}): price ₹${a.quote.price}, PE ${a.metrics.pe}, ROE ${a.metrics.roe}%, D/E ${a.metrics.debtEquity}, growth ${a.metrics.salesGrowth}%/${a.metrics.profitGrowth}%, Smart Score ${a.smartScore.score}/5, Risk ${a.riskScore.score}/5, 1Y ${a.technicals.return1Y}%.
B = ${b.companyName} (${b.symbol}): price ₹${b.quote.price}, PE ${b.metrics.pe}, ROE ${b.metrics.roe}%, D/E ${b.metrics.debtEquity}, growth ${b.metrics.salesGrowth}%/${b.metrics.profitGrowth}%, Smart Score ${b.smartScore.score}/5, Risk ${b.riskScore.score}/5, 1Y ${b.technicals.return1Y}%.
Which one should a quality-focused long-term investor prefer?`;

  const answer = await complete(system, user);
  if (answer) return { answer, source: "ai" };

  const pick = a.smartScore.score - a.riskScore.score / 2 >= b.smartScore.score - b.riskScore.score / 2 ? a : b;
  const other = pick === a ? b : a;
  return {
    answer: `**Verdict: ${pick.symbol}** edges out ${other.symbol} on the blended quality metric.\n\n- Smart Score ${pick.smartScore.score}/5 vs ${other.smartScore.score}/5 — the factor stack favours ${pick.symbol}\n- ROE ${pick.metrics.roe}% vs ${other.metrics.roe}% with D/E ${pick.metrics.debtEquity} vs ${other.metrics.debtEquity}\n- 1Y return ${pick.technicals.return1Y}% vs ${other.technicals.return1Y}%\n\nKey risk: ${pick.riskScore.label} risk profile (${pick.riskScore.score}/5) — size the position for that.`,
    source: "fallback",
  };
}

export async function portfolioRiskAnalysis(
  holdings: { symbol: string; name: string; quantity: number; buyPrice: number; currentPrice: number; invested: number; currentValue: number; weight: number }[]
): Promise<{ analysis: string; source: "ai" | "fallback" }> {
  const totalValue = holdings.reduce((a, h) => a + h.currentValue, 0) || 1;
  const system = `You are a portfolio risk analyst. Given holdings with weights, analyse concentration, sector spread and quality.
Return ONLY valid JSON (no fences): {"overallRisk":"Low|Medium|High","riskScore":number 0-10,"diversificationScore":number 0-10,"summary":"2 sentences","topRisks":["..."],"recommendations":["..."]}. topRisks and recommendations have exactly 3 items each, max 14 words per item.`;
  const user = `Holdings (weight %):\n${holdings.map((h) => `${h.symbol} (${h.name}): ₹${Math.round(h.currentValue)} weight ${(h.weight * 100).toFixed(1)}%, P&L ${(((h.currentPrice - h.buyPrice) / h.buyPrice) * 100).toFixed(1)}%`).join("\n")}\nTotal value ₹${Math.round(totalValue)}.`;

  const raw = await complete(system, user);
  if (raw) {
    try {
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      return { analysis: JSON.stringify(parsed), source: "ai" };
    } catch {
      // fall through
    }
  }

  // Deterministic fallback: HHI-based concentration
  const hhi = holdings.reduce((a, h) => a + (h.weight * 100) ** 2, 0);
  const effective = Math.round((1 / (hhi / 10000)) * 10) / 10;
  const sectors = new Set(holdings.map((h) => h.symbol));
  const analysis = {
    overallRisk: effective < 3 ? "High" : effective < 6 ? "Medium" : "Low",
    riskScore: Math.round(Math.min(10, Math.max(1, 11 - effective)) * 10) / 10,
    diversificationScore: Math.round(Math.min(10, effective) * 10) / 10,
    summary: `Your portfolio behaves like ${effective} equally-weighted positions. ${effective < 3 ? "Concentration is high — single-name shocks will dominate returns." : "Concentration is reasonable — single-name shocks are diluted."}`,
    topRisks: [
      effective < 3 ? `Top position dominates at ${(Math.max(...holdings.map((h) => h.weight)) * 100).toFixed(0)}% weight` : "Sector correlation in drawdowns",
      "Liquidity risk if exiting large positions quickly",
      `Only ${sectors.size} distinct holdings tracked`,
    ],
    recommendations: [
      effective < 4 ? "Cap any single position near 20–25% of the book" : "Maintain position sizing discipline",
      "Add a defensive sector if you're fully cyclical",
      "Rebalance annually or on 25% drift",
    ],
  };
  return { analysis: JSON.stringify(analysis), source: "fallback" };
}

export async function watchlistDigest(symbols: string[]): Promise<{ digest: string; source: "ai" | "fallback" }> {
  const rows = symbols
    .map((s) => loadDashboard(s))
    .filter((d): d is NonNullable<typeof d> => d !== null);

  if (rows.length === 0) return { digest: "Watchlist is empty — add symbols to get a digest.", source: "fallback" };

  const system = `Write a morning watchlist digest in markdown for an Indian equity investor. Max 160 words.
Format: one opening line on the tape, then one bullet per stock: **SYMBOL** — action in ≤12 words (what to watch, not advice).`;
  const user = `Watchlist:\n${rows.map((d) => `${d.symbol}: ₹${d.quote.price} (${d.quote.changePercent}%), Smart ${d.smartScore.score}/5, Risk ${d.riskScore.score}/5, RSI ${d.technicals.rsi14}, trend ${d.technicals.trend}`).join("\n")}`;

  const digest = await complete(system, user);
  if (digest) return { digest, source: "ai" };

  const best = [...rows].sort((a, b) => b.smartScore.score - a.smartScore.score)[0];
  const worst = [...rows].sort((a, b) => a.riskScore.score - b.riskScore.score)[0];
  return {
    digest: `Watchlist pulse — ${rows.length} names tracked.\n\n${rows.map((d) => `- **${d.symbol}** — ₹${d.quote.price} (${d.quote.changePercent >= 0 ? "+" : ""}${d.quote.changePercent}%), ${d.smartScore.label} quality / ${d.riskScore.label} risk`).join("\n")}\n\nHighest conviction: **${best.symbol}** (${best.smartScore.score}/5). Watch closest for risk: **${worst.symbol}** (${worst.riskScore.score}/5).`,
    source: "fallback",
  };
}

export function marketPulseContext(): string {
  const news = getMarketNews(6).map((n) => `- ${n.title}`).join("\n");
  return news;
}
