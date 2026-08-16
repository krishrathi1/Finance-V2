"use client";

import { useMemo, useState } from "react";
import { Calculator, Crosshair, PiggyBank, Receipt, TrendingUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import { roundTrip, type TradeSegment } from "@/shared/trade-charges";
import { cagr, positionSize, sipForGoal, sipFutureValue } from "@/shared/planning-tools";

/**
 * The trading toolkit: the four calculations Indian retail investors reach for
 * a spreadsheet (or someone else's ad-covered site) to do.
 *
 * Every calculator is a thin shell over a pure, tested module — the page owns
 * inputs and formatting, never arithmetic. Results update as you type; there
 * is no submit button because there is nothing to submit.
 */

const rupees = (value: number) =>
  `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function Field({
  label,
  value,
  onChange,
  suffix,
  min = "0",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  suffix?: string;
  min?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted">{label}</span>
      <span className="relative block">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full rounded-xl border border-border/60 bg-bg/60 px-3 pr-10 text-sm outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted">
            {suffix}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border border-border/40 bg-bg/40 px-2.5 py-2">
      <p className="text-[10px] text-muted">{label}</p>
      <p
        className={`text-sm font-bold tabular-nums ${
          tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

const parse = (raw: string): number => {
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
};

// ─── Brokerage & charges ─────────────────────────────────────────────────────

function ChargesCalculator() {
  const [segment, setSegment] = useState<TradeSegment>("delivery");
  const [quantity, setQuantity] = useState("100");
  const [buyPrice, setBuyPrice] = useState("500");
  const [sellPrice, setSellPrice] = useState("520");
  const [brokerage, setBrokerage] = useState("");

  const result = useMemo(
    () =>
      roundTrip({
        quantity: parse(quantity),
        buyPrice: parse(buyPrice),
        sellPrice: parse(sellPrice),
        segment,
        ...(brokerage.trim() !== "" ? { brokeragePerOrder: parse(brokerage) } : {}),
      }),
    [quantity, buyPrice, sellPrice, segment, brokerage]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Receipt className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Brokerage &amp; Charges</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        What a round trip actually costs after STT, exchange charges, SEBI fees, stamp duty and
        GST — and the sell price where you genuinely break even.
      </p>

      <div className="mt-3 flex rounded-xl border border-border/50 bg-bg/40 p-0.5" role="tablist">
        {(["delivery", "intraday"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={segment === option}
            onClick={() => setSegment(option)}
            className={`flex-1 rounded-[10px] px-3 py-1.5 text-xs font-semibold capitalize transition ${
              segment === option ? "bg-accent/15 text-accent" : "text-muted hover:text-fg"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Quantity" value={quantity} onChange={setQuantity} />
        <Field
          label={`Brokerage/order (default ${segment === "delivery" ? "₹0" : "₹20"})`}
          value={brokerage}
          onChange={setBrokerage}
          suffix="₹"
        />
        <Field label="Buy price" value={buyPrice} onChange={setBuyPrice} suffix="₹" />
        <Field label="Sell price" value={sellPrice} onChange={setSellPrice} suffix="₹" />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Total charges" value={rupees(result.totalCharges)} />
            <Stat
              label="Net P&L"
              value={rupees(result.netPnl)}
              tone={result.netPnl >= 0 ? "good" : "bad"}
            />
            <Stat label="Breakeven sell" value={rupees(result.breakevenSellPrice)} />
          </div>
          <details className="mt-2 rounded-lg border border-border/40 bg-bg/30 px-3 py-2">
            <summary className="cursor-pointer text-[11px] font-medium text-muted">
              Charge breakdown
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] tabular-nums">
              {[
                ["Brokerage", result.buy.brokerage + result.sell.brokerage],
                ["STT", result.buy.stt + result.sell.stt],
                ["Exchange txn", result.buy.exchangeTxn + result.sell.exchangeTxn],
                ["SEBI fee", result.buy.sebiFee + result.sell.sebiFee],
                ["Stamp duty", result.buy.stampDuty + result.sell.stampDuty],
                ["GST", result.buy.gst + result.sell.gst],
                ["DP charge", result.buy.dpCharge + result.sell.dpCharge],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between">
                  <span className="text-muted">{label}</span>
                  <span>{rupees(value as number)}</span>
                </div>
              ))}
            </div>
          </details>
          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            FY 2025-26 statutory rates, NSE. Gross P&amp;L {rupees(result.grossPnl)} − charges ={" "}
            {rupees(result.netPnl)}; charges are {result.chargesPercentOfTurnover.toFixed(3)}% of
            turnover.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Enter a quantity and both prices.
        </p>
      )}
    </Card>
  );
}

// ─── Position size ───────────────────────────────────────────────────────────

function PositionSizeCalculator() {
  const [capital, setCapital] = useState("500000");
  const [riskPercent, setRiskPercent] = useState("1");
  const [entry, setEntry] = useState("500");
  const [stop, setStop] = useState("480");
  const [target, setTarget] = useState("");

  const result = useMemo(
    () =>
      positionSize({
        capital: parse(capital),
        riskPercent: parse(riskPercent),
        entry: parse(entry),
        stopLoss: parse(stop),
        target: target.trim() === "" ? null : parse(target),
      }),
    [capital, riskPercent, entry, stop, target]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Crosshair className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Position Size</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        How many shares your stop-loss allows. Size from the risk, not the conviction — the stop
        decides the quantity, and the quantity decides whether a wrong trade matters.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Trading capital" value={capital} onChange={setCapital} suffix="₹" />
        <Field label="Risk per trade" value={riskPercent} onChange={setRiskPercent} suffix="%" />
        <Field label="Entry price" value={entry} onChange={setEntry} suffix="₹" />
        <Field label="Stop-loss" value={stop} onChange={setStop} suffix="₹" />
        <Field label="Target (optional)" value={target} onChange={setTarget} suffix="₹" />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              label="Shares to trade"
              value={result.quantity.toLocaleString("en-IN")}
              tone={result.quantity > 0 ? "good" : "bad"}
            />
            <Stat label="Position value" value={rupees(result.positionValue)} />
            <Stat label="Money at risk" value={rupees(result.riskAmount)} />
            <Stat label="Risk per share" value={rupees(result.riskPerShare)} />
            <Stat label="Of capital" value={`${result.capitalSharePercent.toFixed(1)}%`} />
            <Stat
              label="Reward : risk"
              value={result.rewardRiskRatio === null ? "—" : `${result.rewardRiskRatio.toFixed(2)} : 1`}
            />
          </div>
          {result.quantity === 0 && (
            <p className="mt-2 text-[11px] text-danger">
              The stop is too wide for this risk budget — even one share risks more than{" "}
              {rupees(result.riskAmount)}.
            </p>
          )}
          {result.exceedsCapital && (
            <p className="mt-2 text-[11px] text-amber-500">
              This position needs more than your capital — the risk budget allows it, your account
              doesn&apos;t. Size down or widen nothing.
            </p>
          )}
          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            {result.direction === "long" ? "Long" : "Short"} setup. Quantity = risk budget ÷ risk
            per share, rounded down — rounding up would breach the one rule this tool exists for.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Stop-loss must differ from entry — the gap between them is the whole calculation.
        </p>
      )}
    </Card>
  );
}

// ─── SIP planner ─────────────────────────────────────────────────────────────

function SipPlanner() {
  const [mode, setMode] = useState<"goal" | "grow">("goal");
  const [targetAmount, setTargetAmount] = useState("10000000");
  const [monthly, setMonthly] = useState("25000");
  const [years, setYears] = useState("15");
  const [annualReturn, setAnnualReturn] = useState("12");

  const goalResult = useMemo(
    () =>
      sipForGoal({
        targetAmount: parse(targetAmount),
        years: parse(years),
        annualReturnPercent: parse(annualReturn),
      }),
    [targetAmount, years, annualReturn]
  );
  const growResult = useMemo(
    () =>
      sipFutureValue({
        monthly: parse(monthly),
        years: parse(years),
        annualReturnPercent: parse(annualReturn),
      }),
    [monthly, years, annualReturn]
  );
  const invested =
    mode === "grow"
      ? parse(monthly) * 12 * parse(years)
      : goalResult !== null
      ? goalResult * 12 * parse(years)
      : null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <PiggyBank className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">SIP Planner</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        Work backwards from a goal to the monthly amount, or forwards from a monthly amount to
        where it lands.
      </p>

      <div className="mt-3 flex rounded-xl border border-border/50 bg-bg/40 p-0.5" role="tablist">
        {(
          [
            { key: "goal", label: "Reach a goal" },
            { key: "grow", label: "Grow an amount" },
          ] as const
        ).map((option) => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={mode === option.key}
            onClick={() => setMode(option.key)}
            className={`flex-1 rounded-[10px] px-3 py-1.5 text-xs font-semibold transition ${
              mode === option.key ? "bg-accent/15 text-accent" : "text-muted hover:text-fg"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {mode === "goal" ? (
          <Field label="Goal amount" value={targetAmount} onChange={setTargetAmount} suffix="₹" />
        ) : (
          <Field label="Monthly SIP" value={monthly} onChange={setMonthly} suffix="₹" />
        )}
        <Field label="Years" value={years} onChange={setYears} />
        <Field label="Expected return" value={annualReturn} onChange={setAnnualReturn} suffix="%/yr" />
      </div>

      {mode === "goal" ? (
        goalResult !== null ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Monthly SIP needed" value={rupees(goalResult)} tone="good" />
            <Stat label="You'd put in" value={invested !== null ? rupees(invested) : "—"} />
            <Stat
              label="Growth does"
              value={invested !== null ? rupees(parse(targetAmount) - invested) : "—"}
            />
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
            Enter a goal, a horizon and a return assumption.
          </p>
        )
      ) : growResult !== null ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Future value" value={rupees(growResult)} tone="good" />
          <Stat label="You'd put in" value={invested !== null ? rupees(invested) : "—"} />
          <Stat
            label="Growth does"
            value={invested !== null ? rupees(growResult - invested) : "—"}
          />
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Enter a monthly amount, a horizon and a return assumption.
        </p>
      )}

      <p className="mt-2 text-[10px] leading-4 text-muted/60">
        Standard SIP arithmetic (monthly rate = annual ÷ 12, instalments at month start) so the
        figures reconcile with your fund house&apos;s calculator. Returns are an assumption, not a
        promise — 12% is a common long-run equity figure, not a guarantee.
      </p>
    </Card>
  );
}

// ─── CAGR ────────────────────────────────────────────────────────────────────

function CagrCalculator() {
  const [start, setStart] = useState("100000");
  const [end, setEnd] = useState("250000");
  const [years, setYears] = useState("5");

  const result = useMemo(
    () => cagr({ startValue: parse(start), endValue: parse(end), years: parse(years) }),
    [start, end, years]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">CAGR</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        The annual rate a start-to-end move actually compounds at. &ldquo;Doubled in five
        years&rdquo; sounds better than 14.9% a year — this is the honest translation.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Field label="Start value" value={start} onChange={setStart} suffix="₹" />
        <Field label="End value" value={end} onChange={setEnd} suffix="₹" />
        <Field label="Years" value={years} onChange={setYears} />
      </div>

      {result !== null ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat
            label="CAGR"
            value={`${result >= 0 ? "+" : ""}${result.toFixed(2)}% / yr`}
            tone={result >= 0 ? "good" : "bad"}
          />
          <Stat
            label="Total change"
            value={`${(((parse(end) - parse(start)) / parse(start)) * 100).toFixed(1)}%`}
          />
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Both values and the year count must be positive.
        </p>
      )}
    </Card>
  );
}

export function ToolsClient() {
  return (
    <div className="stagger-fade space-y-6 py-4 sm:py-8">
      <div>
        <p className="text-sm text-muted">Home / Tools</p>
        <h1 className="mt-1 flex items-center gap-2.5 font-[var(--font-space)] text-2xl font-bold tracking-tight sm:text-3xl">
          <Calculator className="h-6 w-6 text-accent" />
          Trading Tools
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          The four calculations that usually mean opening a spreadsheet: what a trade really costs,
          how many shares a stop-loss allows, what a SIP needs to be, and what a return actually
          compounded at. Everything runs locally as you type.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChargesCalculator />
        <PositionSizeCalculator />
        <SipPlanner />
        <CagrCalculator />
      </div>

      <p className="text-center text-[11px] text-muted/60">
        Statutory rates as of FY 2025-26. Educational tools, not investment advice.
      </p>
    </div>
  );
}
