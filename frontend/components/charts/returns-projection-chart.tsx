"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useId } from "react";

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
  const strokeColor = positive ? "#10b981" : "#f43f5e";
  const gradientBase = positive ? "#34d399" : "#fb7185";

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <AreaChart data={data}>
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
      </ResponsiveContainer>
    </div>
  );
}
