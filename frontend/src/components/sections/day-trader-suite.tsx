"use client";

import React, { useMemo, useState } from "react";
import {
  Zap,
  Target,
  ShieldAlert,
  Clock,
  TrendingUp,
  Sliders,
  Sparkles,
  BarChart2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Calculator,
  ShieldCheck,
  Radar,
  ArrowRight,
  Layers,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  computeDayTradePlan,
  calculatePositionSize,
  validateTradeRisk,
  detectScannerSetups,
} from "@/server/domain/day-trader";
import { cn } from "@/shared/utils";
import { BeginnerHelpModal } from "@/components/modals/beginner-help-modal";

interface DayTraderSuiteProps {
  symbol: string;
  cmp?: number;
  history?: Array<{ date: string; open?: number; high?: number; low?: number; close?: number }>;
  intraday?: Array<{ date: string; open?: number; high?: number; low?: number; close?: number }>;
}

export function DayTraderSuite({ symbol, cmp = 1000, history = [], intraday = [] }: DayTraderSuiteProps) {
  const [activeTab, setActiveTab] = useState<"setup" | "budget" | "risk">("setup");
  const [stopMode, setStopMode] = useState<"or-mid" | "or-low" | "atr">("or-mid");
  const [targetMultiplier, setTargetMultiplier] = useState<"1R" | "1.5R" | "2R" | "3R">("2R");

  // Budget state (trader-budget/size.py inputs)
  const [budgetInput, setBudgetInput] = useState<number>(50000);
  const [riskPctInput, setRiskPctInput] = useState<number>(1.0);
  const [positionCapPctInput, setPositionCapPctInput] = useState<number>(30.0);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);

  const plan = useMemo(() => {
    return computeDayTradePlan(symbol, cmp, history, intraday);
  }, [symbol, cmp, history, intraday]);

  // Dynamic Stop Loss based on user toggle
  const activeStop = useMemo(() => {
    if (stopMode === "or-low") {
      const price = plan.openingRange.low;
      const risk = Number((plan.entryPrice - price).toFixed(2));
      return { price, risk, pct: Number(((risk / plan.entryPrice) * 100).toFixed(2)) };
    }
    if (stopMode === "atr") {
      const risk = Number((plan.entryPrice * 0.015).toFixed(2));
      const price = Number((plan.entryPrice - risk).toFixed(2));
      return { price, risk, pct: 1.5 };
    }
    return {
      price: plan.stopLoss.price,
      risk: plan.stopLoss.riskPerShare,
      pct: plan.stopLoss.riskPct,
    };
  }, [stopMode, plan]);

  // Target Price based on user R multiplier
  const activeTargetPrice = useMemo(() => {
    const mult = targetMultiplier === "1R" ? 1.0 : targetMultiplier === "1.5R" ? 1.5 : targetMultiplier === "2R" ? 2.0 : 3.0;
    return Number((plan.entryPrice + activeStop.risk * mult).toFixed(2));
  }, [targetMultiplier, plan.entryPrice, activeStop.risk]);

  const potentialRewardPct = Number((((activeTargetPrice - plan.entryPrice) / plan.entryPrice) * 100).toFixed(2));

  // Position sizing computation (trader-budget/size.py)
  const positionSize = useMemo(() => {
    return calculatePositionSize(
      plan.entryPrice,
      activeStop.price,
      activeTargetPrice,
      budgetInput,
      riskPctInput,
      positionCapPctInput
    );
  }, [plan.entryPrice, activeStop.price, activeTargetPrice, budgetInput, riskPctInput, positionCapPctInput]);

  // Pre-trade risk validation (trader-risk/check.py)
  const riskCheck = useMemo(() => {
    return validateTradeRisk(plan.entryPrice, activeStop.price, activeTargetPrice);
  }, [plan.entryPrice, activeStop.price, activeTargetPrice]);

  // Technical Scanner pattern detections (trader-scanner/scan.py)
  const scannerPatterns = useMemo(() => {
    return detectScannerSetups(history);
  }, [history]);

  return (
    <Card className="p-6 border border-border/80 bg-panel/75 backdrop-blur-xl shadow-xl space-y-6">
      {/* Top Header & Navigation Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/50 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-accent animate-pulse" />
            <h3 className="text-lg font-bold text-text">Day Trader Pro Station</h3>
            <span
              className={cn(
                "px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full border",
                plan.status === "triggered"
                  ? "bg-success/15 text-success border-success/30"
                  : "bg-amber-500/15 text-amber-500 border-amber-500/30"
              )}
            >
              {plan.status === "triggered" ? "ORB Breakout Triggered" : "Waiting for Range Breakout"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted mt-1">
            <span>
              {plan.status === "triggered" ? (
                <strong className="text-success font-medium">Price has closed above the 15-minute Opening Range High (₹{plan.openingRange.high}). Breakout trade is active.</strong>
              ) : (
                <>
                  Current CMP (<strong className="text-text font-mono">₹{plan.cmp}</strong>) is inside the opening range (₹{plan.openingRange.low} – ₹{plan.openingRange.high}). Needs a 5-min close above <strong className="text-accent font-mono">₹{plan.openingRange.high}</strong> (+₹{Number(Math.max(0, plan.openingRange.high - plan.cmp).toFixed(2))} away) to trigger.
                </>
              )}
            </span>
          </div>
        </div>

        {/* Tab Switcher & Beginner Help Button */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-accent/40 bg-accent/10 hover:bg-accent/20 text-accent font-bold text-xs transition-all shadow-sm"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Beginner Guide: How It Works</span>
          </button>

          <div className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-panel p-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("setup")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all",
                activeTab === "setup" ? "bg-accent/15 text-accent border border-accent/30 font-bold" : "text-muted hover:text-text"
              )}
            >
              <Target className="h-3.5 w-3.5" />
              <span>Setup &amp; Odds</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("budget")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all",
                activeTab === "budget" ? "bg-accent/15 text-accent border border-accent/30 font-bold" : "text-muted hover:text-text"
              )}
            >
              <Calculator className="h-3.5 w-3.5" />
              <span>Position Sizing</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("risk")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all",
                activeTab === "risk" ? "bg-accent/15 text-accent border border-accent/30 font-bold" : "text-muted hover:text-text"
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Risk Guardrails</span>
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: ENTRY, EXIT & TIME MACHINE */}
      {activeTab === "setup" && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          {/* Beginner Quick Concept Callout */}
          <div className="p-3.5 rounded-xl border border-accent/25 bg-accent/5 flex items-start justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5">
              <Sparkles className="h-4 w-4 text-accent shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-text">New to Day Trading? How this strategy works:</p>
                <p className="text-muted text-[11px] mt-0.5 leading-relaxed">
                  We calculate the high &amp; low formed between 9:15 and 9:30 AM. When price breaks out above the high on a 5-minute close, we enter with a pre-set stop loss at the midpoint. You never risk more than your predefined budget.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowHelpModal(true)}
              className="text-accent hover:underline font-bold shrink-0 text-[11px] whitespace-nowrap pt-0.5"
            >
              Open Full Academy &rarr;
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 15m Opening Range Card */}
            <div className="p-4 rounded-xl border border-border/70 bg-panel/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">15M Opening Range</span>
                <span className="text-[11px] font-mono text-accent">9:15 - 9:30 IST</span>
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <div>
                  <p className="text-xs text-muted">High (Trigger)</p>
                  <p className="text-base font-bold font-mono text-text">₹{plan.openingRange.high}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted">Midpoint</p>
                  <p className="text-base font-bold font-mono text-muted">₹{plan.openingRange.midpoint}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Low</p>
                  <p className="text-base font-bold font-mono text-text">₹{plan.openingRange.low}</p>
                </div>
              </div>
              <p className="text-[11px] text-muted pt-1 border-t border-border/40">
                Range Width: <strong className="text-text font-mono">{plan.openingRange.rangePct}%</strong> of CMP
              </p>
            </div>

            {/* Dynamic Stop Loss Planner */}
            <div className="p-4 rounded-xl border border-border/70 bg-panel/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-danger uppercase tracking-wider flex items-center gap-1">
                  <ShieldAlert className="h-3.5 w-3.5" /> Stop Loss Plan
                </span>
                <div className="inline-flex rounded-lg border border-border/60 p-0.5 bg-panel text-[10px]">
                  {(["or-mid", "or-low", "atr"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setStopMode(mode)}
                      className={cn(
                        "px-1.5 py-0.5 rounded font-semibold transition-all",
                        stopMode === mode ? "bg-danger/15 text-danger font-bold" : "text-muted hover:text-text"
                      )}
                    >
                      {mode.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-1">
                <p className="text-xl font-bold font-mono text-danger">₹{activeStop.price}</p>
                <p className="text-xs text-muted mt-0.5">
                  Risk: <strong className="text-text font-mono">₹{activeStop.risk} / share</strong> (-{activeStop.pct}%)
                </p>
              </div>
              <p className="text-[11px] text-muted pt-1 border-t border-border/40">
                Stop rounds down away from entry; never moves wider once set.
              </p>
            </div>

            {/* Profit Target Planner */}
            <div className="p-4 rounded-xl border border-border/70 bg-panel/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-success uppercase tracking-wider flex items-center gap-1">
                  <Target className="h-3.5 w-3.5" /> Profit Target
                </span>
                <div className="inline-flex rounded-lg border border-border/60 p-0.5 bg-panel text-[10px]">
                  {(["1R", "1.5R", "2R", "3R"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setTargetMultiplier(r)}
                      className={cn(
                        "px-1.5 py-0.5 rounded font-semibold transition-all",
                        targetMultiplier === r ? "bg-success/20 text-success font-bold" : "text-muted hover:text-text"
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-1">
                <p className="text-xl font-bold font-mono text-success">₹{activeTargetPrice}</p>
                <p className="text-xs text-muted mt-0.5">
                  Reward: <strong className="text-text font-mono">+{potentialRewardPct}%</strong> (Reward/Risk: {targetMultiplier})
                </p>
              </div>
              <p className="text-[11px] text-muted pt-1 border-t border-border/40">
                Flat by <span className="font-mono text-text font-semibold">{plan.flatByTime}</span> regardless of outcome.
              </p>
            </div>
          </div>

          {/* Time Machine Monte Carlo Replay Output */}
          <div className="p-5 rounded-2xl border border-accent/25 bg-accent/5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                <h4 className="text-sm font-bold text-text">Time Machine Statistical Outcome (1,000 Replays)</h4>
              </div>
              <span className="text-xs font-semibold text-accent font-mono">{plan.timeMachineOdds.verdict}</span>
            </div>

            {/* Visual Probability Distribution Bar */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-success font-mono">Hits Target: {plan.timeMachineOdds.targetProbPct}%</span>
                <span className="text-muted font-mono">Session Close: {plan.timeMachineOdds.flatProbPct}%</span>
                <span className="text-danger font-mono">Hits Stop: {plan.timeMachineOdds.stopProbPct}%</span>
              </div>

              <div className="h-2.5 w-full rounded-full bg-panel overflow-hidden flex shadow-inner">
                <div
                  style={{ width: `${plan.timeMachineOdds.targetProbPct}%` }}
                  className="h-full bg-success transition-all duration-500"
                />
                <div
                  style={{ width: `${plan.timeMachineOdds.flatProbPct}%` }}
                  className="h-full bg-muted/40 transition-all duration-500"
                />
                <div
                  style={{ width: `${plan.timeMachineOdds.stopProbPct}%` }}
                  className="h-full bg-danger transition-all duration-500"
                />
              </div>
            </div>

            {/* Bottom Metrics Bar */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-4 text-xs text-muted border-t border-border/40">
              <div>
                Expected R-Multiple:{" "}
                <strong className={cn("font-mono", plan.timeMachineOdds.expectedR >= 0 ? "text-success" : "text-danger")}>
                  {plan.timeMachineOdds.expectedR > 0 ? `+${plan.timeMachineOdds.expectedR}R` : `${plan.timeMachineOdds.expectedR}R`}
                </strong>
              </div>
              <div>
                Simulated Median EOD Price: <strong className="text-text font-mono">₹{plan.timeMachineOdds.medianExitPrice}</strong>
              </div>
              <div>
                Conservative Rule: <span className="text-text font-medium">Stops evaluate before targets on each bar.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: POSITION SIZING & BUDGET (trader-budget/size.py) */}
      {activeTab === "budget" && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-border/70 bg-panel/50 space-y-3">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider block">Account Capital (₹)</label>
              <input
                type="number"
                value={budgetInput}
                onChange={(e) => setBudgetInput(Math.max(1000, Number(e.target.value) || 1000))}
                className="w-full px-3 py-2 rounded-lg border border-border bg-panel text-text font-mono font-bold text-base focus:outline-none focus:border-accent"
              />
              <p className="text-[11px] text-muted">Total liquid funds allocated for day trading.</p>
            </div>

            <div className="p-4 rounded-xl border border-border/70 bg-panel/50 space-y-3">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider block">
                Max Loss Per Trade: <span className="text-text font-bold font-mono">{riskPctInput}%</span>
              </label>
              <input
                type="range"
                min="0.25"
                max="3.0"
                step="0.25"
                value={riskPctInput}
                onChange={(e) => setRiskPctInput(Number(e.target.value))}
                className="w-full accent-accent cursor-pointer"
              />
              <p className="text-[11px] text-muted">
                Max allowed rupee drawdown on stop: <strong className="text-danger font-mono">₹{positionSize.maxLossBudget}</strong>
              </p>
            </div>

            <div className="p-4 rounded-xl border border-border/70 bg-panel/50 space-y-3">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider block">
                Max Position Cap: <span className="text-text font-bold font-mono">{positionCapPctInput}%</span>
              </label>
              <input
                type="range"
                min="10"
                max="50"
                step="5"
                value={positionCapPctInput}
                onChange={(e) => setPositionCapPctInput(Number(e.target.value))}
                className="w-full accent-accent cursor-pointer"
              />
              <p className="text-[11px] text-muted">No single position may exceed this percent of capital.</p>
            </div>
          </div>

          {/* Allocation Results Panel */}
          <div className="p-5 rounded-2xl border border-border/70 bg-panel/60 space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">Sized Bracket Order Payload</span>
              <span className="text-xs font-semibold text-accent">
                Limiting factor: <strong className="uppercase font-mono">{positionSize.limiter.replace("_", " ")}</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted">Shares to Buy</p>
                <p className="text-2xl font-bold font-mono text-accent">{positionSize.shares} <span className="text-xs font-normal text-muted">shares</span></p>
              </div>
              <div>
                <p className="text-xs text-muted">Capital Deployed</p>
                <p className="text-2xl font-bold font-mono text-text">₹{positionSize.capitalRequired.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Actual Max Loss (1R)</p>
                <p className="text-2xl font-bold font-mono text-danger">-₹{positionSize.actualRiskRupees.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Potential Profit ({targetMultiplier})</p>
                <p className="text-2xl font-bold font-mono text-success">
                  +₹{(targetMultiplier === "1R" ? positionSize.profitAtR1 : targetMultiplier === "1.5R" ? positionSize.profitAtR1 * 1.5 : targetMultiplier === "2R" ? positionSize.profitAtR2 : positionSize.profitAtR3).toLocaleString("en-IN")}
                </p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between text-xs text-muted border-t border-border/40">
              <span>Cash Reserve Buffer: <strong className="text-text font-mono">₹{positionSize.cashBuffer}</strong></span>
              <span>Capital Left Idle: <strong className="text-text font-mono">₹{positionSize.capitalLeftIdle.toLocaleString("en-IN")}</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: RISK GUARDRAILS & SCANNER SETUPS (trader-risk/check.py & scan.py) */}
      {activeTab === "risk" && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pre-trade Rules Checklist */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-accent" />
                <h4 className="text-sm font-bold text-text">Pre-Trade Risk Verification (trader-risk)</h4>
              </div>

              <div className="space-y-2">
                {riskCheck.items.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-xl border border-border/60 bg-panel/40">
                    {item.status === "pass" ? (
                      <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                    ) : item.status === "warn" ? (
                      <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-danger shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-text">{item.rule}</span>
                        <span
                          className={cn(
                            "px-1.5 py-0.2 text-[9px] font-bold uppercase rounded",
                            item.status === "pass"
                              ? "bg-success/10 text-success"
                              : item.status === "warn"
                              ? "bg-amber-500/10 text-amber-500"
                              : "bg-danger/10 text-danger"
                          )}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted mt-0.5">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Technical Chart Scanner Patterns */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Radar className="h-4 w-4 text-accent" />
                <h4 className="text-sm font-bold text-text">Active Chart Setups (trader-scanner)</h4>
              </div>

              <div className="space-y-2">
                {scannerPatterns.map((pat, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "p-3 rounded-xl border transition-all",
                      pat.detected
                        ? "border-accent/40 bg-accent/10"
                        : "border-border/50 bg-panel/30 opacity-70"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-text">{pat.name}</span>
                      <span
                        className={cn(
                          "px-2 py-0.5 text-[10px] font-bold rounded-full",
                          pat.detected ? "bg-accent text-white font-bold" : "bg-panel border border-border text-muted"
                        )}
                      >
                        {pat.detected ? "Active Signal" : "Inactive"}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted mt-1">{pat.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Beginner Academy & Help Modal */}
      <BeginnerHelpModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        currentSymbol={symbol}
        cmp={cmp}
      />
    </Card>
  );
}
