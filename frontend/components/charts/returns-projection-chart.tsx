"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function ReturnsProjectionChart({ data }: { data: Array<{ year: number; value: number }> }) {
  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="returnsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#59d380" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#59d380" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(130,148,179,0.2)" />
          <XAxis dataKey="year" tick={{ fill: "currentColor", fontSize: 11 }} />
          <YAxis tick={{ fill: "currentColor", fontSize: 11 }} width={68} />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--panel))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12
            }}
          />
          <Area type="monotone" dataKey="value" stroke="#59d380" fill="url(#returnsGradient)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
