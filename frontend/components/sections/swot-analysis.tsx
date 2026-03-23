"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Lightbulb, RefreshCw, ShieldAlert, TrendingDown, TrendingUp, XCircle } from "lucide-react";

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
};

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() / 1000) - ts);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/* ─── Shimmer placeholder ─── */
function ShimmerBlock({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3.5 animate-pulse rounded-md bg-border/40"
          style={{ width: `${70 + Math.random() * 25}%` }}
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
      <ShimmerBlock lines={3} />
    </div>
  );
}

/* ─── SWOT quadrant ─── */
const QUADRANT_CONFIG = {
  strengths: {
    label: "Strengths",
    icon: CheckCircle2,
    color: "#22c55e",
    borderColor: "border-l-green-500",
  },
  weaknesses: {
    label: "Weaknesses",
    icon: XCircle,
    color: "#ef4444",
    borderColor: "border-l-red-500",
  },
  opportunities: {
    label: "Opportunities",
    icon: Lightbulb,
    color: "#3b82f6",
    borderColor: "border-l-blue-500",
  },
  threats: {
    label: "Threats",
    icon: AlertTriangle,
    color: "#f97316",
    borderColor: "border-l-orange-500",
  },
} as const;

type QuadrantKey = keyof typeof QUADRANT_CONFIG;

function SwotQuadrant({ quadrant, items }: { quadrant: QuadrantKey; items: string[] }) {
  const config = QUADRANT_CONFIG[quadrant];
  const Icon = config.icon;

  return (
    <div
      className={`rounded-xl border border-border/60 bg-bg/40 p-4 border-l-[3px] ${config.borderColor}`}
    >
      <div className="mb-3 flex items-center gap-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${config.color}15` }}
        >
          <Icon className="h-4 w-4" style={{ color: config.color }} />
        </div>
        <h4 className="text-sm font-semibold" style={{ color: config.color }}>
          {config.label}
        </h4>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-muted">
              <span
                className="mt-1.5 block h-1.5 w-1.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: config.color }}
              />
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted/60">No data available.</p>
      )}
    </div>
  );
}

/* ─── Main component ─── */
export function SwotAnalysis({ symbol }: { symbol: string }) {
  const [data, setData] = useState<SwotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState(false);

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

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10">
            <ShieldAlert className="h-4 w-4 text-indigo-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">SWOT Analysis</h3>
            <p className="text-xs text-muted">
              AI-generated · {data?.generatedAt ? timeAgo(data.generatedAt) : "live"}
            </p>
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading || regenerating}
          title="Regenerate with latest market data"
          className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-bg/50 px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-accent disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
          {regenerating ? "Regenerating…" : "Regenerate"}
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <ShimmerCard />
            <ShimmerCard />
            <ShimmerCard />
            <ShimmerCard />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-bg/40 p-4">
              <ShimmerBlock lines={2} />
            </div>
            <div className="rounded-xl border border-border/60 bg-bg/40 p-4">
              <ShimmerBlock lines={2} />
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="mt-4 rounded-xl border border-dashed border-border/70 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-muted/50" />
          <p className="mt-2 text-sm text-muted">
            Unable to load SWOT analysis right now. The backend may still be processing data for{" "}
            <span className="font-semibold text-text">{symbol}</span>.
          </p>
        </div>
      )}

      {/* Data loaded */}
      {!loading && !error && data && (
        <div className="mt-4 space-y-4">
          {/* 2x2 SWOT grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            <SwotQuadrant quadrant="strengths" items={data.strengths} />
            <SwotQuadrant quadrant="weaknesses" items={data.weaknesses} />
            <SwotQuadrant quadrant="opportunities" items={data.opportunities} />
            <SwotQuadrant quadrant="threats" items={data.threats} />
          </div>

          {/* Bull / Bear cases */}
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Bull Case */}
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <p className="text-xs font-semibold uppercase tracking-wider text-green-500">
                  Bull Case
                </p>
              </div>
              <p className="text-sm leading-relaxed text-muted">
                {data.bullCase || "No bull case available."}
              </p>
            </div>

            {/* Bear Case */}
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                <p className="text-xs font-semibold uppercase tracking-wider text-red-500">
                  Bear Case
                </p>
              </div>
              <p className="text-sm leading-relaxed text-muted">
                {data.bearCase || "No bear case available."}
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
