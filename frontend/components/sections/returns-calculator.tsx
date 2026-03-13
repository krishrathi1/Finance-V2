"use client";

import { useMemo, useState } from "react";

import { ReturnsProjectionChart } from "@/components/charts/returns-projection-chart";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";

export function ReturnsCalculator({
  symbol,
  currentPrice,
  aiTarget,
  mlConfidence = 0,
  upProbability = 0.5
}: {
  symbol: string;
  currentPrice: number;
  aiTarget: number;
  mlConfidence?: number;
  upProbability?: number;
}) {
  const [amountInput, setAmountInput] = useState("100000");
  const amount = useMemo(() => {
    const numeric = Number(amountInput.replace(/[^\d]/g, ""));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }, [amountInput]);

  const series = useMemo(() => {
    const safeCurrent = currentPrice > 0 ? currentPrice : 1;
    const principal = amount > 0 ? amount : 0;
    const sharesBought = principal / safeCurrent;
    const direction = aiTarget >= safeCurrent ? 1 : -1;
    const confidence = Math.max(0, Math.min(1, mlConfidence));
    const probabilityBias = Math.max(-1, Math.min(1, ((upProbability ?? 0.5) - 0.5) * 2));
    const bend = 0.7 + (confidence * 0.55) + (Math.abs(probabilityBias) * 0.2);

    return [0, 1, 2, 3].map((year) => {
      const progress = year / 3;
      const curvedProgress = progress === 0 ? 0 : Math.min(1, Math.pow(progress, bend));
      const simulatedPrice = safeCurrent + ((aiTarget - safeCurrent) * curvedProgress);
      const stabilizer = year === 0 ? 0 : direction * probabilityBias * confidence * safeCurrent * 0.02 * year;
      return {
        year,
        value: sharesBought * (simulatedPrice + stabilizer),
        };
      });
    }, [amount, currentPrice, aiTarget, mlConfidence, upProbability]);

  const future = series[series.length - 1].value;
  const simulatedFuturePrice = currentPrice > 0 ? future / Math.max(amount / currentPrice, 1e-9) : 0;
  const futureGain = amount > 0 ? ((future - amount) / amount) * 100 : 0;
  const panelTone = futureGain >= 0 ? "bg-success/20" : "bg-danger/15";
  const trendTone = futureGain >= 0 ? "text-success" : "text-danger";
  const sharesBought = amount > 0 ? amount / Math.max(currentPrice, 1) : 0;
  const confidencePct = (Math.max(0, Math.min(1, mlConfidence)) * 100).toFixed(0);

  return (
    <Card className="flex h-full flex-col p-4">
      <h3 className="text-lg font-semibold">Predictive ROI Simulator</h3>
      <p className="mt-1 text-sm text-muted">3-year path shaped by the same bounded ML trend signal used in the stock score.</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-1">
        <label className="flex flex-col justify-between rounded-xl border border-border/70 bg-panel/70 p-3 text-sm">
          <span className="text-muted">Investment Amount</span>
          <input
            type="text"
            inputMode="numeric"
            className="mt-1 w-full min-w-0 bg-transparent text-2xl font-semibold outline-none"
            value={amountInput}
            onChange={(e) => {
              const digitsOnly = e.target.value.replace(/[^\d]/g, "");
              setAmountInput(digitsOnly.replace(/^0+(?=\d)/, ""));
            }}
          />
          <span className="mt-1 text-xs text-muted">
            Approx. {Math.floor(sharesBought).toLocaleString()} shares @ {formatCurrency(currentPrice)}
          </span>
        </label>
      </div>

      <div className={`mt-4 flex min-h-0 flex-1 flex-col rounded-xl p-4 ${panelTone}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted">Projected Value</p>
            <p className={`break-words text-[clamp(2.15rem,4vw,3.3rem)] font-bold leading-tight ${trendTone}`}>{formatCurrency(future)}</p>
            <p className={`mt-1 text-base font-medium ${trendTone}`}>Future Price: {formatCurrency(simulatedFuturePrice)} per share</p>
          </div>
          <div className="grid min-w-[170px] gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-border/50 bg-panel/70 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted">3Y Return</p>
              <p className={`text-lg font-semibold ${trendTone}`}>{futureGain >= 0 ? "+" : ""}{futureGain.toFixed(2)}%</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-panel/70 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted">ML Confidence</p>
              <p className="text-lg font-semibold text-text">{confidencePct}%</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-border/50 bg-panel/65 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted">Invested</p>
            <p className="text-sm font-semibold text-text">{formatCurrency(amount)}</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-panel/65 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted">Shares</p>
            <p className="text-sm font-semibold text-text">{sharesBought.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-panel/65 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted">Current Price</p>
            <p className="text-sm font-semibold text-text">{formatCurrency(currentPrice)}</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-panel/65 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted">Model View</p>
            <p className={`text-sm font-semibold ${trendTone}`}>{futureGain >= 0 ? "Positive" : "Negative"}</p>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted">
          {symbol} implied 3-year path uses the same bounded ML signal used in score validation. This is a scenario view, not a guaranteed outcome.
        </p>

        <div className="mt-4 min-h-0 flex-1 rounded-xl border border-border/50 bg-panel/75 p-3">
          <ReturnsProjectionChart data={series} positive={futureGain >= 0} height="100%" />
        </div>
      </div>
    </Card>
  );
}
