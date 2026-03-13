"use client";

import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { KeyRatioTrendCard, KeyRatioTrends } from "@/lib/types";

const PERCENTAGE_LABELS = new Set(["ROE", "ROCE", "ROA", "NPM", "NET NPA", "CASA Ratio", "Advance Growth", "Net Interest Margin", "Operating CF Margin"]);

function formatValue(value: number | null, label: string): string {
  const numeric = Number(value || 0);
  if (PERCENTAGE_LABELS.has(label)) {
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
  const ratioData: KeyRatioTrends = {
    profitability: (trends?.profitability || []).filter((card) => card.series.some((point) => Number.isFinite(Number(point.value)))),
    valuation: (trends?.valuation || []).filter((card) => card.series.some((point) => Number.isFinite(Number(point.value)))),
    liquidity: (trends?.liquidity || []).filter((card) => card.series.some((point) => Number.isFinite(Number(point.value)))),
  };
  const hasAnyData = ratioData.profitability.length || ratioData.valuation.length || ratioData.liquidity.length;

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold">Key Ratios</h3>
      {!hasAnyData ? <p className="mt-3 text-sm text-muted">Trend data is not available from the live providers for this stock right now.</p> : null}
      <Tabs defaultValue="profitability" className="mt-3">
        <TabsList>
          <TabsTrigger value="profitability">Profitability</TabsTrigger>
          <TabsTrigger value="valuation">Valuation</TabsTrigger>
          <TabsTrigger value="liquidity">Liquidity</TabsTrigger>
        </TabsList>
        <TabsContent value="profitability" className="mt-4">
          {ratioData.profitability.length ? <RatioGrid cards={ratioData.profitability} color="violet" /> : <p className="text-sm text-muted">No live profitability trend data.</p>}
        </TabsContent>
        <TabsContent value="valuation" className="mt-4">
          {ratioData.valuation.length ? <RatioGrid cards={ratioData.valuation} color="blue" /> : <p className="text-sm text-muted">No live valuation trend data.</p>}
        </TabsContent>
        <TabsContent value="liquidity" className="mt-4">
          {ratioData.liquidity.length ? <RatioGrid cards={ratioData.liquidity} color="violet" /> : <p className="text-sm text-muted">No live liquidity trend data.</p>}
        </TabsContent>
      </Tabs>
    </Card>
  );
}
