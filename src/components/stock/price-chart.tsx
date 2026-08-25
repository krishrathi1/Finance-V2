"use client";

import { useEffect, useId, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";
import { apiGet } from "@/lib/api";
import { fmtInr } from "@/lib/types";
import type { PricePoint } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChangePill } from "@/components/shared/change-pill";
import { fmtDayMonth, fmtFullDate, fmtMonthYear } from "./helpers";

const RANGES = ["1W", "1M", "6M", "1Y", "5Y"] as const;
type RangeKey = (typeof RANGES)[number];

interface ChartPayload {
  symbol: string;
  range: string;
  history: PricePoint[];
  livePrice: number | null;
  changePercent: number | null;
}

interface LoadedChart {
  key: string;
  history: PricePoint[];
}

const BRAND_COLOR = "#f59e0b";
const DANGER_COLOR = "#ef4444";

/** Sidebar price chart card with range selector and adaptive red/green gradient. */
export function PriceChartCard({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<RangeKey>("6M");
  // Loaded chart keyed by symbol+range so switching ranges keeps the previous
  // chart visible (dimmed) while the new slice streams in.
  const [loaded, setLoaded] = useState<LoadedChart | null>(null);
  // Unique SVG gradient id per instance — avoids id collisions across charts.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradId = `priceGrad-${uid}`;

  const chartKey = `${symbol}|${range}`;
  const history = loaded?.history ?? [];
  const loading = loaded === null || loaded.key !== chartKey;

  useEffect(() => {
    let cancelled = false;
    apiGet<ChartPayload>(
      `/api/stocks/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`
    )
      .then((res) => {
        if (cancelled) return;
        setLoaded({
          key: `${symbol}|${range}`,
          history: Array.isArray(res.history) ? res.history : [],
        });
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded({ key: `${symbol}|${range}`, history: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, range]);

  const first = history.length > 0 ? history[0].close : null;
  const last = history.length > 0 ? history[history.length - 1].close : null;
  const rangeChange =
    first !== null && last !== null && first !== 0 ? ((last - first) / first) * 100 : null;
  const strokeColor = (rangeChange ?? 0) >= 0 ? BRAND_COLOR : DANGER_COLOR;

  const tickFormatter = (v: string) =>
    range === "1Y" || range === "5Y" ? fmtMonthYear(v) : fmtDayMonth(v);

  return (
    <div
      className="rounded-2xl border border-border/50 bg-panel/60 p-4 backdrop-blur-sm"
      aria-label={`${symbol} price chart`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Price Chart
        </p>
        <ChangePill size="xs" value={rangeChange} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1" role="tablist" aria-label="Chart range">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={range === r}
            onClick={() => setRange(r)}
            className={cn(
              "min-h-9 rounded-full px-3 text-[11px] font-semibold transition",
              range === r
                ? "bg-brand text-white shadow-lg shadow-brand/20"
                : "border border-border/60 text-muted-foreground hover:border-brand/40 hover:text-text"
            )}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="mt-3 h-[220px]">
        {history.length === 0 ? (
          loading ? (
            <div className="shimmer h-full w-full rounded-xl" aria-hidden="true" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No chart data
            </div>
          )
        ) : (
          <div className={cn("h-full transition-opacity", loading && "pointer-events-none opacity-60")}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tickFormatter={tickFormatter}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted))", fontSize: 10 }}
                  interval="preserveStartEnd"
                  minTickGap={44}
                />
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip content={<PriceTooltip />} />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke={strokeColor}
                  strokeWidth={2}
                  fill={`url(#${gradId})`}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function PriceTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as PricePoint | undefined;
  if (!point) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-panel/95 px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground">{fmtFullDate(point.date)}</p>
      <p className="mt-0.5 font-semibold tabular-nums text-text">{fmtInr(point.close)}</p>
    </div>
  );
}
