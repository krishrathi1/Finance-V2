"use client";

import {
  ArrowRight,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Layers,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { fetchIpoData } from "@/lib/api";
import type { IpoItem } from "@/lib/api";

type Tab = "upcoming" | "recent";

function IpoCardSkeleton() {
  return (
    <div className="shimmer rounded-2xl border border-border/40 h-52" />
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
        <Building2 className="h-8 w-8 text-accent" />
      </div>
      <h3 className="text-lg font-semibold">No {tab === "upcoming" ? "Upcoming" : "Recent"} IPOs</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">
        {tab === "upcoming"
          ? "There are no scheduled IPOs in the next 3 months."
          : "No IPOs have been listed in the past 3 months."}
      </p>
    </div>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatMarketCap(mc: number | null): string {
  if (!mc) return "—";
  if (mc >= 1e9) return `₹${(mc / 1e7).toFixed(0)} Cr`;
  if (mc >= 1e7) return `₹${(mc / 1e7).toFixed(2)} Cr`;
  return `₹${mc.toLocaleString("en-IN")}`;
}

function formatShares(shares: number | null): string {
  if (!shares) return "—";
  if (shares >= 1e7) return `${(shares / 1e7).toFixed(2)} Cr`;
  if (shares >= 1e5) return `${(shares / 1e5).toFixed(2)} L`;
  return shares.toLocaleString("en-IN");
}

function IpoCard({ ipo, tab }: { ipo: IpoItem; tab: Tab }) {
  const symbol = ipo.symbol?.replace(/\.(NS|BO)$/i, "");
  const hasSymbol = !!symbol;

  return (
    <div className="glow-card group relative flex flex-col rounded-2xl border border-border/50 bg-panel/60 p-5 backdrop-blur-sm transition hover:border-accent/30">
      {/* Top accent bar */}
      <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-2xl bg-gradient-to-r from-accent/60 via-purple-500/40 to-transparent" />

      {/* Company name + exchange badge */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-xs font-bold text-accent">
            {(ipo.company || ipo.symbol || "?").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-snug">
              {ipo.company || symbol || "Unknown Company"}
            </p>
            {symbol && (
              <p className="text-[11px] text-muted">{symbol}</p>
            )}
          </div>
        </div>
        {ipo.exchange && (
          <span className="shrink-0 rounded-lg border border-border/50 bg-bg/60 px-2 py-0.5 text-[10px] font-medium text-muted">
            {ipo.exchange}
          </span>
        )}
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl bg-bg/50 px-3 py-2">
          <div className="flex items-center gap-1 mb-0.5">
            <CalendarDays className="h-3 w-3 text-muted" />
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
              {tab === "upcoming" ? "IPO Date" : "Listed On"}
            </p>
          </div>
          <p className="text-xs font-semibold">{formatDate(ipo.date)}</p>
        </div>

        <div className="rounded-xl bg-bg/50 px-3 py-2">
          <div className="flex items-center gap-1 mb-0.5">
            <CircleDollarSign className="h-3 w-3 text-muted" />
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted">Price Range</p>
          </div>
          <p className="text-xs font-semibold">
            {ipo.priceRange ? ipo.priceRange : "—"}
          </p>
        </div>

        <div className="rounded-xl bg-bg/50 px-3 py-2">
          <div className="flex items-center gap-1 mb-0.5">
            <Layers className="h-3 w-3 text-muted" />
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted">Issue Size</p>
          </div>
          <p className="text-xs font-semibold">{formatMarketCap(ipo.marketCap)}</p>
        </div>

        <div className="rounded-xl bg-bg/50 px-3 py-2">
          <div className="flex items-center gap-1 mb-0.5">
            <TrendingUp className="h-3 w-3 text-muted" />
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted">Shares</p>
          </div>
          <p className="text-xs font-semibold">{formatShares(ipo.shares)}</p>
        </div>
      </div>

      {/* Action type badge */}
      {ipo.actions && (
        <div className="mb-4">
          <span className="rounded-lg bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
            {ipo.actions}
          </span>
        </div>
      )}

      {/* View details button */}
      <div className="mt-auto">
        {hasSymbol ? (
          <Link
            href={`/stocks/${symbol}`}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-accent/30 bg-accent/10 py-2 text-xs font-semibold text-accent transition hover:bg-accent/20 hover:-translate-y-0.5"
          >
            View Stock Details
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <div className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border/40 bg-bg/40 py-2 text-xs font-medium text-muted">
            Not yet listed
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function IpoPage() {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [data, setData] = useState<IpoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (t: Tab) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchIpoData(t);
      setData(rows);
    } catch (e) {
      setError("Failed to load IPO data. Please try again.");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  return (
    <div className="stagger-fade space-y-6 py-4 sm:space-y-8 sm:py-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">
            <Link href="/" className="hover:text-text">Home</Link> / IPO
          </p>
          <h1 className="mt-1 font-[var(--font-space)] text-2xl font-bold sm:text-3xl">
            <span className="bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent">
              IPO Calendar
            </span>
          </h1>
          <p className="mt-1 text-xs text-muted sm:text-sm">
            Upcoming and recently listed IPOs on NSE &amp; BSE
          </p>
        </div>

        {/* Stats */}
        {!loading && data.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="rounded-xl border border-border/50 bg-panel/60 px-3 py-1.5 font-medium">
              {data.length} IPO{data.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 rounded-2xl border border-border/50 bg-panel/40 p-1 backdrop-blur-sm w-fit">
        {(["upcoming", "recent"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              tab === t
                ? "bg-accent/15 text-accent shadow-sm"
                : "text-muted hover:text-text"
            }`}
          >
            {t === "upcoming" ? "Upcoming IPOs" : "Recent IPOs (Listed)"}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <IpoCardSkeleton key={i} />)
        ) : data.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          data.map((ipo, idx) => (
            <IpoCard key={`${ipo.symbol}-${ipo.date}-${idx}`} ipo={ipo} tab={tab} />
          ))
        )}
      </div>
    </div>
  );
}
