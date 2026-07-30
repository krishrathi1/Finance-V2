"use client";

import { useEffect, useState } from "react";
import { 
  AlertTriangle, 
  CheckCircle2, 
  Lightbulb, 
  RefreshCw, 
  ShieldAlert, 
  TrendingDown, 
  TrendingUp, 
  XCircle,
  X,
  Plus
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { Card } from "@/components/ui/card";
import { fetchSwotAnalysis } from "@/lib/api";

type SwotData = {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  bullCase: string;
  bearCase: string;
  generatedAt?: number;
  isFallback: boolean;
};

const QUADRANT_CONFIG = {
  strengths: {
    id: "Q1",
    label: "Strengths",
    icon: CheckCircle2,
    color: "#22c55e",
    gradient: "from-green-500/20 to-emerald-500/5",
    borderColor: "border-green-500/30",
  },
  weaknesses: {
    id: "Q2",
    label: "Weaknesses",
    icon: XCircle,
    color: "#ef4444",
    gradient: "from-red-500/20 to-rose-500/5",
    borderColor: "border-red-500/30",
  },
  opportunities: {
    id: "Q3",
    label: "Opportunities",
    icon: Lightbulb,
    color: "#3b82f6",
    gradient: "from-blue-500/20 to-indigo-500/5",
    borderColor: "border-blue-500/30",
  },
  threats: {
    id: "Q4",
    label: "Threats",
    icon: AlertTriangle,
    color: "#f97316",
    gradient: "from-orange-500/20 to-amber-500/5",
    borderColor: "border-orange-500/30",
  },
} as const;

type QuadrantKey = keyof typeof QUADRANT_CONFIG;

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() / 1000) - ts);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ShimmerBlock({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3.5 animate-pulse rounded-md bg-border/40"
          style={{ width: "82%" }}
        />
      ))}
    </div>
  );
}

function ShimmerCard() {
  return (
    <div className="rounded-xl border border-border/60 bg-bg/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-7 w-7 animate-pulse rounded-lg bg-border/40" />
        <div className="h-4 w-24 animate-pulse rounded bg-border/40" />
      </div>
      <ShimmerBlock lines={2} />
    </div>
  );
}

function SwotQuadrant({ 
  quadrant, 
  items, 
  onClick 
}: { 
  quadrant: QuadrantKey; 
  items: string[]; 
  onClick: () => void 
}) {
  const config = QUADRANT_CONFIG[quadrant];
  const Icon = config.icon;

  return (
    <motion.button
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`group relative flex flex-col items-start overflow-hidden rounded-2xl border ${config.borderColor} bg-gradient-to-br ${config.gradient} p-4 text-left transition-all hover:shadow-lg hover:shadow-${config.color.split("#")[1]}/10`}
    >
      <div className="mb-3 flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-black/20"
          >
            <Icon className="h-4 w-4" style={{ color: config.color }} />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted/60 opacity-80 group-hover:opacity-100 transition-opacity">
              {config.id}
            </span>
            <h4 className="text-sm font-bold leading-tight" style={{ color: config.color }}>
              {config.label}
            </h4>
          </div>
        </div>
        <div className="rounded-lg bg-white/50 p-1 backdrop-blur-sm dark:bg-black/20">
          <Plus className="h-3.5 w-3.5 text-muted/60 group-hover:text-text" />
        </div>
      </div>

      <div className="mt-auto space-y-1.5 opacity-80 transition-opacity group-hover:opacity-100">
        {items.slice(0, 2).map((item, i) => (
          <p key={i} className="line-clamp-1 text-xs text-muted/80">
            • {item}
          </p>
        ))}
        {items.length > 2 && (
          <p className="text-[10px] font-medium text-muted/40 group-hover:text-muted/60">
            +{items.length - 2} more insights...
          </p>
        )}
        {items.length === 0 && <p className="text-xs text-muted/40 italic">No data available</p>}
      </div>
      
      {/* Subtle glass effect border overlay */}
      <div className="absolute inset-0 border border-white/10 dark:border-white/5 rounded-2xl pointer-events-none" />
    </motion.button>
  );
}

export function SwotAnalysis({ symbol }: { symbol: string }) {
  const [data, setData] = useState<SwotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState(false);
  const [activeQuadrant, setActiveQuadrant] = useState<QuadrantKey | null>(null);

  const load = (refresh = false) => {
    if (refresh) setRegenerating(true);
    else { setLoading(true); setError(false); }

    fetchSwotAnalysis(symbol, { refresh })
      .then((result) => {
        setData(result);
      })
      .catch(() => {
        if (!refresh) setError(true);
      })
      .finally(() => {
        setLoading(false);
        setRegenerating(false);
      });
  };

  useEffect(() => { load(false); }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeConfig = activeQuadrant ? QUADRANT_CONFIG[activeQuadrant] : null;

  return (
    <Card className="relative overflow-hidden p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent shadow-sm">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold tracking-tight">SWOT Analysis</h3>
            <p className="text-xs font-medium text-muted/60">
              {data?.isFallback
                ? "Sample analysis — live AI is unavailable"
                : `AI-driven strategic intelligence • ${data?.generatedAt ? timeAgo(data.generatedAt) : "live"}`}
            </p>
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading || regenerating}
          className="group flex flex-col items-center gap-1 rounded-xl border border-border/40 bg-bg/50 px-3.5 py-1.5 transition-all hover:border-accent/40 active:scale-95 disabled:opacity-40"
        >
          <RefreshCw className={`h-4 w-4 text-muted group-hover:text-accent transition-colors ${regenerating ? "animate-spin" : ""}`} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted/70 group-hover:text-accent/90">
            {regenerating ? "Loading…" : "Reload"}
          </span>
        </button>
      </div>

      {loading && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <ShimmerCard />
          <ShimmerCard />
          <ShimmerCard />
          <ShimmerCard />
        </div>
      )}

      {!loading && error && (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 p-10 text-center">
          <div className="mb-4 rounded-full bg-muted/10 p-4">
            <AlertTriangle className="h-8 w-8 text-muted/40" />
          </div>
          <p className="max-w-[300px] text-sm font-medium text-muted">
            The neural engine is currently processing <span className="text-text font-bold uppercase tracking-tight">{symbol}</span>. 
            Try refreshing in a few moments.
          </p>
        </div>
      )}

      {!loading && !error && data && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <SwotQuadrant 
              quadrant="strengths" 
              items={data.strengths} 
              onClick={() => setActiveQuadrant("strengths")} 
            />
            <SwotQuadrant 
              quadrant="weaknesses" 
              items={data.weaknesses} 
              onClick={() => setActiveQuadrant("weaknesses")} 
            />
            <SwotQuadrant 
              quadrant="opportunities" 
              items={data.opportunities} 
              onClick={() => setActiveQuadrant("opportunities")} 
            />
            <SwotQuadrant 
              quadrant="threats" 
              items={data.threats} 
              onClick={() => setActiveQuadrant("threats")} 
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="group relative overflow-hidden rounded-2xl border border-success/20 bg-success/5 p-5 transition-all hover:border-success/40">
              <div className="relative z-10">
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-success/20 p-2 text-success group-hover:scale-110 transition-transform">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <h5 className="text-[11px] font-bold uppercase tracking-[0.2em] text-success/80">Bull Case Scenario</h5>
                </div>
                <p className="text-sm font-medium leading-relaxed text-muted/90 group-hover:text-text transition-colors">
                  {data.bullCase || "Accumulating strategic growth data..."}
                </p>
              </div>
              <div className="absolute -bottom-6 -right-6 h-28 w-28 bg-success/5 blur-3xl rounded-full" />
            </div>

            <div className="group relative overflow-hidden rounded-2xl border border-danger/20 bg-danger/5 p-5 transition-all hover:border-danger/40">
              <div className="relative z-10">
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-danger/20 p-2 text-danger group-hover:scale-110 transition-transform">
                    <TrendingDown className="h-4 w-4" />
                  </div>
                  <h5 className="text-[11px] font-bold uppercase tracking-[0.2em] text-danger/80">Bear Case Scenario</h5>
                </div>
                <p className="text-sm font-medium leading-relaxed text-muted/90 group-hover:text-text transition-colors">
                  {data.bearCase || "Evaluating downside risk vectors..."}
                </p>
              </div>
              <div className="absolute -bottom-6 -right-6 h-28 w-28 bg-danger/5 blur-3xl rounded-full" />
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL PANEL */}
      <AnimatePresence>
        {activeQuadrant && activeConfig && (
          <>
            {/* Backdrop blur effect overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveQuadrant(null)}
              className="absolute inset-0 z-40 bg-black/40 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute inset-x-0 bottom-0 z-50 rounded-t-[2.5rem] border-t border-white/10 bg-panel/95 shadow-2xl backdrop-blur-2xl px-6 pb-12 pt-8 sm:px-10"
            >
              <div className="mb-1 flex justify-center">
                <div 
                  className="h-1.5 w-12 rounded-full opacity-20" 
                  style={{ backgroundColor: activeConfig.color }}
                />
              </div>

              <div className="mb-8 flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div 
                    className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-xl ring-1 ring-black/5 dark:bg-black/40"
                  >
                    <activeConfig.icon className="h-7 w-7" style={{ color: activeConfig.color }} />
                  </div>
                  <div>
                    <span className="text-xs font-black uppercase tracking-[0.3em] opacity-40">
                      Quadrant {activeConfig.id}
                    </span>
                    <h2 className="text-3xl font-black tracking-tight" style={{ color: activeConfig.color }}>
                      {activeConfig.label}
                    </h2>
                  </div>
                </div>
                <button
                  onClick={() => setActiveQuadrant(null)}
                  className="rounded-full bg-muted/10 p-2 text-muted hover:bg-muted/20 active:scale-90 transition-all"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                <div className="grid gap-4">
                  {(data as any)[activeQuadrant].length > 0 ? (
                    (data as any)[activeQuadrant].map((item: string, i: number) => (
                      <motion.div 
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: i * 0.05 }}
                        key={i} 
                        className="group flex gap-4 rounded-2xl border border-border/40 bg-white/50 p-4 transition-all hover:border-accent/40 dark:bg-black/20"
                      >
                        <div 
                          className="mt-1 h-2 w-2 flex-shrink-0 rounded-full group-hover:scale-150 transition-transform" 
                          style={{ backgroundColor: activeConfig.color }}
                        />
                        <p className="text-sm font-medium leading-relaxed text-muted group-hover:text-text transition-colors">
                          {item}
                        </p>
                      </motion.div>
                    ))
                  ) : (
                    <div className="py-10 text-center">
                      <p className="text-muted/60 italic">No specific {activeConfig.label.toLowerCase()} available for this symbol.</p>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="mt-8 flex justify-end">
                <button 
                  onClick={() => setActiveQuadrant(null)}
                  className="rounded-2xl border border-border/60 bg-white/50 px-8 py-3 text-sm font-bold tracking-tight text-muted transition-all hover:bg-panel hover:text-text dark:bg-black/40"
                >
                  Close Insights
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Card>
  );
}

