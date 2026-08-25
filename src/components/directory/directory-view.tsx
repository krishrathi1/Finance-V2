"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  LibraryBig,
  Loader2,
  RotateCcw,
  Search,
  SearchX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChangePill } from "@/components/shared/change-pill";
import { SectionHeading } from "@/components/shared/section-heading";
import { apiGet } from "@/lib/api";
import { useApp, usePolling } from "@/lib/store";
import { fmtCr, fmtInr, type DirectoryData, type DirectoryRow } from "@/lib/types";
import { cn } from "@/lib/utils";

// ── constants ────────────────────────────────────────────────────────────

const PAGE_LIMIT = 60;
const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];
const EXCHANGES = ["ALL", "NSE", "BSE"] as const;
type Exchange = (typeof EXCHANGES)[number];
/** replace = fresh filter load · append = "Load more" page · silent = price refresh */
type FetchMode = "replace" | "append" | "silent";

interface DirectoryMeta {
  letterCounts: Record<string, number>;
  exchangeCounts: { NSE: number; BSE: number; total: number };
  sectors: string[];
}

const EMPTY_META: DirectoryMeta = {
  letterCounts: {},
  exchangeCounts: { NSE: 0, BSE: 0, total: 0 },
  sectors: [],
};

// ── main view ────────────────────────────────────────────────────────────

export function DirectoryView() {
  const openStock = useApp((s) => s.openStock);

  // filters
  const [letter, setLetter] = useState("A");
  const [exchange, setExchange] = useState<Exchange>("ALL");
  const [sector, setSector] = useState("");
  const [q, setQ] = useState(""); // raw input value
  const [query, setQuery] = useState(""); // debounced committed query

  // results
  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [meta, setMeta] = useState<DirectoryMeta>(EMPTY_META);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Always-fresh snapshots: usePolling captures the mount-time fn, so every
  // fetch (poll included) reads the latest filters through refs. Filter
  // changes fetch directly in their event handlers, never in effects.
  const filtersRef = useRef({ letter, exchange, sector, query });
  filtersRef.current = { letter, exchange, sector, query };
  const rowsLenRef = useRef(rows.length);
  rowsLenRef.current = rows.length;
  const offsetRef = useRef(0);
  const reqIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPage = useCallback(async (mode: FetchMode) => {
    // silent polls never overlap a user-triggered load, so an in-flight
    // append can't be invalidated (which would strand its spinner)
    if (mode === "silent" && inFlightRef.current) return;
    const f = filtersRef.current;
    const offset = mode === "append" ? offsetRef.current : 0;
    const id = ++reqIdRef.current;
    inFlightRef.current = true;

    const p = new URLSearchParams();
    p.set("letter", f.query ? "ALL" : f.letter); // backend ignores letter while q is set
    p.set("exchange", f.exchange);
    if (f.sector) p.set("sector", f.sector);
    if (f.query) p.set("q", f.query);
    p.set("limit", String(PAGE_LIMIT));
    p.set("offset", String(offset));

    try {
      const data = await apiGet<DirectoryData>(`/api/stocks/directory?${p.toString()}`);
      if (id !== reqIdRef.current) return; // stale response
      const nextRows = Array.isArray(data.rows) ? data.rows : [];
      setMeta({
        letterCounts: data.letterCounts ?? {},
        exchangeCounts: data.exchangeCounts ?? EMPTY_META.exchangeCounts,
        sectors: Array.isArray(data.sectors) ? data.sectors : [],
      });
      setTotal(data.total ?? 0);
      setError(null);
      if (mode === "append") {
        setRows((prev) => {
          const seen = new Set(prev.map((r) => r.symbol));
          const fresh = nextRows.filter((r) => !seen.has(r.symbol));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
        setLoadMoreError(false);
        offsetRef.current = offset + nextRows.length;
      } else if (mode === "silent" && rowsLenRef.current > 0) {
        // price refresh in place — keeps loaded pages and the pagination cursor
        const latest = new Map(nextRows.map((r) => [r.symbol, r]));
        setRows((prev) => prev.map((r) => latest.get(r.symbol) ?? r));
      } else {
        setRows(nextRows);
        offsetRef.current = nextRows.length;
      }
    } catch (err) {
      if (id !== reqIdRef.current) return;
      if (mode === "append") {
        setLoadMoreError(true);
      } else if (mode !== "silent") {
        setError(err instanceof Error ? err.message : "Failed to load the directory.");
      }
    } finally {
      if (id === reqIdRef.current) inFlightRef.current = false;
      if (mode === "append") setLoadingMore(false);
      if (mode === "replace" && id === reqIdRef.current) setLoading(false);
    }
  }, []);

  // latest-fetcher ref for the polled closure (mount call = full load so the
  // skeleton shows; interval calls = silent price refresh)
  const fetcherRef = useRef<(silent: boolean) => void>(() => {});
  fetcherRef.current = (silent) => {
    fetchPage(silent ? "silent" : "replace");
  };
  const firstPollRef = useRef(true);
  usePolling(() => {
    if (firstPollRef.current) {
      firstPollRef.current = false;
      fetcherRef.current(false);
    } else {
      fetcherRef.current(true);
    }
  }, 30000);

  // cancel a pending search debounce on unmount (no state, lint-safe)
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  /** Reset pagination + refetch — called from event handlers only. */
  const runReplace = useCallback(() => {
    offsetRef.current = 0;
    setRows([]);
    setError(null);
    setLoadMoreError(false);
    setLoading(true);
    fetchPage("replace");
  }, [fetchPage]);

  const cancelDebounce = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  };

  const selectLetter = (next: string) => {
    if (next === letter && !query && !q) return;
    cancelDebounce();
    setLetter(next);
    setQ(""); // picking a letter always exits search mode
    setQuery("");
    filtersRef.current = { letter: next, exchange, sector, query: "" };
    runReplace();
  };

  const selectExchange = (next: Exchange) => {
    if (next === exchange) return;
    setExchange(next);
    setSector(""); // sector list is exchange-specific
    filtersRef.current = { letter, exchange: next, sector: "", query };
    runReplace();
  };

  const selectSector = (next: string) => {
    if (next === sector) return;
    setSector(next);
    filtersRef.current = { letter, exchange, sector: next, query };
    runReplace();
  };

  const onSearchInput = (value: string) => {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const next = value.trim();
      if (next === filtersRef.current.query) return;
      setQuery(next);
      filtersRef.current = { ...filtersRef.current, query: next };
      runReplace();
    }, 250);
  };

  const loadMore = () => {
    if (loadingMore || loading || rows.length >= total) return;
    setLoadMoreError(false);
    setLoadingMore(true);
    fetchPage("append");
  };

  const clearFilters = () => {
    cancelDebounce();
    setLetter("A");
    setExchange("ALL");
    setSector("");
    setQ("");
    setQuery("");
    filtersRef.current = { letter: "A", exchange: "ALL" as Exchange, sector: "", query: "" };
    runReplace();
  };

  const searching = query.length > 0;
  const firstPaint = loading && rows.length === 0;

  return (
    <div className="stagger-fade space-y-6">
      {/* 1) header */}
      <section aria-label="Stocks directory header">
        <SectionHeading
          icon={LibraryBig}
          kicker="COMPLETE MARKET COVERAGE"
          title="Stocks A–Z — NSE & BSE Directory"
          right={
            <div className="hidden shrink-0 flex-wrap items-center justify-end gap-1.5 sm:flex">
              <Badge
                variant="secondary"
                className="gap-1.5 border-border/60 bg-panel/70 text-[10px] font-semibold tabular-nums text-muted-foreground"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
                {meta.exchangeCounts.NSE} NSE
              </Badge>
              <Badge
                variant="secondary"
                className="gap-1.5 border-border/60 bg-panel/70 text-[10px] font-semibold tabular-nums text-muted-foreground"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                {meta.exchangeCounts.BSE} BSE
              </Badge>
              <Badge
                variant="secondary"
                className="border-border/60 bg-panel/70 text-[10px] font-semibold tabular-nums text-muted-foreground"
              >
                {meta.exchangeCounts.total} companies
              </Badge>
            </div>
          }
        />
      </section>

      {/* 2 + 3) filter bar + letter rail */}
      <section
        aria-label="Directory filters"
        className="glass rounded-2xl border border-border/50 bg-panel/60 p-4 sm:p-5"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* exchange segmented toggle */}
          <div
            role="group"
            aria-label="Exchange filter"
            className="flex shrink-0 rounded-xl border border-border/60 bg-bg/50 p-1"
          >
            {EXCHANGES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => selectExchange(ex)}
                aria-pressed={exchange === ex}
                aria-label={ex === "ALL" ? "All exchanges" : `${ex} listings only`}
                className={cn(
                  "min-h-9 flex-1 rounded-lg px-4 text-xs font-semibold transition lg:flex-none",
                  exchange === ex
                    ? "bg-brand text-white shadow-lg shadow-brand/20"
                    : "text-muted-foreground hover:text-text"
                )}
              >
                {ex === "ALL" ? "All" : ex}
              </button>
            ))}
          </div>

          {/* search */}
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={q}
              onChange={(e) => onSearchInput(e.target.value)}
              placeholder="Search 500+ companies — name or symbol…"
              aria-label="Search companies by name or symbol"
              className="h-10 border-border/60 bg-bg/50 pl-9 text-sm placeholder:text-muted-foreground/70"
            />
          </div>

          {/* sector */}
          <Select value={sector || "all"} onValueChange={(v) => selectSector(v === "all" ? "" : v)}>
            <SelectTrigger
              aria-label="Filter by sector"
              className="h-10 w-full border-border/60 bg-bg/50 text-sm lg:w-[220px]"
            >
              <SelectValue placeholder="All sectors" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All sectors</SelectItem>
              {meta.sectors.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* letter rail */}
        <div className="mt-4 border-t border-border/40 pt-4">
          <div className="flex flex-wrap gap-1.5 sm:gap-2" role="group" aria-label="Filter by first letter">
            {LETTERS.map((l) => {
              const count = meta.letterCounts[l] ?? 0;
              const active = letter === l && !searching;
              return (
                <button
                  key={l}
                  type="button"
                  disabled={count === 0}
                  onClick={() => selectLetter(l)}
                  aria-pressed={active}
                  aria-label={
                    l === "#"
                      ? `Symbols starting with a digit, ${count} companies`
                      : `Letter ${l}, ${count} companies`
                  }
                  className={cn(
                    "relative flex h-11 w-11 items-center justify-center rounded-xl border text-sm font-bold transition",
                    active
                      ? "border-brand/50 bg-brand text-white shadow-lg shadow-brand/25"
                      : "border-border/60 bg-panel/60 text-text hover:border-brand/40 hover:text-brand",
                    count === 0 && "cursor-not-allowed opacity-40"
                  )}
                >
                  {l}
                  {count > 0 && (
                    <span
                      className="absolute -right-1.5 -top-1.5 rounded-full border border-border/60 bg-bg px-1 text-[9px] font-semibold leading-4 tabular-nums text-muted-foreground"
                      aria-hidden="true"
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4) results */}
      <section aria-label="Directory results">
        {!firstPaint && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {searching ? (
                <>
                  Search <span className="font-semibold text-text">“{query}”</span> ·{" "}
                  <span className="tabular-nums">{total}</span>{" "}
                  {total === 1 ? "match" : "matches"}
                </>
              ) : (
                <>
                  Letter <span className="font-semibold text-text">“{letter}”</span> ·{" "}
                  <span className="tabular-nums">{total}</span>{" "}
                  {total === 1 ? "company" : "companies"}
                </>
              )}
            </p>
            {rows.length > 0 && (
              <p className="text-xs tabular-nums text-muted-foreground">
                Showing {rows.length} of {total}
              </p>
            )}
          </div>
        )}

        {firstPaint ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="h-[104px] rounded-2xl border border-border/50 bg-panel/60 shimmer"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : error && rows.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-border/50 bg-panel/40 px-6 py-12 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-danger/30 bg-danger/10">
              <AlertTriangle className="h-5 w-5 text-danger" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-semibold text-text">Couldn’t load the directory</p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{error}</p>
            <Button onClick={runReplace} size="sm" className="mt-4 gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/60 bg-panel/30 px-6 py-12 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 bg-panel/70">
              <SearchX className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-semibold text-text">
              {searching ? `No companies match “${query}”` : `No companies under “${letter}”`}
            </p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
              {searching
                ? "Try a shorter query or a different spelling, or clear the filters to browse the full A–Z list."
                : "This letter has no listings for the selected exchange and sector. Clear the filters to see everything."}
            </p>
            <Button
              onClick={clearFilters}
              size="sm"
              variant="outline"
              className="mt-4 gap-1.5 border-border/60 bg-bg/50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Clear filters
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rows.map((row) => (
                <DirectoryCard key={row.symbol} row={row} onSelect={openStock} />
              ))}
            </div>

            {(rows.length < total || loadingMore) && (
              <div className="mt-5 flex flex-col items-center gap-2">
                <Button
                  onClick={loadMore}
                  disabled={loadingMore}
                  variant="outline"
                  className="gap-1.5 rounded-full border-brand/40 bg-transparent px-5 text-brand hover:bg-brand/10 hover:text-brand"
                >
                  {loadingMore ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  )}
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
                {loadMoreError && (
                  <p className="flex items-center gap-1.5 text-xs text-danger">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    Couldn’t load more companies.
                    <button
                      type="button"
                      onClick={loadMore}
                      className="font-semibold underline underline-offset-2"
                    >
                      Retry
                    </button>
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// ── result card ──────────────────────────────────────────────────────────

function DirectoryCard({ row, onSelect }: { row: DirectoryRow; onSelect: (symbol: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(row.symbol)}
      aria-label={`${row.name} (${row.symbol}), ${row.exchange}, ${fmtInr(row.price)}`}
      className="flex min-h-[104px] flex-col justify-between rounded-2xl border border-border/50 bg-panel/60 p-3.5 text-left transition hover:-translate-y-0.5 hover:border-brand/40 hover:bg-panel/80 focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-text">{row.symbol}</span>
            <span
              className={cn(
                "rounded-full border px-1.5 py-px text-[9px] font-bold uppercase tracking-wider",
                row.exchange === "NSE"
                  ? "border-brand/40 bg-brand/10 text-brand"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              )}
            >
              {row.exchange}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground" title={row.name}>
            {row.name}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-text">{fmtInr(row.price)}</p>
          <div className="mt-0.5 flex justify-end">
            <ChangePill value={row.changePercent} size="xs" />
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {row.sector}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {fmtCr(row.marketCapCr)}
        </span>
      </div>
    </button>
  );
}
