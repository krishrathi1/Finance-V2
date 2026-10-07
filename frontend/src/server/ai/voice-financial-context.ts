import type { DashboardData } from "@/shared/types";
import { computeForensicAudit } from "@/server/domain/forensic-scores";

export function buildVoiceFinancialContext(data: DashboardData): string {
  if (!data) return "No financial data available for this entity.";

  const {
    symbol,
    companyName,
    exchange,
    sector,
    profile,
    price,
    metrics,
    smartScore,
    riskScore,
    technicals,
    financials,
    shareholding,
    corporateActions,
    brokerageResearch,
    competitors,
    news,
  } = data;

  const lines: string[] = [];

  // 1. Company Profile & Identity
  lines.push(`COMPANY: ${companyName || symbol} (${symbol}) [${exchange || "NSE"}]`);
  if (sector || profile?.industry) {
    lines.push(`SECTOR/INDUSTRY: ${sector || "N/A"} | ${profile?.industry || "N/A"}`);
  }
  if (profile?.description) {
    lines.push(`BUSINESS: ${profile.description.slice(0, 200)}...`);
  }

  // 2. Price & Trading Metrics
  if (price) {
    const chgStr = price.changePercent !== undefined
      ? `${price.changePercent > 0 ? "+" : ""}${price.changePercent.toFixed(2)}%`
      : "0%";
    const chgAbs = price.change !== undefined
      ? `(${price.change > 0 ? "+" : ""}₹${price.change})`
      : "";
    lines.push(`LIVE CMP: ₹${price.cmp ?? "N/A"} ${chgStr} ${chgAbs}`);
    lines.push(`52-WEEK RANGE: High ₹${price.fiftyTwoWeekHigh ?? "N/A"} | Low ₹${price.fiftyTwoWeekLow ?? "N/A"}`);
    if (price.aiTarget) {
      lines.push(`AI FAIR TARGET: ₹${price.aiTarget}`);
    }
  }

  // 3. Valuation & Key Ratios
  if (metrics) {
    const pe = metrics.pe ?? metrics.peRatio ?? "N/A";
    const pb = metrics.pb ?? metrics.pbRatio ?? "N/A";
    const roe = metrics.roe ?? "N/A";
    const roce = metrics.roce ?? "N/A";
    const divYield = metrics.dividendYield ?? "0";
    const mCap = metrics.marketCap ? `₹${Number(metrics.marketCap).toLocaleString("en-IN")} Cr` : "N/A";
    const evEbitda = metrics.evToEbitda ?? metrics.evEbitda ?? "N/A";
    const debtToEquity = metrics.debtToEquity ?? "N/A";

    lines.push(`VALUATION: P/E: ${pe} | P/B: ${pb} | EV/EBITDA: ${evEbitda} | Market Cap: ${mCap} | Div Yield: ${divYield}%`);
    lines.push(`PROFITABILITY & RETURN: ROE: ${roe}% | ROCE: ${roce}% | Debt/Equity: ${debtToEquity}`);
  }

  // 4. AI Smart Score & Risk Score
  if (smartScore) {
    lines.push(`AI SMART SCORE: ${smartScore.score ?? 0}/${smartScore.maxScore ?? 5} (Rating: ${smartScore.label || "N/A"}). Reason: ${smartScore.explanation || smartScore.aiExplanation || "Computed across fundamentals, valuation, and momentum."}`);
  }
  if (riskScore) {
    lines.push(`RISK ASSESSMENT: ${riskScore.score ?? 0}/${riskScore.maxScore ?? 5} (Rating: ${riskScore.label || "N/A"}). Factor: ${riskScore.explanation || riskScore.aiExplanation || "Assessed on leverage, volatility, and governance."}`);
  }

  // 5. Technical Indicators & Moving Averages
  if (technicals) {
    lines.push(`TECHNICAL SETUP: Trend: ${technicals.trend || "Neutral"} | RSI(14): ${technicals.rsi14 ?? "N/A"} | MACD: ${technicals.macd ?? "N/A"} | 20-EMA: ₹${technicals.ema20 ?? "N/A"} | 50-EMA: ₹${technicals.ema50 ?? "N/A"}`);
    if (technicals.pivotLevels && Object.keys(technicals.pivotLevels).length > 0) {
      const p = technicals.pivotLevels;
      lines.push(`PIVOT LEVELS: R1: ₹${p.r1 ?? "N/A"}, S1: ₹${p.s1 ?? "N/A"}`);
    }
  }

  // 6. Forensic Health Engine (Beneish M-Score, Altman Z, Piotroski F)
  try {
    const bs0 = financials?.balanceSheet?.[0] || {};
    const bs1 = financials?.balanceSheet?.[1] || {};
    const is0 = financials?.incomeStatement?.[0] || {};
    const is1 = financials?.incomeStatement?.[1] || {};
    const mCapNum = metrics?.marketCap ? Number(metrics.marketCap) : (price?.cmp ? price.cmp * 1000 : undefined);

    const toNum = (v: any): number | undefined => {
      if (v === null || v === undefined) return undefined;
      const n = Number(v);
      return isNaN(n) ? undefined : n;
    };

    const forensicResult = computeForensicAudit({
      marketCap: mCapNum,
      totalAssets: toNum(bs0.totalAssets) || (is0.revenue ? toNum(is0.revenue)! * 1.2 : undefined),
      totalAssetsPrev: toNum(bs1.totalAssets),
      currentAssets: toNum(bs0.totalCurrentAssets),
      currentAssetsPrev: toNum(bs1.totalCurrentAssets),
      currentLiabilities: toNum(bs0.totalCurrentLiabilities),
      currentLiabilitiesPrev: toNum(bs1.totalCurrentLiabilities),
      totalLiabilities: toNum(bs0.totalLiabilities),
      longTermDebt: toNum(bs0.longTermDebt),
      longTermDebtPrev: toNum(bs1.longTermDebt),
      revenue: toNum(is0.revenue || is0.totalRevenue),
      revenuePrev: toNum(is1.revenue || is1.totalRevenue),
      grossProfit: toNum(is0.grossProfit),
      grossProfitPrev: toNum(is1.grossProfit),
      netIncome: toNum(is0.netIncome),
      netIncomePrev: toNum(is1.netIncome),
      operatingCashFlow: toNum(financials?.cashFlow?.[0]?.operatingCashFlow),
    });

    lines.push(
      `FORENSICS & ACCOUNTING QUALITY: Beneish M-Score: ${forensicResult.mScore.score.toFixed(2)} (${forensicResult.mScore.manipulationRisk} Manipulation Risk) | Altman Z-Score: ${forensicResult.zScore.score.toFixed(2)} (${forensicResult.zScore.zone} Zone, ${forensicResult.zScore.bankruptcyRisk} Distress Risk) | Piotroski F-Score: ${forensicResult.fScore.score}/9 (${forensicResult.fScore.rating}) | Overall Verdict: ${forensicResult.compositeForensicVerdict.overallHealth}`
    );
  } catch {}

  // 7. Shareholding Pattern
  if (shareholding) {
    const qtr = shareholding.quarter ? ` (${shareholding.quarter})` : "";
    lines.push(`SHAREHOLDING${qtr}: Promoters: ${shareholding.promoters ?? "N/A"}% | FII: ${shareholding.fii ?? "N/A"}% | DII: ${shareholding.dii ?? "N/A"}% | Public: ${shareholding.public ?? "N/A"}%`);
  }

  // 8. Financials: Recent Performance & Quarterly / Yearly
  if (financials?.quarterly && financials.quarterly.length > 0) {
    const latestQ = financials.quarterly.slice(-2);
    const qSummary = latestQ.map((q) => `${q.period}: Rev ₹${q.revenue ?? "N/A"}Cr, PAT ₹${q.profit ?? "N/A"}Cr`).join(" | ");
    lines.push(`RECENT QUARTERLY RESULTS: ${qSummary}`);
  }
  if (financials?.growthSnapshot?.periods?.[0]?.metrics) {
    const gMetrics = financials.growthSnapshot.periods[0].metrics
      .slice(0, 3)
      .map((m: any) => `${m.label}: ${m.value}%`)
      .join(", ");
    lines.push(`GROWTH SNAPSHOT: ${gMetrics}`);
  }

  // 9. Brokerage Consensus & Targets
  if (brokerageResearch?.summary) {
    const bs = brokerageResearch.summary;
    lines.push(`BROKERAGE CONSENSUS: Buy: ${bs.buy ?? 0}, Hold: ${bs.hold ?? 0}, Sell: ${bs.sell ?? 0} (Total: ${bs.total ?? 0} Analyst Ratings)`);
    if (brokerageResearch.reports && brokerageResearch.reports.length > 0) {
      const topReport = brokerageResearch.reports[0];
      lines.push(`LATEST ANALYST CALL: ${topReport.broker} rated "${topReport.action}" with target ₹${topReport.targetPrice ?? "N/A"}`);
    }
  }

  // 10. Peer Competitors
  if (competitors?.table && competitors.table.length > 0) {
    const peerNames = competitors.table
      .filter((c) => c.name.toUpperCase() !== (companyName || symbol).toUpperCase())
      .slice(0, 3)
      .map((c) => `${c.name} (PE: ${c.pe ?? "N/A"}, P/B: ${c.pb ?? "N/A"})`)
      .join(", ");
    if (peerNames) {
      lines.push(`PEER COMPARISON: ${peerNames}`);
    }
  }

  // 11. Corporate Actions (Dividends, Splits, Board Meetings)
  if (corporateActions?.dividends && corporateActions.dividends.length > 0) {
    const div = corporateActions.dividends[0];
    const divVal = div.dividendAmount ? `₹${div.dividendAmount}` : (div.details || "Announced");
    lines.push(`RECENT DIVIDEND: ${divVal} (Date: ${div.date || div.exDate || "N/A"})`);
  }

  // 12. Recent News & Developments
  if (news && news.length > 0) {
    const topNews = news
      .slice(0, 3)
      .map((n) => `"${n.title}" (${n.source || "News"})`)
      .join(" | ");
    lines.push(`RECENT NEWS HEADLINES: ${topNews}`);
  }

  return lines.join("\n");
}
