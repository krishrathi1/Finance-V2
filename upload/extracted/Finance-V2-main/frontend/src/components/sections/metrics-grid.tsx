import { Info } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber } from "@/shared/format";
import type { KeyRatioTrends } from "@/shared/types";

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

function getMetricBadge(key: string, val: MetricValue): { text: string; color: string } | null {
  if (!isValid(val)) return null;
  const num = Number(val);
  if (key === "roe" && num >= 15) return { text: "High Return", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
  if (key === "roce" && num >= 20) return { text: "Capital Efficient", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
  if (key === "debtToEquity" && num <= 0.5) return { text: "Low Debt", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
  if (key === "debtToEquity" && num >= 1.5) return { text: "High Leverage", color: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
  if (key === "dividendYield" && num >= 2.0) return { text: "Good Yield", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  if (key === "peRatio" && num > 0 && num <= 15) return { text: "Value Zone", color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" };
  if (key === "peRatio" && num >= 50) return { text: "Growth Premium", color: "bg-purple-500/15 text-purple-400 border-purple-500/30" };
  return null;
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

  const visibleMetrics = metricConfig.filter((metric) => {
    if (BANK_ONLY_METRICS.has(metric.key)) return isBank(sector, industry) || isValid(mergedMetrics[metric.key]);
    if (LENDER_METRICS.has(metric.key)) return isLender(sector, industry) || isValid(mergedMetrics[metric.key]);
    // Hide tile if it evaluates to N/A unless it's a core metric (marketCap, peRatio, roe, eps, faceValue)
    const val = metric.type === "bookValuePb" ? bookValuePb : metricText(mergedMetrics[metric.key], metric.type);
    if (val === "N/A" && !["marketCap", "peRatio", "roe", "eps", "faceValue"].includes(metric.key)) {
      return false;
    }
    return true;
  });

  const marketCapCr = mergedMetrics.marketCap;
  const marketCapCategory =
    typeof marketCapCr === "number" && Number.isFinite(marketCapCr) && marketCapCr > 0
      ? marketCapCr >= 100_000
        ? "Large Cap"
        : marketCapCr >= 20_000
          ? "Mid Cap"
          : marketCapCr >= 5_000
            ? "Small Cap"
            : "Micro Cap"
      : null;

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {visibleMetrics.map((metric) => {
          const formattedVal = metric.type === "bookValuePb" ? bookValuePb : metricText(mergedMetrics[metric.key], metric.type);
          const badge = getMetricBadge(metric.key, mergedMetrics[metric.key]);
          return (
            <Card key={metric.key} className="min-h-[90px] p-3 sm:min-h-[108px] sm:p-4 hover:border-accent/40 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-muted font-medium uppercase tracking-wider">{metric.label}</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="shrink-0 text-muted transition hover:text-text" aria-label={`${metric.label} formula`}>
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{metric.formula}</TooltipContent>
                </Tooltip>
              </div>
              <p className="mt-2 text-lg font-bold sm:mt-3 sm:text-2xl">
                {formattedVal}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                {metric.key === "marketCap" && marketCapCategory ? (
                  <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border border-border/60 bg-bg/50 text-muted">
                    {marketCapCategory}
                  </span>
                ) : null}
                {badge ? (
                  <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${badge.color}`}>
                    {badge.text}
                  </span>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
