import { buildScreenSnapshot } from "./screen-chunker";
import { ScreenMetric, ScreenSnapshot, ScreenStockFacts } from "./types";

/**
 * Extracts rich, accurate screen context and structured metrics from the active browser page.
 */
export function extractClientScreenSnapshot(sessionId: string): ScreenSnapshot {
  if (typeof window === "undefined") {
    return buildScreenSnapshot({
      sessionId,
      route: "/",
      pageTitle: "Finance Platform",
    });
  }

  const route = window.location.pathname + window.location.search;
  const pageTitle = document.title || "Finance Dashboard";

  let stock: ScreenStockFacts | undefined = undefined;
  const metrics: ScreenMetric[] = [];
  const sections: Array<{ title: string; text: string }> = [];
  const tables: Array<{ title: string; rows: Array<Record<string, string>> }> = [];

  const pageText = document.body.innerText || "";

  // ── 1. Check for Embedded Comprehensive Stock Data (#stock-page-data) ──
  const stockDataScript = document.getElementById("stock-page-data");
  if (stockDataScript?.textContent) {
    try {
      const parsed = JSON.parse(stockDataScript.textContent);
      if (parsed?.symbol) {
        stock = {
          symbol: String(parsed.symbol).toUpperCase(),
          companyName: parsed.companyName || "",
          price: parsed.cmp ? String(parsed.cmp) : "",
          changePercent: parsed.dayChangePercent !== undefined
            ? `${Number(parsed.dayChangePercent) > 0 ? "+" : ""}${parsed.dayChangePercent}%`
            : "",
          pe: parsed.pe ? String(parsed.pe) : "",
          marketCap: parsed.marketCap ? String(parsed.marketCap) : "",
          smartScore: parsed.smartScore !== undefined
            ? `${parsed.smartScore}/5 (${parsed.smartScoreLabel || ""})`
            : "",
          sector: parsed.sector || "",
        };

        if (parsed.pe) metrics.push({ label: "P/E Ratio", value: String(parsed.pe), category: "valuation" });
        if (parsed.pb) metrics.push({ label: "P/B Ratio", value: String(parsed.pb), category: "valuation" });
        if (parsed.marketCap) metrics.push({ label: "Market Cap", value: String(parsed.marketCap), category: "valuation" });
        if (parsed.dividendYield) metrics.push({ label: "Dividend Yield", value: `${parsed.dividendYield}%`, category: "valuation" });
        if (parsed.roce) metrics.push({ label: "ROCE", value: `${parsed.roce}%`, category: "profitability" });
        if (parsed.roe) metrics.push({ label: "ROE", value: `${parsed.roe}%`, category: "profitability" });
        if (parsed.high52 && parsed.low52) metrics.push({ label: "52-Week Range", value: `₹${parsed.low52} - ₹${parsed.high52}`, category: "technical" });
        if (parsed.smartScore !== undefined) metrics.push({ label: "Smart Score", value: `${parsed.smartScore}/5 (${parsed.smartScoreLabel || ""})`, category: "forensics" });
        if (parsed.riskScore !== undefined) metrics.push({ label: "Risk Score", value: `${parsed.riskScore}/5 (${parsed.riskScoreLabel || ""})`, category: "forensics" });

        if (parsed.technicals) {
          if (parsed.technicals.rsi14) metrics.push({ label: "RSI (14)", value: String(parsed.technicals.rsi14), category: "technical" });
          if (parsed.technicals.trend) metrics.push({ label: "Momentum Trend", value: String(parsed.technicals.trend), category: "technical" });
          if (parsed.technicals.ema20) metrics.push({ label: "EMA 20", value: `₹${parsed.technicals.ema20}`, category: "technical" });
          if (parsed.technicals.ema50) metrics.push({ label: "EMA 50", value: `₹${parsed.technicals.ema50}`, category: "technical" });
        }

        if (parsed.smartScoreExplanation) {
          sections.push({
            title: "Smart Score & Forensic Analysis",
            text: parsed.smartScoreExplanation,
          });
        }

        if (parsed.riskScoreExplanation) {
          sections.push({
            title: "Key Risks & Red Flags",
            text: parsed.riskScoreExplanation,
          });
        }

        if (parsed.shareholding) {
          sections.push({
            title: "Shareholding Breakdown",
            text: `Promoters: ${parsed.shareholding.promoters || 0}%, FII: ${parsed.shareholding.fii || 0}%, DII: ${parsed.shareholding.dii || 0}%, Public: ${parsed.shareholding.public || 0}% (${parsed.shareholding.quarter || "Latest"})`,
          });
        }

        if (Array.isArray(parsed.quarterly) && parsed.quarterly.length > 0) {
          sections.push({
            title: "Recent Quarterly Results",
            text: parsed.quarterly
              .slice(0, 4)
              .map((q: any) => `${q.period || q.quarter || "Qtr"}: Revenue ₹${q.revenue || "-"}, PAT/Net Profit ₹${q.netProfit || q.pat || "-"}`)
              .join(" | "),
          });
        }

        if (Array.isArray(parsed.competitors) && parsed.competitors.length > 0) {
          sections.push({
            title: "Sector Peers",
            text: parsed.competitors
              .slice(0, 5)
              .map((c: any) => `${c.companyName || c.symbol} (CMP: ₹${c.cmp || c.price || "-"}, P/E: ${c.pe || "-"})`)
              .join(" | "),
          });
        }
      }
    } catch (e) {
      console.warn("[context-extractor] failed parsing #stock-page-data:", e);
    }
  }

  // ── 2. Fallback DOM Parsing for Stock Pages if #stock-page-data absent ──
  if (!stock && window.location.pathname.includes("/stocks/")) {
    const parts = window.location.pathname.split("/stocks/")[1]?.split("/") || [];
    const symbol = (parts[0] || "").toUpperCase();

    if (symbol) {
      let companyName = "";
      const h1El = document.querySelector("h1");
      if (h1El) companyName = h1El.textContent?.trim() || "";

      let price = "";
      const priceCandidates = Array.from(
        document.querySelectorAll("[data-price], [class*='text-2xl'], [class*='text-3xl']")
      );
      for (const el of priceCandidates) {
        const text = el.textContent?.trim() || "";
        if (text.includes("₹") || /^[0-9,]+(\.[0-9]{1,2})?$/.test(text)) {
          price = text.replace("₹", "").trim();
          break;
        }
      }

      let changePercent = "";
      const changeEl = document.querySelector(
        "[class*='text-success'], [class*='text-danger'], [class*='text-emerald'], [class*='text-rose']"
      );
      if (
        changeEl &&
        (changeEl.textContent?.includes("%") ||
          changeEl.textContent?.includes("+") ||
          changeEl.textContent?.includes("-"))
      ) {
        changePercent = changeEl.textContent.trim();
      }

      let pe = "";
      const peMatch = pageText.match(/P\/E\s*[:\s]*([0-9.]+)/i);
      if (peMatch) pe = peMatch[1];

      let smartScore = "";
      const scoreMatch = pageText.match(/(?:Smart|Forensic)\s*Score\s*[:\s]*([0-9.]+)/i);
      if (scoreMatch) smartScore = scoreMatch[1];

      let marketCap = "";
      const mcapMatch = pageText.match(/Market\s*Cap\s*[:\s]*₹?\s*([0-9,.]+\s*(?:Cr|Lakh\s*Cr)?)/i);
      if (mcapMatch) marketCap = mcapMatch[1];

      stock = {
        symbol,
        companyName,
        price,
        changePercent,
        pe,
        smartScore,
        marketCap,
      };

      if (pe) metrics.push({ label: "P/E Ratio", value: pe, category: "valuation" });
      if (marketCap) metrics.push({ label: "Market Cap", value: marketCap, category: "valuation" });
      if (smartScore) metrics.push({ label: "Smart Score", value: smartScore, category: "forensics" });
    }
  }

  // ── 2b. Extract Home Page & Dashboard Live Market Stats (NIFTY 50, SENSEX, Breadth) ──
  try {
    const statCards = Array.from(document.querySelectorAll("div")).filter((d) => {
      const txt = d.textContent || "";
      return (
        (txt.includes("NIFTY 50") || txt.includes("BSE SENSEX") || txt.includes("Adv / Dec")) &&
        d.children.length >= 2 &&
        d.children.length <= 6 &&
        txt.length < 200
      );
    });
    for (const card of statCards.slice(0, 5)) {
      const raw = card.innerText?.trim() || "";
      const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length >= 2) {
        metrics.push({
          label: lines[0],
          value: lines.slice(1).join(" | "),
          category: "market-index",
        });
      }
    }
  } catch {}

  // ── 3. Extract Visible Tables (Screener, Watchlist, Portfolio, Heatmaps) ──
  const tableEls = Array.from(document.querySelectorAll("table")).slice(0, 3);
  for (const table of tableEls) {
    const headers = Array.from(table.querySelectorAll("th")).map((th) => th.textContent?.trim() || "");
    if (headers.length === 0) continue;

    const rowEls = Array.from(table.querySelectorAll("tbody tr")).slice(0, 6);
    const rows: Array<Record<string, string>> = [];

    for (const tr of rowEls) {
      const cells = Array.from(tr.querySelectorAll("td")).map((td) => td.textContent?.trim() || "");
      if (cells.length === 0) continue;

      const record: Record<string, string> = {};
      headers.forEach((h, idx) => {
        if (h && cells[idx]) {
          record[h] = cells[idx];
        }
      });
      if (Object.keys(record).length > 0) {
        rows.push(record);
      }
    }

    if (rows.length > 0) {
      tables.push({
        title: table.getAttribute("aria-label") || "Visible Table Data",
        rows,
      });
    }
  }

  // ── 4. Extract Key Headings and Content Blocks ──
  const headings = Array.from(document.querySelectorAll("h1, h2, h3")).slice(0, 6);
  for (const h of headings) {
    const title = h.textContent?.trim() || "";
    if (!title) continue;

    const parent = h.parentElement;
    const pEl = parent?.querySelector("p");
    const text = pEl?.textContent?.trim() || "";

    if (text) {
      sections.push({ title, text });
    }
  }

  // ── 5. Capture Visible Content Excerpt ──
  const mainEl = document.querySelector("main") || document.body;
  const visibleExcerpt = (mainEl?.innerText || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);

  return buildScreenSnapshot({
    sessionId,
    route,
    pageTitle,
    stock,
    metrics,
    sections,
    tables,
    visibleExcerpt,
  });
}
