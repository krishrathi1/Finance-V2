"use client";

import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { useRef, useLayoutEffect, useState } from "react";

const colors = ["#4ea6ff", "#68d786", "#f8b94d", "#ef6b6b"];

export function ShareholdingPie({
  promoters,
  fii,
  dii,
  publicHolding
}: {
  promoters: number;
  fii: number;
  dii: number;
  publicHolding: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  const data = [
    { name: "Promoters", value: promoters },
    { name: "FII", value: fii },
    { name: "DII", value: dii },
    { name: "Public", value: publicHolding }
  ];

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
        className="h-[250px] w-full animate-pulse rounded-lg bg-bg/40"
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-[250px] w-full min-w-0 flex items-center justify-center"
    >
      <PieChart width={Math.min(width, 300)} height={250}>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={86} strokeWidth={0} cx={Math.min(width, 300) / 2} cy={125}>
          {data.map((_, idx) => (
            <Cell key={idx} fill={colors[idx]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number | string | undefined) => `${Number(value || 0).toFixed(2)}%`}
          contentStyle={{
            background: "hsl(var(--panel))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 12
          }}
        />
      </PieChart>
    </div>
  );
}
