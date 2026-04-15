"use client";

import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { useRef, useLayoutEffect, useState } from "react";

export function FinancialBarChart({
  data,
  firstKey,
  secondKey
}: {
  data: Array<Record<string, string | number | null>>;
  firstKey: string;
  secondKey: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);

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

  if (width === null || width <= 0) {
    return (
      <div
        ref={containerRef}
        className="h-[300px] w-full animate-pulse rounded-lg bg-bg/40"
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-[300px] w-full min-w-0"
    >
      <BarChart width={width} height={300} data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(130, 148, 179, 0.2)" />
        <XAxis dataKey="period" tick={{ fill: "currentColor", fontSize: 11 }} />
        <YAxis tick={{ fill: "currentColor", fontSize: 11 }} />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--panel))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 12
          }}
        />
        <Legend />
        <Bar dataKey={firstKey} fill="#4ea6ff" radius={[6, 6, 0, 0]} />
        <Bar dataKey={secondKey} fill="#57d983" radius={[6, 6, 0, 0]} />
      </BarChart>
    </div>
  );
}
