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

  // 1. Detect and parse Stock Page (/stocks/[symbol])
  if (window.location.pathname.includes("/stocks/")) {
    const parts = window.location.pathname.split("/stocks/")[1]?.split("/") || [];
    const symbol = (parts[0] || "").toUpperCase();

    if (symbol) {
      let companyName = "";
      const h1El = document.querySelector("h1");
      if (h1El) companyName = h1El.textContent?.trim() || "";

      // Price extraction: look for data-price attribute or primary metric classes
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

      // Check for day change percent
      let changePercent = "";
      const changeEl = document.querySelector("[class*='text-success'], [class*='text-danger'], [class*='text-emerald'], [class*='text-rose']");
      if (changeEl && (changeEl.textContent?.includes("%") || changeEl.textContent?.includes("+") || changeEl.textContent?.includes("-"))) {
        changePercent = changeEl.textContent.trim();
      }

      // Read text content for core metrics
      const pageText = document.body.innerText || "";
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

  // 2. Extract Visible Tables (e.g. Screener results, Peer comparison, Financial statements)
  const tableEls = Array.from(document.querySelectorAll("table")).slice(0, 2);
  for (const table of tableEls) {
    const headers = Array.from(table.querySelectorAll("th")).map((th) => th.textContent?.trim() || "");
    if (headers.length === 0) continue;

    const rowEls = Array.from(table.querySelectorAll("tbody tr")).slice(0, 5);
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

  // 3. Extract Key Headings and Content Blocks
  const headings = Array.from(document.querySelectorAll("h1, h2, h3")).slice(0, 5);
  for (const h of headings) {
    const title = h.textContent?.trim() || "";
    if (!title) continue;

    // Grab sibling or parent text
    const parent = h.parentElement;
    const pEl = parent?.querySelector("p");
    const text = pEl?.textContent?.trim() || "";

    if (text) {
      sections.push({ title, text });
    }
  }

  // 4. Capture visible excerpt from main container
  const mainEl = document.querySelector("main") || document.body;
  const visibleExcerpt = (mainEl?.innerText || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);

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
