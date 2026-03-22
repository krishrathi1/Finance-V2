"use client";

import { TrendingUp, Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EstimateRow = Record<string, number | string | null>;

function fmt(v: number | null, isRevenue = false) {
  if (v === null || v === undefined) return "—";
  if (isRevenue) {
    const cr = (v as number) / 1e7; // USD → rough INR Cr at 84
    if (cr >= 1e5) return `₹${(cr / 1e5).toFixed(2)}L Cr`;
    if (cr >= 1000) return `₹${(cr / 1000).toFixed(1)}K Cr`;
    return `₹${cr.toFixed(0)} Cr`;
  }
  return (v as number).toFixed(2);
}

function fmtDate(d: string) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

export function AnalystEstimatesSection({ estimates }: { estimates: EstimateRow[] }) {
  if (!estimates || estimates.length === 0) return null;

  const rows = estimates.slice(0, 4);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-accent" />
          Analyst Estimates (Consensus)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 text-[11px] font-medium uppercase tracking-wider text-muted">
                <th className="pb-2 text-left">Period</th>
                <th className="pb-2 text-right">Est. Revenue</th>
                <th className="pb-2 text-right">Est. EPS</th>
                <th className="pb-2 text-right">Est. Net Income</th>
                <th className="pb-2 text-right">Analysts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border/30 transition hover:bg-bg/40">
                  <td className="py-2.5 font-medium">{fmtDate(String(row.period ?? ""))}</td>
                  <td className="py-2.5 text-right">
                    <div className="text-xs">
                      <span className="font-semibold">{fmt(row.estimatedRevenueAvg as number | null, true)}</span>
                      {row.estimatedRevenueLow !== null && row.estimatedRevenueHigh !== null && (
                        <div className="text-muted">
                          {fmt(row.estimatedRevenueLow as number | null, true)} – {fmt(row.estimatedRevenueHigh as number | null, true)}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="text-xs">
                      <span className="font-semibold">{fmt(row.estimatedEpsAvg as number | null)}</span>
                      {row.estimatedEpsLow !== null && row.estimatedEpsHigh !== null && (
                        <div className="text-muted">
                          {fmt(row.estimatedEpsLow as number | null)} – {fmt(row.estimatedEpsHigh as number | null)}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 text-right">
                    <span className="text-xs font-semibold">{fmt(row.estimatedNetIncomeAvg as number | null, true)}</span>
                  </td>
                  <td className="py-2.5 text-right text-xs text-muted">
                    {row.numberAnalystsEstimatedEps ? `${row.numberAnalystsEstimatedEps} EPS` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-muted">
          <TrendingUp className="mr-1 inline h-3 w-3" />
          Forward estimates from analyst consensus via FMP. Not investment advice.
        </p>
      </CardContent>
    </Card>
  );
}
