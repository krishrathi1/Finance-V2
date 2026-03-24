"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  SlidersHorizontal,
  ChevronDown,
  RotateCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  Filter,
  X,
  Sparkles,
  Send,
  Zap,
  BarChart2,
  DollarSign,
  Percent,
  Activity,
  Star,
  HelpCircle,
  Target,
  ShieldCheck,
  Banknote,
} from "lucide-react";
import { MarketStatusBadge } from "@/components/market-status-badge";
import { fetchScreenerResults, fetchAIScreenerResults } from "@/lib/api";
import type { ScreenerFilters, ScreenerResult } from "@/lib/types";

// ── Tooltip component ──────────────────────────────────────
function Tooltip({ text, children }: { text: string; children?: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex items-center gap-1">
      {children}
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="cursor-help"
      >
        <HelpCircle className="h-3 w-3 text-muted/50 hover:text-accent transition-colors" />
      </span>
      {show && (
        <span className="absolute bottom-full left-1/2 z-50 mb-1.5 w-52 -translate-x-1/2 rounded-lg border border-border/60 bg-panel px-3 py-2 text-[11px] leading-relaxed text-text shadow-xl">
          {text}
        </span>
      )}
    </span>
  );
}

// ── Color coding helpers ───────────────────────────────────
function peColor(pe: number | null | undefined): string {
  if (pe === null || pe === undefined) return "text-muted";
  if (pe <= 0) return "text-muted";
  if (pe < 15) return "text-success font-semibold"; // cheap
  if (pe < 30) return "text-text"; // fair
  if (pe < 50) return "text-amber-400"; // slightly expensive
  return "text-danger"; // very expensive
}
function roeColor(roe: number | null | undefined): string {
  if (roe === null || roe === undefined) return "text-muted";
  if (roe >= 20) return "text-success font-semibold";
  if (roe >= 12) return "text-text";
  if (roe >= 5) return "text-amber-400";
  return "text-danger";
}
function divColor(div: number | null | undefined): string {
  if (div === null || div === undefined) return "text-muted";
  if (div >= 3) return "text-success font-semibold";
  if (div >= 1) return "text-text";
  return "text-muted";
}

// ── Match-reason helper ────────────────────────────────────
function getMatchReasons(stock: ScreenerResult, filters: ScreenerFilters): string[] {
  const reasons: string[] = [];
  if (filters.sector && stock.sector) reasons.push(`Sector: ${stock.sector}`);
  if (filters.market_cap_min > 0 || filters.market_cap_max > 0) {
    reasons.push(`Market Cap filter matched`);
  }
  if (filters.pe_min > 0 || filters.pe_max > 0) {
    if (stock.pe != null) reasons.push(`PE ${stock.pe.toFixed(1)} within range`);
  }
  if (filters.dividend_min > 0) {
    if (stock.dividendYield != null) reasons.push(`Div Yield ${stock.dividendYield.toFixed(1)}% ≥ ${filters.dividend_min}%`);
  }
  if (reasons.length === 0) reasons.push(`Matched ${filters.exchange || "NSE"} exchange filter`);
  return reasons;
}

const SECTORS = [
  "Technology",
  "Financial Services",
  "Healthcare",
  "Consumer Cyclical",
  "Industrials",
  "Basic Materials",
  "Energy",
  "Consumer Defensive",
  "Communication Services",
  "Utilities",
  "Real Estate",
];

const MARKET_CAP_PRESETS = [
  { label: "Smallcap", subtitle: "<5K Cr", min: 0, max: 600_000_000 },
  { label: "Midcap", subtitle: "5K-20K Cr", min: 600_000_000, max: 2_400_000_000 },
  { label: "Largecap", subtitle: ">20K Cr", min: 2_400_000_000, max: 0 },
] as const;

// Goal-based quick screens (for beginners — results are AI-generated suggestions)
const GOAL_SCREENS = [
  { icon: Banknote, label: "I want income", query: "High dividend yield NSE stocks above 2%", color: "text-success" },
  { icon: TrendingUp, label: "I want growth", query: "Undervalued mid cap stocks with PE under 25 and high ROE", color: "text-accent" },
  { icon: ShieldCheck, label: "I want safety", query: "Debt-free large cap stocks with strong fundamentals", color: "text-sky-400" },
  { icon: Target, label: "I want value", query: "Stocks trading near 52 week low with low PE", color: "text-amber-400" },
];

// Expert preset screens
const PRESET_SCREENS = [
  { label: "🔥 High Dividend", query: "High dividend yield stocks above 3%" },
  { label: "📈 Low PE Growth", query: "Undervalued stocks with PE under 20 and positive ROE" },
  { label: "💎 Debt Free", query: "Debt-free large cap IT stocks" },
  { label: "🚀 Small Cap Pharma", query: "Small cap pharma companies with strong fundamentals" },
  { label: "🏦 Banking Leaders", query: "Top private banking stocks with high ROE" },
];

type SortKey = keyof Pick<
  ScreenerResult,
  "symbol" | "companyName" | "price" | "changePercent" | "marketCap" | "pe" | "roe" | "dividendYield" | "sector"
>;

const DEFAULT_FILTERS: ScreenerFilters = {
  exchange: "NSE",
  sector: "",
  industry: "",
  market_cap_min: 0,
  market_cap_max: 0,
  pe_min: 0,
  pe_max: 0,
  price_min: 0,
  price_max: 0,
  dividend_min: 0,
  volume_min: 0,
  limit: 100,
};

function formatMarketCap(usd: number): string {
  if (!usd) return "-";
  // FMP returns market cap in USD — convert at approx rate. Use ~ to indicate estimate.
  const crore = Math.round((usd * 84) / 1e7);
  if (crore >= 100_000) return `~₹${(crore / 100_000).toFixed(2)}L Cr`;
  if (crore >= 1_000) return `~₹${(crore / 1_000).toFixed(1)}K Cr`;
  return `~₹${crore} Cr`;
}

function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || isNaN(value)) return "-";
  return value.toFixed(decimals);
}

function buildStockHref(symbol: string, exchange?: string) {
  const normalizedExchange = String(exchange || "NSE").trim().toUpperCase() || "NSE";
  return normalizedExchange === "NSE" ? `/stocks/${symbol}` : `/stocks/${symbol}?exchange=${normalizedExchange}`;
}

function FilterSection({
  icon: Icon,
  title,
  children,
  defaultOpen = true,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/30 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-accent/5"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-semibold text-text">{title}</span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export default function ScreenerPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<ScreenerFilters>({ ...DEFAULT_FILTERS });
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("marketCap");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [activeCapPreset, setActiveCapPreset] = useState<number | null>(null);

  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiParsedFilters, setAiParsedFilters] = useState<Record<string, unknown> | null>(null);
  const [aiMode, setAiMode] = useState(false);
  const aiInputRef = useRef<HTMLInputElement>(null);

  const applyFilters = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHasSearched(true);
    setAiMode(false);
    setAiParsedFilters(null);
    try {
      const data = await fetchScreenerResults(filters);
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch results");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const handleAISearch = useCallback(
    async (query?: string) => {
      const q = (query ?? aiQuery).trim();
      if (!q) return;
      setAiLoading(true);
      setAiError(null);
      setAiMode(true);
      setHasSearched(true);
      try {
        const { results: aiResults, parsedFilters } = await fetchAIScreenerResults(q);
        setResults(aiResults);
        setAiParsedFilters(parsedFilters);
      } catch {
        setAiError("AI screener unavailable. Try using manual filters.");
        setAiMode(false);
      } finally {
        setAiLoading(false);
      }
    },
    [aiQuery]
  );

  const resetFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
    setActiveCapPreset(null);
    setResults([]);
    setHasSearched(false);
    setAiMode(false);
    setAiQuery("");
    setAiParsedFilters(null);
    setError(null);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "symbol" || key === "companyName" || key === "sector" ? "asc" : "desc");
    }
  };

  const sortedResults = [...results].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    const aNum = typeof aVal === "number" ? aVal : 0;
    const bNum = typeof bVal === "number" ? bVal : 0;
    return sortDir === "asc" ? aNum - bNum : bNum - aNum;
  });

  const updateFilter = <K extends keyof ScreenerFilters>(key: K, value: ScreenerFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleCapPreset = (index: number) => {
    const preset = MARKET_CAP_PRESETS[index];
    if (activeCapPreset === index) {
      setActiveCapPreset(null);
      updateFilter("market_cap_min", 0);
      updateFilter("market_cap_max", 0);
    } else {
      setActiveCapPreset(index);
      setFilters((prev) => ({
        ...prev,
        market_cap_min: preset.min,
        market_cap_max: preset.max,
      }));
    }
  };

  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 inline h-3 w-3 text-muted/40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 inline h-3 w-3 text-accent" />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3 text-accent" />
    );
  };

  const activeFilterCount = [
    filters.sector,
    filters.market_cap_min || filters.market_cap_max,
    filters.pe_min || filters.pe_max,
    filters.price_min || filters.price_max,
    filters.dividend_min,
    filters.volume_min,
  ].filter(Boolean).length;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      {/* ── Top Bar ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/40 bg-panel/80 px-4 py-2.5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="h-4 w-4 text-accent" />
          <h1 className="font-[var(--font-space)] text-base font-bold tracking-tight">
            Stock Screener
          </h1>
          <span className="hidden rounded-full border border-border/50 bg-bg/50 px-2 py-0.5 text-[10px] text-muted sm:inline">
            NSE · BSE
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* AI Search Bar */}
          <div className="relative hidden sm:flex items-center gap-2">
            <div className="relative">
              <Sparkles className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-accent" />
              <input
                ref={aiInputRef}
                type="text"
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAISearch();
                }}
                placeholder="AI Search: describe stocks in plain English…"
                className="w-80 rounded-lg border border-accent/30 bg-bg/60 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/20"
              />
            </div>
            <button
              onClick={() => handleAISearch()}
              disabled={!aiQuery.trim() || aiLoading}
              className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-accent to-purple-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {aiLoading ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              Search
            </button>
          </div>

          <MarketStatusBadge compact />

          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 rounded-lg border border-border/50 px-2.5 py-1.5 text-[11px] text-muted transition hover:border-danger/40 hover:text-danger"
            >
              <RotateCcw className="h-3 w-3" />
              Reset{" "}
              <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
                {activeFilterCount}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ── Goal-based + Expert Screens Bar ── */}
      <div className="flex shrink-0 flex-col border-b border-border/30">
        {/* Goal screens row */}
        <div className="flex items-center gap-2 overflow-x-auto bg-bg/60 px-4 py-2 scrollbar-hide">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted">I want…</span>
          <div className="h-3 w-px bg-border/40" />
          {GOAL_SCREENS.map((gs) => (
            <button
              key={gs.label}
              onClick={() => { setAiQuery(gs.query); handleAISearch(gs.query); }}
              title="AI-powered search — results are AI suggestions, not certified recommendations"
              className="group shrink-0 flex items-center gap-1.5 rounded-full border border-border/50 bg-panel/60 px-3 py-1 text-[11px] font-semibold text-muted transition hover:border-accent/40 hover:bg-accent/5 hover:text-text"
            >
              <gs.icon className={`h-3 w-3 ${gs.color}`} />
              {gs.label}
            </button>
          ))}
          <div className="h-3 w-px bg-border/40 mx-1" />
          <span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent">
            AI
          </span>
          {PRESET_SCREENS.map((screen) => (
            <button
              key={screen.label}
              onClick={() => { setAiQuery(screen.query); handleAISearch(screen.query); }}
              className="shrink-0 rounded-full border border-border/40 bg-bg/50 px-3 py-1 text-[11px] text-muted transition hover:border-accent/30 hover:text-accent"
            >
              {screen.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main Body: Sidebar + Results ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar ── */}
        <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-border/40 bg-panel/60 backdrop-blur-sm lg:flex">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              Filters
            </span>
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="text-[10px] text-muted transition hover:text-danger"
              >
                Reset all
              </button>
            )}
          </div>

          {/* Exchange */}
          <FilterSection icon={Activity} title="Exchange">
            <div className="flex gap-1.5">
              {["NSE", "BSE"].map((ex) => (
                <button
                  key={ex}
                  onClick={() => updateFilter("exchange", ex)}
                  className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition ${
                    filters.exchange === ex
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-border/50 bg-bg/50 text-muted hover:border-accent/30"
                  }`}
                >
                  {ex}
                </button>
              ))}
            </div>
          </FilterSection>

          {/* Sector */}
          <FilterSection icon={Filter} title="Sector">
            <div className="relative">
              <select
                value={filters.sector}
                onChange={(e) => updateFilter("sector", e.target.value)}
                className="w-full appearance-none rounded-lg border border-border/50 bg-bg/60 px-3 py-1.5 text-xs text-text outline-none focus:border-accent/40"
              >
                <option value="">All Sectors</option>
                {SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
            </div>
          </FilterSection>

          {/* Market Cap */}
          <FilterSection icon={TrendingUp} title="Market Cap">
            <div className="space-y-2">
              <div className="flex gap-1.5">
                {MARKET_CAP_PRESETS.map((preset, i) => (
                  <button
                    key={preset.label}
                    onClick={() => handleCapPreset(i)}
                    className={`flex-1 rounded-lg border py-1 text-[10px] font-semibold transition ${
                      activeCapPreset === i
                        ? "border-accent/50 bg-accent/10 text-accent"
                        : "border-border/50 bg-bg/50 text-muted hover:border-accent/30"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted">
                <span>{activeCapPreset !== null ? MARKET_CAP_PRESETS[activeCapPreset].subtitle : "Any"}</span>
              </div>
            </div>
          </FilterSection>

          {/* PE Ratio */}
          <FilterSection icon={BarChart2} title="PE Ratio" defaultOpen={false}>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                placeholder="Min"
                value={filters.pe_min || ""}
                onChange={(e) => updateFilter("pe_min", Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-border/50 bg-bg/60 px-2 py-1.5 text-xs text-text outline-none focus:border-accent/40"
              />
              <span className="shrink-0 text-[10px] text-muted">to</span>
              <input
                type="number"
                placeholder="Max"
                value={filters.pe_max || ""}
                onChange={(e) => updateFilter("pe_max", Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-border/50 bg-bg/60 px-2 py-1.5 text-xs text-text outline-none focus:border-accent/40"
              />
            </div>
          </FilterSection>

          {/* Price Range */}
          <FilterSection icon={DollarSign} title="Price (₹)" defaultOpen={false}>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                placeholder="Min"
                value={filters.price_min || ""}
                onChange={(e) => updateFilter("price_min", Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-border/50 bg-bg/60 px-2 py-1.5 text-xs text-text outline-none focus:border-accent/40"
              />
              <span className="shrink-0 text-[10px] text-muted">to</span>
              <input
                type="number"
                placeholder="Max"
                value={filters.price_max || ""}
                onChange={(e) => updateFilter("price_max", Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-border/50 bg-bg/60 px-2 py-1.5 text-xs text-text outline-none focus:border-accent/40"
              />
            </div>
          </FilterSection>

          {/* Dividend */}
          <FilterSection icon={Percent} title="Min Div. Yield %" defaultOpen={false}>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 2.5"
              value={filters.dividend_min || ""}
              onChange={(e) => updateFilter("dividend_min", Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-border/50 bg-bg/60 px-2 py-1.5 text-xs text-text outline-none focus:border-accent/40"
            />
          </FilterSection>

          {/* Volume */}
          <FilterSection icon={Zap} title="Min Volume" defaultOpen={false}>
            <input
              type="number"
              placeholder="e.g. 100000"
              value={filters.volume_min || ""}
              onChange={(e) => updateFilter("volume_min", Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-border/50 bg-bg/60 px-2 py-1.5 text-xs text-text outline-none focus:border-accent/40"
            />
          </FilterSection>

          {/* Apply Button */}
          <div className="sticky bottom-0 border-t border-border/40 bg-panel/90 p-4 backdrop-blur-sm">
            <button
              onClick={applyFilters}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-amber-500 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-90 disabled:opacity-60"
            >
              <Search className="h-4 w-4" />
              {loading ? "Screening…" : "Apply Filters"}
            </button>
          </div>
        </aside>

        {/* ── Mobile Filters Row (compact horizontal) ── */}
        <div className="lg:hidden border-b border-border/30 bg-panel/40 px-3 py-2 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-hide">
          <select
            value={filters.exchange}
            onChange={(e) => updateFilter("exchange", e.target.value)}
            className="shrink-0 rounded-lg border border-border/50 bg-bg px-2 py-1 text-[11px] text-text outline-none"
          >
            <option value="NSE">NSE</option>
            <option value="BSE">BSE</option>
          </select>
          <select
            value={filters.sector}
            onChange={(e) => updateFilter("sector", e.target.value)}
            className="shrink-0 rounded-lg border border-border/50 bg-bg px-2 py-1 text-[11px] text-text outline-none"
          >
            <option value="">All Sectors</option>
            {SECTORS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {MARKET_CAP_PRESETS.map((preset, i) => (
            <button
              key={preset.label}
              onClick={() => handleCapPreset(i)}
              className={`shrink-0 rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
                activeCapPreset === i
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-border/50 bg-bg/50 text-muted"
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            onClick={applyFilters}
            disabled={loading}
            className="shrink-0 rounded-lg bg-accent px-3 py-1 text-[11px] font-semibold text-white"
          >
            {loading ? "…" : "Apply"}
          </button>
        </div>

        {/* ── Results Panel ── */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Results Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-border/30 bg-panel/40 px-4 py-2">
            <div className="flex items-center gap-3">
              {hasSearched && !loading && (
                <p className="text-xs text-muted">
                  Showing{" "}
                  <span className="font-semibold text-text">1 - {results.length}</span> of{" "}
                  <span className="font-semibold text-text">{results.length}</span> results
                </p>
              )}
              {loading && <p className="text-xs text-muted">Fetching results…</p>}
            </div>

            {/* AI parsed filters display */}
            {aiMode && aiParsedFilters && Object.keys(aiParsedFilters).length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-accent" />
                {Object.entries(aiParsedFilters)
                  .filter(([, v]) => v && v !== 0 && v !== "")
                  .slice(0, 4)
                  .map(([k, v]) => (
                    <span
                      key={k}
                      className="rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent"
                    >
                      {k}: {String(v)}
                    </span>
                  ))}
              </div>
            )}
          </div>

          {/* Table Content */}
          <div className="flex-1 overflow-auto">
            {/* Loading shimmer */}
            {loading && (
              <div>
                <div className="border-b border-border/30 bg-bg/40 px-4 py-3 flex gap-4">
                  {[160, 80, 80, 80, 80, 80, 80, 80].map((w, i) => (
                    <div key={i} className="shimmer h-3 rounded" style={{ width: w }} />
                  ))}
                </div>
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 border-b border-border/20 px-4 py-3.5"
                  >
                    {[120, 180, 70, 60, 90, 60, 60, 70].map((w, j) => (
                      <div key={j} className="shimmer h-3.5 rounded" style={{ width: w }} />
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Error state */}
            {!loading && error && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-danger/30 bg-danger/10">
                  <X className="h-6 w-6 text-danger" />
                </div>
                <p className="text-sm font-medium">{error}</p>
                <button
                  onClick={applyFilters}
                  className="mt-4 rounded-xl bg-accent/10 px-4 py-2 text-xs font-medium text-accent transition hover:bg-accent/20"
                >
                  Try Again
                </button>
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && hasSearched && results.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/40 bg-panel/60">
                  <Search className="h-6 w-6 text-muted" />
                </div>
                <p className="text-sm font-medium">No stocks match your filters</p>
                <p className="mt-1 max-w-xs text-xs text-muted">
                  Try relaxing your criteria — reduce restrictions on market cap, PE, or sector.
                </p>
                <button
                  onClick={resetFilters}
                  className="mt-4 rounded-xl bg-accent/10 px-4 py-2 text-xs font-medium text-accent transition hover:bg-accent/20"
                >
                  Reset All Filters
                </button>
              </div>
            )}

            {/* Results Table */}
            {!loading && !error && results.length > 0 && (
              <table className="w-full min-w-[780px] text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border/40 bg-bg/95 backdrop-blur-sm">
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted w-8">
                      #
                    </th>
                    {(
                      [
                        { key: "companyName", label: "Name", align: "left", tip: "" },
                        { key: "marketCap", label: "Market Cap", align: "right", tip: "Total market value of the company. Largecap >20K Cr, Midcap 5K–20K, Smallcap <5K Cr." },
                        { key: "price", label: "Close Price", align: "right", tip: "Last traded price of the stock in INR." },
                        { key: "pe", label: "PE Ratio", align: "right", tip: "Price-to-Earnings ratio. Lower = cheaper stock. Green (<15), Normal (15–30), Expensive (>50)." },
                        { key: "changePercent", label: "1D Return", align: "right", tip: "Today's price change in %. Green = up, Red = down." },
                        { key: "roe", label: "ROE %", align: "right", tip: "Return on Equity. How much profit the company makes on shareholders' money. ≥20% is excellent." },
                        { key: "dividendYield", label: "Div Yield %", align: "right", tip: "Annual dividend paid as % of current price. ≥3% is high. Great for income investors." },
                        { key: "sector", label: "Sector", align: "left", tip: "" },
                      ] as { key: SortKey; label: string; align: string; tip: string }[]
                    ).map(({ key, label, align, tip }) => (
                      <th
                        key={key}
                        onClick={() => handleSort(key)}
                        className={`cursor-pointer whitespace-nowrap px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted transition hover:text-text ${
                          align === "right" ? "text-right" : ""
                        } ${
                          key === "sector" ? "hidden lg:table-cell" :
                          key === "roe" || key === "dividendYield" ? "hidden md:table-cell" : ""
                        }`}
                      >
                        {tip ? (
                          <Tooltip text={tip}>
                            <span>{label}</span>
                          </Tooltip>
                        ) : label}
                        {sortKey === key ? (
                          sortDir === "asc" ? (
                            <ArrowUp className="ml-1 inline h-3 w-3 text-accent" />
                          ) : (
                            <ArrowDown className="ml-1 inline h-3 w-3 text-accent" />
                          )
                        ) : (
                          <ArrowUpDown className="ml-1 inline h-3 w-3 text-muted/40" />
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((stock, idx) => (
                    <tr
                      key={stock.symbol}
                      title={`✓ ${getMatchReasons(stock, filters).join(" · ")}`}
                      onClick={() => router.push(buildStockHref(stock.symbol, stock.exchange))}
                      className="group cursor-pointer border-b border-border/20 transition-colors hover:bg-accent/5"
                    >
                      <td className="px-4 py-3 text-[11px] text-muted tabular-nums">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-text">{stock.companyName}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-[11px] text-muted">{stock.symbol}</p>
                            <span className="rounded-md bg-bg px-1.5 py-0.5 text-[10px] text-muted">{stock.exchange || "NSE"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium tabular-nums text-muted">
                        {formatMarketCap(stock.marketCap)}
                      </td>
                      <td className="px-4 py-3 text-right font-[var(--font-space)] text-sm font-semibold tabular-nums text-text">
                        ₹{formatNumber(stock.price)}
                      </td>
                      <td className={`px-4 py-3 text-right text-sm tabular-nums ${peColor(stock.pe)}`}>
                        {formatNumber(stock.pe)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                            stock.changePercent >= 0
                              ? "bg-success/10 text-success"
                              : "bg-danger/10 text-danger"
                          }`}
                        >
                          {stock.changePercent >= 0 ? "+" : ""}
                          {formatNumber(stock.changePercent)}%
                        </span>
                      </td>
                      <td className={`hidden px-4 py-3 text-right text-sm tabular-nums md:table-cell ${roeColor(stock.roe)}`}>
                        {stock.roe != null ? `${formatNumber(stock.roe)}%` : "-"}
                      </td>
                      <td className={`hidden px-4 py-3 text-right text-sm tabular-nums md:table-cell ${divColor(stock.dividendYield)}`}>
                        {stock.dividendYield != null ? `${formatNumber(stock.dividendYield)}%` : "-"}
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        {stock.sector ? (
                          <span className="rounded-full border border-border/50 bg-bg/60 px-2 py-0.5 text-[10px] font-medium text-muted">
                            {stock.sector}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted/40">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          {!loading && results.length > 0 && (
            <div className="shrink-0 border-t border-border/30 bg-panel/40 px-4 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] text-muted">
                  {results.length} results · Sorted by{" "}
                  <span className="text-text">{sortKey}</span> ({sortDir}) · Click any row to open stock analysis
                </p>
                <p className="text-[10px] text-muted/60">
                  Data: FMP · ~Market cap converted from USD · Not investment advice
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
