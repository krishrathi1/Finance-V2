"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

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
  const data = [
    { name: "Promoters", value: promoters },
    { name: "FII", value: fii },
    { name: "DII", value: dii },
    { name: "Public", value: publicHolding }
  ];

  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={86} strokeWidth={0}>
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
      </ResponsiveContainer>
    </div>
  );
}
