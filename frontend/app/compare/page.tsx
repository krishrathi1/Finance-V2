"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  GitCompareArrows,
  Loader2,
  Search,
  Shield,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchCompareAnalysis, fetchDashboard, searchStocks } from "@/lib/api";
import type { DashboardData } from "@/lib/types";

type SearchResult = { symbol: string; name: string; exchange: string };

/* ─── Helpers ─── */

function fmt(v: number | null | undefined, opts?: { prefix?: string; suffix?: string; decimals?: number }): string {
  if (v === null || v === undefined || isNaN(v)) return "N/A";
  const d = opts?.decimals ?? 2;
  const num = v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${opts?.prefix ?? ""}${num}${opts?.suffix ?? ""}`;
}

function fmtCr(v: number | null | undefined): string {
  if (v === null || v === undefined || isNaN(v)) return "N/A";
  if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(2)}L Cr`;
  if (Math.abs(v) >= 100) return `₹${(v / 100).toFixed(2)}K Cr`;
  return `₹${v.toFixed(2)} Cr`;
}

function better(
  a: number | null | undefined,
  b: number | null | undefined,
  higher: boolean
): "a" | "b" | "none" {
  if (a === null || a === undefined || isNaN(a)) return b !== null && b !== undefined && !isNaN(b) ? "b" : "none";
  if (b === null || b === undefined || isNaN(b)) return "a";
  if (a === b) return "none";
  return higher ? (a > b ? "a" : "b") : (a < b ? "a" : "b");
}

/* ─── Search Input Component ─── */

function SymbolInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSearch(q: string) {
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      const res = await searchStocks(q);
      setResults(res);
      setOpen(true);
    }, 250);
  }

  function select(symbol: string) {
    setQuery(symbol);
    onChange(symbol);
    setOpen(false);
  }

  return (
    <div className={`relative flex-1 ${open ? "z-[80]" : "z-0"}`} ref={containerRef}>
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">
        {label}
      </label>
      <div className="flex items-center rounded-xl border border-border/60 bg-panel/80 px-3 backdrop-blur-sm focus-within:border-accent/50">
        <Search className="mr-2 h-4 w-4 shrink-0 text-muted" />
        <input
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) {
              onChange(query.toUpperCase());
              setOpen(false);
            }
          }}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          placeholder="e.g. RELIANCE"
          className="h-10 w-full bg-transparent text-sm outline-none focus:shadow-none focus-visible:shadow-none sm:h-11"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-[90] mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-border/60 bg-panel/95 p-1 shadow-2xl backdrop-blur-xl">
          {results.map((item) => (
            <button
              key={item.symbol}
              onMouseDown={(e) => { e.preventDefault(); select(item.symbol); }}
              className="group flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-accent/8"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10 text-[10px] font-bold text-accent">
                  {item.symbol.slice(0, 2)}
                </span>
                <div>
                  <p className="text-sm font-semibold">{item.symbol}</p>
                  <p className="text-[10px] text-muted">{item.name}</p>
                </div>
              </div>
              <span className="rounded-md bg-bg px-1.5 py-0.5 text-[10px] text-muted">
                {item.exchange}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Comparison Row ─── */

function CompRow({
  label,
  valA,
  valB,
  higherIsBetter = true,
}: {
  label: string;
  valA: string;
  valB: string;
  higherIsBetter?: boolean;
}) {
  const numA = parseFloat(valA.replace(/[₹%LCrKN/A\s]/g, "").replace(/,/g, ""));
  const numB = parseFloat(valB.replace(/[₹%LCrKN/A\s]/g, "").replace(/,/g, ""));
  const win = better(
    isNaN(numA) ? null : numA,
    isNaN(numB) ? null : numB,
    higherIsBetter
  );

  return (
    <div className="grid grid-cols-3 items-center gap-2 rounded-lg px-3 py-2 text-sm transition odd:bg-panel/40 even:bg-transparent hover:bg-accent/5 sm:gap-4 sm:px-4">
      <span className="text-xs text-muted sm:text-sm">{label}</span>
      <span
        className={`text-right font-medium ${
          win === "a" ? "text-success" : "text-text"
        }`}
      >
        {valA}
        {win === "a" && <span className="ml-1 text-[10px] text-success">&#9650;</span>}
      </span>
      <span
        className={`text-right font-medium ${
          win === "b" ? "text-success" : "text-text"
        }`}
      >
        {valB}
        {win === "b" && <span className="ml-1 text-[10px] text-success">&#9650;</span>}
      </span>
    </div>
  );
}

/* ─── Score Bar ─── */

function ScoreBar({
  label,
  scoreA,
  scoreB,
  maxScore,
  colorA,
  colorB,
}: {
  label: string;
  scoreA: number;
  scoreB: number;
  maxScore: number;
  colorA: string;
  colorB: string;
}) {
  const pctA = Math.min((scoreA / maxScore) * 100, 100);
  const pctB = Math.min((scoreB / maxScore) * 100, 100);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium">{scoreA.toFixed(1)}</span>
            <span className="text-muted">/ {maxScore}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-bg/80">
            <div
              className={`h-full rounded-full transition-all duration-700 ${colorA}`}
              style={{ width: `${pctA}%` }}
            />
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium">{scoreB.toFixed(1)}</span>
            <span className="text-muted">/ {maxScore}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-bg/80">
            <div
              className={`h-full rounded-full transition-all duration-700 ${colorB}`}
              style={{ width: `${pctB}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Section Wrapper ─── */

function Section({
  title,
  icon,
  symbolA,
  symbolB,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  symbolA: string;
  symbolB: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          {icon}
          {title}
        </CardTitle>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] font-medium uppercase tracking-wider text-muted sm:gap-4">
          <span>Metric</span>
          <span className="text-right text-accent">{symbolA}</span>
          <span className="text-right text-accent">{symbolB}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-0.5">{children}</CardContent>
    </Card>
  );
}

/* ─── Main Page ─── */

function ComparePageContent() {
  const searchParams = useSearchParams();
  const [symbolA, setSymbolA] = useState(() => searchParams.get("a") || "");
  const [symbolB, setSymbolB] = useState(() => searchParams.get("b") || "");
  const [dataA, setDataA] = useState<DashboardData | null>(null);
  const [dataB, setDataB] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysis, setAnalysis] = useState<{ answer: string; source: "gemini" | "fallback" } | null>(null);
  const [error, setError] = useState("");

  const handleCompare = useCallback(async () => {
    const a = symbolA.trim().toUpperCase();
    const b = symbolB.trim().toUpperCase();
    if (!a || !b) {
      setError("Please enter both stock symbols.");
      return;
    }
    if (a === b) {
      setError("Please enter two different stock symbols.");
      return;
    }
    setError("");
    setLoading(true);
    setDataA(null);
    setDataB(null);
    setAnalysis(null);
    try {
      const [resA, resB] = await Promise.all([
        fetchDashboard(a),
        fetchDashboard(b),
      ]);
      setDataA(resA);
      setDataB(resB);
    } catch (err) {
      setError(
        `Failed to fetch data. ${err instanceof Error ? err.message : "Please try again."}`
      );
    } finally {
      setLoading(false);
    }
  }, [symbolA, symbolB]);

  const handleAIAnalysis = useCallback(async () => {
    const a = symbolA.trim().toUpperCase();
    const b = symbolB.trim().toUpperCase();
    if (!a || !b || a === b) return;
    setAnalysisLoading(true);
    try {
      const result = await fetchCompareAnalysis(a, b);
      setAnalysis(result);
    } finally {
      setAnalysisLoading(false);
    }
  }, [symbolA, symbolB]);

  const hasData = dataA && dataB;

  return (
    <div className="stagger-fade space-y-6 py-4 sm:space-y-8 sm:py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted">
            <Link href="/" className="hover:text-text">
              Home
            </Link>{" "}
            / Compare
          </p>
          <h1 className="mt-1 font-[var(--font-space)] text-2xl font-bold sm:text-3xl">
            <span className="bg-gradient-to-r from-accent to-amber-400 bg-clip-text text-transparent">
              Stock Comparison
            </span>
          </h1>
          <p className="mt-1 text-xs text-muted sm:text-sm">
            Compare two stocks side-by-side across all key metrics
          </p>
        </div>
        <Link
          href="/watchlist"
          className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-panel/80 px-3 py-2 text-xs font-medium text-muted backdrop-blur-sm transition hover:border-accent/40 hover:text-accent sm:text-sm"
        >
          <TrendingUp className="h-3.5 w-3.5" />
          My Watchlist
        </Link>
      </div>

      {/* Search Inputs */}
      <Card className="relative z-40 overflow-visible">
        <CardContent className="py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <SymbolInput
              label="Stock A"
              value={symbolA}
              onChange={setSymbolA}
            />
            <div className="flex items-center justify-center sm:pb-0.5">
              <GitCompareArrows className="h-5 w-5 text-muted" />
            </div>
            <SymbolInput
              label="Stock B"
              value={symbolB}
              onChange={setSymbolB}
            />
            <button
              onClick={handleCompare}
              disabled={loading}
              className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0 sm:self-end"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BarChart3 className="h-4 w-4" />
              )}
              Compare
            </button>
          </div>
          {error && (
            <p className="mt-3 text-sm text-danger">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="shimmer h-40 rounded-2xl border border-border/40"
            />
          ))}
        </div>
      )}

      {/* Results */}
      {hasData && !loading && (
        <div className="space-y-4">
          <Card className="border-accent/20 bg-gradient-to-r from-accent/6 via-amber-500/5 to-transparent">
            <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" />
                  <p className="text-sm font-semibold">AI Comparison Summary</p>
                  {analysis ? (
                    <span className="rounded-full border border-border/60 bg-panel/70 px-2 py-0.5 text-[10px] font-medium text-muted">
                      Source: {analysis.source === "gemini" ? "Gemini" : "Fallback"}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted">
                  Quant-style summary comparing {dataA.symbol} and {dataB.symbol}
                </p>
              </div>
              <button
                onClick={handleAIAnalysis}
                disabled={analysisLoading}
                className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {analysisLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {analysisLoading ? "Analyzing..." : "AI Analysis"}
              </button>
            </CardContent>
            {analysis ? (
              <CardContent className="pt-0">
                <div className="rounded-2xl border border-border/60 bg-bg/40 p-4">
                  <p className="whitespace-pre-line text-sm leading-7 text-text">{analysis.answer}</p>
                </div>
              </CardContent>
            ) : null}
          </Card>

          {/* Company Names Banner */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[dataA, dataB].map((d) => (
              <Link
                key={d.symbol}
                href={`/stocks/${d.symbol}`}
                className="glow-card flex items-center gap-3 rounded-2xl border border-border/50 bg-panel/60 px-4 py-3 backdrop-blur-sm transition hover:border-accent/30"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-sm font-bold text-accent">
                  {d.symbol.slice(0, 2)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{d.symbol}</p>
                  <p className="truncate text-[11px] text-muted">
                    {d.companyName} &middot; {d.sector || d.exchange}
                  </p>
                </div>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted" />
              </Link>
            ))}
          </div>

          {/* Price & Returns */}
          <Section
            title="Price & Returns"
            icon={<TrendingUp className="h-4 w-4 text-accent" />}
            symbolA={dataA.symbol}
            symbolB={dataB.symbol}
          >
            <CompRow
              label="CMP"
              valA={fmt(dataA.price.cmp, { prefix: "₹" })}
              valB={fmt(dataB.price.cmp, { prefix: "₹" })}
              higherIsBetter={true}
            />
            <CompRow
              label="Change %"
              valA={fmt(dataA.price.changePercent, { suffix: "%" })}
              valB={fmt(dataB.price.changePercent, { suffix: "%" })}
              higherIsBetter={true}
            />
            <CompRow
              label="52W High"
              valA={fmt(dataA.price.fiftyTwoWeekHigh, { prefix: "₹" })}
              valB={fmt(dataB.price.fiftyTwoWeekHigh, { prefix: "₹" })}
              higherIsBetter={true}
            />
            <CompRow
              label="52W Low"
              valA={fmt(dataA.price.fiftyTwoWeekLow, { prefix: "₹" })}
              valB={fmt(dataB.price.fiftyTwoWeekLow, { prefix: "₹" })}
              higherIsBetter={false}
            />
            <CompRow
              label="AI Target"
              valA={fmt(dataA.price.aiTarget, { prefix: "₹" })}
              valB={fmt(dataB.price.aiTarget, { prefix: "₹" })}
              higherIsBetter={true}
            />
          </Section>

          {/* Valuation */}
          <Section
            title="Valuation"
            icon={<BarChart3 className="h-4 w-4 text-accent" />}
            symbolA={dataA.symbol}
            symbolB={dataB.symbol}
          >
            <CompRow
              label="PE Ratio"
              valA={fmt(dataA.metrics.pe)}
              valB={fmt(dataB.metrics.pe)}
              higherIsBetter={false}
            />
            <CompRow
              label="PB Ratio"
              valA={fmt(dataA.metrics.pb)}
              valB={fmt(dataB.metrics.pb)}
              higherIsBetter={false}
            />
            <CompRow
              label="Market Cap"
              valA={fmtCr(dataA.metrics.marketCap)}
              valB={fmtCr(dataB.metrics.marketCap)}
              higherIsBetter={true}
            />
            <CompRow
              label="Dividend Yield"
              valA={fmt(dataA.metrics.dividendYield, { suffix: "%" })}
              valB={fmt(dataB.metrics.dividendYield, { suffix: "%" })}
              higherIsBetter={true}
            />
            <CompRow
              label="EPS"
              valA={fmt(dataA.metrics.eps, { prefix: "₹" })}
              valB={fmt(dataB.metrics.eps, { prefix: "₹" })}
              higherIsBetter={true}
            />
            <CompRow
              label="Book Value"
              valA={fmt(dataA.metrics.bookValue, { prefix: "₹" })}
              valB={fmt(dataB.metrics.bookValue, { prefix: "₹" })}
              higherIsBetter={true}
            />
          </Section>

          {/* Profitability */}
          <Section
            title="Profitability"
            icon={<Sparkles className="h-4 w-4 text-accent" />}
            symbolA={dataA.symbol}
            symbolB={dataB.symbol}
          >
            <CompRow
              label="ROE"
              valA={fmt(dataA.metrics.roe, { suffix: "%" })}
              valB={fmt(dataB.metrics.roe, { suffix: "%" })}
              higherIsBetter={true}
            />
            <CompRow
              label="ROCE"
              valA={fmt(dataA.metrics.roce, { suffix: "%" })}
              valB={fmt(dataB.metrics.roce, { suffix: "%" })}
              higherIsBetter={true}
            />
            <CompRow
              label="Operating Margin"
              valA={fmt(dataA.metrics.operatingMargin, { suffix: "%" })}
              valB={fmt(dataB.metrics.operatingMargin, { suffix: "%" })}
              higherIsBetter={true}
            />
            <CompRow
              label="Net Margin"
              valA={fmt(dataA.metrics.netMargin, { suffix: "%" })}
              valB={fmt(dataB.metrics.netMargin, { suffix: "%" })}
              higherIsBetter={true}
            />
            <CompRow
              label="Revenue Growth"
              valA={fmt(dataA.metrics.revenueGrowth, { suffix: "%" })}
              valB={fmt(dataB.metrics.revenueGrowth, { suffix: "%" })}
              higherIsBetter={true}
            />
            <CompRow
              label="Profit Growth"
              valA={fmt(dataA.metrics.profitGrowth, { suffix: "%" })}
              valB={fmt(dataB.metrics.profitGrowth, { suffix: "%" })}
              higherIsBetter={true}
            />
          </Section>

          {/* Smart Score & Risk Score */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Smart Score */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Sparkles className="h-4 w-4 text-accent" />
                  Smart Score
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScoreBar
                  label="Overall Score"
                  scoreA={dataA.smartScore.score}
                  scoreB={dataB.smartScore.score}
                  maxScore={dataA.smartScore.maxScore || 5}
                  colorA="bg-gradient-to-r from-accent to-amber-400"
                  colorB="bg-gradient-to-r from-blue-500 to-cyan-400"
                />
                <div className="grid grid-cols-3 gap-2 text-[11px] font-medium uppercase tracking-wider text-muted">
                  <span>Dimension</span>
                  <span className="text-right text-accent">
                    {dataA.symbol}
                  </span>
                  <span className="text-right text-accent">
                    {dataB.symbol}
                  </span>
                </div>
                {(() => {
                  const allKeys = new Set([
                    ...Object.keys(dataA.smartScore.dimensions || {}),
                    ...Object.keys(dataB.smartScore.dimensions || {}),
                  ]);
                  return [...allKeys].map((key) => (
                    <CompRow
                      key={key}
                      label={key
                        .replace(/([A-Z])/g, " $1")
                        .replace(/^./, (c) => c.toUpperCase())
                        .trim()}
                      valA={fmt(dataA.smartScore.dimensions?.[key])}
                      valB={fmt(dataB.smartScore.dimensions?.[key])}
                      higherIsBetter={true}
                    />
                  ));
                })()}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="rounded-xl bg-accent/8 px-3 py-2 text-center">
                    <p className="text-lg font-bold text-accent">
                      {dataA.smartScore.label}
                    </p>
                    <p className="text-[10px] text-muted">{dataA.symbol}</p>
                  </div>
                  <div className="rounded-xl bg-blue-500/8 px-3 py-2 text-center">
                    <p className="text-lg font-bold text-blue-400">
                      {dataB.smartScore.label}
                    </p>
                    <p className="text-[10px] text-muted">{dataB.symbol}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Risk Score */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Shield className="h-4 w-4 text-accent" />
                  Risk Score
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScoreBar
                  label="Overall Risk"
                  scoreA={dataA.riskScore.score}
                  scoreB={dataB.riskScore.score}
                  maxScore={dataA.riskScore.maxScore || 5}
                  colorA="bg-gradient-to-r from-danger to-orange-400"
                  colorB="bg-gradient-to-r from-purple-500 to-pink-400"
                />
                <div className="grid grid-cols-3 gap-2 text-[11px] font-medium uppercase tracking-wider text-muted">
                  <span>Component</span>
                  <span className="text-right text-accent">
                    {dataA.symbol}
                  </span>
                  <span className="text-right text-accent">
                    {dataB.symbol}
                  </span>
                </div>
                {(() => {
                  const allKeys = new Set([
                    ...Object.keys(dataA.riskScore.components || {}),
                    ...Object.keys(dataB.riskScore.components || {}),
                  ]);
                  return [...allKeys].map((key) => (
                    <CompRow
                      key={key}
                      label={key
                        .replace(/([A-Z])/g, " $1")
                        .replace(/^./, (c) => c.toUpperCase())
                        .trim()}
                      valA={fmt(dataA.riskScore.components?.[key])}
                      valB={fmt(dataB.riskScore.components?.[key])}
                      higherIsBetter={false}
                    />
                  ));
                })()}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="rounded-xl bg-danger/8 px-3 py-2 text-center">
                    <p className="text-lg font-bold text-danger">
                      {dataA.riskScore.label}
                    </p>
                    <p className="text-[10px] text-muted">{dataA.symbol}</p>
                  </div>
                  <div className="rounded-xl bg-purple-500/8 px-3 py-2 text-center">
                    <p className="text-lg font-bold text-purple-400">
                      {dataB.riskScore.label}
                    </p>
                    <p className="text-[10px] text-muted">{dataB.symbol}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Shareholding */}
          <Section
            title="Shareholding Pattern"
            icon={<BarChart3 className="h-4 w-4 text-accent" />}
            symbolA={dataA.symbol}
            symbolB={dataB.symbol}
          >
            <CompRow
              label="Promoters"
              valA={fmt(dataA.shareholding.promoters, { suffix: "%" })}
              valB={fmt(dataB.shareholding.promoters, { suffix: "%" })}
              higherIsBetter={true}
            />
            <CompRow
              label="FII"
              valA={fmt(dataA.shareholding.fii, { suffix: "%" })}
              valB={fmt(dataB.shareholding.fii, { suffix: "%" })}
              higherIsBetter={true}
            />
            <CompRow
              label="DII"
              valA={fmt(dataA.shareholding.dii, { suffix: "%" })}
              valB={fmt(dataB.shareholding.dii, { suffix: "%" })}
              higherIsBetter={true}
            />
            <CompRow
              label="Public"
              valA={fmt(dataA.shareholding.public, { suffix: "%" })}
              valB={fmt(dataB.shareholding.public, { suffix: "%" })}
              higherIsBetter={false}
            />
          </Section>

          {/* Technicals */}
          <Section
            title="Technical Indicators"
            icon={<TrendingUp className="h-4 w-4 text-accent" />}
            symbolA={dataA.symbol}
            symbolB={dataB.symbol}
          >
            <CompRow
              label="RSI (14)"
              valA={fmt(dataA.technicals.rsi14)}
              valB={fmt(dataB.technicals.rsi14)}
              higherIsBetter={true}
            />
            <CompRow
              label="MACD"
              valA={fmt(dataA.technicals.macd)}
              valB={fmt(dataB.technicals.macd)}
              higherIsBetter={true}
            />
            <CompRow
              label="EMA 20"
              valA={fmt(dataA.technicals.ema20, { prefix: "₹" })}
              valB={fmt(dataB.technicals.ema20, { prefix: "₹" })}
              higherIsBetter={true}
            />
            <CompRow
              label="EMA 50"
              valA={fmt(dataA.technicals.ema50, { prefix: "₹" })}
              valB={fmt(dataB.technicals.ema50, { prefix: "₹" })}
              higherIsBetter={true}
            />
            <div className="grid grid-cols-3 items-center gap-2 rounded-lg px-3 py-2 text-sm sm:gap-4 sm:px-4">
              <span className="text-xs text-muted sm:text-sm">Trend</span>
              <span className="text-right font-medium">{dataA.technicals.trend}</span>
              <span className="text-right font-medium">{dataB.technicals.trend}</span>
            </div>
          </Section>
        </div>
      )}

      {/* Initial State */}
      {!hasData && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
            <GitCompareArrows className="h-8 w-8 text-accent" />
          </div>
          <h3 className="text-lg font-semibold">
            Compare two stocks side-by-side
          </h3>
          <p className="mt-1 max-w-md text-sm text-muted">
            Enter two NSE/BSE stock symbols above and click Compare to see a
            detailed breakdown of price, valuation, profitability, Smart Score,
            and Risk Score.
          </p>
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="py-4 text-sm text-muted">Loading comparison...</div>}>
      <ComparePageContent />
    </Suspense>
  );
}
