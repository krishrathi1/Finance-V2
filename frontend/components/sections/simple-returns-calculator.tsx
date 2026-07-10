"use client";

import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/format";

export function SimpleReturnsCalculator({
  returnsSummary
}: {
  returnsSummary: Array<{ label: string; value: number | null }>;
}) {
  const [amountInput, setAmountInput] = useState("100000");
  const amount = useMemo(() => {
    const numeric = Number(amountInput.replace(/[^\d]/g, ""));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }, [amountInput]);

  const threeYearPct = returnsSummary.find((item) => item.label === "3 Years")?.value ?? null;
  const hasReturn = threeYearPct !== null;
  const futureValue = hasReturn ? amount * (1 + threeYearPct / 100) : amount;
  const gain = futureValue - amount;
  const tone = gain >= 0 ? "bg-success/20 text-success" : "bg-danger/15 text-danger";

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold">Returns Calculator</h3>

      <label className="mt-3 block text-sm">
        <span className="text-muted">If you would have invested</span>
        <div className="mt-1 flex items-center gap-2 rounded-xl border border-border/70 bg-panel/70 px-3 py-2">
          <span className="text-muted">₹</span>
          <input
            type="text"
            inputMode="numeric"
            className="w-full min-w-0 bg-transparent text-lg font-semibold outline-none"
            value={amountInput}
            onChange={(e) => {
              const digitsOnly = e.target.value.replace(/[^\d]/g, "");
              setAmountInput(digitsOnly ? digitsOnly.replace(/^0+(?=\d)/, "") : "");
            }}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      </label>

      {hasReturn ? (
        <>
          <p className="mt-4 text-sm text-muted">In 3 years the current value would be</p>
          <div className={`mt-2 rounded-xl p-4 text-center text-2xl font-bold ${tone}`}>
            {formatCurrency(futureValue)}{" "}
            <span className="text-base font-semibold">
              {gain >= 0 ? "+" : ""}
              {formatCurrency(gain)} ({formatPercent(threeYearPct!)})
            </span>
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-xl border border-border/70 bg-bg/40 p-4 text-sm text-muted">
          3-year historical price data isn&apos;t available for this stock yet.
        </p>
      )}
    </Card>
  );
}
