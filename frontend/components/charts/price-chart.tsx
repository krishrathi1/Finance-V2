"use client";

import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { useId, useState, useEffect, useRef, useLayoutEffect } from "react";

// PriceChart only reads `date` and `close`, so accept any series that provides them
// (full PricePoint[] from the dashboard, or the {date, close}[] the sidebar derives).
type ChartPoint = { date: unknown; close: unknown };

export function PriceChart({ data, trend, height = 260 }: { data: ChartPoint[]; trend?: "up" | "down"; height?: number | string }) {
  const gradientId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  // Use useLayoutEffect to measure BEFORE paint
  useLayoutEffect(() => {
    const measureWidth = () => {
      if (containerRef.current) {
        const computedWidth = containerRef.current.getBoundingClientRect().width;
        if (computedWidth > 0) {
          setWidth(Math.floor(computedWidth));
        }
      }
    };

    measureWidth();
  }, []);

  // Also measure on resize
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        const computedWidth = containerRef.current.getBoundingClientRect().width;
        if (computedWidth > 0) {
          setWidth(Math.floor(computedWidth));
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const compact = data.flatMap((item) => {
    const date = typeof item?.date === "string" ? item.date : "";
    const close = Number(item?.close);
    if (!date || !Number.isFinite(close)) return [];
    const label = date.includes("T") ? date.slice(11, 16) : date.slice(5);
    return [{ date: label || date, close: Number(close.toFixed(2)) }];
  });

  if (!compact.length) {
    return (
      <div
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
        className="w-full rounded-lg border border-border/60 bg-bg/40"
      />
    );
  }

  const isUp = trend === "up";
  const isDown = trend === "down";
  const strokeColor = isUp ? "#10b981" : isDown ? "#f43f5e" : "#3ab8c7";
  const gradientBase = isUp ? "#34d399" : isDown ? "#fb7185" : "#41c6da";
  const heightValue = typeof height === 'number' ? height : 260;

  // Don't render chart if width is not ready
  if (width === null || width <= 0) {
    return (
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: typeof height === 'number' ? `${height}px` : height,
        }}
        className="min-w-0 animate-pulse rounded-lg bg-bg/40"
      />
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: typeof height === 'number' ? `${height}px` : height,
      }}
      className="min-w-0"
    >
      <AreaChart
        width={width}
        height={heightValue}
        data={compact}
        margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={gradientBase} stopOpacity={0.45} />
            <stop offset="100%" stopColor={gradientBase} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(130, 148, 179, 0.2)" />
        <XAxis dataKey="date" tick={{ fill: "currentColor", fontSize: 10 }} minTickGap={14} />
        <YAxis tick={{ fill: "currentColor", fontSize: 10 }} width={42} domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--panel))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 12,
            color: "hsl(var(--text))"
          }}
        />
        <Area type="monotone" dataKey="close" stroke={strokeColor} strokeWidth={2} fill={`url(#${gradientId})`} />
      </AreaChart>
    </div>
  );
}
