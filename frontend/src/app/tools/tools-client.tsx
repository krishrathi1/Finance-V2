"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
  Vault,
  Dices,
  Gem,
  Home,
  Gift,
  Ticket,
  Info,
  RefreshCcw,
  Percent,
  Wallet,
  Scissors,
  ArrowDownWideNarrow,
  ArrowUpDown,
  GitCompare,
  Telescope,
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
import { fdVsEquity } from "@/shared/fd-vs-equity";
import { npsProjection } from "@/shared/nps-tools";
import { kellyStake, tradingExpectancy } from "@/shared/expectancy-tools";
import { goldVsEquity, propertyReturn } from "@/shared/asset-class-tools";
import {
  bonusIssue,
  buybackTender,
  rightsIssue,
  stockSplit,
} from "@/shared/corporate-action-tools";
import { expenseRatioDrag, swpPlan } from "@/shared/fund-tools";
import { partialExit, trailingStop } from "@/shared/exit-tools";
import { verticalSpread, type SpreadType } from "@/shared/spread-tools";
import { earningsYieldGap, impliedGrowth } from "@/shared/valuation-tools";
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

// ─── Bonus & split ───────────────────────────────────────────────────────────

/**
 * Bonus and split share one card because they share one answer: more shares,
 * proportionally lower cost, identical total. Splitting them into two cards
 * would imply the outcomes differ, which is the misconception this is here to
 * correct.
 */
function BonusSplitCalculator() {
  const [mode, setMode] = useState<"bonus" | "split">("bonus");
  const [quantity, setQuantity] = useState("100");
  const [buyPrice, setBuyPrice] = useState("500");
  const [bonusNew, setBonusNew] = useState("1");
  const [bonusHeld, setBonusHeld] = useState("1");
  const [oldFace, setOldFace] = useState("10");
  const [newFace, setNewFace] = useState("1");

  const result = useMemo(() => {
    const shared = { quantity: parse(quantity), buyPrice: parse(buyPrice) };
    return mode === "bonus"
      ? bonusIssue({ ...shared, bonusNew: parse(bonusNew), bonusHeld: parse(bonusHeld) })
      : stockSplit({ ...shared, oldFaceValue: parse(oldFace), newFaceValue: parse(newFace) });
  }, [mode, quantity, buyPrice, bonusNew, bonusHeld, oldFace, newFace]);

  const priceDrop = result === null ? null : 100 - result.adjustmentFactor * 100;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Gift className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Bonus &amp; Split</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        Neither creates value. The share count rises, the price falls by the same proportion, and
        what you own is worth exactly what it was the day before.
      </p>

      <div className="mt-3 flex gap-1 rounded-lg border border-border/40 bg-bg/40 p-1">
        {(["bonus", "split"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
            aria-pressed={mode === option}
            className={`flex-1 rounded-md px-3 py-1.5 text-[11px] font-medium capitalize transition ${
              mode === option ? "bg-accent text-bg" : "text-muted hover:text-fg"
            }`}
          >
            {option === "bonus" ? "Bonus issue" : "Stock split"}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Shares held" value={quantity} onChange={setQuantity} />
        <Field label="Your avg price" value={buyPrice} onChange={setBuyPrice} suffix="₹" />
        {mode === "bonus" ? (
          <>
            <Field label="Bonus — new" value={bonusNew} onChange={setBonusNew} />
            <Field label="Bonus — per held" value={bonusHeld} onChange={setBonusHeld} />
          </>
        ) : (
          <>
            <Field label="Old face value" value={oldFace} onChange={setOldFace} suffix="₹" />
            <Field label="New face value" value={newFace} onChange={setNewFace} suffix="₹" />
          </>
        )}
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Shares after" value={result.newQuantity.toLocaleString("en-IN")} />
            <Stat label="New avg price" value={rupees(result.newAveragePrice)} />
            <Stat
              label="Price adjusts by"
              value={priceDrop === null ? "—" : `−${priceDrop.toFixed(2)}%`}
            />
            <Stat label="Total invested" value={rupees(result.totalInvested)} />
          </div>

          {mode === "bonus" && result.sharesReceived > 0 && (
            <p className="mt-2 text-[10px] leading-4 text-muted/60">
              {result.sharesReceived.toLocaleString("en-IN")} free shares credited. Fractional
              entitlements are settled in cash, so the count is rounded down.
            </p>
          )}
          <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-muted/60">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Your holding is still worth {rupees(result.totalInvested)} at cost — the apparent fall
            on the chart is the adjustment, not a loss. Holding period for tax purposes carries
            over from the original shares.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          {mode === "split"
            ? "Enter a new face value below the old one — a rise is a reverse split, which works differently."
            : "Enter a holding and a bonus ratio, such as 1 new share for every 1 held."}
        </p>
      )}
    </Card>
  );
}

// ─── Rights issue ────────────────────────────────────────────────────────────

function RightsIssueCalculator() {
  const [quantity, setQuantity] = useState("100");
  const [buyPrice, setBuyPrice] = useState("500");
  const [rightsNew, setRightsNew] = useState("1");
  const [rightsHeld, setRightsHeld] = useState("2");
  const [rightsPrice, setRightsPrice] = useState("400");
  const [marketPrice, setMarketPrice] = useState("600");

  const result = useMemo(
    () =>
      rightsIssue({
        quantity: parse(quantity),
        buyPrice: parse(buyPrice),
        rightsNew: parse(rightsNew),
        rightsHeld: parse(rightsHeld),
        rightsPrice: parse(rightsPrice),
        marketPrice: parse(marketPrice),
      }),
    [quantity, buyPrice, rightsNew, rightsHeld, rightsPrice, marketPrice]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Ticket className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Rights Issue</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        The only corporate action that takes fresh money. Declining is not free — the price still
        drifts to the ex-rights level, just without the discounted shares to offset it.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Shares held" value={quantity} onChange={setQuantity} />
        <Field label="Your avg price" value={buyPrice} onChange={setBuyPrice} suffix="₹" />
        <Field label="Market price" value={marketPrice} onChange={setMarketPrice} suffix="₹" />
        <Field label="Rights — new" value={rightsNew} onChange={setRightsNew} />
        <Field label="Rights — per held" value={rightsHeld} onChange={setRightsHeld} />
        <Field label="Rights price" value={rightsPrice} onChange={setRightsPrice} suffix="₹" />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="You can buy"
              value={`${result.entitlement.toLocaleString("en-IN")} sh`}
            />
            <Stat label="Costs you" value={rupees(result.costToSubscribe)} tone="bad" />
            <Stat
              label="Each right is worth"
              value={rupees(result.valuePerRight)}
              tone={result.valuePerRight > 0 ? "good" : undefined}
            />
            <Stat label="Ex-rights price" value={rupees(result.theoreticalExRightsPrice)} />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              label="Shares after"
              value={result.quantityIfSubscribed.toLocaleString("en-IN")}
            />
            <Stat label="New avg price" value={rupees(result.averagePriceIfSubscribed)} />
            <Stat label="Total invested" value={rupees(result.totalInvestedIfSubscribed)} />
          </div>

          {result.worthSubscribing ? (
            <p className="mt-2 text-[10px] leading-4 text-muted/60">
              The offer is below the market price, so the entitlement carries real value. If you do
              not want more of the stock, rights are usually tradable on the exchange during the
              issue — letting them lapse gives that value away.
            </p>
          ) : (
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-amber-500">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              The rights price is at or above the market price. There is nothing to gain here — the
              shares can be bought more cheaply on the exchange.
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Enter a holding, a rights ratio and both prices.
        </p>
      )}
    </Card>
  );
}

// ─── Buyback tender ──────────────────────────────────────────────────────────

function BuybackCalculator() {
  const [sharesHeld, setSharesHeld] = useState("100");
  const [buyPrice, setBuyPrice] = useState("400");
  const [buybackPrice, setBuybackPrice] = useState("600");
  const [marketPrice, setMarketPrice] = useState("500");
  const [acceptance, setAcceptance] = useState("15");

  const result = useMemo(
    () =>
      buybackTender({
        sharesHeld: parse(sharesHeld),
        buyPrice: parse(buyPrice),
        buybackPrice: parse(buybackPrice),
        marketPrice: parse(marketPrice),
        acceptanceRatioPercent: parse(acceptance),
      }),
    [sharesHeld, buyPrice, buybackPrice, marketPrice, acceptance]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <RefreshCcw className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Buyback Tender</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        The premium is real, but it only applies to the shares the company actually accepts. The
        rest come back to you — often into a price with the buyback support removed.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Shares tendered" value={sharesHeld} onChange={setSharesHeld} />
        <Field label="Your avg price" value={buyPrice} onChange={setBuyPrice} suffix="₹" />
        <Field label="Market price" value={marketPrice} onChange={setMarketPrice} suffix="₹" />
        <Field label="Buyback price" value={buybackPrice} onChange={setBuybackPrice} suffix="₹" />
        <Field label="Acceptance ratio" value={acceptance} onChange={setAcceptance} suffix="%" />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="Accepted"
              value={`${result.sharesAccepted.toLocaleString("en-IN")} sh`}
              tone="good"
            />
            <Stat
              label="Returned to you"
              value={`${result.sharesReturned.toLocaleString("en-IN")} sh`}
            />
            <Stat
              label="Premium"
              value={`${result.premiumPercent.toFixed(2)}%`}
              tone={result.premiumPercent >= 0 ? "good" : "bad"}
            />
            <Stat label="Proceeds" value={rupees(result.proceedsFromBuyback)} />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <Stat
              label="Gain on accepted"
              value={rupees(result.gainOnAccepted)}
              tone={result.gainOnAccepted >= 0 ? "good" : "bad"}
            />
            <Stat
              label="Better than selling by"
              value={rupees(result.advantageOverSelling)}
              tone={result.advantageOverSelling >= 0 ? "good" : "bad"}
            />
          </div>

          {result.sharesAccepted === 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-amber-500">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              At this acceptance ratio none of your shares would be bought back — small holdings
              can round down to nothing.
            </p>
          )}
          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            Acceptance ratios are only known after the issue closes; the figure here is your
            estimate. Retail holders under ₹2 lakh sit in a reserved category and usually see a far
            higher ratio than the general one. Buyback proceeds are tax-free in your hands — the
            company pays the tax.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Enter a holding, both prices and an acceptance ratio between 0 and 100.
        </p>
      )}
    </Card>
  );
}

// ─── Expense ratio drag ──────────────────────────────────────────────────────

function ExpenseRatioCalculator() {
  const [amount, setAmount] = useState("1000000");
  const [monthlySip, setMonthlySip] = useState("0");
  const [years, setYears] = useState("20");
  const [grossReturn, setGrossReturn] = useState("12");
  const [regularFee, setRegularFee] = useState("1.5");
  const [directFee, setDirectFee] = useState("0.5");

  const result = useMemo(
    () =>
      expenseRatioDrag({
        amount: parse(amount),
        monthlySip: parse(monthlySip),
        years: parse(years),
        grossReturnPercent: parse(grossReturn),
        expenseRatioPercent: parse(regularFee),
        comparisonExpenseRatioPercent: parse(directFee),
      }),
    [amount, monthlySip, years, grossReturn, regularFee, directFee]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Percent className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Expense Ratio Drag</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        The same fund, the same manager, the same portfolio — and about 1% a year between the
        regular and direct plan. Stated as a percentage it sounds like rounding.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Lump sum" value={amount} onChange={setAmount} suffix="₹" />
        <Field label="Monthly SIP" value={monthlySip} onChange={setMonthlySip} suffix="₹" />
        <Field label="Years" value={years} onChange={setYears} />
        <Field label="Gross return" value={grossReturn} onChange={setGrossReturn} suffix="%/yr" />
        <Field label="Regular plan TER" value={regularFee} onChange={setRegularFee} suffix="%" />
        <Field label="Direct plan TER" value={directFee} onChange={setDirectFee} suffix="%" />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border/40 bg-bg/40 px-3 py-2.5">
              <p className="text-[10px] text-muted">
                Regular · {result.plan.expenseRatioPercent}% TER
              </p>
              <p className="text-sm font-bold tabular-nums">{rupees(result.plan.finalValue)}</p>
              <p className="text-[10px] leading-3 text-muted/70">
                {result.plan.netAnnualPercent.toFixed(2)}% net
              </p>
            </div>
            <div className="rounded-lg border border-border/40 bg-bg/40 px-3 py-2.5">
              <p className="text-[10px] text-muted">
                Direct · {result.comparison.expenseRatioPercent}% TER
              </p>
              <p className="text-sm font-bold tabular-nums text-success">
                {rupees(result.comparison.finalValue)}
              </p>
              <p className="text-[10px] leading-3 text-muted/70">
                {result.comparison.netAnnualPercent.toFixed(2)}% net
              </p>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Total invested" value={rupees(result.plan.totalInvested)} />
            <Stat
              label="Direct plan leaves you"
              value={`+${rupees(result.difference)}`}
              tone="good"
            />
            <Stat
              label="That is"
              value={`${result.differencePercent.toFixed(1)}% more`}
              tone="good"
            />
          </div>

          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            A TER is charged on your whole balance every year, including the returns the earlier
            years&apos; fees would have earned — which is why the gap grows far faster than the
            headline percentage suggests. Switching a fund from regular to direct is a redemption
            and repurchase, so check exit load and capital gains before you do it.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Enter a lump sum or a monthly SIP, and a horizon of up to 100 years.
        </p>
      )}
    </Card>
  );
}

// ─── SWP ─────────────────────────────────────────────────────────────────────

function SwpCalculator() {
  const [corpus, setCorpus] = useState("10000000");
  const [withdrawal, setWithdrawal] = useState("60000");
  const [returnRate, setReturnRate] = useState("8");
  const [inflation, setInflation] = useState("6");

  const result = useMemo(
    () =>
      swpPlan({
        corpus: parse(corpus),
        monthlyWithdrawal: parse(withdrawal),
        returnPercent: parse(returnRate),
        inflationPercent: parse(inflation),
      }),
    [corpus, withdrawal, returnRate, inflation]
  );

  const overdrawn =
    result !== null &&
    !result.sustainable &&
    result.sustainableMonthlyWithdrawal > 0 &&
    parse(withdrawal) > result.sustainableMonthlyWithdrawal;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">SWP — How Long It Lasts</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        Drawing a monthly income from a corpus. The first year always looks affordable; what
        decides the outcome is whether the return beats the rate your withdrawal has to rise at.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Corpus" value={corpus} onChange={setCorpus} suffix="₹" />
        <Field label="Monthly withdrawal" value={withdrawal} onChange={setWithdrawal} suffix="₹" />
        <Field label="Return" value={returnRate} onChange={setReturnRate} suffix="%/yr" />
        <Field label="Inflation" value={inflation} onChange={setInflation} suffix="%/yr" />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              label="Lasts"
              value={
                result.sustainable
                  ? "Indefinitely"
                  : `${result.yearsLasted?.toFixed(1) ?? "—"} yrs`
              }
              tone={result.sustainable ? "good" : "bad"}
            />
            <Stat label="Total withdrawn" value={rupees(result.totalWithdrawn)} />
            <Stat
              label={result.sustainable ? "Corpus after 100 yrs" : "Left at the end"}
              value={rupees(result.finalBalance)}
              tone={result.sustainable ? "good" : "bad"}
            />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <Stat
              label="Safe monthly draw"
              value={
                result.sustainableMonthlyWithdrawal > 0
                  ? rupees(result.sustainableMonthlyWithdrawal)
                  : "None"
              }
              tone={result.sustainableMonthlyWithdrawal > 0 ? "good" : "bad"}
            />
            <Stat label="Final draw" value={rupees(result.finalMonthlyWithdrawal)} />
          </div>

          {overdrawn && (
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-amber-500">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              You are drawing more than the corpus earns in real terms. Holding the withdrawal at{" "}
              {rupees(result.sustainableMonthlyWithdrawal)} would make it last indefinitely.
            </p>
          )}
          {result.sustainableMonthlyWithdrawal === 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-amber-500">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              The return does not beat inflation, so no withdrawal lasts forever — every rupee
              drawn comes out of capital.
            </p>
          )}

          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            The withdrawal is taken at the start of each month and indexed once a year, so its
            buying power holds. Each redemption is a partial sale with its own capital gains —
            long-term equity gains above ₹1.25 lakh a year are taxed at 12.5%.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Enter a corpus and a monthly withdrawal.
        </p>
      )}
    </Card>
  );
}

// ─── Partial exit ────────────────────────────────────────────────────────────

function PartialExitCalculator() {
  const [quantity, setQuantity] = useState("100");
  const [buyPrice, setBuyPrice] = useState("1000");
  const [sellQuantity, setSellQuantity] = useState("50");
  const [sellPrice, setSellPrice] = useState("1500");

  const result = useMemo(
    () =>
      partialExit({
        quantity: parse(quantity),
        buyPrice: parse(buyPrice),
        sellQuantity: parse(sellQuantity),
        sellPrice: parse(sellPrice),
      }),
    [quantity, buyPrice, sellQuantity, sellPrice]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Scissors className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Partial Exit</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        Book part of a position and the cash comes back against the original outlay — so the shares
        you still hold have cost you less than you paid for them.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Shares held" value={quantity} onChange={setQuantity} />
        <Field label="Your avg price" value={buyPrice} onChange={setBuyPrice} suffix="₹" />
        <Field label="Shares to sell" value={sellQuantity} onChange={setSellQuantity} />
        <Field label="Sell price" value={sellPrice} onChange={setSellPrice} suffix="₹" />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Proceeds" value={rupees(result.proceeds)} />
            <Stat
              label="Realised gain"
              value={rupees(result.realisedGain)}
              tone={result.realisedGain >= 0 ? "good" : "bad"}
            />
            <Stat
              label="Still holding"
              value={`${result.remainingQuantity.toLocaleString("en-IN")} sh`}
            />
            <Stat
              label="Now cost you"
              value={rupees(result.effectiveCostPerShare)}
              tone={result.isFreePosition ? "good" : undefined}
            />
          </div>

          {result.isFreePosition ? (
            <p className="mt-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-[11px] leading-4 text-success">
              This sale returns your whole outlay. The remaining{" "}
              {result.remainingQuantity.toLocaleString("en-IN")} shares carry no net cost, and{" "}
              {rupees(Math.abs(result.netCostOfRemainder))} of profit is already banked on top.
            </p>
          ) : result.sharesToSellForFree !== null ? (
            <p className="mt-2 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] leading-4 text-muted">
              Sell {result.sharesToSellForFree.toLocaleString("en-IN")} shares at{" "}
              {rupees(parse(sellPrice))} and the remaining{" "}
              {(parse(quantity) - result.sharesToSellForFree).toLocaleString("en-IN")} carry no net
              cost. Still outstanding on the rest: {rupees(result.netCostOfRemainder)}.
            </p>
          ) : (
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-amber-500">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              At this price no quantity you hold can return the original outlay — the position is
              under water.
            </p>
          )}

          <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-muted/60">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            &ldquo;Free&rdquo; describes the cost basis, not the risk. Those shares still carry
            their full market value and it can still be lost — nothing is protected by having
            already been paid for. Brokerage, STT and capital gains are not counted here.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Enter a holding and a sale smaller than it — selling everything is a full exit, which the
          Capital Gains Tax card covers.
        </p>
      )}
    </Card>
  );
}

// ─── Trailing stop ───────────────────────────────────────────────────────────

function TrailingStopCalculator() {
  const [entryPrice, setEntryPrice] = useState("1000");
  const [trailPercent, setTrailPercent] = useState("10");
  const [highestPrice, setHighestPrice] = useState("1400");
  const [currentPrice, setCurrentPrice] = useState("1300");

  const result = useMemo(
    () =>
      trailingStop({
        entryPrice: parse(entryPrice),
        trailPercent: parse(trailPercent),
        highestPrice: parse(highestPrice),
        currentPrice: parse(currentPrice),
      }),
    [entryPrice, trailPercent, highestPrice, currentPrice]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <ArrowDownWideNarrow className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Trailing Stop-Loss</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        A stop that follows the peak up and never comes back down. It protects nothing until the
        price has risen further than the trail is wide.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Entry price" value={entryPrice} onChange={setEntryPrice} suffix="₹" />
        <Field label="Trail" value={trailPercent} onChange={setTrailPercent} suffix="%" />
        <Field label="Highest since entry" value={highestPrice} onChange={setHighestPrice} suffix="₹" />
        <Field label="Current price" value={currentPrice} onChange={setCurrentPrice} suffix="₹" />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="Stop sits at"
              value={rupees(result.stopPrice)}
              tone={result.isProfitLocked ? "good" : "bad"}
            />
            <Stat
              label="Room to stop"
              value={`${rupees(result.distanceToStop)} · ${result.distancePercent.toFixed(1)}%`}
              tone={result.alreadyTriggered ? "bad" : undefined}
            />
            <Stat
              label={result.isProfitLocked ? "Profit locked" : "Still at risk"}
              value={rupees(result.lockedInGain)}
              tone={result.isProfitLocked ? "good" : "bad"}
            />
            <Stat label="Given back from peak" value={rupees(result.giveBackFromPeak)} />
          </div>

          {result.alreadyTriggered && (
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-amber-500">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              The current price is already at or below the stop — this trade would have exited at{" "}
              {rupees(result.stopPrice)}.
            </p>
          )}

          {!result.isProfitLocked && (
            <p className="mt-2 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] leading-4 text-muted">
              Your stop only clears the entry price once the peak reaches{" "}
              {rupees(result.breakEvenPeak)} — a{" "}
              {((result.breakEvenPeak / parse(entryPrice) - 1) * 100).toFixed(1)}% rise, not{" "}
              {parse(trailPercent)}%. Until then the trade can still finish at a loss.
            </p>
          )}

          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            The trail is measured down from the peak, not up from your entry, which is why the rise
            needed to reach breakeven is always wider than the trail itself. The peak is taken as
            the higher of your entry and the high you enter, since the high since entry can never
            be below entry.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Enter an entry price and a trail between 0 and 100%.
        </p>
      )}
    </Card>
  );
}

// ─── Vertical spreads ────────────────────────────────────────────────────────

const SPREAD_TYPES: ReadonlyArray<{
  key: SpreadType;
  label: string;
  legs: string;
  view: string;
}> = [
  {
    key: "bull-call",
    label: "Bull Call",
    legs: "Buy the lower call, sell the higher",
    view: "pays if the underlying rises",
  },
  {
    key: "bear-call",
    label: "Bear Call",
    legs: "Sell the lower call, buy the higher",
    view: "pays if it falls, stays flat, or rises only slightly",
  },
  {
    key: "bear-put",
    label: "Bear Put",
    legs: "Buy the higher put, sell the lower",
    view: "pays if the underlying falls",
  },
  {
    key: "bull-put",
    label: "Bull Put",
    legs: "Sell the higher put, buy the lower",
    view: "pays if it rises, stays flat, or falls only slightly",
  },
];

function VerticalSpreadCalculator() {
  const [type, setType] = useState<SpreadType>("bull-call");
  const [lowerStrike, setLowerStrike] = useState("24000");
  const [upperStrike, setUpperStrike] = useState("24200");
  const [lowerPremium, setLowerPremium] = useState("150");
  const [upperPremium, setUpperPremium] = useState("70");
  const [lotSize, setLotSize] = useState("50");
  const [lots, setLots] = useState("1");

  const result = useMemo(
    () =>
      verticalSpread({
        type,
        lowerStrike: parse(lowerStrike),
        upperStrike: parse(upperStrike),
        lowerPremium: parse(lowerPremium),
        upperPremium: parse(upperPremium),
        lotSize: parse(lotSize),
        lots: parse(lots),
      }),
    [type, lowerStrike, upperStrike, lowerPremium, upperPremium, lotSize, lots]
  );

  const active = SPREAD_TYPES.find((entry) => entry.key === type)!;
  const isCall = type === "bull-call" || type === "bear-call";

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <ArrowUpDown className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Vertical Spreads</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        Two options, same expiry, different strikes. Both the best case and the worst are fixed the
        moment you open it — which is the whole point, and also the catch.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg border border-border/40 bg-bg/40 p-1 sm:grid-cols-4">
        {SPREAD_TYPES.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setType(entry.key)}
            aria-pressed={type === entry.key}
            className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition ${
              type === entry.key ? "bg-accent text-bg" : "text-muted hover:text-fg"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] leading-4 text-muted/70">
        {active.legs} — {active.view}.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Lower strike" value={lowerStrike} onChange={setLowerStrike} />
        <Field label="Upper strike" value={upperStrike} onChange={setUpperStrike} />
        <Field label="Lot size" value={lotSize} onChange={setLotSize} />
        <Field
          label={`Lower ${isCall ? "CE" : "PE"} premium`}
          value={lowerPremium}
          onChange={setLowerPremium}
          suffix="₹"
        />
        <Field
          label={`Upper ${isCall ? "CE" : "PE"} premium`}
          value={upperPremium}
          onChange={setUpperPremium}
          suffix="₹"
        />
        <Field label="Lots" value={lots} onChange={setLots} />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label={result.isDebit ? "You pay" : "You receive"}
              value={rupees(Math.abs(result.netPremium))}
              tone={result.isDebit ? "bad" : "good"}
            />
            <Stat label="Max profit" value={rupees(result.maxProfit)} tone="good" />
            <Stat label="Max loss" value={rupees(result.maxLoss)} tone="bad" />
            <Stat
              label="Risk / reward"
              value={`${result.riskRewardRatio.toFixed(2)} : 1`}
              tone={result.riskRewardRatio >= 1 ? "good" : "bad"}
            />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Breakeven" value={rupees(result.breakEven)} />
            <Stat label="Strike width" value={rupees(result.strikeWidth)} />
            <Stat label="Capital at risk" value={rupees(result.capitalAtRisk)} tone="bad" />
          </div>

          {!result.isDebit && (
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-amber-500">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              The {rupees(Math.abs(result.netPremium) * parse(lotSize) * parse(lots))} arrives up
              front, but {rupees(result.maxLoss)} is at risk behind it. Credit spreads win often
              and lose big — the frequency is not the edge.
            </p>
          )}

          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            Max profit and max loss always add up to the strike width times the quantity — they are
            two slices of one fixed amount, which is why a bigger credit always buys a smaller
            cushion. Figures are at expiry and exclude brokerage, STT and the margin the exchange
            actually blocks.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Enter an upper strike above the lower one, and premiums whose difference falls inside the
          strike width — a net premium wider than the spread itself means the two prices belong to
          different strikes.
        </p>
      )}
    </Card>
  );
}

// ─── Earnings yield vs bond ──────────────────────────────────────────────────

function EarningsYieldCalculator() {
  const [price, setPrice] = useState("1000");
  const [eps, setEps] = useState("50");
  const [bondYield, setBondYield] = useState("7");

  const result = useMemo(
    () =>
      earningsYieldGap({
        price: parse(price),
        eps: parse(eps),
        bondYieldPercent: parse(bondYield),
      }),
    [price, eps, bondYield]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <GitCompare className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Earnings Yield vs G-Sec</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        What a rupee of share price buys in earnings, against what the same rupee buys risk-free in
        a government bond. India&apos;s 10-year has paid 6–7.5% for years, which is a high bar.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Share price" value={price} onChange={setPrice} suffix="₹" />
        <Field label="EPS" value={eps} onChange={setEps} suffix="₹" />
        <Field label="10Y G-Sec yield" value={bondYield} onChange={setBondYield} suffix="%" />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="Earnings yield"
              value={`${result.earningsYieldPercent.toFixed(2)}%`}
              tone={result.beatsBond ? "good" : "bad"}
            />
            <Stat label="P/E" value={result.peRatio.toFixed(2)} />
            <Stat
              label="Gap vs bond"
              value={`${result.gapPercent > 0 ? "+" : ""}${result.gapPercent.toFixed(2)} pts`}
              tone={result.beatsBond ? "good" : "bad"}
            />
            <Stat label="P/E at bond parity" value={result.peAtBondParity.toFixed(2)} />
          </div>

          {result.beatsBond ? (
            <p className="mt-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-[11px] leading-4 text-success">
              On today&apos;s earnings this yields more than the bond — before any growth at all.
            </p>
          ) : (
            <p className="mt-2 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] leading-4 text-muted">
              The bond wins on today&apos;s earnings. This has to grow to justify itself: the
              multiple would need to fall to {result.peAtBondParity.toFixed(1)} for the two to be
              level as things stand.
            </p>
          )}

          <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-muted/60">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            An earnings yield is not income. The bond pays its coupon contractually; these earnings
            belong to the company, which may reinvest them, waste them, or never pay them out. The
            comparison sets a hurdle, not a forecast.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Enter a price and a positive EPS — a loss-making company has no earnings yield to compare.
        </p>
      )}
    </Card>
  );
}

// ─── Reverse DCF ─────────────────────────────────────────────────────────────

function ImpliedGrowthCalculator() {
  const [price, setPrice] = useState("2853");
  const [cashflow, setCashflow] = useState("100");
  const [discount, setDiscount] = useState("12");
  const [terminal, setTerminal] = useState("4");
  const [years, setYears] = useState("10");

  const result = useMemo(
    () =>
      impliedGrowth({
        price: parse(price),
        cashflow: parse(cashflow),
        discountPercent: parse(discount),
        terminalGrowthPercent: parse(terminal),
        years: parse(years),
      }),
    [price, cashflow, discount, terminal, years]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Telescope className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Reverse DCF — What&apos;s Priced In</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        Instead of guessing a growth rate and calling the output a fair value, this takes the price
        the market is charging and solves for the growth it already assumes.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Share price" value={price} onChange={setPrice} suffix="₹" />
        <Field label="Cashflow / EPS" value={cashflow} onChange={setCashflow} suffix="₹" />
        <Field label="Forecast years" value={years} onChange={setYears} />
        <Field label="Discount rate" value={discount} onChange={setDiscount} suffix="%" />
        <Field label="Terminal growth" value={terminal} onChange={setTerminal} suffix="%" />
      </div>

      {result ? (
        <>
          <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-3">
            <p className="text-[10px] text-muted">At this price you are paying for</p>
            <p className="text-xl font-bold tabular-nums text-accent">
              {result.impliedGrowthPercent.toFixed(2)}% a year
            </p>
            <p className="mt-0.5 text-[10px] leading-4 text-muted/70">
              for {parse(years)} years, then {parse(terminal)}% forever. The question is whether
              this company has ever done that.
            </p>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="From the forecast" value={rupees(result.explicitValue)} />
            <Stat label="From the perpetuity" value={rupees(result.terminalValue)} />
            <Stat
              label="Terminal share"
              value={`${result.terminalSharePercent.toFixed(1)}%`}
              tone={result.terminalSharePercent > 70 ? "bad" : undefined}
            />
          </div>

          {result.terminalSharePercent > 70 && (
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-amber-500">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {result.terminalSharePercent.toFixed(0)}% of this valuation rests on the perpetuity —
              an assumption about the far future, not on anything in the forecast. Treat the
              precision of the growth figure accordingly.
            </p>
          )}

          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            Compare the implied rate against the company&apos;s actual revenue and profit growth
            over the last five and ten years. If the market is pricing 20% and the business has
            compounded at 11%, that gap is the thesis you are taking on — in one direction or the
            other.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Enter a price this model can reach, a positive cashflow, and a terminal growth rate below
          the discount rate — at or above it the perpetuity is worth infinity.
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

// ─── FD vs Equity ────────────────────────────────────────────────────────────

const SLABS = [0, 5, 20, 30];

function FdVsEquityCalculator() {
  const [amount, setAmount] = useState("1000000");
  const [years, setYears] = useState("5");
  const [fdRate, setFdRate] = useState("7");
  const [equityRate, setEquityRate] = useState("12");
  const [slab, setSlab] = useState("30");

  const result = useMemo(
    () =>
      fdVsEquity({
        amount: parse(amount),
        years: parse(years),
        fdRatePercent: parse(fdRate),
        equityReturnPercent: parse(equityRate),
        slabPercent: parse(slab),
      }),
    [amount, years, fdRate, equityRate, slab]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Vault className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">FD vs Equity (after tax)</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        The comparison is nearly always published before tax, which flatters the deposit. FD
        interest is taxed every year at your slab; equity is taxed once on sale, at a lower rate,
        after an annual exemption.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Amount" value={amount} onChange={setAmount} suffix="₹" />
        <Field label="Years" value={years} onChange={setYears} />
        <Field label="FD rate" value={fdRate} onChange={setFdRate} suffix="%/yr" />
        <Field label="Equity return" value={equityRate} onChange={setEquityRate} suffix="%/yr" />
      </div>

      <div className="mt-2">
        <p className="mb-1 text-[11px] font-medium text-muted">Your income-tax slab</p>
        <div className="flex flex-wrap gap-1.5">
          {SLABS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={parse(slab) === option}
              onClick={() => setSlab(String(option))}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                parse(slab) === option
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-border/50 bg-bg/40 text-muted hover:border-accent/30"
              }`}
            >
              {option}%
            </button>
          ))}
        </div>
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border/40 bg-bg/40 px-3 py-2.5">
              <p className="text-[10px] text-muted">Fixed deposit</p>
              <p
                className={`text-sm font-bold tabular-nums ${
                  result.equityWins ? "" : "text-success"
                }`}
              >
                {rupees(result.fd.postTaxValue)}
              </p>
              <p className="text-[10px] leading-3 text-muted/70">
                {result.fd.effectiveAnnualPercent.toFixed(2)}% after tax
              </p>
            </div>
            <div className="rounded-lg border border-border/40 bg-bg/40 px-3 py-2.5">
              <p className="text-[10px] text-muted">Equity</p>
              <p
                className={`text-sm font-bold tabular-nums ${
                  result.equityWins ? "text-success" : ""
                }`}
              >
                {rupees(result.equity.postTaxValue)}
              </p>
              <p className="text-[10px] leading-3 text-muted/70">
                {result.equity.effectiveAnnualPercent.toFixed(2)}% after tax
              </p>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="FD tax paid" value={rupees(result.fd.taxPaid)} tone="bad" />
            <Stat label="Equity tax paid" value={rupees(result.equity.taxPaid)} tone="bad" />
            <Stat
              label={result.equityWins ? "Equity ahead by" : "FD ahead by"}
              value={rupees(Math.abs(result.difference))}
              tone={result.equityWins ? "good" : "bad"}
            />
          </div>

          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            The FD compounds at {result.fd.effectiveAnnualPercent.toFixed(2)}%, not{" "}
            {parse(fdRate)}% — interest is assessable in the year it accrues, so tax is taken
            before it can compound. Equity taxed at {result.appliedEquityRatePercent}%
            {result.appliedExemption > 0
              ? ` after a ₹${result.appliedExemption.toLocaleString("en-IN")} exemption`
              : " with no exemption"}
            , plus cess.
          </p>
          {!result.longTerm && (
            <p className="mt-1 flex items-start gap-1.5 text-[10px] leading-4 text-amber-500">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              Under a year, so the short-term rate applies and the long-term exemption does not.
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Enter an amount and a horizon of up to 100 years.
        </p>
      )}
    </Card>
  );
}

// ─── NPS ─────────────────────────────────────────────────────────────────────

function NpsCalculator() {
  const [age, setAge] = useState("30");
  const [monthly, setMonthly] = useState("10000");
  const [rate, setRate] = useState("10");
  const [annuityShare, setAnnuityShare] = useState("40");
  const [annuityRate, setAnnuityRate] = useState("6");
  const [slab, setSlab] = useState("30");

  const result = useMemo(
    () =>
      npsProjection({
        currentAge: parse(age),
        monthlyContribution: parse(monthly),
        expectedReturnPercent: parse(rate),
        annuitySharePercent: parse(annuityShare),
        annuityRatePercent: parse(annuityRate),
        slabPercent: parse(slab),
      }),
    [age, monthly, rate, annuityShare, annuityRate, slab]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">NPS Projection</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        Not a generic retirement pot: at least 40% of the corpus must buy an annuity and cannot be
        withdrawn, and the pension it pays is taxable income.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Your age" value={age} onChange={setAge} />
        <Field label="Monthly contribution" value={monthly} onChange={setMonthly} suffix="₹" />
        <Field label="Expected return" value={rate} onChange={setRate} suffix="%/yr" />
        <Field label="Annuity share" value={annuityShare} onChange={setAnnuityShare} suffix="%" />
        <Field label="Annuity rate" value={annuityRate} onChange={setAnnuityRate} suffix="%/yr" />
        <Field label="Your slab" value={slab} onChange={setSlab} suffix="%" />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              label="Corpus at 60"
              value={rupees(result.corpusAtRetirement)}
              tone="good"
            />
            <Stat label="You'd put in" value={rupees(result.totalContributed)} />
            <Stat label="Growth does" value={rupees(result.wealthGained)} />
          </div>

          {/* The split is the whole point — a generic calculator shows only the
              corpus and lets the reader assume all of it is theirs to spend. */}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border/40 bg-bg/40 px-3 py-2.5">
              <p className="text-[10px] text-muted">Lump sum, tax-free</p>
              <p className="text-sm font-bold tabular-nums text-success">
                {rupees(result.lumpSum)}
              </p>
              <p className="text-[10px] leading-3 text-muted/70">yours to withdraw</p>
            </div>
            <div className="rounded-lg border border-border/40 bg-bg/40 px-3 py-2.5">
              <p className="text-[10px] text-muted">Locked into annuity</p>
              <p className="text-sm font-bold tabular-nums text-amber-500">
                {rupees(result.annuityCorpus)}
              </p>
              <p className="text-[10px] leading-3 text-muted/70">
                {result.appliedAnnuitySharePercent}% — cannot be withdrawn
              </p>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <Stat label="Pension / month" value={rupees(result.monthlyPensionGross)} />
            <Stat
              label="After your slab"
              value={rupees(result.monthlyPensionPostTax)}
              tone="bad"
            />
          </div>

          {result.annuityShareRaised && (
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-amber-500">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              Raised to the statutory 40% minimum — NPS does not permit annuitising less.
            </p>
          )}
          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            Contributions run to 60, the scheme&apos;s vesting age. The pension depends on annuity
            rates available then, not on the return that built the corpus — and unlike the lump
            sum, it is taxed as income every year it arrives.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Enter an age under 60 — past vesting age there is no accumulation phase left to project.
        </p>
      )}
    </Card>
  );
}

// ─── Trading expectancy & Kelly ──────────────────────────────────────────────

function ExpectancyCalculator() {
  const [winRate, setWinRate] = useState("40");
  const [avgWin, setAvgWin] = useState("3000");
  const [avgLoss, setAvgLoss] = useState("1000");
  const [tradesPerYear, setTradesPerYear] = useState("200");
  const [capital, setCapital] = useState("500000");

  const edge = useMemo(
    () =>
      tradingExpectancy({
        winRatePercent: parse(winRate),
        averageWin: parse(avgWin),
        averageLoss: parse(avgLoss),
        tradesPerYear: tradesPerYear.trim() === "" ? undefined : parse(tradesPerYear),
      }),
    [winRate, avgWin, avgLoss, tradesPerYear]
  );
  const stake = useMemo(
    () =>
      kellyStake({
        winRatePercent: parse(winRate),
        averageWin: parse(avgWin),
        averageLoss: parse(avgLoss),
        capital: capital.trim() === "" ? undefined : parse(capital),
      }),
    [winRate, avgWin, avgLoss, capital]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Dices className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">System Edge &amp; Bet Size</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        Every other tool here prices one trade. This prices the system — and no entry, stop or
        position size rescues a negative edge.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Win rate" value={winRate} onChange={setWinRate} suffix="%" />
        <Field label="Average win" value={avgWin} onChange={setAvgWin} suffix="₹" />
        <Field label="Average loss" value={avgLoss} onChange={setAvgLoss} suffix="₹" />
        <Field label="Trades / year" value={tradesPerYear} onChange={setTradesPerYear} />
        <Field label="Capital" value={capital} onChange={setCapital} suffix="₹" />
      </div>

      {edge ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="Per trade"
              value={rupees(edge.perTrade)}
              tone={edge.profitable ? "good" : "bad"}
            />
            <Stat label="In R" value={`${edge.perTradeR >= 0 ? "+" : ""}${edge.perTradeR.toFixed(2)}R`} />
            <Stat
              label="Profit factor"
              value={edge.profitFactor >= 999 ? "∞" : edge.profitFactor.toFixed(2)}
              tone={edge.profitFactor > 1 ? "good" : "bad"}
            />
            <Stat
              label="Per year"
              value={edge.annualExpectancy === null ? "—" : rupees(edge.annualExpectancy)}
              tone={edge.profitable ? "good" : "bad"}
            />
          </div>

          {/* The figure most worth reading — a payoff ratio sets the bar the
              win rate has to clear, and "I win more than I lose" says nothing
              until you know where that bar is. */}
          <div className="mt-2 rounded-xl border border-border/40 bg-bg/30 px-3 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-[11px] text-muted">
                At {edge.rewardRiskRatio.toFixed(2)}:1, breakeven needs
              </span>
              <span className="text-sm font-bold tabular-nums">
                {edge.breakevenWinRatePercent.toFixed(1)}% wins
              </span>
            </div>
            <p
              className={`mt-1 text-[11px] leading-4 ${
                edge.edgePercentagePoints > 0 ? "text-success" : "text-danger"
              }`}
            >
              You win {parse(winRate)}% —{" "}
              {edge.edgePercentagePoints > 0
                ? `${edge.edgePercentagePoints.toFixed(1)} points above the bar.`
                : `${Math.abs(edge.edgePercentagePoints).toFixed(1)} points below it, so this loses money over time.`}
            </p>
          </div>

          {stake && (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat
                label="Half Kelly (use this)"
                value={`${stake.halfKellyPercent.toFixed(1)}%`}
                tone={stake.noEdge ? "bad" : "good"}
              />
              <Stat label="Full Kelly" value={`${stake.fullKellyPercent.toFixed(1)}%`} />
              <Stat
                label="Risk per trade"
                value={stake.halfKellyAmount === null ? "—" : rupees(stake.halfKellyAmount)}
              />
            </div>
          )}

          {stake?.noEdge ? (
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-danger">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              No edge, so the correct stake is nothing. There is no bet size that makes a losing
              system profitable — scaling down only loses more slowly.
            </p>
          ) : (
            <p className="mt-2 text-[10px] leading-4 text-muted/60">
              Half Kelly is the number to use. Full Kelly is growth-optimal only if these
              probabilities are exact and never drift, and its drawdowns are severe enough that
              most people abandon the system before the maths pays off.
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Win rate must be 0–100, and both averages positive.
        </p>
      )}
    </Card>
  );
}

// ─── Gold vs Equity ──────────────────────────────────────────────────────────

function GoldVsEquityCalculator() {
  const [amount, setAmount] = useState("1000000");
  const [years, setYears] = useState("5");
  const [goldRate, setGoldRate] = useState("10");
  const [equityRate, setEquityRate] = useState("12");

  const result = useMemo(
    () =>
      goldVsEquity({
        amount: parse(amount),
        years: parse(years),
        goldReturnPercent: parse(goldRate),
        equityReturnPercent: parse(equityRate),
      }),
    [amount, years, goldRate, equityRate]
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Gem className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Gold vs Equity (after tax)</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        Gold lost indexation in July 2024 and never had equity&apos;s ₹1.25L exemption — so at
        equal returns, equity wins on tax alone.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Amount" value={amount} onChange={setAmount} suffix="₹" />
        <Field label="Years" value={years} onChange={setYears} />
        <Field label="Gold return" value={goldRate} onChange={setGoldRate} suffix="%/yr" />
        <Field label="Equity return" value={equityRate} onChange={setEquityRate} suffix="%/yr" />
      </div>

      {result ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border/40 bg-bg/40 px-3 py-2.5">
              <p className="text-[10px] text-muted">Gold</p>
              <p
                className={`text-sm font-bold tabular-nums ${
                  result.equityWins ? "" : "text-success"
                }`}
              >
                {rupees(result.gold.postTaxValue)}
              </p>
              <p className="text-[10px] leading-3 text-muted/70">
                {result.gold.effectiveAnnualPercent.toFixed(2)}% after tax
              </p>
            </div>
            <div className="rounded-lg border border-border/40 bg-bg/40 px-3 py-2.5">
              <p className="text-[10px] text-muted">Equity</p>
              <p
                className={`text-sm font-bold tabular-nums ${
                  result.equityWins ? "text-success" : ""
                }`}
              >
                {rupees(result.equity.postTaxValue)}
              </p>
              <p className="text-[10px] leading-3 text-muted/70">
                {result.equity.effectiveAnnualPercent.toFixed(2)}% after tax
              </p>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Gold tax" value={rupees(result.gold.taxPaid)} tone="bad" />
            <Stat label="Equity tax" value={rupees(result.equity.taxPaid)} tone="bad" />
            <Stat
              label={result.equityWins ? "Equity ahead by" : "Gold ahead by"}
              value={rupees(Math.abs(result.difference))}
              tone={result.equityWins ? "good" : "bad"}
            />
          </div>

          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            Gold is taxed from the first rupee of gain; equity shelters the first ₹1.25L each year.
            Neither is indexed for inflation any more.
          </p>
          {(!result.goldLongTerm || !result.equityLongTerm) && (
            <p className="mt-1 flex items-start gap-1.5 text-[10px] leading-4 text-amber-500">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              Short holding period — the higher short-term rate applies
              {!result.equityLongTerm ? " and equity's exemption does not" : ""}.
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Enter an amount and a horizon of up to 100 years.
        </p>
      )}
    </Card>
  );
}

// ─── Property return ─────────────────────────────────────────────────────────

function PropertyReturnCalculator() {
  const [price, setPrice] = useState("10000000");
  const [years, setYears] = useState("10");
  const [appreciation, setAppreciation] = useState("8");
  const [rentalYield, setRentalYield] = useState("3");
  const [stampDuty, setStampDuty] = useState("6");
  const [maintenance, setMaintenance] = useState("0.5");
  const [slab, setSlab] = useState("30");

  const result = useMemo(
    () =>
      propertyReturn({
        propertyPrice: parse(price),
        years: parse(years),
        appreciationPercent: parse(appreciation),
        rentalYieldPercent: parse(rentalYield),
        stampDutyPercent: parse(stampDuty),
        maintenancePercent: parse(maintenance),
        slabPercent: parse(slab),
      }),
    [price, years, appreciation, rentalYield, stampDuty, maintenance, slab]
  );

  const drag =
    result === null ? null : result.headlineAnnualPercent - result.effectiveAnnualPercent;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Home className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Property Return (real)</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        What a flat actually returns once stamp duty, maintenance and tax are counted — the costs
        that never appear in &ldquo;property doubled in ten years&rdquo;.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Price" value={price} onChange={setPrice} suffix="₹" />
        <Field label="Years" value={years} onChange={setYears} />
        <Field label="Appreciation" value={appreciation} onChange={setAppreciation} suffix="%/yr" />
        <Field label="Rental yield" value={rentalYield} onChange={setRentalYield} suffix="%/yr" />
        <Field label="Stamp duty" value={stampDuty} onChange={setStampDuty} suffix="%" />
        <Field label="Maintenance" value={maintenance} onChange={setMaintenance} suffix="%/yr" />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Field label="Your slab (on rent)" value={slab} onChange={setSlab} suffix="%" />
      </div>

      {result ? (
        <>
          {/* Headline against effective is the entire point of this card. */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              label="Headline appreciation"
              value={`${result.headlineAnnualPercent.toFixed(2)}%`}
            />
            <Stat
              label="Actually returned"
              value={`${result.effectiveAnnualPercent.toFixed(2)}%`}
              tone={result.effectiveAnnualPercent >= 0 ? "good" : "bad"}
            />
            <Stat
              label="Costs cost you"
              value={drag === null ? "—" : `${drag.toFixed(2)} pts/yr`}
              tone="bad"
            />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Total invested" value={rupees(result.totalInvested)} />
            <Stat label="Sale value" value={rupees(result.saleValue)} />
            <Stat
              label="Net rent"
              value={rupees(result.netRentalIncome)}
              tone={result.netRentalIncome >= 0 ? "good" : "bad"}
            />
            <Stat label="Capital gains tax" value={rupees(result.capitalGainsTax)} tone="bad" />
          </div>

          {result.netRentalIncome < 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-amber-500">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              Maintenance exceeds the rent after tax — the flat costs money to hold, before any
              appreciation.
            </p>
          )}
          <p className="mt-2 text-[10px] leading-4 text-muted/60">
            Total invested includes stamp duty, which also counts toward the cost of acquisition
            and so reduces the taxable gain. Rent is taxed at your slab as ordinary income.
            Long-term gains are 12.5% flat — indexation ended in July 2024.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
          Enter a price and a horizon of up to 100 years.
        </p>
      )}
    </Card>
  );
}

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
    key: "expectancy",
    title: "System Edge & Bet Size",
    group: "trading",
    keywords: "expectancy edge win rate profit factor kelly criterion bet size system backtest r multiple breakeven win rate",
    Component: ExpectancyCalculator,
  },
  {
    key: "partial-exit",
    title: "Partial Exit",
    group: "trading",
    keywords:
      "partial exit book profit sell half free position house money cost basis remainder scale out trim recover capital effective cost",
    Component: PartialExitCalculator,
  },
  {
    key: "trailing-stop",
    title: "Trailing Stop-Loss",
    group: "trading",
    keywords:
      "trailing stop loss trail percent peak high water mark lock profit breakeven give back exit ratchet sl",
    Component: TrailingStopCalculator,
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
  {
    key: "bonus-split",
    title: "Bonus & Split",
    group: "equity",
    keywords:
      "bonus issue stock split face value adjusted price ratio free shares record date ex date average cost adjustment 1:1 2:1 corporate action",
    Component: BonusSplitCalculator,
  },
  {
    key: "rights-issue",
    title: "Rights Issue",
    group: "equity",
    keywords:
      "rights issue entitlement subscribe renounce terp theoretical ex rights price dilution discount corporate action rights entitlement re",
    Component: RightsIssueCalculator,
  },
  {
    key: "earnings-yield",
    title: "Earnings Yield vs G-Sec",
    group: "equity",
    keywords:
      "earnings yield bond gsec g-sec 10 year risk free fed model equity risk premium pe ratio expensive cheap valuation hurdle",
    Component: EarningsYieldCalculator,
  },
  {
    key: "reverse-dcf",
    title: "Reverse DCF",
    group: "equity",
    keywords:
      "reverse dcf implied growth priced in discounted cash flow intrinsic value terminal value perpetuity what the market expects valuation fair value",
    Component: ImpliedGrowthCalculator,
  },
  {
    key: "buyback",
    title: "Buyback Tender",
    group: "equity",
    keywords:
      "buyback tender offer acceptance ratio premium retail category record date share repurchase corporate action",
    Component: BuybackCalculator,
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
    key: "vertical-spread",
    title: "Vertical Spreads",
    group: "fno",
    keywords:
      "vertical spread bull call bear call bull put bear put debit credit spread max profit max loss breakeven risk reward strike width two leg strategy",
    Component: VerticalSpreadCalculator,
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
    key: "fd-vs-equity",
    title: "FD vs Equity (after tax)",
    group: "planning",
    keywords: "fd fixed deposit vs equity after tax post tax slab safe versus risky bank interest comparison",
    Component: FdVsEquityCalculator,
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
    key: "gold-vs-equity",
    title: "Gold vs Equity (after tax)",
    group: "planning",
    keywords: "gold vs equity sovereign bond etf digital gold after tax indexation comparison safe haven",
    Component: GoldVsEquityCalculator,
  },
  {
    key: "property-return",
    title: "Property Return (real)",
    group: "planning",
    keywords: "property real estate flat house rental yield stamp duty maintenance return after tax buy vs rent",
    Component: PropertyReturnCalculator,
  },
  {
    key: "nps",
    title: "NPS Projection",
    group: "planning",
    keywords: "nps national pension system annuity corpus tier 1 retirement government pension vesting",
    Component: NpsCalculator,
  },
  {
    key: "expense-ratio",
    title: "Expense Ratio Drag",
    group: "planning",
    keywords:
      "expense ratio ter direct regular plan mutual fund commission distributor cost fee drag switch savings amc charges",
    Component: ExpenseRatioCalculator,
  },
  {
    key: "swp",
    title: "SWP — How Long It Lasts",
    group: "planning",
    keywords:
      "swp systematic withdrawal plan monthly income corpus retirement drawdown safe withdrawal rate depletion pension how long will my money last",
    Component: SwpCalculator,
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
  const searchRef = useRef<HTMLInputElement>(null);
  const active = GROUPS.find((entry) => entry.key === group)!;
  const searching = query.trim().length > 0;

  // "/" jumps to the search box, the convention every tool with a lot of
  // things in it has settled on. Ignored while a field already has focus, so
  // it never swallows a slash someone is genuinely typing — including into
  // the search box itself.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
          ref={searchRef}
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
