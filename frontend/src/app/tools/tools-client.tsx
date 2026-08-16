"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
  Repeat2,
  Scale,
  Zap,
  AlertTriangle,
  ShieldCheck,
  LifeBuoy,
  Gauge,
  AlertOctagon,
  Skull,
  ReceiptText,
  CalendarClock,
  ListPlus,
  X,
  Plus,
  Hourglass,
  Sailboat,
  Search,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { roundTrip, type TradeSegment } from "@/shared/trade-charges";
import { cagr, positionSize, sipForGoal, sipFutureValue } from "@/shared/planning-tools";
import {
  averageDown,
  breakEvenAfterLoss,
  dividendIncomePlanner,
  requiredReturn,
  stopLossTargets,
  weightedAverageBuy,
} from "@/shared/equity-tools";
import { estimateTradeTax } from "@/shared/single-trade-tax";
import { TAX_ESTIMATE_DISCLAIMER } from "@/shared/capital-gains";
import { todayIstDateKey } from "@/shared/market-status";
import { coastFire, timeToGoal } from "@/shared/goal-tools";
import {
  coveredCall,
  impliedLeverage,
  optionBreakeven,
  optionPayoff,
  optionPayoffCurve,
  type OptionPayoffCurvePoint,
  protectivePut,
} from "@/shared/options-tools";
import {
  intradayMargin,
  leverageRiskOfRuin,
  liquidationPrice,
  marginCallAmount,
  maxQuantityForMargin,
} from "@/shared/margin-tools";
import {
  emiCalculator,
  inflationAdjustedValue,
  realReturn,
  retirementCorpus,
  ruleOf72,
  sipVsLumpsum,
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

/**
 * Where a payoff curve's fill should switch from profit-green to loss-red.
 *
 * recharts has no "colour by sign" primitive — a single Area only takes one
 * fill, so the standard trick is a vertical gradient whose stop is placed
 * exactly where the SERIES' OWN VALUES cross zero, not assumed at the
 * midpoint. A payoff curve is rarely symmetric (a long option's downside is
 * capped at the premium while the upside runs further), so computing the
 * offset from this curve's actual min/max is what keeps the colour change
 * landing on the true zero line rather than drifting off it.
 */
function payoffGradientOffset(points: OptionPayoffCurvePoint[]): number {
  const values = points.map((point) => point.payoffPerLot);
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max <= 0) return 0;
  if (min >= 0) return 1;
  return max / (max - min);
}

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

// ─── Rule of 72 ──────────────────────────────────────────────────────────────

function RuleOf72Calculator() {
  const [rate, setRate] = useState("12");
  const years = useMemo(() => ruleOf72({ annualReturnPercent: parse(rate) }), [rate]);
  const exact = useMemo(() => {
    const r = parse(rate) / 100;
    return Number.isFinite(r) && r > 0 ? Math.log(2) / Math.log(1 + r) : null;
  }, [rate]);

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Repeat2 className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Rule of 72</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        The mental shortcut for how long money takes to double at a given rate.
      </p>

      <div className="mt-3">
        <Field label="Annual return" value={rate} onChange={setRate} suffix="%/yr" />
      </div>

      {years !== null ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Doubles in (rule of 72)" value={`${years.toFixed(1)} yrs`} tone="good" />
            <Stat label="Exact answer" value={exact !== null ? `${exact.toFixed(2)} yrs` : "—"} />
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            72 is chosen because it divides cleanly by 2, 3, 4, 6, 8, 9 and 12, and is most
            accurate around the 8% band where most long-run equity conversations happen — not
            because it is exact.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Enter a positive annual return.
        </p>
      )}
    </Card>
  );
}

// ─── SIP vs Lumpsum ──────────────────────────────────────────────────────────

function SipVsLumpsumCalculator() {
  const [amount, setAmount] = useState("1200000");
  const [years, setYears] = useState("10");
  const [rate, setRate] = useState("12");

  const result = useMemo(
    () =>
      sipVsLumpsum({
        totalAmount: parse(amount),
        years: parse(years),
        annualReturnPercent: parse(rate),
      }),
    [amount, years, rate]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">SIP vs Lumpsum</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        The same money, all at once versus spread evenly. The lumpsum always wins on a single
        fixed rate — this shows exactly by how much, so &ldquo;SIP beats lumpsum&rdquo; is
        answered honestly rather than assumed.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Field label="Total to invest" value={amount} onChange={setAmount} suffix="₹" />
        <Field label="Years" value={years} onChange={setYears} />
        <Field label="Expected return" value={rate} onChange={setRate} suffix="%/yr" />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              label="Lumpsum, all at once"
              value={rupees(result.lumpsumValue)}
              tone={result.lumpsumWins ? "good" : undefined}
            />
            <Stat
              label="SIP, spread evenly"
              value={rupees(result.sipValue)}
              tone={!result.lumpsumWins ? "good" : undefined}
            />
            <Stat label="Gap" value={rupees(Math.abs(result.difference))} />
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            {result.lumpsumWins
              ? "The lumpsum wins because every rupee of it is invested for the full horizon, while the average SIP rupee is invested for roughly half of it — timing, not a market view."
              : "At this rate the two land together or the SIP edges ahead. SIP's real advantage is behavioural — it removes the timing decision and buys more units when prices fall — neither of which this constant-rate model can show."}
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Enter an amount and a horizon of up to 100 years.
        </p>
      )}
    </Card>
  );
}

// ─── Stop-loss & target from percent ─────────────────────────────────────────

function StopLossTargetCalculator() {
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [entry, setEntry] = useState("500");
  const [stopPercent, setStopPercent] = useState("4");
  const [targetPercent, setTargetPercent] = useState("12");

  const result = useMemo(
    () =>
      stopLossTargets({
        entryPrice: parse(entry),
        stopLossPercent: parse(stopPercent),
        targetPercent: targetPercent.trim() === "" ? null : parse(targetPercent),
        direction,
      }),
    [entry, stopPercent, targetPercent, direction]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Crosshair className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Stop-Loss &amp; Target Price</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        Percentages are how risk is decided; prices are what the order window accepts. Converting
        that in your head at the moment of placing a trade is where fat-finger mistakes happen.
      </p>

      <div className="mt-3 flex rounded-xl border border-border/50 bg-bg/40 p-0.5" role="tablist">
        {(["long", "short"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={direction === option}
            onClick={() => setDirection(option)}
            className={`flex-1 rounded-[10px] px-3 py-1.5 text-xs font-semibold capitalize transition ${
              direction === option ? "bg-accent/15 text-accent" : "text-muted hover:text-fg"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Field label="Entry price" value={entry} onChange={setEntry} suffix="₹" />
        <Field label="Stop-loss" value={stopPercent} onChange={setStopPercent} suffix="%" />
        <Field label="Target (optional)" value={targetPercent} onChange={setTargetPercent} suffix="%" />
      </div>

      {result ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="Stop-loss price" value={rupees(result.stopLossPrice)} tone="bad" />
          <Stat
            label="Target price"
            value={result.targetPrice === null ? "—" : rupees(result.targetPrice)}
            tone={result.targetPrice === null ? undefined : "good"}
          />
          <Stat
            label="Reward : risk"
            value={result.riskRewardRatio === null ? "—" : `${result.riskRewardRatio.toFixed(2)} : 1`}
          />
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          A long stop cannot reach 100% — that is the price at zero. Try a smaller stop.
        </p>
      )}
    </Card>
  );
}

// ─── Option payoff ───────────────────────────────────────────────────────────

function OptionPayoffCalculator() {
  const [optionType, setOptionType] = useState<"call" | "put">("call");
  const [position, setPosition] = useState<"long" | "short">("long");
  const [strike, setStrike] = useState("500");
  const [premium, setPremium] = useState("15");
  const [spot, setSpot] = useState("530");
  const [lotSize, setLotSize] = useState("");

  const result = useMemo(
    () =>
      optionPayoff({
        optionType,
        position,
        strikePrice: parse(strike),
        premium: parse(premium),
        spotAtExpiry: parse(spot),
        ...(lotSize.trim() !== "" ? { lotSize: parse(lotSize) } : {}),
      }),
    [optionType, position, strike, premium, spot, lotSize]
  );
  const breakeven = useMemo(
    () => optionBreakeven({ optionType, strikePrice: parse(strike), premium: parse(premium) }),
    [optionType, strike, premium]
  );
  const leverage = useMemo(
    () =>
      impliedLeverage({
        premium: parse(premium),
        strikePrice: parse(strike),
        spotPrice: parse(spot),
      }),
    [premium, strike, spot]
  );
  const curve = useMemo(
    () =>
      optionPayoffCurve({
        optionType,
        position,
        strikePrice: parse(strike),
        premium: parse(premium),
        ...(lotSize.trim() !== "" ? { lotSize: parse(lotSize) } : {}),
      }),
    [optionType, position, strike, premium, lotSize]
  );
  // A unique gradient id per card instance — two Option Payoff cards on one
  // page (there is only ever one today, but nothing stops that changing)
  // must not fight over the same <linearGradient id="...">.
  const gradientId = useId().replace(/[:]/g, "");
  const strikeValue = parse(strike);

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Option Payoff</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        Settlement P&amp;L at expiry — the arithmetic the exchange pays by, not a fair-value
        estimate. No Greeks, no time value: this is what the position is worth on expiry day.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="flex rounded-xl border border-border/50 bg-bg/40 p-0.5" role="tablist">
          {(["call", "put"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={optionType === option}
              onClick={() => setOptionType(option)}
              className={`flex-1 rounded-[10px] px-3 py-1.5 text-xs font-semibold capitalize transition ${
                optionType === option ? "bg-accent/15 text-accent" : "text-muted hover:text-fg"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="flex rounded-xl border border-border/50 bg-bg/40 p-0.5" role="tablist">
          {(["long", "short"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={position === option}
              onClick={() => setPosition(option)}
              className={`flex-1 rounded-[10px] px-3 py-1.5 text-xs font-semibold capitalize transition ${
                position === option ? "bg-accent/15 text-accent" : "text-muted hover:text-fg"
              }`}
            >
              {option === "long" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Strike price" value={strike} onChange={setStrike} suffix="₹" />
        <Field label="Premium" value={premium} onChange={setPremium} suffix="₹" />
        <Field label="Spot at expiry" value={spot} onChange={setSpot} suffix="₹" />
        <Field label="Lot size (optional)" value={lotSize} onChange={setLotSize} />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              label="P&L per lot"
              value={rupees(result.payoffPerLot)}
              tone={result.profitable ? "good" : "bad"}
            />
            <Stat label="Breakeven spot" value={breakeven === null ? "—" : rupees(breakeven)} />
            <Stat label="Rough leverage" value={leverage === null ? "—" : `${leverage.toFixed(1)}x`} />
          </div>

          {curve && curve.length > 1 ? (
            <div className="mt-3 h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curve} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    {/* Split the fill at y=0 so profit shades green and loss
                        shades red on the SAME series — recharts has no
                        built-in "colour by sign", so the gradient stop is
                        computed from where zero actually falls in this
                        curve's own min/max range rather than assumed at 50%. */}
                    <linearGradient id={`payoff-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset={payoffGradientOffset(curve)}
                        stopColor="hsl(var(--success))"
                        stopOpacity={0.55}
                      />
                      <stop
                        offset={payoffGradientOffset(curve)}
                        stopColor="hsl(var(--danger))"
                        stopOpacity={0.55}
                      />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="spot"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted))" }}
                    tickFormatter={(value: number) => value.toFixed(0)}
                    stroke="hsl(var(--border))"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted))" }}
                    tickFormatter={(value: number) => value.toFixed(0)}
                    width={44}
                    stroke="hsl(var(--border))"
                  />
                  <Tooltip
                    formatter={(value) => [rupees(Number(value ?? 0)), "P&L per lot"]}
                    labelFormatter={(value) => `Spot ₹${Number(value ?? 0).toFixed(2)}`}
                    contentStyle={{
                      background: "hsl(var(--panel))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 11,
                    }}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--muted))" strokeDasharray="3 3" />
                  {Number.isFinite(strikeValue) && strikeValue > 0 ? (
                    <ReferenceLine
                      x={strikeValue}
                      stroke="hsl(var(--accent))"
                      strokeDasharray="3 3"
                      label={{ value: "Strike", fontSize: 9, fill: "hsl(var(--accent))", position: "insideTopRight" }}
                    />
                  ) : null}
                  <Area
                    type="linear"
                    dataKey="payoffPerLot"
                    stroke="hsl(var(--accent))"
                    strokeWidth={1.5}
                    fill={`url(#payoff-${gradientId})`}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {position === "short" && (
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-danger">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              Selling {optionType === "call" ? "a call" : "a put"} naked has no floor on the loss —
              it is not capped at the premium the way buying one is.
            </p>
          )}
          <p className="mt-1 text-[10px] leading-4 text-muted/60">
            &ldquo;Rough leverage&rdquo; is spot ÷ premium — the retail rule of thumb, not a real
            delta. An option&apos;s true sensitivity moves continuously with moneyness, time and
            volatility.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Strike and premium must be positive; spot at expiry cannot be negative.
        </p>
      )}
    </Card>
  );
}

// ─── Covered call ────────────────────────────────────────────────────────────

function CoveredCallCalculator() {
  const [shares, setShares] = useState("100");
  const [buyPrice, setBuyPrice] = useState("480");
  const [strike, setStrike] = useState("500");
  const [premium, setPremium] = useState("12");
  const [spot, setSpot] = useState("530");

  const result = useMemo(
    () =>
      coveredCall({
        sharesHeld: parse(shares),
        buyPrice: parse(buyPrice),
        strikePrice: parse(strike),
        premium: parse(premium),
        spotAtExpiry: parse(spot),
      }),
    [shares, buyPrice, strike, premium, spot]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Covered Call</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        Selling a call against shares you already hold — income now, upside traded away above the
        strike.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Shares held" value={shares} onChange={setShares} />
        <Field label="Your buy price" value={buyPrice} onChange={setBuyPrice} suffix="₹" />
        <Field label="Call strike sold" value={strike} onChange={setStrike} suffix="₹" />
        <Field label="Premium received" value={premium} onChange={setPremium} suffix="₹" />
        <Field label="Spot at expiry" value={spot} onChange={setSpot} suffix="₹" />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              label="Total P&L"
              value={rupees(result.totalPnl)}
              tone={result.totalPnl >= 0 ? "good" : "bad"}
            />
            <Stat label="Max profit" value={rupees(result.maxProfit)} tone="good" />
            <Stat label="Breakeven" value={rupees(result.breakeven)} />
          </div>
          {result.capped && (
            <p className="mt-2 text-[10px] leading-4 text-amber-500">
              Spot is at or above the strike — profit is capped here regardless of how much
              further it runs; the shares are called away at {rupees(parse(strike))}.
            </p>
          )}
          <p className="mt-1 text-[10px] leading-4 text-muted/60">
            Breakeven is your buy price minus the premium — different from a naked call&apos;s
            breakeven (strike + premium), because the premium here cushions the stock&apos;s own
            cost basis, not the option&apos;s strike.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Shares, buy price and strike must all be positive.
        </p>
      )}
    </Card>
  );
}

// ─── Protective put ──────────────────────────────────────────────────────────

function ProtectivePutCalculator() {
  const [shares, setShares] = useState("100");
  const [buyPrice, setBuyPrice] = useState("480");
  const [strike, setStrike] = useState("450");
  const [premium, setPremium] = useState("8");
  const [spot, setSpot] = useState("380");

  const result = useMemo(
    () =>
      protectivePut({
        sharesHeld: parse(shares),
        buyPrice: parse(buyPrice),
        strikePrice: parse(strike),
        premium: parse(premium),
        spotAtExpiry: parse(spot),
      }),
    [shares, buyPrice, strike, premium, spot]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <LifeBuoy className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Protective Put</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        Buying insurance on shares you hold. Costs the premium; puts a floor under how much a
        crash can take.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Shares held" value={shares} onChange={setShares} />
        <Field label="Your buy price" value={buyPrice} onChange={setBuyPrice} suffix="₹" />
        <Field label="Put strike bought" value={strike} onChange={setStrike} suffix="₹" />
        <Field label="Premium paid" value={premium} onChange={setPremium} suffix="₹" />
        <Field label="Spot at expiry" value={spot} onChange={setSpot} suffix="₹" />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              label="Total P&L"
              value={rupees(result.totalPnl)}
              tone={result.totalPnl >= 0 ? "good" : "bad"}
            />
            <Stat label="Max loss, floored" value={rupees(result.maxLoss)} tone="bad" />
            <Stat label="Breakeven" value={rupees(result.breakeven)} />
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            Max loss is fixed at or below the strike, however far the stock falls beyond it — the
            put&apos;s intrinsic value rises rupee-for-rupee with the stock&apos;s fall below that
            point, cancelling it out. Breakeven is your buy price plus the premium: the stock must
            recover both before the position is whole.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Shares, buy price and strike must all be positive.
        </p>
      )}
    </Card>
  );
}

// ─── Intraday margin ─────────────────────────────────────────────────────────

function IntradayMarginCalculator() {
  const [mode, setMode] = useState<"margin" | "quantity">("margin");
  const [quantity, setQuantity] = useState("500");
  const [price, setPrice] = useState("500");
  const [marginPercent, setMarginPercent] = useState("20");
  const [availableMargin, setAvailableMargin] = useState("100000");

  const marginResult = useMemo(
    () =>
      intradayMargin({
        quantity: parse(quantity),
        price: parse(price),
        marginPercent: parse(marginPercent),
      }),
    [quantity, price, marginPercent]
  );
  const quantityResult = useMemo(
    () =>
      maxQuantityForMargin({
        availableMargin: parse(availableMargin),
        price: parse(price),
        marginPercent: parse(marginPercent),
      }),
    [availableMargin, price, marginPercent]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Intraday Margin</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        How much margin a position demands, or how many shares a margin budget buys — the two
        sides of the same question.
      </p>

      <div className="mt-3 flex rounded-xl border border-border/50 bg-bg/40 p-0.5" role="tablist">
        {(
          [
            { key: "margin", label: "I have a quantity" },
            { key: "quantity", label: "I have a budget" },
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

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {mode === "margin" ? (
          <Field label="Quantity" value={quantity} onChange={setQuantity} />
        ) : (
          <Field label="Available margin" value={availableMargin} onChange={setAvailableMargin} suffix="₹" />
        )}
        <Field label="Price" value={price} onChange={setPrice} suffix="₹" />
        <Field label="Broker margin" value={marginPercent} onChange={setMarginPercent} suffix="%" />
      </div>

      {mode === "margin" ? (
        marginResult ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Position value" value={rupees(marginResult.positionValue)} />
            <Stat label="Margin required" value={rupees(marginResult.marginRequired)} tone="good" />
            <Stat label="Leverage" value={`${marginResult.leverage.toFixed(1)}x`} />
            <Stat label="Borrowed" value={rupees(marginResult.borrowedAmount)} />
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
            Quantity and price must be positive; margin must be between 0 and 100%.
          </p>
        )
      ) : quantityResult ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label="Max shares"
            value={quantityResult.maxQuantity.toLocaleString("en-IN")}
            tone="good"
          />
          <Stat label="Position value" value={rupees(quantityResult.positionValue)} />
          <Stat label="Margin used" value={rupees(quantityResult.marginUsed)} />
          <Stat label="Margin left over" value={rupees(quantityResult.marginRemaining)} />
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Available margin and price must be positive; margin must be between 0 and 100%.
        </p>
      )}
      <p className="mt-2 text-[10px] leading-4 text-muted/60">
        &ldquo;Broker margin&rdquo; is the percent of position value demanded up front — brokers
        quote it this way (&ldquo;20% margin&rdquo;), not as a multiple.
      </p>
    </Card>
  );
}

// ─── Liquidation & margin call ───────────────────────────────────────────────

function LiquidationCalculator() {
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [quantity, setQuantity] = useState("500");
  const [entryPrice, setEntryPrice] = useState("500");
  const [currentPrice, setCurrentPrice] = useState("470");
  const [marginPercent, setMarginPercent] = useState("20");
  const [maintenancePercent, setMaintenancePercent] = useState("10");

  const liqPrice = useMemo(
    () =>
      liquidationPrice({
        entryPrice: parse(entryPrice),
        marginPercent: parse(marginPercent),
        maintenanceMarginPercent: parse(maintenancePercent),
        direction,
      }),
    [entryPrice, marginPercent, maintenancePercent, direction]
  );
  const call = useMemo(
    () =>
      marginCallAmount({
        quantity: parse(quantity),
        entryPrice: parse(entryPrice),
        currentPrice: parse(currentPrice),
        marginPercent: parse(marginPercent),
        maintenanceMarginPercent: parse(maintenancePercent),
        direction,
      }),
    [quantity, entryPrice, currentPrice, marginPercent, maintenancePercent, direction]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <AlertOctagon className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Liquidation &amp; Margin Call</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        The price a leveraged position gets force-closed at, and whether it is already below the
        maintenance line today.
      </p>

      <div className="mt-3 flex rounded-xl border border-border/50 bg-bg/40 p-0.5" role="tablist">
        {(["long", "short"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={direction === option}
            onClick={() => setDirection(option)}
            className={`flex-1 rounded-[10px] px-3 py-1.5 text-xs font-semibold capitalize transition ${
              direction === option ? "bg-accent/15 text-accent" : "text-muted hover:text-fg"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Quantity" value={quantity} onChange={setQuantity} />
        <Field label="Entry price" value={entryPrice} onChange={setEntryPrice} suffix="₹" />
        <Field label="Current price" value={currentPrice} onChange={setCurrentPrice} suffix="₹" />
        <Field label="Initial margin" value={marginPercent} onChange={setMarginPercent} suffix="%" />
        <Field label="Maintenance margin" value={maintenancePercent} onChange={setMaintenancePercent} suffix="%" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Liquidation price"
          value={liqPrice === null ? "—" : rupees(liqPrice)}
          tone="bad"
        />
        <Stat
          label="Current equity"
          value={call ? rupees(call.currentEquity) : "—"}
          tone={call && call.inMarginCall ? "bad" : undefined}
        />
        <Stat label="Required equity" value={call ? rupees(call.requiredEquity) : "—"} />
        <Stat
          label={call?.inMarginCall ? "Top-up needed" : "Margin call?"}
          value={call ? (call.inMarginCall ? rupees(call.marginCallAmount) : "No") : "—"}
          tone={call?.inMarginCall ? "bad" : "good"}
        />
      </div>
      <p className="mt-2 text-[10px] leading-4 text-muted/60">
        {direction === "short"
          ? "A short's liquidation price sits ABOVE entry — a short is squeezed out by the price rising, the mirror of a long."
          : "A long's liquidation price sits below entry."}{" "}
        The top-up figure restores the ORIGINAL margin level, not just the bare maintenance floor —
        real broker margin-call notices ask for enough to rebuild the buffer, not just clear the
        breach.
      </p>
    </Card>
  );
}

// ─── Risk of ruin ────────────────────────────────────────────────────────────

const LEVERAGE_STEPS = [2, 3, 5, 10, 20];

function RiskOfRuinCalculator() {
  const [leverage, setLeverage] = useState("5");
  const [move, setMove] = useState("15");

  const result = useMemo(
    () => leverageRiskOfRuin({ leverage: parse(leverage), adverseMovePercent: parse(move) }),
    [leverage, move]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Skull className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Leverage Risk of Ruin</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        &ldquo;5x leverage&rdquo; sounds like a modest multiplier. This is what it actually does to
        an ordinary adverse move.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Leverage" value={leverage} onChange={setLeverage} suffix="x" />
        <Field label="Adverse move" value={move} onChange={setMove} suffix="%" />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-5">
        {LEVERAGE_STEPS.map((step) => {
          const shock = leverageRiskOfRuin({ leverage: step, adverseMovePercent: parse(move) });
          return (
            <button
              key={step}
              type="button"
              onClick={() => setLeverage(String(step))}
              className="rounded-lg border border-border/40 bg-bg/40 px-1.5 py-1.5 text-center transition hover:border-accent/40"
            >
              <span className="block text-[10px] text-muted">{step}x</span>
              <span
                className={`block text-[11px] font-bold tabular-nums ${
                  shock?.wipedOut ? "text-danger" : "text-fg"
                }`}
              >
                {shock ? `${shock.equityLossPercent.toFixed(0)}%` : "—"}
              </span>
            </button>
          );
        })}
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat
              label="Equity lost"
              value={`${result.equityLossPercent.toFixed(1)}%`}
              tone={result.wipedOut ? "bad" : undefined}
            />
            <Stat
              label="Outcome"
              value={result.wipedOut ? "Wiped out" : "Survives"}
              tone={result.wipedOut ? "bad" : "good"}
            />
          </div>
          {result.wipedOut && result.equityLossPercent > 100 && (
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-danger">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              This is not just a total loss — the shortfall past 100% is owed back to the broker.
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Leverage must be positive; the adverse move cannot be negative.
        </p>
      )}
    </Card>
  );
}

// ─── Trade tax estimator ─────────────────────────────────────────────────────

function TradeTaxCalculator() {
  const today = todayIstDateKey();
  const [quantity, setQuantity] = useState("100");
  const [buyPrice, setBuyPrice] = useState("500");
  const [sellPrice, setSellPrice] = useState("650");
  const [buyDate, setBuyDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 4);
    return d.toISOString().slice(0, 10);
  });
  const [sellDate, setSellDate] = useState(today);

  const result = useMemo(
    () =>
      estimateTradeTax({
        quantity: parse(quantity),
        buyPrice: parse(buyPrice),
        sellPrice: parse(sellPrice),
        buyDate,
        sellDate,
      }),
    [quantity, buyPrice, sellPrice, buyDate, sellDate]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <ReceiptText className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Capital Gains Tax</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        What one hypothetical trade would owe, before it exists in your portfolio — the same
        FY-aware rules (STCG/LTCG rate, ₹1.25L exemption, cess) as your portfolio&apos;s tax
        statement, applied to a single what-if.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Quantity" value={quantity} onChange={setQuantity} />
        <Field label="Buy price" value={buyPrice} onChange={setBuyPrice} suffix="₹" />
        <Field label="Sell price" value={sellPrice} onChange={setSellPrice} suffix="₹" />
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted">Buy date</span>
          <input
            type="date"
            value={buyDate}
            onChange={(event) => setBuyDate(event.target.value)}
            className="h-10 w-full rounded-xl border border-border/60 bg-bg/60 px-3 text-sm outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted">Sell date</span>
          <input
            type="date"
            value={sellDate}
            onChange={(event) => setSellDate(event.target.value)}
            className="h-10 w-full rounded-xl border border-border/60 bg-bg/60 px-3 text-sm outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
          />
        </label>
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="Gain / loss"
              value={rupees(result.realisedPnl)}
              tone={result.realisedPnl >= 0 ? "good" : "bad"}
            />
            <Stat
              label="Held"
              value={`${result.holdingDays}d`}
              tone={result.term === "long" ? "good" : undefined}
            />
            <Stat label="Term" value={result.term === "long" ? "Long-term" : "Short-term"} />
            <Stat label="Estimated tax" value={rupees(result.totalTax)} tone="bad" />
          </div>
          {result.term === "short" && result.daysToLongTerm > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-amber-500">
              <CalendarClock className="mt-0.5 h-3 w-3 shrink-0" />
              {result.daysToLongTerm} more days turns this long-term — a lower rate and the ₹1.25L
              exemption, instead of the flat short-term rate.
            </p>
          )}
          {result.exemptionUsed > 0 && (
            <p className="mt-1 text-[10px] leading-4 text-muted/60">
              {rupees(result.exemptionUsed)} of this year&apos;s ₹{result.exemptionLimit.toLocaleString("en-IN")} long-term
              exemption used, {rupees(result.exemptionRemaining)} left for other trades this FY.
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Sell date must be on or after the buy date; quantity and prices must be positive.
        </p>
      )}

      <p className="mt-2 text-[10px] leading-4 text-muted/60">{TAX_ESTIMATE_DISCLAIMER}</p>
    </Card>
  );
}

// ─── Weighted average (multi-lot) ────────────────────────────────────────────

type LotRow = { id: number; quantity: string; price: string };
let lotRowId = 0;
const newLotRow = (): LotRow => ({ id: lotRowId++, quantity: "", price: "" });

function WeightedAverageCalculator() {
  const [rows, setRows] = useState<LotRow[]>(() => [newLotRow(), newLotRow(), newLotRow()]);

  const result = useMemo(
    () =>
      weightedAverageBuy({
        lots: rows.map((row) => ({ quantity: parse(row.quantity), price: parse(row.price) })),
      }),
    [rows]
  );
  const usableCount = useMemo(
    () => rows.filter((row) => parse(row.quantity) > 0 && parse(row.price) > 0).length,
    [rows]
  );

  const updateRow = (id: number, field: "quantity" | "price", value: string) => {
    setRows((previous) => previous.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };
  const removeRow = (id: number) => {
    setRows((previous) => (previous.length > 1 ? previous.filter((row) => row.id !== id) : previous));
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <ListPlus className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Weighted Average (Multi-Lot)</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        Bought across several tranches? Your true average blends all of them, not just the last
        top-up. Blank rows are ignored, not errors.
      </p>

      <div className="mt-3 space-y-1.5">
        {rows.map((row, index) => (
          <div key={row.id} className="flex items-center gap-1.5">
            <span className="w-5 shrink-0 text-[10px] text-muted">{index + 1}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={row.quantity}
              onChange={(event) => updateRow(row.id, "quantity", event.target.value)}
              placeholder="Qty"
              className="h-9 min-w-0 flex-1 rounded-lg border border-border/60 bg-bg/60 px-2.5 text-sm outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
            />
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={row.price}
              onChange={(event) => updateRow(row.id, "price", event.target.value)}
              placeholder="Price ₹"
              className="h-9 min-w-0 flex-1 rounded-lg border border-border/60 bg-bg/60 px-2.5 text-sm outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="button"
              onClick={() => removeRow(row.id)}
              disabled={rows.length <= 1}
              aria-label={`Remove lot ${index + 1}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/50 text-muted transition hover:border-danger/40 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows((previous) => [...previous, newLotRow()])}
        className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-border/60 px-3 py-1.5 text-[11px] font-semibold text-muted transition hover:border-accent/40 hover:text-accent"
      >
        <Plus className="h-3.5 w-3.5" /> Add lot
      </button>

      {result ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Total shares" value={result.totalQuantity.toLocaleString("en-IN")} />
          <Stat label="Weighted average" value={rupees(result.averagePrice)} tone="good" />
          <Stat label="Total invested" value={rupees(result.totalInvested)} />
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Fill in at least one row with a quantity and a price.
        </p>
      )}
      {usableCount > 0 && usableCount < rows.length && (
        <p className="mt-2 text-[10px] leading-4 text-muted/60">
          Using {usableCount} of {rows.length} rows — the rest are blank or incomplete.
        </p>
      )}
    </Card>
  );
}

// ─── Time to goal ────────────────────────────────────────────────────────────

function TimeToGoalCalculator() {
  const [current, setCurrent] = useState("500000");
  const [monthly, setMonthly] = useState("25000");
  const [target, setTarget] = useState("10000000");
  const [rate, setRate] = useState("12");

  const result = useMemo(
    () =>
      timeToGoal({
        currentAmount: parse(current),
        monthlyInvestment: parse(monthly),
        targetAmount: parse(target),
        annualReturnPercent: parse(rate),
      }),
    [current, monthly, target, rate]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Hourglass className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Time to Goal</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        Not &ldquo;how much will I have&rdquo; but &ldquo;how long until I get there&rdquo; — the
        question you actually have when the number is already fixed in your head.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Already invested" value={current} onChange={setCurrent} suffix="₹" />
        <Field label="Adding monthly" value={monthly} onChange={setMonthly} suffix="₹" />
        <Field label="Goal" value={target} onChange={setTarget} suffix="₹" />
        <Field label="Expected return" value={rate} onChange={setRate} suffix="%/yr" />
      </div>

      {result ? (
        result.alreadyThere ? (
          <p className="mt-3 rounded-lg border border-success/30 bg-success/5 px-3 py-2.5 text-[11px] text-success">
            Already there — what you hold today clears the goal.
          </p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat
                label="Time needed"
                value={
                  result.years >= 1
                    ? `${result.years.toFixed(1)} yrs`
                    : `${result.months} months`
                }
                tone="good"
              />
              <Stat label="You'd put in" value={rupees(result.totalInvested)} />
              <Stat label="Growth does" value={rupees(result.growth)} />
            </div>
            <p className="mt-2 text-[10px] leading-4 text-muted/60">
              {result.months} monthly instalments. Of the {rupees(parse(target))} goal,{" "}
              {rupees(result.growth)} comes from compounding rather than from your pocket.
            </p>
          </>
        )
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          This plan does not reach the goal within 100 years — raise the monthly amount or the
          expected return.
        </p>
      )}
    </Card>
  );
}

// ─── Coast FIRE ──────────────────────────────────────────────────────────────

function CoastFireCalculator() {
  const [current, setCurrent] = useState("2000000");
  const [target, setTarget] = useState("50000000");
  const [years, setYears] = useState("25");
  const [rate, setRate] = useState("12");

  const result = useMemo(
    () =>
      coastFire({
        currentAmount: parse(current),
        targetAmount: parse(target),
        years: parse(years),
        annualReturnPercent: parse(rate),
      }),
    [current, target, years, rate]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Sailboat className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Coast Point</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        Whether what you already hold reaches the goal on its own, with nothing further added.
        Past that point, compounding finishes the job.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Already invested" value={current} onChange={setCurrent} suffix="₹" />
        <Field label="Goal" value={target} onChange={setTarget} suffix="₹" />
        <Field label="Years to goal" value={years} onChange={setYears} />
        <Field label="Expected return" value={rate} onChange={setRate} suffix="%/yr" />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              label="Grows to"
              value={rupees(result.projectedAmount)}
              tone={result.onTrack ? "good" : undefined}
            />
            <Stat
              label="Covers"
              value={`${result.coveragePercent.toFixed(0)}%`}
              tone={result.onTrack ? "good" : "bad"}
            />
            <Stat
              label="Still short"
              value={result.shortfall === 0 ? "—" : rupees(result.shortfall)}
              tone={result.shortfall === 0 ? "good" : "bad"}
            />
          </div>

          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border/40">
            <div
              className={`h-full rounded-full ${
                result.onTrack
                  ? "bg-gradient-to-r from-emerald-400 to-teal-500"
                  : "bg-gradient-to-r from-amber-400 to-orange-500"
              }`}
              style={{ width: `${Math.min(100, Math.max(1, result.coveragePercent))}%` }}
            />
          </div>

          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            {result.onTrack
              ? "You could stop contributing today and still reach the goal on this return assumption. Continuing to invest simply gets you there sooner, or further."
              : "Contributions are still doing the work here — this is what the existing balance alone would manage."}
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Enter a goal and a horizon of up to 100 years.
        </p>
      )}
    </Card>
  );
}

const GROUPS = [
  { key: "trading", label: "Trading", blurb: "Costs and sizing for a trade you are about to place." },
  { key: "equity", label: "Equity", blurb: "Questions about a position you hold or are building." },
  { key: "fno", label: "F&O", blurb: "Options payoff and leveraged-position arithmetic." },
  { key: "planning", label: "Planning", blurb: "Long-horizon compounding, inflation and goals." },
] as const;

type GroupKey = (typeof GROUPS)[number]["key"];

/**
 * The registry every rendering path reads from.
 *
 * Twenty-five calculators had reached the point where the render block was a
 * hand-maintained wall of JSX, and search was impossible without duplicating
 * the list. Describing them as data instead means the tab filter, the search
 * filter, the count and the deep link are all derived from one place and
 * cannot drift out of step with each other.
 *
 * `keywords` carries the words someone would actually type — including the
 * ones the visible title deliberately avoids. Nobody searches "Loss Recovery";
 * they search "breakeven" or "recover my loss".
 */
type CalculatorEntry = {
  key: string;
  title: string;
  group: GroupKey;
  keywords: string;
  Component: () => JSX.Element;
};

const CALCULATORS: CalculatorEntry[] = [
  // Trading
  {
    key: "charges",
    title: "Brokerage & Charges",
    group: "trading",
    keywords: "brokerage stt tax charges cost stamp duty gst sebi turnover breakeven intraday delivery contract note",
    Component: ChargesCalculator,
  },
  {
    key: "position-size",
    title: "Position Size",
    group: "trading",
    keywords: "position sizing risk per trade quantity shares stop loss capital allocation money management",
    Component: PositionSizeCalculator,
  },
  {
    key: "stop-loss",
    title: "Stop-Loss & Target Price",
    group: "trading",
    keywords: "stop loss target price risk reward ratio long short entry exit levels",
    Component: StopLossTargetCalculator,
  },

  // Equity
  {
    key: "stock-average",
    title: "Stock Average",
    group: "equity",
    keywords: "average down averaging up cost basis buy more add position tranche",
    Component: StockAverageCalculator,
  },
  {
    key: "weighted-average",
    title: "Weighted Average (Multi-Lot)",
    group: "equity",
    keywords: "weighted average multiple lots tranches accumulation cost basis several buys",
    Component: WeightedAverageCalculator,
  },
  {
    key: "target-price",
    title: "Target Price",
    group: "equity",
    keywords: "target price required return double 2x multibagger annualised how much needed",
    Component: TargetPriceCalculator,
  },
  {
    key: "loss-recovery",
    title: "Loss Recovery",
    group: "equity",
    keywords: "loss recovery breakeven gain needed recover drawdown down 50 percent",
    Component: LossRecoveryCalculator,
  },
  {
    key: "dividend-income",
    title: "Dividend Income",
    group: "equity",
    keywords: "dividend income yield passive monthly capital required payout",
    Component: DividendIncomeCalculator,
  },
  {
    key: "trade-tax",
    title: "Capital Gains Tax",
    group: "equity",
    keywords: "capital gains tax stcg ltcg short term long term exemption cess holding period",
    Component: TradeTaxCalculator,
  },

  // F&O
  {
    key: "option-payoff",
    title: "Option Payoff",
    group: "fno",
    keywords: "option payoff call put strike premium expiry breakeven intrinsic value diagram fno derivatives",
    Component: OptionPayoffCalculator,
  },
  {
    key: "covered-call",
    title: "Covered Call",
    group: "fno",
    keywords: "covered call income strategy sell call against shares capped upside",
    Component: CoveredCallCalculator,
  },
  {
    key: "protective-put",
    title: "Protective Put",
    group: "fno",
    keywords: "protective put hedge insurance downside protection floor crash",
    Component: ProtectivePutCalculator,
  },
  {
    key: "intraday-margin",
    title: "Intraday Margin",
    group: "fno",
    keywords: "margin intraday mtf leverage borrowed how many shares budget exposure",
    Component: IntradayMarginCalculator,
  },
  {
    key: "liquidation",
    title: "Liquidation & Margin Call",
    group: "fno",
    keywords: "liquidation price margin call force close maintenance margin square off shortfall",
    Component: LiquidationCalculator,
  },
  {
    key: "risk-of-ruin",
    title: "Leverage Risk of Ruin",
    group: "fno",
    keywords: "leverage risk of ruin wiped out blown account equity loss adverse move",
    Component: RiskOfRuinCalculator,
  },

  // Planning
  {
    key: "time-to-goal",
    title: "Time to Goal",
    group: "planning",
    keywords: "time to goal how long until target crore years months reach",
    Component: TimeToGoalCalculator,
  },
  {
    key: "coast-point",
    title: "Coast Point",
    group: "planning",
    keywords: "coast fire financial independence stop investing compounding alone on track",
    Component: CoastFireCalculator,
  },
  {
    key: "sip",
    title: "SIP Planner",
    group: "planning",
    keywords: "sip systematic investment plan monthly goal future value mutual fund",
    Component: SipPlanner,
  },
  {
    key: "step-up-sip",
    title: "Step-Up SIP",
    group: "planning",
    keywords: "step up sip top up annual increase salary hike increasing monthly",
    Component: StepUpSipCalculator,
  },
  {
    key: "sip-vs-lumpsum",
    title: "SIP vs Lumpsum",
    group: "planning",
    keywords: "sip vs lumpsum one time versus monthly which is better timing",
    Component: SipVsLumpsumCalculator,
  },
  {
    key: "cagr",
    title: "CAGR",
    group: "planning",
    keywords: "cagr compound annual growth rate annualised return absolute",
    Component: CagrCalculator,
  },
  {
    key: "rule-of-72",
    title: "Rule of 72",
    group: "planning",
    keywords: "rule of 72 doubling time double money how many years",
    Component: RuleOf72Calculator,
  },
  {
    key: "real-return",
    title: "Real Return & Inflation",
    group: "planning",
    keywords: "real return inflation adjusted purchasing power fisher erosion value of money",
    Component: RealReturnCalculator,
  },
  {
    key: "emi",
    title: "EMI",
    group: "planning",
    keywords: "emi loan instalment interest home loan against securities tenure",
    Component: EmiCalculator,
  },
  {
    key: "retirement",
    title: "Retirement Corpus",
    group: "planning",
    keywords: "retirement corpus fire pension monthly expense post retirement nest egg",
    Component: RetirementCalculator,
  },
];

/** Matches a calculator against a free-text query. */
function matchesQuery(entry: CalculatorEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = `${entry.title} ${entry.keywords}`.toLowerCase();
  // Every whitespace-separated term must appear somewhere. AND rather than OR
  // so "sip tax" narrows instead of returning half the page.
  return needle.split(/\s+/).every((term) => haystack.includes(term));
}

/**
 * The tab whose name is in the URL hash, if it names a real one.
 *
 * Read from the hash rather than a query param on purpose: `useSearchParams`
 * would opt this page out of static prerendering (or demand a Suspense
 * boundary around it), and the whole SEO argument for rendering every
 * calculator server-side depends on the page staying static.
 */
function groupFromHash(): GroupKey | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#/, "").trim().toLowerCase();
  const match = GROUPS.find((entry) => entry.key === raw);
  return match ? match.key : null;
}

export function ToolsClient() {
  const [group, setGroup] = useState<GroupKey>("trading");
  const [query, setQuery] = useState("");
  const active = GROUPS.find((entry) => entry.key === group)!;
  const searching = query.trim().length > 0;

  // Applied after mount rather than as the initial state: the server has no
  // hash to read, so seeding state from it directly would make the first
  // client render disagree with the server's HTML and trip a hydration
  // mismatch on every deep link.
  useEffect(() => {
    const fromHash = groupFromHash();
    if (fromHash) setGroup(fromHash);
  }, []);

  const selectGroup = useCallback((next: GroupKey) => {
    setGroup(next);
    if (typeof window !== "undefined") {
      // replaceState, not a hash assignment: setting location.hash scrolls the
      // page to the matching element and stacks a history entry, so Back would
      // walk through tab changes instead of leaving the page.
      window.history.replaceState(null, "", `#${next}`);
    }
  }, []);

  const matches = useMemo(
    () => CALCULATORS.filter((entry) => matchesQuery(entry, query)),
    [query]
  );

  return (
    <div className="stagger-fade space-y-6 py-4 sm:py-8">
      <div>
        <p className="text-sm text-muted">Home / Tools</p>
        <h1 className="mt-1 flex items-center gap-2.5 font-[var(--font-space)] text-2xl font-bold tracking-tight sm:text-3xl">
          <Calculator className="h-6 w-6 text-accent" />
          Trading Tools
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          {CALCULATORS.length} calculations that usually mean opening a spreadsheet — or somebody
          else&apos;s ad-covered site. Everything runs locally in your browser as you type; nothing
          is sent anywhere.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${CALCULATORS.length} calculators — "breakeven", "sip", "margin"…`}
          aria-label="Search calculators"
          className="h-11 w-full rounded-xl border border-border/60 bg-bg/60 pl-10 pr-10 text-sm outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
        />
        {searching ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Grouped rather than one long grid: twenty-five calculators in a flat
          wall makes the reader scan instead of choose. Hidden while searching,
          because results deliberately cross every group. */}
      {!searching && (
        <>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Tool category">
            {GROUPS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={group === entry.key}
                onClick={() => selectGroup(entry.key)}
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
        </>
      )}

      {searching ? (
        matches.length > 0 ? (
          <>
            <p className="-mt-3 text-[11px] text-muted">
              {matches.length} of {CALCULATORS.length} calculators match &ldquo;{query.trim()}
              &rdquo;
            </p>
            <div className="grid gap-4 xl:grid-cols-2">
              {matches.map(({ key, Component }) => (
                <Component key={key} />
              ))}
            </div>
          </>
        ) : (
          <p className="rounded-xl border border-border/40 bg-bg/40 px-4 py-8 text-center text-sm text-muted">
            Nothing matches &ldquo;{query.trim()}&rdquo;. Try a broader word — &ldquo;tax&rdquo;,
            &ldquo;sip&rdquo;, &ldquo;option&rdquo;, &ldquo;margin&rdquo;.
          </p>
        )
      ) : (
        // Every group stays mounted and only its visibility toggles. This
        // page's whole selling point is search traffic for things like "stock
        // average calculator", and with `"use client"` only whatever the
        // initial state renders reaches the server-rendered HTML — so
        // conditionally mounting groups on click would hide most of the
        // calculators from a crawler that never runs JavaScript. `hidden` is a
        // real DOM/CSS property that screen readers and search engines both
        // honour correctly.
        GROUPS.map((entry) => (
          <div
            key={entry.key}
            className="grid gap-4 xl:grid-cols-2"
            hidden={group !== entry.key}
          >
            {CALCULATORS.filter((calculator) => calculator.group === entry.key).map(
              ({ key, Component }) => (
                <Component key={key} />
              )
            )}
          </div>
        ))
      )}

      <p className="text-center text-[11px] text-muted/60">
        Statutory rates as of FY 2025-26. Educational tools, not investment advice.
      </p>
    </div>
  );
}
