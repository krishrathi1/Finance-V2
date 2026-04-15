"use client";

import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { useId, useState, useLayoutEffect, useRef } from "react";

import { formatCurrency } from "@/lib/format";

export function ReturnsProjectionChart({
  data,
  positive = true,
  height = 180
}: {
  data: Array<{ year: number; value: number }>;
  positive?: boolean;
  height?: number | string;
}) {
  const gradientId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  const strokeColor = positive ? "#10b981" : "#f43f5e";
  const gradientBase = positive ? "#34d399" : "#fb7185";

  // Measure width
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

  // Handle resize
  useLayoutEffect(() => {
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

  const heightValue = typeof height === 'number' ? height : 180;

  if (width === null || width <= 0) {
    return (
      <div
        ref={containerRef}
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
        className="w-full animate-pulse rounded-lg bg-bg/40"
      />
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
      className="w-full min-w-0"
    >
      <AreaChart width={width} height={heightValue} data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={gradientBase} stopOpacity={0.45} />
            <stop offset="100%" stopColor={gradientBase} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(130,148,179,0.2)" />
        <XAxis dataKey="year" tick={{ fill: "currentColor", fontSize: 11 }} tickFormatter={(value) => `Y${value}`} />
        <YAxis tick={{ fill: "currentColor", fontSize: 11 }} width={84} tickFormatter={(value) => formatCurrency(Number(value))} />
        <Tooltip
          formatter={(value: number | string | undefined) => formatCurrency(Number(value || 0))}
          labelFormatter={(label) => `Year ${label}`}
          contentStyle={{
            background: "hsl(var(--panel))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 12,
            color: "hsl(var(--text))"
          }}
        />
        <Area type="monotone" dataKey="value" stroke={strokeColor} strokeWidth={2} fill={`url(#${gradientId})`} />
      </AreaChart>
    </div>
  );
}
