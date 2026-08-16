"use client";

import { useMemo, useState } from "react";
import { Grid3X3, Search } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  buildMetricsCatalog,
  formatMetricValue,
  type MetricCategory,
} from "@/shared/metrics-catalog";

/**
 * The full metrics reference — every figure the payload supports, grouped and
 * searchable.
 *
 * The cards above each curate; this is for looking something up. Dense on
 * purpose: the reader arriving here typed "ROCE" or "pledge" into their head
 * before they arrived, and the search box is the primary interface. Metrics
 * whose inputs are missing are absent rather than dashed out, with the honest
 * count in the footer.
 */
export function MetricsReference({ data }: { data: any }) {
  const catalog = useMemo(() => buildMetricsCatalog(data), [data]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MetricCategory | "All">("All");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.entries.filter((entry) => {
      if (category !== "All" && entry.category !== category) return false;
      if (!needle) return true;
      return (
        entry.label.toLowerCase().includes(needle) ||
        entry.category.toLowerCase().includes(needle) ||
        entry.about.toLowerCase().includes(needle)
      );
    });
  }, [catalog, query, category]);

  const grouped = useMemo(() => {
    const map = new Map<MetricCategory, typeof visible>();
    for (const entry of visible) {
      const bucket = map.get(entry.category);
      if (bucket) bucket.push(entry);
      else map.set(entry.category, [entry]);
    }
    return [...map.entries()];
  }, [visible]);

  if (catalog.available < 10) return null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-zinc-400 to-zinc-600" />
        <h3 className="text-lg font-semibold">All Metrics</h3>
        <span className="ml-auto text-[11px] text-muted">
          {catalog.available} of {catalog.total} available
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a metric — ROCE, drawdown, promoter…"
            aria-label="Search metrics"
            className="h-9 w-full rounded-xl border border-border/60 bg-bg/60 pl-8 pr-3 text-xs outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
          />
        </label>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as MetricCategory | "All")}
          aria-label="Filter by category"
          className="h-9 rounded-xl border border-border/60 bg-bg/60 px-2.5 text-xs outline-none transition focus:border-accent/60"
        >
          <option value="All">All categories</option>
          {catalog.categories.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      </div>

      {grouped.length === 0 ? (
        <p className="mt-4 rounded-xl border border-border/40 bg-bg/40 px-3 py-4 text-center text-[11px] text-muted">
          Nothing matches &ldquo;{query}&rdquo; — the metric may not be computable for this stock.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {grouped.map(([groupCategory, entries]) => (
            <div key={groupCategory}>
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                <Grid3X3 className="h-3 w-3" /> {groupCategory}
                <span className="font-normal normal-case tracking-normal">({entries.length})</span>
              </p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
                {entries.map((entry) => (
                  <div
                    key={entry.key}
                    className="rounded-lg border border-border/40 bg-bg/40 px-2.5 py-2"
                    title={entry.about}
                  >
                    <p className="truncate text-[10px] text-muted">{entry.label}</p>
                    <p
                      className={`text-sm font-bold tabular-nums ${
                        entry.tone === "good"
                          ? "text-success"
                          : entry.tone === "bad"
                          ? "text-danger"
                          : ""
                      }`}
                    >
                      {formatMetricValue(entry)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[10px] leading-4 text-muted/60">
        Hover a tile for what the figure means. Metrics the data cannot support are omitted, not
        zeroed. Educational reference, not investment advice.
      </p>
    </Card>
  );
}
