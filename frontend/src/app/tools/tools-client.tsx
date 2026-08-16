"use client";

import { useMemo, useState } from "react";
import {
  Calculator,
  Coins,
  Crosshair,
  Flame,
  Landmark,
  Layers,
  PiggyBank,
  Receipt,
  Target,
  TrendingUp,
  Umbrella,
  Undo2,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { roundTrip, type TradeSegment } from "@/shared/trade-charges";
import { cagr, positionSize, sipForGoal, sipFutureValue } from "@/shared/planning-tools";
import {
  averageDown,
  breakEvenAfterLoss,
  dividendIncomePlanner,
  requiredReturn,
} from "@/shared/equity-tools";
import {
  emiCalculator,
  inflationAdjustedValue,
  realReturn,
  retirementCorpus,
  stepUpSip,
} from "@/shared/wealth-tools";

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

// ─── Stock average ───────────────────────────────────────────────────────────

function StockAverageCalculator() {
  const [heldQty, setHeldQty] = useState("100");
  const [heldPrice, setHeldPrice] = useState("500");
  const [addQty, setAddQty] = useState("50");
  const [addPrice, setAddPrice] = useState("420");

  const result = useMemo(
    () =>
      averageDown({
        existingQuantity: parse(heldQty),
        existingAvgPrice: parse(heldPrice),
        newQuantity: parse(addQty),
        newPrice: parse(addPrice),
      }),
    [heldQty, heldPrice, addQty, addPrice]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Stock Average</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        Your new average after buying more. Works for averaging up as well as down — the sign of
        the change tells you which happened.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Shares held" value={heldQty} onChange={setHeldQty} />
        <Field label="Your average" value={heldPrice} onChange={setHeldPrice} suffix="₹" />
        <Field label="Buying more" value={addQty} onChange={setAddQty} />
        <Field label="At price" value={addPrice} onChange={setAddPrice} suffix="₹" />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              label="New average"
              value={rupees(result.newAveragePrice)}
              tone={result.avgPriceChange <= 0 ? "good" : "bad"}
            />
            <Stat label="Total shares" value={result.totalQuantity.toLocaleString("en-IN")} />
            <Stat label="Total invested" value={rupees(result.totalInvested)} />
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            Average {result.avgPriceChange <= 0 ? "falls" : "rises"} by{" "}
            {rupees(Math.abs(result.avgPriceChange))} (
            {Math.abs(result.avgPriceChangePercent).toFixed(2)}%). Averaging down lowers your
            breakeven; it does not make a falling business a good one.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          All four fields must be positive.
        </p>
      )}
    </Card>
  );
}

// ─── Target price ────────────────────────────────────────────────────────────

function TargetPriceCalculator() {
  const [current, setCurrent] = useState("500");
  const [target, setTarget] = useState("1000");
  const [years, setYears] = useState("3");

  const result = useMemo(
    () =>
      requiredReturn({
        currentPrice: parse(current),
        targetPrice: parse(target),
        years: years.trim() === "" ? null : parse(years),
      }),
    [current, target, years]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Target Price</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        What a price target actually demands. &ldquo;It will double&rdquo; is a 26%-a-year promise
        over three years — worth saying out loud before believing it.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Field label="Current price" value={current} onChange={setCurrent} suffix="₹" />
        <Field label="Target price" value={target} onChange={setTarget} suffix="₹" />
        <Field label="Years (optional)" value={years} onChange={setYears} />
      </div>

      {result ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat
            label="Total return"
            value={`${result.totalReturnPercent >= 0 ? "+" : ""}${result.totalReturnPercent.toFixed(2)}%`}
            tone={result.totalReturnPercent >= 0 ? "good" : "bad"}
          />
          <Stat label="Multiple" value={`${result.multiple.toFixed(2)}x`} />
          <Stat
            label="Needed per year"
            value={
              result.annualisedPercent === null
                ? "—"
                : `${result.annualisedPercent >= 0 ? "+" : ""}${result.annualisedPercent.toFixed(2)}%`
            }
          />
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Both prices must be positive.
        </p>
      )}
    </Card>
  );
}

// ─── Loss recovery ───────────────────────────────────────────────────────────

const LOSS_LADDER = [10, 20, 30, 50, 70, 90];

function LossRecoveryCalculator() {
  const [loss, setLoss] = useState("30");
  const result = useMemo(() => breakEvenAfterLoss({ lossPercent: parse(loss) }), [loss]);

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Undo2 className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Loss Recovery</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        The gain needed to get back to even. Losses and recoveries are not symmetric, and the gap
        widens fast — which is the whole argument for a stop-loss.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Loss so far" value={loss} onChange={setLoss} suffix="%" />
        <div className="flex items-end">
          {result !== null ? (
            <Stat label="Gain needed to break even" value={`+${result.toFixed(2)}%`} tone="bad" />
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {LOSS_LADDER.map((step) => {
          const need = breakEvenAfterLoss({ lossPercent: step });
          return (
            <button
              key={step}
              type="button"
              onClick={() => setLoss(String(step))}
              className="rounded-lg border border-border/40 bg-bg/40 px-1.5 py-1.5 text-center transition hover:border-accent/40"
            >
              <span className="block text-[10px] text-muted">−{step}%</span>
              <span className="block text-[11px] font-bold tabular-nums text-danger">
                +{need === null ? "—" : need.toFixed(0)}%
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] leading-4 text-muted/60">
        A 100% loss is unrecoverable at any gain — zero capital cannot be multiplied back.
      </p>
    </Card>
  );
}

// ─── Dividend income ─────────────────────────────────────────────────────────

function DividendIncomeCalculator() {
  const [income, setIncome] = useState("50000");
  const [yieldPercent, setYieldPercent] = useState("3");

  const result = useMemo(
    () =>
      dividendIncomePlanner({
        targetMonthlyIncome: parse(income),
        dividendYieldPercent: parse(yieldPercent),
      }),
    [income, yieldPercent]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Coins className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Dividend Income</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        The capital a target monthly dividend income needs, at a given yield.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Monthly income wanted" value={income} onChange={setIncome} suffix="₹" />
        <Field label="Portfolio yield" value={yieldPercent} onChange={setYieldPercent} suffix="%" />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Capital required" value={rupees(result.capitalRequired)} tone="good" />
            <Stat label="Annual dividend" value={rupees(result.annualIncome)} />
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            Gross of tax — dividends are taxed at your slab rate in India since FY21. Most Indian
            companies pay once or twice a year, so the income arrives in lumps, not monthly.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Income and yield must both be positive.
        </p>
      )}
    </Card>
  );
}

// ─── Step-up SIP ─────────────────────────────────────────────────────────────

function StepUpSipCalculator() {
  const [monthly, setMonthly] = useState("20000");
  const [years, setYears] = useState("15");
  const [annualReturn, setAnnualReturn] = useState("12");
  const [stepUp, setStepUp] = useState("10");

  const result = useMemo(
    () =>
      stepUpSip({
        monthly: parse(monthly),
        years: parse(years),
        annualReturnPercent: parse(annualReturn),
        annualStepUpPercent: parse(stepUp),
      }),
    [monthly, years, annualReturn, stepUp]
  );
  const flat = useMemo(
    () =>
      stepUpSip({
        monthly: parse(monthly),
        years: parse(years),
        annualReturnPercent: parse(annualReturn),
        annualStepUpPercent: 0,
      }),
    [monthly, years, annualReturn]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Step-Up SIP</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        A SIP that rises with your salary each year. Raising the instalment around 10% annually is
        the single cheapest change most plans can make.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Starting monthly" value={monthly} onChange={setMonthly} suffix="₹" />
        <Field label="Annual step-up" value={stepUp} onChange={setStepUp} suffix="%" />
        <Field label="Years" value={years} onChange={setYears} />
        <Field
          label="Expected return"
          value={annualReturn}
          onChange={setAnnualReturn}
          suffix="%/yr"
        />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Future value" value={rupees(result.futureValue)} tone="good" />
            <Stat label="You would put in" value={rupees(result.totalInvested)} />
            <Stat label="Growth does" value={rupees(result.wealthGained)} />
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            Final instalment {rupees(result.finalMonthlyAmount)}/month.
            {flat && result.futureValue > flat.futureValue
              ? ` Stepping up adds ${rupees(result.futureValue - flat.futureValue)} against a flat SIP of the same starting amount.`
              : ""}
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Enter a monthly amount and a horizon of up to 100 years.
        </p>
      )}
    </Card>
  );
}

// ─── Real return ─────────────────────────────────────────────────────────────

function RealReturnCalculator() {
  const [nominal, setNominal] = useState("12");
  const [inflation, setInflation] = useState("6");
  const [amount, setAmount] = useState("1000000");
  const [years, setYears] = useState("10");

  const real = useMemo(
    () => realReturn({ nominalReturnPercent: parse(nominal), inflationPercent: parse(inflation) }),
    [nominal, inflation]
  );
  const erosion = useMemo(
    () =>
      inflationAdjustedValue({
        amount: parse(amount),
        years: parse(years),
        inflationPercent: parse(inflation),
      }),
    [amount, years, inflation]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Flame className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Real Return &amp; Inflation</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        What your return is worth after inflation, and what today&apos;s money is worth later.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Nominal return" value={nominal} onChange={setNominal} suffix="%/yr" />
        <Field label="Inflation" value={inflation} onChange={setInflation} suffix="%/yr" />
        <Field label="Amount today" value={amount} onChange={setAmount} suffix="₹" />
        <Field label="Years" value={years} onChange={setYears} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat
          label="Real return"
          value={real === null ? "—" : `${real >= 0 ? "+" : ""}${real.toFixed(2)}%`}
          tone={real === null ? undefined : real >= 0 ? "good" : "bad"}
        />
        <Stat
          label="Buys this much later"
          value={erosion ? rupees(erosion.todaysPurchasingPower) : "—"}
          tone="bad"
        />
        <Stat
          label="Needs to be, to match"
          value={erosion ? rupees(erosion.futureNominalValue) : "—"}
        />
      </div>
      <p className="mt-2 text-[10px] leading-4 text-muted/60">
        Real return uses the Fisher relation, not nominal minus inflation — the naive subtraction
        flatters the result, and by more the higher the rates are.
      </p>
    </Card>
  );
}

// ─── EMI ─────────────────────────────────────────────────────────────────────

function EmiCalculator() {
  const [principal, setPrincipal] = useState("2500000");
  const [rate, setRate] = useState("9");
  const [years, setYears] = useState("20");

  const result = useMemo(
    () =>
      emiCalculator({
        principal: parse(principal),
        annualRatePercent: parse(rate),
        years: parse(years),
      }),
    [principal, rate, years]
  );

  const interestShare =
    result && parse(principal) > 0 ? (result.totalInterest / parse(principal)) * 100 : null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Landmark className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">EMI</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        Monthly instalment, and what the loan costs in total — useful for a loan against securities
        as much as a home loan.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Field label="Loan amount" value={principal} onChange={setPrincipal} suffix="₹" />
        <Field label="Interest rate" value={rate} onChange={setRate} suffix="%/yr" />
        <Field label="Tenure" value={years} onChange={setYears} suffix="yr" />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="Monthly EMI" value={rupees(result.emi)} />
            <Stat label="Total interest" value={rupees(result.totalInterest)} tone="bad" />
            <Stat label="Total repaid" value={rupees(result.totalPayment)} />
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            Interest is {interestShare === null ? "—" : `${interestShare.toFixed(0)}%`} of what you
            borrowed, over the full tenure.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Enter a loan amount and a tenure of up to 100 years.
        </p>
      )}
    </Card>
  );
}

// ─── Retirement ──────────────────────────────────────────────────────────────

function RetirementCalculator() {
  const [expense, setExpense] = useState("60000");
  const [yearsToRetire, setYearsToRetire] = useState("25");
  const [inflation, setInflation] = useState("6");
  const [retiredYears, setRetiredYears] = useState("25");
  const [postReturn, setPostReturn] = useState("8");

  const realPost = useMemo(
    () =>
      realReturn({ nominalReturnPercent: parse(postReturn), inflationPercent: parse(inflation) }),
    [postReturn, inflation]
  );

  const result = useMemo(
    () =>
      retirementCorpus({
        monthlyExpenseToday: parse(expense),
        yearsToRetirement: parse(yearsToRetire),
        inflationPercent: parse(inflation),
        postRetirementYears: parse(retiredYears),
        // The real (post-inflation) rate, so spending keeps pace with prices
        // through retirement rather than shrinking every year.
        postRetirementReturnPercent: realPost ?? 0,
      }),
    [expense, yearsToRetire, inflation, retiredYears, realPost]
  );

  const monthlySip = useMemo(
    () =>
      result
        ? sipForGoal({
            targetAmount: result.corpusRequired,
            years: parse(yearsToRetire),
            annualReturnPercent: 12,
          })
        : null,
    [result, yearsToRetire]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Umbrella className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Retirement Corpus</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        The corpus that funds your current lifestyle through retirement, after inflation has had its
        way with it.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Monthly expense today" value={expense} onChange={setExpense} suffix="₹" />
        <Field label="Years to retirement" value={yearsToRetire} onChange={setYearsToRetire} />
        <Field label="Inflation" value={inflation} onChange={setInflation} suffix="%/yr" />
        <Field label="Years retired" value={retiredYears} onChange={setRetiredYears} />
        <Field
          label="Return in retirement"
          value={postReturn}
          onChange={setPostReturn}
          suffix="%/yr"
        />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Corpus needed" value={rupees(result.corpusRequired)} tone="good" />
            <Stat
              label="Expense then"
              value={rupees(result.monthlyExpenseAtRetirement)}
              tone="bad"
            />
            <Stat
              label="SIP to get there"
              value={monthlySip === null ? "—" : `${rupees(monthlySip)}/mo`}
            />
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            Withdrawals priced at month start, and the retirement return is converted to a real
            rate so spending keeps pace with prices. Your {rupees(parse(expense))} lifestyle costs{" "}
            {rupees(result.monthlyExpenseAtRetirement)} a month by then — that gap is the entire
            reason for the corpus. The SIP figure assumes 12% a year until retirement.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Fill every field; horizons cap at 100 years.
        </p>
      )}
    </Card>
  );
}

const GROUPS = [
  { key: "trading", label: "Trading", blurb: "Costs and sizing for a trade you are about to place." },
  { key: "equity", label: "Equity", blurb: "Questions about a position you hold or are building." },
  { key: "planning", label: "Planning", blurb: "Long-horizon compounding, inflation and goals." },
] as const;

type GroupKey = (typeof GROUPS)[number]["key"];

export function ToolsClient() {
  const [group, setGroup] = useState<GroupKey>("trading");
  const active = GROUPS.find((entry) => entry.key === group)!;

  return (
    <div className="stagger-fade space-y-6 py-4 sm:py-8">
      <div>
        <p className="text-sm text-muted">Home / Tools</p>
        <h1 className="mt-1 flex items-center gap-2.5 font-[var(--font-space)] text-2xl font-bold tracking-tight sm:text-3xl">
          <Calculator className="h-6 w-6 text-accent" />
          Trading Tools
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          The calculations that usually mean opening a spreadsheet — or somebody else&apos;s
          ad-covered site. Everything runs locally in your browser as you type; nothing is sent
          anywhere.
        </p>
      </div>

      {/* Grouped rather than one long grid: a dozen calculators in a flat wall
          makes the reader scan instead of choose. */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Tool category">
        {GROUPS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={group === entry.key}
            onClick={() => setGroup(entry.key)}
            className={`rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition ${
              group === entry.key
                ? "border-accent/40 bg-accent/15 text-accent"
                : "border-border/50 bg-bg/40 text-muted hover:border-accent/30 hover:text-fg"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <p className="-mt-3 text-[11px] text-muted">{active.blurb}</p>

      <div className="grid gap-4 xl:grid-cols-2">
        {group === "trading" && (
          <>
            <ChargesCalculator />
            <PositionSizeCalculator />
          </>
        )}
        {group === "equity" && (
          <>
            <StockAverageCalculator />
            <TargetPriceCalculator />
            <LossRecoveryCalculator />
            <DividendIncomeCalculator />
          </>
        )}
        {group === "planning" && (
          <>
            <SipPlanner />
            <StepUpSipCalculator />
            <CagrCalculator />
            <RealReturnCalculator />
            <EmiCalculator />
            <RetirementCalculator />
          </>
        )}
      </div>

      <p className="text-center text-[11px] text-muted/60">
        Statutory rates as of FY 2025-26. Educational tools, not investment advice.
      </p>
    </div>
  );
}
