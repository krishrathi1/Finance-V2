"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
  const quickAmounts = [5000, 10000, 25000];
  const [amountInput, setAmountInput] = useState("");
  const amount = useMemo(() => {
    const numeric = Number(amountInput.replace(/[^\d]/g, ""));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }, [amountInput]);
  const hasTarget = currentPrice > 0 && aiTarget > 0;
  const projectionTarget = hasTarget ? aiTarget : currentPrice;

  const simulation = useMemo(() => {
    const safeCurrent = currentPrice > 0 ? currentPrice : 1;
    const principal = amount > 0 ? amount : 0;
    const sharesBought = principal / safeCurrent;
    const direction = projectionTarget >= safeCurrent ? 1 : -1;
    const confidence = Math.max(0, Math.min(1, mlConfidence));
    const probabilityBias = Math.max(-1, Math.min(1, ((upProbability ?? 0.5) - 0.5) * 2));
    const bend = 0.7 + (confidence * 0.55) + (Math.abs(probabilityBias) * 0.2);
    const mlStdDev = 0.08;

    const simulateValue = (curve: number, year: number, volatilityFactor = 0) => {
      const progress = year / 3;
      const curvedProgress = progress === 0 ? 0 : Math.min(1, Math.pow(progress, Math.max(0.2, curve)));
      const simulatedPrice = safeCurrent + ((projectionTarget - safeCurrent) * curvedProgress);
      const stabilizer = year === 0 ? 0 : direction * probabilityBias * confidence * safeCurrent * 0.02 * year;
      const scenarioPrice = simulatedPrice + stabilizer
      const scenarioValue = sharesBought * scenarioPrice * (1 + (volatilityFactor * year));
      return Math.max(0, scenarioValue);
    };

    const baseBend = bend;
    const bearBend = bend - (confidence * 0.3);
    const bullBend = bend + (confidence * 0.3);

    const series = [0, 1, 2, 3].map((year) => {
      const base = simulateValue(baseBend, year, 0);
      const bear = simulateValue(bearBend, year, -mlStdDev);
      const bull = simulateValue(bullBend, year, mlStdDev);
      return {
        year,
        yearLabel: `Y${year}`,
        base,
        bear,
        bull,
      };
    });

    return {
      confidence,
      sharesBought,
      series,
    };
  }, [amount, currentPrice, projectionTarget, mlConfidence, upProbability]);

  const future = simulation.series[simulation.series.length - 1]?.base ?? 0;
  const bearFuture = simulation.series[simulation.series.length - 1]?.bear ?? 0;
  const bullFuture = simulation.series[simulation.series.length - 1]?.bull ?? 0;
  const simulatedFuturePrice = currentPrice > 0 ? future / Math.max(amount / currentPrice, 1e-9) : 0;
  const futureGain = amount > 0 ? ((future - amount) / amount) * 100 : 0;
  const panelTone = futureGain >= 0 ? "bg-success/20" : "bg-danger/15";
  const trendTone = futureGain >= 0 ? "text-success" : "text-danger";
  const sharesBought = simulation.sharesBought;
  const confidencePct = (simulation.confidence * 100).toFixed(0);
  const shareEstimate = sharesBought >= 1 ? sharesBought.toFixed(2) : sharesBought.toFixed(3);

  if (!hasTarget) {
    return (
      <Card className="p-4">
        <h3 className="text-lg font-semibold">Predictive ROI Simulator</h3>
        <p className="mt-3 rounded-xl border border-border/70 bg-bg/40 p-4 text-sm text-muted">
          A reliable analyst target is not available for {symbol}, so no return projection is shown.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col overflow-hidden p-3 sm:p-4 xl:h-[52rem]">
      <h3 className="text-lg font-semibold">Predictive ROI Simulator</h3>
      <p className="mt-1 text-sm text-muted">Try a simple amount and see what the current 3-year scenario range looks like.</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-1">
        <label className="flex flex-col justify-between rounded-xl border border-border/70 bg-panel/70 p-3 text-sm">
          <span className="text-muted">Investment Amount</span>
          <input
            type="text"
            inputMode="numeric"
            className="mt-1 w-full min-w-0 bg-transparent text-2xl font-semibold outline-none focus:shadow-none"
            value={amountInput}
            placeholder="Enter amount"
            onChange={(e) => {
              const digitsOnly = e.target.value.replace(/[^\d]/g, "");
              setAmountInput(digitsOnly ? digitsOnly.replace(/^0+(?=\d)/, "") : "");
            }}
            onFocus={(e) => e.currentTarget.select()}
          />
          <span className="mt-1 text-xs text-muted">
            {amount > 0
              ? `At today's price, this buys about ${shareEstimate} shares @ ${formatCurrency(currentPrice)}`
              : `Pick an amount to see the possible 3-year range at ${formatCurrency(currentPrice)}`}
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          {quickAmounts.map((quickAmount) => (
            <button
              key={quickAmount}
              type="button"
              onClick={() => setAmountInput(String(quickAmount))}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                amount === quickAmount
                  ? "border-success/25 bg-success/10 text-success"
                  : "border-border/70 bg-panel/70 text-muted hover:border-accent/35 hover:text-text"
              }`}
            >
              {formatCurrency(quickAmount)}
            </button>
          ))}
        </div>
      </div>

      <div className={`mt-4 flex min-h-0 flex-col rounded-xl p-4 ${panelTone}`}>
        <div className="rounded-2xl border border-border/45 bg-panel/46 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-muted">Simple Summary</p>
          <p className="mt-1 text-sm leading-6 text-text">
            {amount > 0
              ? `If you invest ${formatCurrency(amount)} today, the current 3-year scenario ranges from ${formatCurrency(bearFuture)} to ${formatCurrency(bullFuture)}. The likely case is ${formatCurrency(future)}.`
              : "Choose an amount above to translate the forecast into a simple invested-value range."}
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="mt-3 rounded-2xl border border-border/45 bg-panel/38 px-4 py-4">
            <p className="text-sm text-muted">Likely Value</p>
            <p className={`mt-1 break-words text-[clamp(1.95rem,3vw,2.8rem)] font-bold leading-tight ${trendTone}`}>{formatCurrency(future)}</p>
            <p className={`mt-2 text-sm font-medium ${trendTone}`}>Estimated future price: {formatCurrency(simulatedFuturePrice)} per share</p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="flex min-h-[86px] flex-col justify-between rounded-2xl border border-border/45 bg-panel/68 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">3Y Gain</p>
              <p className={`text-[clamp(1.35rem,1.6vw,1.7rem)] font-semibold ${trendTone}`}>{futureGain >= 0 ? "+" : ""}{futureGain.toFixed(2)}%</p>
            </div>
            <div className="flex min-h-[86px] flex-col justify-between rounded-2xl border border-border/45 bg-panel/68 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">Estimate Reliability</p>
              <p className="text-[clamp(1.35rem,1.6vw,1.7rem)] font-semibold text-text">{confidencePct}%</p>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border/45 bg-panel/54 p-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border/45 bg-panel/72 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">Lower Case</p>
              <p className="mt-2 text-[15px] font-semibold text-rose-500">{formatCurrency(bearFuture)}</p>
            </div>
            <div className="rounded-2xl border border-border/45 bg-panel/72 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">Likely Case</p>
              <p className={`mt-2 text-[15px] font-semibold ${trendTone}`}>{formatCurrency(future)}</p>
            </div>
            <div className="rounded-2xl border border-border/45 bg-panel/72 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">Higher Case</p>
              <p className="mt-2 text-[15px] font-semibold text-emerald-500">{formatCurrency(bullFuture)}</p>
            </div>
          </div>
          <div className="mt-4 h-40 w-full -ml-1 sm:ml-0">
            <ResponsiveContainer>
              <AreaChart
                data={simulation.series}
                margin={{ top: 6, right: 6, bottom: 0, left: -18 }}
              >
                <defs>
                  <linearGradient id="roiBandFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#58d68d" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#58d68d" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(130, 148, 179, 0.18)" />
                <XAxis
                  dataKey="yearLabel"
                  tick={{ fill: "currentColor", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  padding={{ left: 0, right: 0 }}
                />
                <YAxis
                  tick={{ fill: "currentColor", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => formatCurrency(Number(value))}
                  tickMargin={4}
                  width={72}
                />
                <Tooltip
                  formatter={(value: number | string | undefined, name: string | undefined) => [formatCurrency(Number(value ?? 0)), name ?? "Value"]}
                  contentStyle={{
                    background: "hsl(var(--panel))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="bull" stroke="transparent" fillOpacity={0} />
                <Area type="monotone" dataKey="bear" stroke="transparent" fill="url(#roiBandFill)" fillOpacity={1} />
                <Line type="monotone" dataKey="bear" stroke="#f97316" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="base" stroke="#22c55e" strokeWidth={2.4} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="bull" stroke="#60a5fa" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="flex min-h-[90px] flex-col justify-between rounded-2xl border border-border/45 bg-panel/68 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Invested</p>
            <p className="text-[1.05rem] font-semibold text-text">{formatCurrency(amount)}</p>
          </div>
          <div className="flex min-h-[90px] flex-col justify-between rounded-2xl border border-border/45 bg-panel/68 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Shares</p>
            <p className="text-[1.05rem] font-semibold text-text">{shareEstimate}</p>
          </div>
          <div className="flex min-h-[90px] flex-col justify-between rounded-2xl border border-border/45 bg-panel/68 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Today's Price</p>
            <p className="text-[1.05rem] font-semibold text-text">{formatCurrency(currentPrice)}</p>
          </div>
          <div className="flex min-h-[90px] flex-col justify-between rounded-2xl border border-border/45 bg-panel/68 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Trend View</p>
            <p className={`text-[1.05rem] font-semibold ${trendTone}`}>{futureGain >= 0 ? "Positive" : "Negative"}</p>
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-5 text-muted">
          {symbol} uses the same underlying ML signal as the stock score. This is a scenario estimate, not a guaranteed return.
        </p>
      </div>
    </Card>
  );
}
