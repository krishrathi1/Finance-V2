import { Info } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber } from "@/lib/format";
import type { KeyRatioTrends } from "@/lib/types";

type MetricValue = number | null | undefined;

type MetricType = "number" | "percent" | "currency" | "bookValuePb";

// Order matches tradebrains' 4x4 Key Metrics layout (Market Cap..EV to Sales).
// Net Profit Margin / Debt-Equity / Current Ratio aren't in that reference grid
// (they live under Key Ratios there) but we keep showing them as trailing tiles
// rather than dropping data users can already see today.
const metricConfig: Array<{ key: string; label: string; formula: string; type: MetricType }> = [
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
  { key: "bookValuePb", label: "Book Value & P/B", formula: "Book Value Per Share with Price-to-Book multiple", type: "bookValuePb" },
  { key: "faceValue", label: "Face Value", formula: "Nominal value per share", type: "number" },
  { key: "outstandingShares", label: "Outstanding Shares (Cr)", formula: "Total issued shares currently outstanding", type: "number" },
  { key: "netInterestMargin", label: "Net Interest Margin", formula: "(Net Interest Income / Average Earning Assets) x 100", type: "percent" },
  { key: "evToSales", label: "EV to Sales", formula: "Enterprise Value / Revenue", type: "number" },
  { key: "profitMargin", label: "Net Profit Margin", formula: "(Net Profit / Revenue) x 100", type: "percent" },
  { key: "debtToEquity", label: "Debt / Equity", formula: "Total Debt / Shareholders' Equity", type: "number" },
  { key: "currentRatio", label: "Current Ratio", formula: "Current Assets / Current Liabilities", type: "number" }
];

function isValid(value: MetricValue) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function metricText(value: MetricValue, type: Exclude<MetricType, "bookValuePb">) {
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

// CASA Ratio and Net Interest Margin describe a lender's deposit/loan book —
// they're structurally undefined for non-financial companies, so tradebrains-style
// research pages only surface them for banks/NBFCs rather than showing "N/A" everywhere.
// `industry` (e.g. "Banks - Regional", "Credit Services") is more precise than the
// coarse `sector` ("Financial Services" also covers asset managers/exchanges/insurers
// that carry neither metric), so it's checked first and `sector` is only a fallback
// for providers that don't return an industry string.
const BANK_ONLY_METRICS = new Set(["casaRatio"]);
const LENDER_METRICS = new Set(["netInterestMargin"]);

function isBank(sector?: string, industry?: string) {
  if (industry) return industry.toLowerCase().includes("bank");
  return sector?.toLowerCase().includes("bank") ?? false;
}

function isLender(sector?: string, industry?: string) {
  if (industry) {
    const normalized = industry.toLowerCase();
    return normalized.includes("bank") || normalized.includes("credit") || normalized.includes("mortgage");
  }
  const normalized = sector?.toLowerCase();
  return normalized === "banking" || normalized === "finance" || normalized === "financial services";
}

export function MetricsGrid({
  metrics,
  keyRatioTrends,
  sector,
  industry
}: {
  metrics: Record<string, number | null>;
  keyRatioTrends?: KeyRatioTrends;
  sector?: string;
  industry?: string;
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

  // Never hide a tile that actually has data — sector/industry text can be
  // missing (profile fetch failed, NSE-only data path) even for a real bank
  // whose CASA/NIM values came through via keyRatioTrends, so the classifier
  // is only used to hide the tile when there's also no data to show.
  const visibleMetrics = metricConfig.filter((metric) => {
    if (BANK_ONLY_METRICS.has(metric.key)) return isBank(sector, industry) || isValid(mergedMetrics[metric.key]);
    if (LENDER_METRICS.has(metric.key)) return isLender(sector, industry) || isValid(mergedMetrics[metric.key]);
    return true;
  });

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {visibleMetrics.map((metric) => (
          <Card key={metric.key} className="min-h-[90px] p-3 sm:min-h-[108px] sm:p-4">
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
            <p className="mt-2 text-lg font-semibold sm:mt-3 sm:text-2xl">
              {metric.type === "bookValuePb" ? bookValuePb : metricText(mergedMetrics[metric.key], metric.type)}
            </p>
          </Card>
        ))}
      </div>
    </TooltipProvider>
  );
}
