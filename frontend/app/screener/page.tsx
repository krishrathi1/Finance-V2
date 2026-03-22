"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  Filter,
  BarChart3,
  X,
  Sparkles,
  Send,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ViewportMotionSection } from "@/components/viewport-motion-section";
import { fetchScreenerResults, fetchAIScreenerResults } from "@/lib/api";
import type { ScreenerFilters, ScreenerResult } from "@/lib/types";

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

// FMP returns marketCap in USD. Approx conversions at ₹84/USD:
// 500 Cr ≈ $60M | 5000 Cr ≈ $600M | 20000 Cr ≈ $2.4B
const MARKET_CAP_PRESETS = [
  { label: "Micro", subtitle: "<500Cr", min: 0, max: 60_000_000 },
  { label: "Small", subtitle: "500-5K Cr", min: 60_000_000, max: 600_000_000 },
  { label: "Mid", subtitle: "5K-20K Cr", min: 600_000_000, max: 2_400_000_000 },
  { label: "Large", subtitle: ">20K Cr", min: 2_400_000_000, max: 0 },
] as const;

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

// FMP returns marketCap in USD; convert to INR Cr for display (₹84/USD approx)
function formatMarketCap(usd: number): string {
  if (!usd) return "-";
  const crore = Math.round((usd * 84) / 1e7);
  if (crore >= 100_000) return `₹${(crore / 100_000).toFixed(2)}L Cr`;
  if (crore >= 1_000) return `₹${(crore / 1_000).toFixed(1)}K Cr`;
  return `₹${crore} Cr`;
}

function formatVolume(value: number): string {
  if (!value) return "-";
  if (value >= 10000000) return `${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || isNaN(value)) return "-";
  return value.toFixed(decimals);
}

const AI_SUGGESTIONS = [
  "Debt-free large cap IT stocks with PE under 30",
  "High dividend yield Finance stocks above 3%",
  "Small cap pharma companies with strong growth",
  "Undervalued mid cap stocks with low PE",
];

export default function ScreenerPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<ScreenerFilters>({ ...DEFAULT_FILTERS });
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("marketCap");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [activeCapPreset, setActiveCapPreset] = useState<number | null>(null);

  // AI Screener state
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

  const handleAISearch = useCallback(async (query?: string) => {
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
      setAiError("AI screener unavailable. Try using manual filters below.");
      setAiMode(false);
    } finally {
      setAiLoading(false);
    }
  }, [aiQuery]);

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

  // Auto-search on mount with default filters
  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col)
      return <ArrowUpDown className="ml-1 inline h-3 w-3 text-muted/50" />;
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
    <div className="stagger-fade space-y-5 py-4 sm:space-y-6 sm:py-6">
      {/* Header */}
      <ViewportMotionSection className="gradient-border relative overflow-hidden rounded-2xl p-5 sm:rounded-[28px] sm:p-8">
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <span className="pulse-dot h-2 w-2 rounded-full bg-accent" />
            <p className="text-[10px] uppercase tracking-[0.3em] text-accent sm:text-xs">
              Stock Screener
            </p>
          </div>
          <h1 className="mt-3 font-[var(--font-space)] text-2xl font-bold leading-tight sm:mt-4 sm:text-3xl md:text-4xl">
            Find Your Next{" "}
            <span className="bg-gradient-to-r from-accent via-amber-500 to-orange-400 bg-clip-text text-transparent">
              Investment
            </span>
          </h1>
          <p className="mt-2 max-w-2xl text-xs text-muted sm:mt-3 sm:text-sm">
            Screen stocks across NSE and BSE using fundamental filters &mdash; market cap, PE ratio,
            dividend yield, sector, and more.
          </p>
        </div>
      </ViewportMotionSection>

      {/* AI Natural Language Screener */}
      <section className="rounded-2xl border border-accent/30 bg-gradient-to-r from-accent/5 via-purple-500/5 to-transparent p-4 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <p className="text-sm font-semibold text-accent">AI-Powered Screener</p>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">NEW</span>
        </div>
        <p className="mb-3 text-xs text-muted">
          Describe stocks in plain English — our AI converts it to filters automatically.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              ref={aiInputRef}
              type="text"
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAISearch(); }}
              placeholder="e.g. Large cap IT stocks with PE under 30 and positive dividends"
              className="w-full rounded-xl border border-border/60 bg-bg/60 py-2.5 pl-9 pr-4 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
            />
          </div>
          <button
            onClick={() => handleAISearch()}
            disabled={!aiQuery.trim() || aiLoading}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-accent to-purple-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
          >
            {aiLoading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Search</span>
          </button>
        </div>

        {/* Quick suggestions */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {AI_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => { setAiQuery(s); handleAISearch(s); }}
              className="rounded-lg border border-border/50 bg-bg/50 px-2.5 py-1 text-[11px] text-muted transition hover:border-accent/40 hover:text-accent"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Parsed filters badge */}
        {aiMode && aiParsedFilters && Object.keys(aiParsedFilters).length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-muted">Applied filters:</span>
            {Object.entries(aiParsedFilters).map(([k, v]) => (
              <span key={k} className="rounded-md bg-accent/10 px-2 py-0.5 font-medium text-accent">
                {k}: {String(v)}
              </span>
            ))}
          </div>
        )}
        {aiError && <p className="mt-2 text-xs text-danger">{aiError}</p>}
      </section>

      {/* Filters + Results */}
      <div className="space-y-4">
        {/* Filter Toggle (mobile) + Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl border border-border/60 bg-panel/80 px-4 py-2 text-sm font-medium text-text backdrop-blur-sm transition hover:border-accent/30"
          >
            <SlidersHorizontal className="h-4 w-4 text-accent" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
            {filtersOpen ? (
              <ChevronUp className="h-4 w-4 text-muted" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted" />
            )}
          </button>

          {hasSearched && !loading && (
            <p className="text-xs text-muted sm:text-sm">
              <span className="font-semibold text-text">{results.length}</span> stocks found
            </p>
          )}
        </div>

        {/* Filters Panel */}
        {filtersOpen && (
          <Card className="glow-card overflow-hidden">
            <CardContent className="pt-4">
              <div className="grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
                {/* Exchange Toggle */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    <BarChart3 className="h-3.5 w-3.5" />
                    Exchange
                  </label>
                  <div className="inline-flex rounded-xl border border-border/40 bg-bg/60 p-1 backdrop-blur-sm">
                    {["NSE", "BSE"].map((ex) => (
                      <button
                        key={ex}
                        onClick={() => updateFilter("exchange", ex)}
                        className={`rounded-lg px-4 py-1.5 text-xs font-medium transition sm:text-sm ${
                          filters.exchange === ex
                            ? "bg-panel text-text shadow-sm"
                            : "text-muted hover:text-text"
                        }`}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sector Dropdown */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    <Filter className="h-3.5 w-3.5" />
                    Sector
                  </label>
                  <div className="relative">
                    <select
                      value={filters.sector}
                      onChange={(e) => updateFilter("sector", e.target.value)}
                      className="w-full appearance-none rounded-xl border border-border/60 bg-panel/80 px-3 py-2 pr-8 text-xs text-text backdrop-blur-sm outline-none transition focus:border-accent/40 sm:text-sm"
                    >
                      <option value="">All Sectors</option>
                      {SECTORS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  </div>
                </div>

                {/* Market Cap Presets */}
                <div className="space-y-2 md:col-span-2 lg:col-span-1">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Market Cap
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {MARKET_CAP_PRESETS.map((preset, i) => (
                      <button
                        key={preset.label}
                        onClick={() => handleCapPreset(i)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                          activeCapPreset === i
                            ? "border-accent/50 bg-accent/10 text-accent"
                            : "border-border/50 bg-bg/50 text-muted hover:border-accent/30 hover:text-text"
                        }`}
                      >
                        {preset.label}
                        <span className="ml-1 text-[10px] opacity-70">{preset.subtitle}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* PE Ratio Range */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted">PE Ratio Range</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={filters.pe_min || ""}
                      onChange={(e) => updateFilter("pe_min", Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-border/60 bg-panel/80 px-3 py-2 text-xs text-text backdrop-blur-sm outline-none transition placeholder:text-muted/50 focus:border-accent/40 sm:text-sm"
                    />
                    <span className="text-xs text-muted">to</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={filters.pe_max || ""}
                      onChange={(e) => updateFilter("pe_max", Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-border/60 bg-panel/80 px-3 py-2 text-xs text-text backdrop-blur-sm outline-none transition placeholder:text-muted/50 focus:border-accent/40 sm:text-sm"
                    />
                  </div>
                </div>

                {/* Price Range */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted">Price Range (INR)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={filters.price_min || ""}
                      onChange={(e) => updateFilter("price_min", Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-border/60 bg-panel/80 px-3 py-2 text-xs text-text backdrop-blur-sm outline-none transition placeholder:text-muted/50 focus:border-accent/40 sm:text-sm"
                    />
                    <span className="text-xs text-muted">to</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={filters.price_max || ""}
                      onChange={(e) => updateFilter("price_max", Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-border/60 bg-panel/80 px-3 py-2 text-xs text-text backdrop-blur-sm outline-none transition placeholder:text-muted/50 focus:border-accent/40 sm:text-sm"
                    />
                  </div>
                </div>

                {/* Dividend + Volume */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted">Min Div. Yield %</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="0"
                      value={filters.dividend_min || ""}
                      onChange={(e) => updateFilter("dividend_min", Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-border/60 bg-panel/80 px-3 py-2 text-xs text-text backdrop-blur-sm outline-none transition placeholder:text-muted/50 focus:border-accent/40 sm:text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted">Min Volume</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={filters.volume_min || ""}
                      onChange={(e) => updateFilter("volume_min", Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-border/60 bg-panel/80 px-3 py-2 text-xs text-text backdrop-blur-sm outline-none transition placeholder:text-muted/50 focus:border-accent/40 sm:text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  onClick={applyFilters}
                  disabled={loading}
                  className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-accent to-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition hover:shadow-accent/30 disabled:opacity-60"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    {loading ? "Screening..." : "Apply Filters"}
                  </span>
                  <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
                </button>

                <button
                  onClick={resetFilters}
                  className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-panel/60 px-4 py-2.5 text-sm font-medium text-muted transition hover:border-danger/30 hover:text-danger"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </button>

                {/* Active filter chips */}
                {filters.sector && (
                  <span className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] font-medium text-accent sm:text-xs">
                    {filters.sector}
                    <button
                      onClick={() => updateFilter("sector", "")}
                      className="ml-0.5 rounded-full p-0.5 transition hover:bg-accent/20"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {activeCapPreset !== null && (
                  <span className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] font-medium text-accent sm:text-xs">
                    {MARKET_CAP_PRESETS[activeCapPreset].label} Cap
                    <button
                      onClick={() => handleCapPreset(activeCapPreset)}
                      className="ml-0.5 rounded-full p-0.5 transition hover:bg-accent/20"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results Table */}
        <Card className="overflow-hidden">
          {/* Loading Shimmer */}
          {loading && (
            <div className="space-y-0">
              {/* Shimmer Header */}
              <div className="border-b border-border/40 px-4 py-3">
                <div className="shimmer h-4 w-48 rounded-lg" />
              </div>
              {/* Shimmer Rows */}
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 border-b border-border/20 px-4 py-3.5"
                >
                  <div className="shimmer h-4 w-16 rounded" />
                  <div className="shimmer h-4 w-32 rounded" />
                  <div className="shimmer ml-auto h-4 w-16 rounded" />
                  <div className="shimmer h-4 w-12 rounded" />
                  <div className="shimmer h-4 w-20 rounded" />
                  <div className="shimmer hidden h-4 w-12 rounded sm:block" />
                  <div className="shimmer hidden h-4 w-12 rounded md:block" />
                  <div className="shimmer hidden h-4 w-12 rounded lg:block" />
                  <div className="shimmer hidden h-4 w-24 rounded lg:block" />
                </div>
              ))}
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-danger/30 bg-danger/10">
                <X className="h-6 w-6 text-danger" />
              </div>
              <p className="text-sm font-medium text-text">Something went wrong</p>
              <p className="mt-1 text-xs text-muted">{error}</p>
              <button
                onClick={applyFilters}
                className="mt-4 rounded-xl bg-accent/10 px-4 py-2 text-xs font-medium text-accent transition hover:bg-accent/20"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && hasSearched && results.length === 0 && (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/40 bg-panel/60">
                <Search className="h-6 w-6 text-muted" />
              </div>
              <p className="text-sm font-medium text-text">No stocks match your filters</p>
              <p className="mt-1 max-w-xs text-xs text-muted">
                Try broadening your criteria &mdash; reduce restrictions on market cap, PE ratio, or
                sector to see more results.
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left">
                <thead>
                  <tr className="border-b border-border/40 bg-bg/40">
                    <th
                      onClick={() => handleSort("symbol")}
                      className="cursor-pointer whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted transition hover:text-text"
                    >
                      Symbol
                      <SortIcon col="symbol" />
                    </th>
                    <th
                      onClick={() => handleSort("companyName")}
                      className="cursor-pointer whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted transition hover:text-text"
                    >
                      Company
                      <SortIcon col="companyName" />
                    </th>
                    <th
                      onClick={() => handleSort("price")}
                      className="cursor-pointer whitespace-nowrap px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted transition hover:text-text"
                    >
                      Price
                      <SortIcon col="price" />
                    </th>
                    <th
                      onClick={() => handleSort("changePercent")}
                      className="cursor-pointer whitespace-nowrap px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted transition hover:text-text"
                    >
                      Change%
                      <SortIcon col="changePercent" />
                    </th>
                    <th
                      onClick={() => handleSort("marketCap")}
                      className="cursor-pointer whitespace-nowrap px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted transition hover:text-text"
                    >
                      Market Cap
                      <SortIcon col="marketCap" />
                    </th>
                    <th
                      onClick={() => handleSort("pe")}
                      className="hidden cursor-pointer whitespace-nowrap px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted transition hover:text-text sm:table-cell"
                    >
                      PE
                      <SortIcon col="pe" />
                    </th>
                    <th
                      onClick={() => handleSort("roe")}
                      className="hidden cursor-pointer whitespace-nowrap px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted transition hover:text-text md:table-cell"
                    >
                      ROE%
                      <SortIcon col="roe" />
                    </th>
                    <th
                      onClick={() => handleSort("dividendYield")}
                      className="hidden cursor-pointer whitespace-nowrap px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted transition hover:text-text md:table-cell"
                    >
                      Div Yield%
                      <SortIcon col="dividendYield" />
                    </th>
                    <th
                      onClick={() => handleSort("sector")}
                      className="hidden cursor-pointer whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted transition hover:text-text lg:table-cell"
                    >
                      Sector
                      <SortIcon col="sector" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((stock, idx) => (
                    <tr
                      key={stock.symbol}
                      onClick={() => router.push(`/stocks/${stock.symbol}`)}
                      className={`cursor-pointer border-b border-border/20 transition hover:bg-accent/5 ${
                        idx % 2 === 0 ? "bg-transparent" : "bg-panel/20"
                      }`}
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="font-[var(--font-space)] text-sm font-semibold text-accent">
                          {stock.symbol}
                        </span>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-sm text-text">
                        {stock.companyName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-[var(--font-space)] text-sm font-medium tabular-nums text-text">
                        {formatNumber(stock.price)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <span
                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                            stock.changePercent >= 0
                              ? "bg-success/10 text-success"
                              : "bg-danger/10 text-danger"
                          }`}
                        >
                          {stock.changePercent >= 0 ? "+" : ""}
                          {formatNumber(stock.changePercent)}%
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-muted">
                        {formatMarketCap(stock.marketCap)}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-muted sm:table-cell">
                        {formatNumber(stock.pe)}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-muted md:table-cell">
                        {formatNumber(stock.roe)}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-muted md:table-cell">
                        {formatNumber(stock.dividendYield)}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 lg:table-cell">
                        <span className="rounded-full border border-border/50 bg-bg/50 px-2 py-0.5 text-[10px] font-medium text-muted">
                          {stock.sector || "-"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Results Footer */}
          {!loading && !error && results.length > 0 && (
            <div className="border-t border-border/40 px-4 py-3">
              <p className="text-[10px] text-muted sm:text-xs">
                Showing {results.length} result{results.length !== 1 ? "s" : ""} &middot; Sorted by{" "}
                <span className="font-medium text-text">
                  {sortKey === "changePercent"
                    ? "Change%"
                    : sortKey === "companyName"
                    ? "Company"
                    : sortKey === "marketCap"
                    ? "Market Cap"
                    : sortKey === "dividendYield"
                    ? "Div Yield"
                    : sortKey.toUpperCase()}
                </span>{" "}
                ({sortDir === "asc" ? "ascending" : "descending"}) &middot; Click any row to view
                detailed analysis
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
