import { Info } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber } from "@/lib/format";
import type { KeyRatioTrends } from "@/lib/types";

type MetricValue = number | null | undefined;

const metricConfig: Array<{ key: string; label: string; formula: string; type: "number" | "percent" | "currency" }> = [
  { key: "marketCap", label: "Market Cap (Cr)", formula: "Share Price x Outstanding Shares", type: "currency" },
  { key: "peRatio", label: "PE Ratio", formula: "Market Price Per Share / Earnings Per Share", type: "number" },
  { key: "industryPe", label: "Industry P/E", formula: "Average P/E of comparable industry peers", type: "number" },
  { key: "pegRatio", label: "PEG Ratio", formula: "PE Ratio / EPS Growth Rate", type: "number" },
  { key: "roe", label: "ROE", formula: "(Net Income / Shareholders' Equity) x 100", type: "percent" },
  { key: "roce", label: "ROCE", formula: "(EBIT / Capital Employed) x 100", type: "percent" },
  { key: "roa", label: "ROA", formula: "(Net Income / Total Assets) x 100", type: "percent" },
  { key: "ebitdaMargin", label: "Ebitda Margin", formula: "(EBITDA / Revenue) x 100", type: "percent" },
  { key: "casaRatio", label: "CASA Ratio", formula: "(Current + Savings Deposits / Total Deposits) x 100", type: "number" },
  { key: "dividendYield", label: "Dividend Yield", formula: "(Dividend Per Share / Current Price) x 100", type: "percent" },
  { key: "eps", label: "EPS", formula: "(Net Profit - Preferred Dividend) / Average Shares", type: "currency" },
  { key: "faceValue", label: "Face Value", formula: "Nominal value per share", type: "number" },
  { key: "outstandingShares", label: "Outstanding Shares (Cr)", formula: "Total issued shares currently outstanding", type: "number" },
  { key: "netInterestMargin", label: "Net Interest Margin", formula: "(Net Interest Income / Average Earning Assets) x 100", type: "percent" },
  { key: "evToSales", label: "EV to Sales", formula: "Enterprise Value / Revenue", type: "number" }
];

function isValid(value: MetricValue) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function metricText(value: MetricValue, type: "number" | "percent" | "currency") {
  if (!isValid(value)) return "N/A";
  const numeric = Number(value);
  if (type === "percent") return `${formatNumber(numeric)}%`;
  if (type === "currency") return `₹ ${formatNumber(numeric)}`;
  return formatNumber(numeric);
}

function latestTrendValue(keyRatioTrends: KeyRatioTrends | undefined, label: string) {
  const cards = keyRatioTrends?.liquidity || [];
  const card = cards.find((item) => item.label.toLowerCase() === label.toLowerCase());
  if (!card) return null;
  for (let index = card.series.length - 1; index >= 0; index -= 1) {
    const value = card.series[index]?.value;
    if (value !== null && value !== undefined && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return card.average3Y ?? null;
}

export function MetricsGrid({
  metrics,
  keyRatioTrends
}: {
  metrics: Record<string, number | null>;
  keyRatioTrends?: KeyRatioTrends;
}) {
  const mergedMetrics: Record<string, number | null> = {
    ...metrics,
    casaRatio: isValid(metrics.casaRatio) ? metrics.casaRatio : latestTrendValue(keyRatioTrends, "CASA Ratio"),
    netInterestMargin: isValid(metrics.netInterestMargin) ? metrics.netInterestMargin : latestTrendValue(keyRatioTrends, "Net Interest Margin")
  };
  const bookValue = metrics.bookValue;
  const pbRatio = metrics.pbRatio;
  const bookValuePb =
    isValid(bookValue) && isValid(pbRatio) ? `₹ ${formatNumber(Number(bookValue))} x ${formatNumber(Number(pbRatio))}` : "N/A";

  return (
    <TooltipProvider>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricConfig.map((metric) => (
          <Card key={metric.key} className="min-h-[108px] p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-muted">{metric.label}</p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="shrink-0 text-muted transition hover:text-text" aria-label={`${metric.label} formula`}>
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{metric.formula}</TooltipContent>
              </Tooltip>
            </div>
            <p className="mt-3 text-2xl font-semibold">{metricText(mergedMetrics[metric.key], metric.type)}</p>
          </Card>
        ))}

        <Card className="min-h-[108px] p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-muted">Book Value &amp; P/B</p>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="shrink-0 text-muted transition hover:text-text" aria-label="Book Value and P/B formula">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Book Value Per Share with Price-to-Book multiple</TooltipContent>
            </Tooltip>
          </div>
          <p className="mt-3 text-2xl font-semibold">{bookValuePb}</p>
        </Card>
      </div>
    </TooltipProvider>
  );
}
