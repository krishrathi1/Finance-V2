/**
 * Structured Page Context System for Real-Time Voice Agent.
 *
 * Maintains a live, authoritative structured representation of the active page,
 * stock fundamentals, technicals, scores, tabs, charts, screener, portfolio, and route state.
 *
 * Primary source: React / application state.
 * Fallback: lightweight visible DOM screen text.
 */

export interface VoicePageContext {
  pageType: "stock-detail" | "screener" | "portfolio" | "dashboard" | "watchlist" | "compare" | "generic";
  route: string;
  title: string;

  stock?: {
    symbol: string;
    companyName?: string;
    exchange?: string;
    sector?: string;
    industry?: string;
  };

  price?: {
    current?: number;
    change?: number;
    changePercent?: number;
    high52Week?: number;
    low52Week?: number;
    aiTarget?: number;
    volume?: number;
  };

  valuation?: {
    pe?: number | null;
    pb?: number | null;
    marketCap?: number | null;
    dividendYield?: number | null;
    roe?: number | null;
    roce?: number | null;
    evToEbitda?: number | null;
    eps?: number | null;
  };

  fundamentals?: {
    revenue?: number | null;
    profit?: number | null;
    quarterlySummary?: string;
    annualSummary?: string;
  };

  technicals?: {
    rsi?: number;
    macd?: number;
    trend?: string;
    ema20?: number;
    ema50?: number;
    support?: number;
    resistance?: number;
  };

  smartScore?: {
    score?: number;
    maxScore?: number;
    label?: string;
    explanation?: string;
  };

  riskScore?: {
    score?: number;
    maxScore?: number;
    label?: string;
    explanation?: string;
  };

  forensics?: {
    mScore?: number;
    altmanZ?: number;
    fScore?: number;
    qualityLabel?: string;
    manipulationRisk?: string;
  };

  shareholding?: {
    promoter?: number;
    fii?: number;
    dii?: number;
    publicHolding?: number;
    pledged?: number;
  };

  news?: Array<{
    title: string;
    date?: string;
  }>;

  chart?: {
    activeTab?: string;
    timeframe?: string;
    indicators?: string[];
  };

  portfolio?: {
    totalValue?: number;
    totalInvested?: number;
    totalPnl?: number;
    totalPnlPercent?: number;
    holdingsCount?: number;
    topHoldings?: string[];
  };

  screener?: {
    activePreset?: string;
    query?: string;
    resultsCount?: number;
    topMatches?: string[];
    filtersApplied?: Record<string, unknown>;
  };

  activeTab?: string;
  visibleSections?: string[];
  selectedFilters?: Record<string, unknown>;
  screenText?: string;
}

declare global {
  interface Window {
    __FINANCE_PAGE_CONTEXT__?: VoicePageContext;
    __FINANCE_PAGE_LISTENERS__?: Set<(ctx: VoicePageContext) => void>;
  }
}

/**
 * Publish updated structured context from any React component (e.g. LiveStockDetails, Screener, Portfolio).
 */
export function publishVoicePageContext(update: Partial<VoicePageContext>): void {
  if (typeof window === "undefined") return;

  const current = window.__FINANCE_PAGE_CONTEXT__ || buildInitialContext();
  const next: VoicePageContext = {
    ...current,
    ...update,
    stock: update.stock ? { ...current.stock, ...update.stock } : current.stock,
    price: update.price ? { ...current.price, ...update.price } : current.price,
    valuation: update.valuation ? { ...current.valuation, ...update.valuation } : current.valuation,
    fundamentals: update.fundamentals ? { ...current.fundamentals, ...update.fundamentals } : current.fundamentals,
    technicals: update.technicals ? { ...current.technicals, ...update.technicals } : current.technicals,
    smartScore: update.smartScore ? { ...current.smartScore, ...update.smartScore } : current.smartScore,
    riskScore: update.riskScore ? { ...current.riskScore, ...update.riskScore } : current.riskScore,
    forensics: update.forensics ? { ...current.forensics, ...update.forensics } : current.forensics,
    shareholding: update.shareholding ? { ...current.shareholding, ...update.shareholding } : current.shareholding,
    chart: update.chart ? { ...current.chart, ...update.chart } : current.chart,
    portfolio: update.portfolio ? { ...current.portfolio, ...update.portfolio } : current.portfolio,
    screener: update.screener ? { ...current.screener, ...update.screener } : current.screener,
  };

  window.__FINANCE_PAGE_CONTEXT__ = next;

  if (window.__FINANCE_PAGE_LISTENERS__) {
    window.__FINANCE_PAGE_LISTENERS__.forEach((fn) => {
      try {
        fn(next);
      } catch (err) {
        console.warn("[page-context] listener error:", err);
      }
    });
  }
}

/**
 * Reset voice page context explicitly, e.g. when changing pages or stock symbols.
 */
export function resetVoicePageContext(newPageType: VoicePageContext["pageType"], route: string, symbol?: string, exchange = "NSE"): VoicePageContext {
  const fresh: VoicePageContext = {
    pageType: newPageType,
    route,
    title: typeof document !== "undefined" ? document.title : "Finance-V2",
    stock: symbol ? { symbol, companyName: symbol, exchange } : undefined,
    visibleSections: [],
  };

  if (typeof window !== "undefined") {
    window.__FINANCE_PAGE_CONTEXT__ = fresh;
    if (window.__FINANCE_PAGE_LISTENERS__) {
      window.__FINANCE_PAGE_LISTENERS__.forEach((fn) => {
        try {
          fn(fresh);
        } catch {}
      });
    }
  }

  return fresh;
}

/**
 * Subscribe to page context changes.
 */
export function subscribeToVoicePageContext(
  listener: (ctx: VoicePageContext) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  if (!window.__FINANCE_PAGE_LISTENERS__) {
    window.__FINANCE_PAGE_LISTENERS__ = new Set();
  }

  window.__FINANCE_PAGE_LISTENERS__.add(listener);

  // Immediately notify listener of current state
  listener(getVoicePageContext());

  return () => {
    window.__FINANCE_PAGE_LISTENERS__?.delete(listener);
  };
}

/**
 * Get the current page context safely.
 */
export function getVoicePageContext(): VoicePageContext {
  if (typeof window === "undefined") {
    return buildInitialContext();
  }
  return window.__FINANCE_PAGE_CONTEXT__ || buildVoicePageContext();
}

/**
 * Builds or refreshes the structured page context using current route and available DOM hints.
 */
export function buildVoicePageContext(): VoicePageContext {
  if (typeof window === "undefined") {
    return buildInitialContext();
  }

  const path = window.location.pathname;
  const search = window.location.search;
  const pathParts = path.split("/").filter(Boolean);
  const searchParams = new URLSearchParams(search);
  const exchange = (searchParams.get("exchange") || "NSE").toUpperCase();

  let pageType: VoicePageContext["pageType"] = "generic";
  let symbol = "";

  if (pathParts[0] === "stocks" && pathParts[1]) {
    pageType = "stock-detail";
    symbol = decodeURIComponent(pathParts[1]).toUpperCase();
  } else if (path.includes("screener")) {
    pageType = "screener";
  } else if (path.includes("portfolio")) {
    pageType = "portfolio";
  } else if (path.includes("watchlist")) {
    pageType = "watchlist";
  } else if (path.includes("compare")) {
    pageType = "compare";
  } else if (path === "/" || path === "") {
    pageType = "dashboard";
  }

  const existing = window.__FINANCE_PAGE_CONTEXT__;

  // If navigating from RELIANCE to TCS, reset old stock context
  const stockMismatch =
    pageType === "stock-detail" && existing?.stock?.symbol && existing.stock.symbol !== symbol;
  const pageMismatch = existing && existing.pageType !== pageType;

  let baseContext: VoicePageContext;

  if (existing && !stockMismatch && !pageMismatch) {
    baseContext = {
      ...existing,
      route: path + search,
      title: document.title,
    };
  } else {
    baseContext = {
      pageType,
      route: path + search,
      title: document.title,
      stock: symbol
        ? {
            symbol,
            companyName: symbol,
            exchange,
          }
        : undefined,
      visibleSections: [],
    };
  }

  // Lightweight visible DOM text as fallback only (max 1500 chars)
  try {
    const main = document.querySelector("main") || document.body;
    const text = (main?.innerText || "").slice(0, 1500);
    baseContext.screenText = text
      .replace(/\n\s*\n/g, "\n")
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("http"))
      .slice(0, 35)
      .join(" | ");
  } catch {}

  window.__FINANCE_PAGE_CONTEXT__ = baseContext;
  return baseContext;
}

function buildInitialContext(): VoicePageContext {
  return {
    pageType: "generic",
    route: "/",
    title: "Finance-V2",
    visibleSections: [],
  };
}
