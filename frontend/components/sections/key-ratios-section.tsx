"use client";

import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { KeyRatioTrendCard, KeyRatioTrends } from "@/lib/types";

function formatValue(value: number | null, label: string): string {
  const numeric = Number(value || 0);
  if (label === "ROE" || label === "ROCE" || label === "ROA" || label === "NPM" || label === "NET NPA" || label === "CASA Ratio" || label === "Advance Growth" || label === "Net Interest Margin") {
    return `${numeric.toFixed(2)}%`;
  }
  return numeric.toFixed(2);
}

function averageLabel(label: string): string {
  return label === "Advance Growth" ? `Avg A G (3 Yrs)` : `Avg ${label} (3 Yrs)`;
}

function RatioTrendCard({ card, color }: { card: KeyRatioTrendCard; color: "violet" | "blue" }) {
  const values = card.series.map((item) => Math.abs(Number(item.value || 0)));
  const maxValue = Math.max(...values, 0);

  return (
    <div className="rounded-2xl border border-border/70 p-3">
      <h4 className="text-base font-semibold">{card.label}</h4>
      <p className="mt-2 text-sm font-medium">
        {averageLabel(card.label)} : {formatValue(card.average3Y, card.label)}
      </p>
      <div className="mt-4 space-y-4">
        {card.series.map((point) => {
          const value = Number(point.value || 0);
          const width = maxValue > 0 ? `${(Math.abs(value) / maxValue) * 100}%` : "0%";
          const barClass =
            color === "blue"
              ? value < 0
                ? "bg-rose-300"
                : "bg-gradient-to-r from-sky-400 to-blue-500"
              : value < 0
                ? "bg-rose-300"
                : "bg-gradient-to-r from-violet-300 to-violet-500";

          return (
            <div key={`${card.label}-${point.period}`} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">{point.period}</span>
                <span>{formatValue(value, card.label)}</span>
              </div>
              <div className="h-5 rounded-full bg-bg">
                <div className={`h-5 rounded-full ${barClass}`} style={{ width }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RatioGrid({ cards, color }: { cards: KeyRatioTrendCard[]; color: "violet" | "blue" }) {
  return <div className="grid gap-3 xl:grid-cols-4">{cards.map((card) => <RatioTrendCard key={card.label} card={card} color={color} />)}</div>;
}

export function KeyRatiosSection({
  metrics,
  trends
}: {
  metrics: Record<string, number | null>;
  trends?: KeyRatioTrends;
}) {
  const fallback: KeyRatioTrends = {
    profitability: [
      {
        label: "ROE",
        average3Y: Number(metrics.roe || 0),
        series: Array.from({ length: 5 }, (_, index) => ({ period: String(2021 + index), value: Number(metrics.roe || 0) }))
      },
      {
        label: "ROCE",
        average3Y: Number(metrics.roce || 0),
        series: Array.from({ length: 5 }, (_, index) => ({ period: String(2021 + index), value: Number(metrics.roce || 0) }))
      },
      {
        label: "ROA",
        average3Y: Number(metrics.roa || 0),
        series: Array.from({ length: 5 }, (_, index) => ({ period: String(2021 + index), value: Number(metrics.roa || 0) }))
      },
      {
        label: "NPM",
        average3Y: Number(metrics.profitMargin || 0),
        series: Array.from({ length: 5 }, (_, index) => ({ period: String(2021 + index), value: Number(metrics.profitMargin || 0) }))
      }
    ],
    valuation: [
      { label: "P/E Ratio", average3Y: Number(metrics.peRatio || 0), series: Array.from({ length: 5 }, (_, index) => ({ period: String(2021 + index), value: Number(metrics.peRatio || 0) })) },
      { label: "EV/EBITDA", average3Y: 0, series: Array.from({ length: 5 }, (_, index) => ({ period: String(2021 + index), value: 0 })) },
      { label: "Price to Book Value", average3Y: Number(metrics.pbRatio || 0), series: Array.from({ length: 5 }, (_, index) => ({ period: String(2021 + index), value: Number(metrics.pbRatio || 0) })) },
      { label: "Price to Cash Flow", average3Y: 0, series: Array.from({ length: 5 }, (_, index) => ({ period: String(2021 + index), value: 0 })) }
    ],
    liquidity: [
      { label: "NET NPA", average3Y: 0, series: Array.from({ length: 5 }, (_, index) => ({ period: String(2021 + index), value: 0 })) },
      { label: "CASA Ratio", average3Y: 0, series: Array.from({ length: 5 }, (_, index) => ({ period: String(2021 + index), value: 0 })) },
      { label: "Advance Growth", average3Y: 0, series: Array.from({ length: 5 }, (_, index) => ({ period: String(2021 + index), value: 0 })) },
      { label: "Net Interest Margin", average3Y: 0, series: Array.from({ length: 5 }, (_, index) => ({ period: String(2021 + index), value: 0 })) }
    ]
  };

  const ratioData = trends || fallback;

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold">Key Ratios</h3>
      <Tabs defaultValue="profitability" className="mt-3">
        <TabsList>
          <TabsTrigger value="profitability">Profitability</TabsTrigger>
          <TabsTrigger value="valuation">Valuation</TabsTrigger>
          <TabsTrigger value="liquidity">Liquidity</TabsTrigger>
        </TabsList>
        <TabsContent value="profitability" className="mt-4">
          <RatioGrid cards={ratioData.profitability} color="violet" />
        </TabsContent>
        <TabsContent value="valuation" className="mt-4">
          <RatioGrid cards={ratioData.valuation} color="blue" />
        </TabsContent>
        <TabsContent value="liquidity" className="mt-4">
          <RatioGrid cards={ratioData.liquidity} color="violet" />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
