"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";

export function ReturnsCalculator({ symbol, currentPrice, aiTarget }: { symbol: string; currentPrice: number, aiTarget: number }) {
  const [amount, setAmount] = useState(100000);

  const series = useMemo(() => {
    const targetPrice = aiTarget; // Real API Payload Match
    const sharesBought = amount / currentPrice;
    return [
      { year: 0, value: amount },
      { year: 1, value: sharesBought * (currentPrice + (targetPrice - currentPrice) * 0.333) },
      { year: 2, value: sharesBought * (currentPrice + (targetPrice - currentPrice) * 0.666) },
      { year: 3, value: sharesBought * targetPrice }
    ];
  }, [amount, currentPrice]);

  const future = series[series.length - 1].value;

  return (
    <Card className="h-full p-4">
      <h3 className="text-lg font-semibold">Predictive ROI Simulator</h3>
      <p className="mt-1 text-sm text-muted">Simulated 3-Year Return to AI Target Price</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-1">
        <label className="rounded-xl border border-border/70 p-2 text-sm flex flex-col justify-between">
          <span>Investment Amount</span>
          <input
            type="number"
            className="mt-1 w-full bg-transparent text-lg font-semibold outline-none"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <span className="text-xs text-muted mt-1">
            ≈ {Math.floor(amount / currentPrice).toLocaleString()} shares @ {formatCurrency(currentPrice)}
          </span>
        </label>
      </div>

      <div className="mt-4 rounded-xl bg-success/20 p-4">
        <p className="text-sm text-muted">Projected Value</p>
        <p className="text-3xl font-bold text-success">{formatCurrency(future)}</p>
        <p className="text-sm text-success/80 mt-1">
          Simulated Future Price: {formatCurrency(future / (amount / currentPrice))} per share
        </p>
      </div>
    </Card>
  );
}
