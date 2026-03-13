"use client";

import { useMemo, useState } from "react";

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
  const [amount, setAmount] = useState(100000);

  const series = useMemo(() => {
    const safeCurrent = currentPrice > 0 ? currentPrice : 1;
    const sharesBought = amount / safeCurrent;
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
  const chartValues = series.map((point) => point.value);
  const maxChartValue = Math.max(...chartValues, amount, 1);
  const minChartValue = Math.min(...chartValues, amount, maxChartValue);
  const span = Math.max(maxChartValue - minChartValue, 1);
  const chartPath = series
    .map((point, index) => {
      const x = (index / Math.max(series.length - 1, 1)) * 100;
      const y = 100 - (((point.value - minChartValue) / span) * 100);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
  const panelTone = futureGain >= 0 ? "bg-success/20" : "bg-danger/15";
  const trendTone = futureGain >= 0 ? "text-success" : "text-danger";

  return (
    <Card className="h-full p-4">
      <h3 className="text-lg font-semibold">Predictive ROI Simulator</h3>
      <p className="mt-1 text-sm text-muted">3-year path shaped by the same bounded ML trend signal used in the stock score.</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-1">
        <label className="flex flex-col justify-between rounded-xl border border-border/70 p-2 text-sm">
          <span>Investment Amount</span>
          <input
            type="number"
            className="mt-1 w-full bg-transparent text-lg font-semibold outline-none"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <span className="mt-1 text-xs text-muted">
            Approx. {Math.floor(amount / Math.max(currentPrice, 1)).toLocaleString()} shares @ {formatCurrency(currentPrice)}
          </span>
        </label>
      </div>

      <div className={`mt-4 rounded-xl p-4 ${panelTone}`}>
        <p className="text-sm text-muted">Projected Value</p>
        <p className={`text-3xl font-bold ${trendTone}`}>{formatCurrency(future)}</p>
        <p className={`mt-1 text-sm ${trendTone}`}>Simulated Future Price: {formatCurrency(simulatedFuturePrice)} per share</p>
        <p className="mt-1 text-xs text-muted">
          {symbol} implied 3Y return: {futureGain >= 0 ? "+" : ""}
          {futureGain.toFixed(2)}% with ML confidence {(Math.max(0, Math.min(1, mlConfidence)) * 100).toFixed(0)}%
        </p>

        <div className="mt-4 rounded-xl border border-border/50 bg-panel/75 p-3">
          <svg viewBox="0 0 100 100" className="h-20 w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="roiLine" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor={futureGain >= 0 ? "#22c55e" : "#f97316"} />
                <stop offset="100%" stopColor={futureGain >= 0 ? "#16a34a" : "#ef4444"} />
              </linearGradient>
            </defs>
            <path d={chartPath} fill="none" stroke="url(#roiLine)" strokeLinecap="round" strokeWidth="3" />
          </svg>
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            {series.map((point) => (
              <span key={point.year}>Y{point.year}</span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
