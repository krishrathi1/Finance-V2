"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useId } from "react";

import type { PricePoint } from "@/lib/types";

export function PriceChart({ data, trend, height = 260 }: { data: PricePoint[]; trend?: "up" | "down"; height?: number | string }) {
  const gradientId = useId().replace(/:/g, "");
  const compact = data.map((item) => {
    // Check if the date has a time component (e.g., 2024-05-12T09:15:00)
    const label = item.date.includes("T") ? item.date.slice(11, 16) : item.date.slice(5);
    return {
      date: label,
      close: Number(item.close.toFixed(2))
    };
  });
  if (!compact.length) {
    return <div style={{ height }} className="w-full rounded-lg border border-border/60 bg-bg/40" />;
  }

  const isUp = trend === "up";
  const isDown = trend === "down";
  const strokeColor = isUp ? "#10b981" : isDown ? "#f43f5e" : "#3ab8c7";
  const gradientBase = isUp ? "#34d399" : isDown ? "#fb7185" : "#41c6da";

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <AreaChart data={compact}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={gradientBase} stopOpacity={0.45} />
              <stop offset="100%" stopColor={gradientBase} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(130, 148, 179, 0.2)" />
          <XAxis dataKey="date" tick={{ fill: "currentColor", fontSize: 11 }} minTickGap={22} />
          <YAxis tick={{ fill: "currentColor", fontSize: 11 }} width={56} domain={["auto", "auto"]} />
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
      </ResponsiveContainer>
    </div>
  );
}
