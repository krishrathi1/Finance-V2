"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Crown, GitCompareArrows, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChangePill } from "@/components/shared/change-pill";
import { AiSourceBadge, MarkdownLite, SectionHeading } from "@/components/shared/section-heading";
import { StockSearch } from "@/components/shared/stock-search";
import { apiGet, apiPost } from "@/lib/api";
import { useApp, usePolling } from "@/lib/store";
import { fmtCr, fmtInr, fmtPct, type StockDashboard } from "@/lib/types";
import { cn } from "@/lib/utils";

// ── helpers ──────────────────────────────────────────────────────────────

/** Blended quick verdict score: smart score, low risk and quality/valuation mix. */
function compositeScore(d: StockDashboard): number {
  return (
    d.smartScore.score * 2 +
    (5 - d.riskScore.score) * 1.5 +
    (d.metrics.roe - (d.metrics.pe ?? 30) / 10) / 8
  );
}

function winHigh(a: number | null | undefined, b: number | null | undefined): "a" | "b" | null {
  if (a === null || a === undefined || b === null || b === undefined || a === b) return null;
  return a > b ? "a" : "b";
}

function winLow(a: number | null | undefined, b: number | null | undefined): "a" | "b" | null {
  if (a === null || a === undefined || b === null || b === undefined || a === b) return null;
  return a < b ? "a" : "b";
}

function Pct({ v }: { v: number | null | undefined }) {
  return (
    <span
      className={cn(
        "tabular-nums",
        v === null || v === undefined
          ? "text-muted-foreground"
          : v > 0
            ? "text-success"
            : v < 0
              ? "text-danger"
              : "text-muted-foreground"
      )}
    >
      {fmtPct(v)}
    </span>
  );
}

/** One comparison line: label | A value | B value, winning cell highlighted. */
function CompRow({
  label,
  a,
  b,
  winner,
}: {
  label: string;
  a: React.ReactNode;
  b: React.ReactNode;
  winner?: "a" | "b" | null;
}) {
  const cell = (side: "a" | "b") =>
    cn(
      "flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 tabular-nums transition-colors",
      winner === side ? "bg-success/10 font-semibold text-success" : "text-text"
    );
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr] items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs odd:bg-bg/30 sm:gap-3 sm:px-3 sm:text-sm">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className={cell("a")}>
        {winner === "a" && <Check className="h-3 w-3 shrink-0" aria-hidden />}
        <span className="truncate">{a}</span>
      </span>
      <span className={cell("b")}>
        {winner === "b" && <Check className="h-3 w-3 shrink-0" aria-hidden />}
        <span className="truncate">{b}</span>
      </span>
    </div>
  );
}

/** Column caption so you always know which side is which stock. */
function CompHeader({ a, b }: { a: string; b: string }) {
  return (
    <div className="mb-1 grid grid-cols-[1fr_1fr_1fr] gap-1.5 px-2 text-[10px] font-bold uppercase tracking-wider sm:gap-3 sm:px-3">
      <span className="text-muted-foreground/60">Metric</span>
      <span className="truncate text-right text-brand">{a}</span>
      <span className="truncate text-right text-brand">{b}</span>
    </div>
  );
}

function Section({
  title,
  a,
  b,
  children,
}: {
  title: string;
  a: string;
  b: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-2xl border border-border/50 bg-panel/60 p-4 backdrop-blur-sm sm:p-5"
    >
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <CompHeader a={a} b={b} />
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

/** 0–5 mini bar shown next to each score dimension. */
function ScoreBar({ value, tone }: { value: number; tone: "smart" | "risk" }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted sm:w-14" aria-hidden>
        <span
          className={cn(
            "block h-full rounded-full",
            tone === "smart" ? "bg-gradient-to-r from-violet-500 to-fuchsia-500" : "bg-gradient-to-r from-red-500 to-orange-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="tabular-nums text-xs">{value.toFixed(1)}</span>
    </span>
  );
}

// ── main view ────────────────────────────────────────────────────────────

export function CompareView() {
  const compareA = useApp((s) => s.compareA);
  const compareB = useApp((s) => s.compareB);
  const setCompare = useApp((s) => s.setCompare);
  const openStock = useApp((s) => s.openStock);

  const [dashA, setDashA] = useState<StockDashboard | null>(null);
  const [dashB, setDashB] = useState<StockDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ai, setAi] = useState<{ answer: string; source: "ai" | "fallback" } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // always-fresh pair snapshot for the polling fetcher
  const pairRef = useRef({ a: compareA, b: compareB });
  pairRef.current = { a: compareA, b: compareB };
  const reqIdRef = useRef(0);

  const load = useCallback(async (silent = false) => {
    const { a, b } = pairRef.current;
    if (!a || !b) return;
    const id = ++reqIdRef.current;
    if (!silent) setLoading(true);
    try {
      const [da, db] = await Promise.all([
        apiGet<StockDashboard>(`/api/stocks/${encodeURIComponent(a)}`),
        apiGet<StockDashboard>(`/api/stocks/${encodeURIComponent(b)}`),
      ]);
      if (id !== reqIdRef.current) return;
      setDashA(da);
      setDashB(db);
      setError(null);
    } catch {
      if (id === reqIdRef.current) setError("Couldn't load one of the dashboards — please retry.");
    } finally {
      if (id === reqIdRef.current) setLoading(false);
    }
  }, []);

  // refetch + reset AI verdict whenever the pair changes (initial load handled by usePolling)
  const skipFirst = useRef(true);
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    setAi(null);
    setAiError(null);
    load();
  }, [compareA, compareB, load]);

  // live prices every 30s
  usePolling(() => load(true), 30000);

  const askAi = async () => {
    if (!compareA || !compareB || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    setAi(null);
    try {
      const res = await apiPost<{ answer: string; source: "ai" | "fallback" }>("/api/ai/analysis", {
        type: "compare",
        a: compareA,
        b: compareB,
      });
      setAi(res);
    } catch {
      setAiError("The AI engine is busy right now — please try again.");
    } finally {
      setAiLoading(false);
    }
  };

  const both = dashA && dashB;
  const scoreA = dashA ? compositeScore(dashA) : 0;
  const scoreB = dashB ? compositeScore(dashB) : 0;
  const quickWinner: "a" | "b" | null =
    !both || scoreA === scoreB ? null : scoreA > scoreB ? "a" : "b";
  const awaitingData = Boolean(compareA && compareB) && !both && !error;

  const shA = both ? dashA.shareholding[dashA.shareholding.length - 1] : undefined;
  const shB = both ? dashB.shareholding[dashB.shareholding.length - 1] : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="stagger-fade space-y-4"
    >
      <SectionHeading icon={GitCompareArrows} kicker="Head to Head" title="Compare Stocks" />

      {/* picker */}
      <section
        aria-label="Pick two stocks to compare"
        className="rounded-2xl border border-border/50 bg-panel/60 p-5 backdrop-blur-sm"
      >
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <StockSearch
              onSelect={(s) => setCompare(s, compareB)}
              placeholder="Stock A — e.g. RELIANCE"
              className="[&_.search-bar]:py-2"
            />
            {compareA && (
              <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                Stock A: <span className="font-semibold text-brand">{compareA}</span>
              </p>
            )}
          </div>
          <span
            className="flex items-center justify-center py-1 font-display text-sm font-bold text-brand sm:py-0"
            aria-hidden
          >
            VS
          </span>
          <div className="min-w-0 flex-1">
            <StockSearch
              onSelect={(s) => setCompare(compareA, s)}
              placeholder="Stock B — e.g. TCS"
              className="[&_.search-bar]:py-2"
            />
            {compareB && (
              <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                Stock B: <span className="font-semibold text-brand">{compareB}</span>
              </p>
            )}
          </div>
          <Button
            onClick={() => load()}
            disabled={!compareA || !compareB}
            className="shine-btn h-11 shrink-0 rounded-2xl bg-brand px-5 text-sm font-semibold text-white shadow-lg shadow-brand/20 hover:opacity-95"
            aria-label="Compare the two selected stocks"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitCompareArrows className="h-4 w-4" />}
            Compare
          </Button>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger" role="alert">
          {error}
        </div>
      )}

      {awaitingData && (
        <div className="grid gap-4 sm:grid-cols-2" aria-live="polite">
          <Skeleton className="shimmer h-36 rounded-[24px] bg-muted/40" />
          <Skeleton className="shimmer h-36 rounded-[24px] bg-muted/40" />
        </div>
      )}

      {both && (
        <>
          {/* quick winner */}
          <section
            aria-label="Quick verdict"
            className="relative rounded-[24px] border border-border/50 bg-panel/60 p-5 backdrop-blur-sm"
          >
            <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
              {([dashA, dashB] as StockDashboard[]).map((d, idx) => {
                const side = idx === 0 ? "a" : "b";
                const isWinner = quickWinner === side;
                const score = idx === 0 ? scoreA : scoreB;
                return (
                  <div
                    key={d.symbol}
                    className={cn(
                      "relative flex flex-col gap-1 rounded-2xl border p-4 transition-colors",
                      isWinner ? "border-brand/50 bg-brand/5" : "border-border/50 bg-bg/40"
                    )}
                  >
                    {isWinner && (
                      <Badge className="absolute -top-2.5 right-3 gap-1 border-brand/40 bg-brand text-white">
                        <Crown className="h-3 w-3" aria-hidden />
                        Our pick
                      </Badge>
                    )}
                    <button
                      type="button"
                      onClick={() => openStock(d.symbol)}
                      className="w-fit font-display text-lg font-bold tracking-tight text-text transition-colors hover:text-brand"
                      aria-label={`Open ${d.symbol} dashboard`}
                    >
                      {d.symbol}
                    </button>
                    <p className="truncate text-xs text-muted-foreground">{d.companyName}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-base font-semibold tabular-nums text-text">
                        {fmtInr(d.quote.price)}
                      </span>
                      <ChangePill value={d.quote.changePercent} size="xs" />
                    </div>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Composite score{" "}
                      <span className="tabular-nums font-semibold text-text">{score.toFixed(1)}</span>
                      {isWinner && <span className="ml-1 text-brand">· leads this matchup</span>}
                    </p>
                  </div>
                );
              })}
              <div
                aria-hidden
                className="absolute left-1/2 top-1/2 z-10 hidden h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-panel font-display text-[11px] font-bold text-brand shadow-lg sm:flex"
              >
                VS
              </div>
            </div>
          </section>

          {/* AI verdict */}
          <section
            aria-label="AI comparison verdict"
            className="rounded-[24px] border border-border/50 bg-panel/60 p-5 backdrop-blur-sm"
          >
            {!ai && !aiLoading && !aiError && (
              <Button
                variant="outline"
                onClick={askAi}
                className="gap-2 rounded-2xl border-brand/40 text-brand hover:bg-brand/10 hover:text-brand"
                aria-label="Ask the AI engine which stock to pick"
              >
                <Sparkles className="h-4 w-4" />
                Ask AI: Which one should I pick?
              </Button>
            )}
            {aiLoading && (
              <div className="space-y-2" aria-live="polite">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-brand" />
                  Analyzing both books…
                </p>
                <div className="shimmer h-4 w-3/4 rounded bg-muted/60" />
                <div className="shimmer h-4 w-full rounded bg-muted/60" />
                <div className="shimmer h-4 w-5/6 rounded bg-muted/60" />
              </div>
            )}
            {aiError && (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-danger" role="alert">
                  {aiError}
                </p>
                <Button variant="outline" size="sm" onClick={askAi} className="gap-1.5 border-border/60">
                  <Sparkles className="h-3.5 w-3.5 text-brand" />
                  Retry
                </Button>
              </div>
            )}
            {ai && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    AI Verdict
                  </p>
                  <AiSourceBadge source={ai.source} />
                </div>
                <MarkdownLite text={ai.answer} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={askAi}
                  className="text-xs text-muted-foreground hover:text-brand"
                >
                  Regenerate
                </Button>
              </div>
            )}
          </section>

          {/* price & returns */}
          <Section title="Price & Returns" a={dashA.symbol} b={dashB.symbol}>
            <CompRow
              label="CMP"
              a={fmtInr(dashA.quote.price)}
              b={fmtInr(dashB.quote.price)}
            />
            <CompRow
              label="1D change"
              a={<ChangePill value={dashA.quote.changePercent} size="xs" />}
              b={<ChangePill value={dashB.quote.changePercent} size="xs" />}
            />
            <CompRow label="52W high" a={fmtInr(dashA.quote.high52)} b={fmtInr(dashB.quote.high52)} />
            <CompRow label="52W low" a={fmtInr(dashA.quote.low52)} b={fmtInr(dashB.quote.low52)} />
            <CompRow
              label="1Y return"
              a={<Pct v={dashA.technicals.return1Y} />}
              b={<Pct v={dashB.technicals.return1Y} />}
              winner={winHigh(dashA.technicals.return1Y, dashB.technicals.return1Y)}
            />
            <CompRow label="AI target" a={fmtInr(dashA.aiTarget)} b={fmtInr(dashB.aiTarget)} />
          </Section>

          {/* valuation */}
          <Section title="Valuation" a={dashA.symbol} b={dashB.symbol}>
            <CompRow
              label="P/E"
              a={dashA.metrics.pe === null ? "—" : dashA.metrics.pe.toFixed(1)}
              b={dashB.metrics.pe === null ? "—" : dashB.metrics.pe.toFixed(1)}
              winner={winLow(dashA.metrics.pe, dashB.metrics.pe)}
            />
            <CompRow
              label="P/B"
              a={dashA.metrics.pb.toFixed(1)}
              b={dashB.metrics.pb.toFixed(1)}
              winner={winLow(dashA.metrics.pb, dashB.metrics.pb)}
            />
            <CompRow
              label="Market cap"
              a={fmtCr(dashA.metrics.marketCapCr)}
              b={fmtCr(dashB.metrics.marketCapCr)}
            />
            <CompRow
              label="Dividend yield"
              a={`${dashA.metrics.dividendYield.toFixed(2)}%`}
              b={`${dashB.metrics.dividendYield.toFixed(2)}%`}
              winner={winHigh(dashA.metrics.dividendYield, dashB.metrics.dividendYield)}
            />
            <CompRow label="EPS" a={fmtInr(dashA.metrics.eps)} b={fmtInr(dashB.metrics.eps)} />
            <CompRow
              label="Book value"
              a={fmtInr(dashA.metrics.bookValue)}
              b={fmtInr(dashB.metrics.bookValue)}
            />
          </Section>

          {/* profitability */}
          <Section title="Profitability" a={dashA.symbol} b={dashB.symbol}>
            <CompRow
              label="ROE"
              a={`${dashA.metrics.roe.toFixed(1)}%`}
              b={`${dashB.metrics.roe.toFixed(1)}%`}
              winner={winHigh(dashA.metrics.roe, dashB.metrics.roe)}
            />
            <CompRow
              label="ROCE"
              a={`${dashA.metrics.roce.toFixed(1)}%`}
              b={`${dashB.metrics.roce.toFixed(1)}%`}
              winner={winHigh(dashA.metrics.roce, dashB.metrics.roce)}
            />
            <CompRow
              label="Revenue"
              a={fmtCr(dashA.metrics.revenueCr)}
              b={fmtCr(dashB.metrics.revenueCr)}
            />
            <CompRow
              label="Net profit"
              a={fmtCr(dashA.metrics.netProfitCr)}
              b={fmtCr(dashB.metrics.netProfitCr)}
            />
            <CompRow
              label="Sales growth"
              a={<Pct v={dashA.metrics.salesGrowth} />}
              b={<Pct v={dashB.metrics.salesGrowth} />}
              winner={winHigh(dashA.metrics.salesGrowth, dashB.metrics.salesGrowth)}
            />
            <CompRow
              label="Profit growth"
              a={<Pct v={dashA.metrics.profitGrowth} />}
              b={<Pct v={dashB.metrics.profitGrowth} />}
              winner={winHigh(dashA.metrics.profitGrowth, dashB.metrics.profitGrowth)}
            />
          </Section>

          {/* smart score */}
          <Section title="Smart Score" a={dashA.symbol} b={dashB.symbol}>
            {(
              [
                ["Profitability", "profitability"],
                ["Growth", "growth"],
                ["Valuation", "valuation"],
                ["Momentum", "momentum"],
                ["Financial health", "financialHealth"],
              ] as const
            ).map(([label, dim]) => (
              <CompRow
                key={dim}
                label={label}
                a={<ScoreBar value={dashA.smartScore.dimensions[dim]} tone="smart" />}
                b={<ScoreBar value={dashB.smartScore.dimensions[dim]} tone="smart" />}
                winner={winHigh(dashA.smartScore.dimensions[dim], dashB.smartScore.dimensions[dim])}
              />
            ))}
            <CompRow
              label="Total"
              a={
                <span className="font-semibold">
                  {dashA.smartScore.score.toFixed(1)}
                  <span className="text-muted-foreground"> / 5</span>
                </span>
              }
              b={
                <span className="font-semibold">
                  {dashB.smartScore.score.toFixed(1)}
                  <span className="text-muted-foreground"> / 5</span>
                </span>
              }
              winner={winHigh(dashA.smartScore.score, dashB.smartScore.score)}
            />
          </Section>

          {/* risk score — lower wins */}
          <Section title="Risk Score" a={dashA.symbol} b={dashB.symbol}>
            {(
              [
                ["Sentiment", "sentiment"],
                ["Financial risk", "financialRisk"],
                ["Narrative risk", "narrativeRisk"],
                ["Technical risk", "technicalRisk"],
              ] as const
            ).map(([label, comp]) => (
              <CompRow
                key={comp}
                label={label}
                a={<ScoreBar value={dashA.riskScore.components[comp]} tone="risk" />}
                b={<ScoreBar value={dashB.riskScore.components[comp]} tone="risk" />}
                winner={winLow(dashA.riskScore.components[comp], dashB.riskScore.components[comp])}
              />
            ))}
            <CompRow
              label="Total"
              a={
                <span className="font-semibold">
                  {dashA.riskScore.score.toFixed(1)}
                  <span className="text-muted-foreground"> / 5</span>
                </span>
              }
              b={
                <span className="font-semibold">
                  {dashB.riskScore.score.toFixed(1)}
                  <span className="text-muted-foreground"> / 5</span>
                </span>
              }
              winner={winLow(dashA.riskScore.score, dashB.riskScore.score)}
            />
          </Section>

          {/* shareholding */}
          {shA && shB && (
            <Section title={`Shareholding — ${shA.quarter}`} a={dashA.symbol} b={dashB.symbol}>
              {(
                [
                  ["Promoters", "promoters"],
                  ["FII", "fii"],
                  ["DII", "dii"],
                  ["Public", "public"],
                ] as const
              ).map(([label, key]) => (
                <CompRow
                  key={key}
                  label={label}
                  a={`${shA[key].toFixed(1)}%`}
                  b={`${shB[key].toFixed(1)}%`}
                />
              ))}
            </Section>
          )}
        </>
      )}

      {!(compareA && compareB) && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/50 py-16 text-center">
          <GitCompareArrows className="h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Pick two stocks above to see a full head-to-head breakdown.
          </p>
        </div>
      )}
    </motion.div>
  );
}
