"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Lightbulb,
  Quote,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiSourceBadge, MarkdownLite, SectionHeading } from "@/components/shared/section-heading";
import { apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";

type AiSource = "ai" | "fallback";

interface SwotData {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  bullCase: string;
  bearCase: string;
}

interface ReportEntry {
  status: "loading" | "error" | "done";
  report?: string;
  source?: AiSource;
}

interface SwotEntry {
  status: "loading" | "error" | "done";
  swot?: SwotData;
  source?: AiSource;
  parseError?: boolean;
}

/** Never throws — returns null on malformed payloads. */
function parseSwot(raw: string): SwotData | null {
  try {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 3) : [];
    const str = (v: unknown): string => (typeof v === "string" ? v : "");
    const data: SwotData = {
      strengths: arr(obj.strengths),
      weaknesses: arr(obj.weaknesses),
      opportunities: arr(obj.opportunities),
      threats: arr(obj.threats),
      bullCase: str(obj.bullCase),
      bearCase: str(obj.bearCase),
    };
    const hasQuadrant =
      data.strengths.length > 0 ||
      data.weaknesses.length > 0 ||
      data.opportunities.length > 0 ||
      data.threats.length > 0;
    if (!hasQuadrant) return null;
    return data;
  } catch {
    return null;
  }
}

const QUADRANTS = [
  {
    key: "strengths" as const,
    title: "Strengths",
    icon: TrendingUp,
    card: "border-success/30 bg-success/5",
    tone: "text-success",
    marker: "plus" as const,
    markerClass: "text-success",
  },
  {
    key: "weaknesses" as const,
    title: "Weaknesses",
    icon: TrendingDown,
    card: "border-danger/30 bg-danger/5",
    tone: "text-danger",
    marker: "minus" as const,
    markerClass: "text-danger",
  },
  {
    key: "opportunities" as const,
    title: "Opportunities",
    icon: Lightbulb,
    card: "border-brand/30 bg-brand/5",
    tone: "text-brand",
    marker: "dot" as const,
    markerClass: "bg-brand",
  },
  {
    key: "threats" as const,
    title: "Threats",
    icon: ShieldAlert,
    card: "border-warn/30 bg-warn/5",
    tone: "text-warn",
    marker: "dot" as const,
    markerClass: "bg-warn",
  },
];

function ShimmerLines({ lines = 3 }: { lines?: number }) {
  const widths = ["w-3/4", "w-full", "w-5/6", "w-2/3", "w-11/12", "w-1/2"];
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={cn("shimmer h-4 rounded-md", widths[i % widths.length])} />
      ))}
    </div>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-warn/30 bg-warn/5 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm text-text/90">{message}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-3 rounded-lg border-border/60 bg-transparent text-xs text-text/85 hover:border-brand/50 hover:text-brand"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}

export function StockAiPanel({ symbol }: { symbol: string }) {
  const [tab, setTab] = useState<"report" | "swot">("report");
  const [reports, setReports] = useState<Record<string, ReportEntry>>({});
  const [swots, setSwots] = useState<Record<string, SwotEntry>>({});

  // Ref mirrors so rapid re-invocations (strict-mode double effects, tab flips)
  // always read the freshest cache and never double-fetch or clobber entries.
  const reportsRef = useRef<Record<string, ReportEntry>>({});
  const swotsRef = useRef<Record<string, SwotEntry>>({});

  const fetchReport = useCallback(async (sym: string, force = false) => {
    const cached = reportsRef.current[sym];
    if (!force && (cached?.status === "done" || cached?.status === "loading")) return;
    reportsRef.current = { ...reportsRef.current, [sym]: { status: "loading" } };
    setReports(reportsRef.current);
    try {
      const res = await apiPost<{ report: string; source: AiSource }>("/api/ai/analysis", {
        type: "report",
        symbol: sym,
      });
      reportsRef.current = {
        ...reportsRef.current,
        [sym]: { status: "done", report: res.report, source: res.source },
      };
    } catch {
      reportsRef.current = { ...reportsRef.current, [sym]: { status: "error" } };
    }
    setReports(reportsRef.current);
  }, []);

  const fetchSwot = useCallback(async (sym: string, force = false) => {
    const cached = swotsRef.current[sym];
    if (!force && (cached?.status === "done" || cached?.status === "loading")) return;
    swotsRef.current = { ...swotsRef.current, [sym]: { status: "loading" } };
    setSwots(swotsRef.current);
    try {
      const res = await apiPost<{ swot: string; source: AiSource }>("/api/ai/analysis", {
        type: "swot",
        symbol: sym,
      });
      const parsed = parseSwot(res.swot);
      swotsRef.current = parsed
        ? { ...swotsRef.current, [sym]: { status: "done", swot: parsed, source: res.source } }
        : { ...swotsRef.current, [sym]: { status: "error", parseError: true } };
    } catch {
      swotsRef.current = { ...swotsRef.current, [sym]: { status: "error" } };
    }
    setSwots(swotsRef.current);
  }, []);

  // Fetch the research report on mount and whenever the symbol changes.
  useEffect(() => {
    fetchReport(symbol);
  }, [symbol, fetchReport]);

  // Fetch the SWOT lazily — when its tab is (or becomes) active for this symbol.
  useEffect(() => {
    if (tab === "swot") fetchSwot(symbol);
  }, [tab, symbol, fetchSwot]);

  const reportEntry = reports[symbol];
  const swotEntry = swots[symbol];
  const swotData = swotEntry?.swot; // const local so TS narrowing survives the map callbacks below
  const activeEntry = tab === "swot" ? swotEntry : reportEntry;

  // Badge reflects the last loaded result — prefer the active tab, fall back to the other.
  const activeSource: AiSource | undefined =
    (tab === "swot" ? swotEntry?.source : reportEntry?.source) ?? swotEntry?.source ?? reportEntry?.source;

  const regenerate = () => {
    if (tab === "swot") fetchSwot(symbol, true);
    else fetchReport(symbol, true);
  };

  return (
    <section aria-label={`AI research for ${symbol}`}>
      <SectionHeading
        icon={Sparkles}
        kicker="AI Research"
        title="AI Research Desk"
        right={
          <div className="flex items-center gap-2">
            {activeSource && <AiSourceBadge source={activeSource} />}
            <Button
              variant="ghost"
              size="sm"
              onClick={regenerate}
              disabled={activeEntry?.status === "loading"}
              className="h-7 gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground hover:text-brand"
              aria-label="Regenerate AI analysis"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", activeEntry?.status === "loading" && "animate-spin")}
                aria-hidden="true"
              />
              Regenerate
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "report" | "swot")}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="report" className="gap-1.5 rounded-md text-xs sm:text-sm">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Research Report
          </TabsTrigger>
          <TabsTrigger value="swot" className="gap-1.5 rounded-md text-xs sm:text-sm">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            SWOT Analysis
          </TabsTrigger>
        </TabsList>

        {/* Research report */}
        <TabsContent value="report" className="mt-3">
          {!reportEntry || reportEntry.status === "loading" ? (
            <div className="rounded-2xl border border-border/50 bg-panel/60 p-5">
              <ShimmerLines lines={6} />
            </div>
          ) : reportEntry.status === "error" ? (
            <ErrorCard
              message="AI service is warming up — try again in a moment."
              onRetry={() => fetchReport(symbol, true)}
            />
          ) : (
            <div className="rounded-2xl border border-border/50 bg-panel/60 p-5">
              <MarkdownLite text={reportEntry.report ?? ""} />
            </div>
          )}
        </TabsContent>

        {/* SWOT */}
        <TabsContent value="swot" className="mt-3">
          {!swotEntry || swotEntry.status === "loading" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-hidden="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-border/50 p-4">
                  <div className="shimmer mb-3 h-3.5 w-24 rounded-md" />
                  <div className="space-y-2">
                    <div className="shimmer h-3 w-full rounded-md" />
                    <div className="shimmer h-3 w-5/6 rounded-md" />
                    <div className="shimmer h-3 w-4/6 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          ) : swotEntry.status === "error" ? (
            <ErrorCard
              message={
                swotEntry.parseError
                  ? "Couldn't parse the SWOT payload from the AI engine — regenerate to try again."
                  : "AI service is warming up — try again in a moment."
              }
              onRetry={() => fetchSwot(symbol, true)}
            />
          ) : (
            swotData && (
              <div className="stagger-fade space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {QUADRANTS.map((q) => (
                    <div key={q.key} className={cn("rounded-2xl border p-4", q.card)}>
                      <div className="mb-2.5 flex items-center gap-2">
                        <q.icon className={cn("h-4 w-4", q.tone)} aria-hidden="true" />
                        <h4 className="font-display text-sm font-bold text-text">{q.title}</h4>
                      </div>
                      <ul className="space-y-2">
                        {swotData[q.key].map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs leading-5 text-text/85">
                            {q.marker === "dot" ? (
                              <span
                                className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", q.markerClass)}
                                aria-hidden="true"
                              />
                            ) : (
                              <span
                                className={cn(
                                  "w-3 shrink-0 text-center text-sm font-bold leading-4",
                                  q.markerClass
                                )}
                                aria-hidden="true"
                              >
                                {q.marker === "plus" ? "+" : "−"}
                              </span>
                            )}
                            <span className="flex-1">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex items-start gap-3 rounded-2xl border border-success/30 bg-success/5 p-4">
                    <Quote className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                    <div>
                      <p className="mb-1 font-display text-xs font-bold uppercase tracking-wider text-success">
                        Bull Case
                      </p>
                      <p className="text-sm text-text/90">{swotData.bullCase}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-4">
                    <Quote className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                    <div>
                      <p className="mb-1 font-display text-xs font-bold uppercase tracking-wider text-danger">
                        Bear Case
                      </p>
                      <p className="text-sm text-text/90">{swotData.bearCase}</p>
                    </div>
                  </div>
                </div>
              </div>
            )
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
