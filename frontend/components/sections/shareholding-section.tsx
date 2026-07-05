"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ShareholdingPie } from "@/components/charts/shareholding-pie";
import { Card } from "@/components/ui/card";
import type { ShareholdingHolder, ShareholdingPoint } from "@/lib/types";

export function ShareholdingSection({
  quarter,
  promoters,
  fii,
  dii,
  publicHolding,
  history,
  topHolders,
  sourceUrl
}: {
  quarter: string;
  promoters: number;
  fii: number;
  dii: number;
  publicHolding: number;
  history?: ShareholdingPoint[];
  topHolders?: ShareholdingHolder[];
  sourceUrl?: string;
}) {
  const points = useMemo(() => {
    if (history && history.length) return history;
    return [{ quarter, promoters, fii, dii, public: publicHolding }];
  }, [history, quarter, promoters, fii, dii, publicHolding]);

  // Only offer a quarter picker when there's real multi-quarter trend data
  // with actual labels — otherwise there's exactly one (label-less) point
  // and the dropdown rendered a single blank option, which looked broken.
  const hasQuarterHistory = points.length > 1 && points.every((item) => Boolean(item.quarter));

  const [selectedQuarter, setSelectedQuarter] = useState(points[0]?.quarter || quarter);

  useEffect(() => {
    setSelectedQuarter(points[0]?.quarter || quarter);
  }, [points, quarter]);

  const activePoint = points.find((item) => item.quarter === selectedQuarter) || points[0];

  const rows = [
    { name: "Promoters", value: activePoint?.promoters || 0 },
    { name: "FII", value: activePoint?.fii || 0 },
    { name: "DII", value: activePoint?.dii || 0 },
    { name: "Public", value: activePoint?.public || 0 }
  ];

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Shareholding Pattern</h3>
          <p className="text-sm text-muted">
            {hasQuarterHistory
              ? "Choose a quarter to see how promoter, FII, DII, and public holdings changed."
              : "Latest available shareholding pattern."}
          </p>
        </div>
        {hasQuarterHistory ? (
          <div className="min-w-[180px]">
            <label htmlFor="shareholding-quarter" className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
              Quarter
            </label>
            <select
              id="shareholding-quarter"
              value={activePoint?.quarter || ""}
              onChange={(event) => setSelectedQuarter(event.target.value)}
              className="w-full rounded-xl border border-border/70 bg-bg px-3 py-2 text-sm text-text outline-none transition focus:border-primary"
            >
              {points.map((item) => (
                <option key={item.quarter} value={item.quarter}>
                  {item.quarter}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid items-center gap-4 md:grid-cols-2">
        <ShareholdingPie
          key={activePoint?.quarter || "shareholding"}
          promoters={activePoint?.promoters || 0}
          fii={activePoint?.fii || 0}
          dii={activePoint?.dii || 0}
          publicHolding={activePoint?.public || 0}
        />
        <div className="space-y-2">
          {rows.map((item) => (
            <div key={item.name} className="rounded-xl border border-border/70 p-3">
              <p className="text-sm text-muted">{item.name}</p>
              <p className="text-2xl font-semibold">{item.value.toFixed(2)}%</p>
            </div>
          ))}
        </div>
      </div>

      {topHolders?.length ? (
        <div className="mt-5 rounded-2xl border border-border/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-lg font-semibold">Top Shareholders</h4>
            {sourceUrl ? (
              <Link href={sourceUrl} target="_blank" className="text-sm text-accent hover:underline">
                View all Share Holders
              </Link>
            ) : null}
          </div>
          <div className="mt-3 grid gap-3 xl:grid-cols-4">
            {topHolders.map((holder) => (
              <div key={holder.name} className="rounded-xl border border-border/70 p-3">
                <p className="text-sm">{holder.name}</p>
                <p className="mt-2 text-lg font-semibold">{holder.value.toFixed(2)}%</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
