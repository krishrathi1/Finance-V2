"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function FinancialBarChart({
  data,
  firstKey,
  secondKey
}: {
  data: Array<Record<string, string | number>>;
  firstKey: string;
  secondKey: string;
}) {
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer>
        <BarChart data={data}>
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
      </ResponsiveContainer>
    </div>
  );
}
