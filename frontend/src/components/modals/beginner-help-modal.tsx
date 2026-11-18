"use client";

import React, { useState } from "react";
import {
  HelpCircle,
  BookOpen,
  Zap,
  Target,
  ShieldAlert,
  Calculator,
  Radar,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Percent,
  TrendingUp,
  Scale,
  Brain,
  Lightbulb,
  Info
} from "lucide-react";
import { cn } from "@/shared/utils";

interface BeginnerHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSymbol?: string;
  cmp?: number;
}

export function BeginnerHelpModal({
  isOpen,
  onClose,
  currentSymbol = "AAVAS",
  cmp = 1060,
}: BeginnerHelpModalProps) {
  const [activeTopic, setActiveTopic] = useState<
    "quickstart" | "datasources" | "orb" | "rmultiple" | "positionsize" | "timemachine" | "forensics" | "glossary"
  >("quickstart");

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 md:p-6 overflow-y-auto animate-in fade-in-50 duration-200"
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-border/80 bg-panel shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-panel/90">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-text">Beginner Trading &amp; Analysis Academy</h2>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-accent/15 text-accent border border-accent/30">
                  Zero Jargon Guide
                </span>
              </div>
              <p className="text-xs text-muted">
                Step-by-step interactive manual to master opening ranges, bracket stops, sizing &amp; forensic signals.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg border border-border/60 hover:bg-white/5 flex items-center justify-center text-muted hover:text-text transition-all font-mono text-sm"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Content Layout: Left Nav + Right Content */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Sidebar Navigation */}
          <nav aria-label="Beginner help topics" className="w-full md:w-64 border-b md:border-b-0 md:border-r border-border/60 bg-panel/50 p-3 space-y-1 overflow-x-auto md:overflow-y-auto flex md:flex-col gap-1 md:gap-0 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTopic("quickstart")}
              className={cn(
                "w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap",
                activeTopic === "quickstart"
                  ? "bg-accent/15 text-accent border border-accent/30 font-bold"
                  : "text-muted hover:text-text hover:bg-white/5"
              )}
            >
              <Sparkles className="h-4 w-4 shrink-0" />
              <span>1. 30-Second Quick Start</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTopic("datasources")}
              className={cn(
                "w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap",
                activeTopic === "datasources"
                  ? "bg-accent/15 text-accent border border-accent/30 font-bold"
                  : "text-muted hover:text-text hover:bg-white/5"
              )}
            >
              <Info className="h-4 w-4 shrink-0" />
              <span>2. Where Info Comes From (Sources)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTopic("orb")}
              className={cn(
                "w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap",
                activeTopic === "orb"
                  ? "bg-accent/15 text-accent border border-accent/30 font-bold"
                  : "text-muted hover:text-text hover:bg-white/5"
              )}
            >
              <Zap className="h-4 w-4 shrink-0" />
              <span>2. Opening Range Breakout (ORB)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTopic("rmultiple")}
              className={cn(
                "w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap",
                activeTopic === "rmultiple"
                  ? "bg-accent/15 text-accent border border-accent/30 font-bold"
                  : "text-muted hover:text-text hover:bg-white/5"
              )}
            >
              <Target className="h-4 w-4 shrink-0" />
              <span>3. Risk-to-Reward (1R, 2R, 3R)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTopic("positionsize")}
              className={cn(
                "w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap",
                activeTopic === "positionsize"
                  ? "bg-accent/15 text-accent border border-accent/30 font-bold"
                  : "text-muted hover:text-text hover:bg-white/5"
              )}
            >
              <Calculator className="h-4 w-4 shrink-0" />
              <span>4. Position Sizing Math</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTopic("timemachine")}
              className={cn(
                "w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap",
                activeTopic === "timemachine"
                  ? "bg-accent/15 text-accent border border-accent/30 font-bold"
                  : "text-muted hover:text-text hover:bg-white/5"
              )}
            >
              <Radar className="h-4 w-4 shrink-0" />
              <span>5. Time Machine Replays</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTopic("forensics")}
              className={cn(
                "w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap",
                activeTopic === "forensics"
                  ? "bg-accent/15 text-accent border border-accent/30 font-bold"
                  : "text-muted hover:text-text hover:bg-white/5"
              )}
            >
              <Scale className="h-4 w-4 shrink-0" />
              <span>6. Valuation &amp; Forensics (M/Z)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTopic("glossary")}
              className={cn(
                "w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap",
                activeTopic === "glossary"
                  ? "bg-accent/15 text-accent border border-accent/30 font-bold"
                  : "text-muted hover:text-text hover:bg-white/5"
              )}
            >
              <HelpCircle className="h-4 w-4 shrink-0" />
              <span>7. Beginner Glossary</span>
            </button>
          </nav>

          {/* Body Content Area */}
          <div className="flex-1 p-5 md:p-6 overflow-y-auto space-y-6">
            {/* TOPIC 1: QUICK START */}
            {activeTopic === "quickstart" && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div className="p-4 rounded-xl border border-accent/30 bg-accent/5">
                  <h3 className="text-base font-bold text-accent flex items-center gap-2">
                    <Sparkles className="h-4 w-4" /> The Golden Rule of Day Trading
                  </h3>
                  <p className="text-xs text-text/90 mt-1 leading-relaxed">
                    Most beginners fail because they buy randomly on hype, bet too much on one stock, and hold losing trades hoping they bounce back. 
                    The <strong>Day Trader Pro Station</strong> eliminates emotion by requiring 3 simple rules:
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl border border-border/70 bg-panel/60 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-accent">
                      <span className="h-5 w-5 rounded-full bg-accent/20 flex items-center justify-center text-[10px]">1</span>
                      Wait for the Candle
                    </div>
                    <p className="text-xs text-muted leading-relaxed">
                      Never enter before <strong>9:30 AM IST</strong>. Let the opening 15-minute battle between buyers and sellers establish the high and low.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-border/70 bg-panel/60 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-danger">
                      <span className="h-5 w-5 rounded-full bg-danger/20 flex items-center justify-center text-[10px]">2</span>
                      Pre-set the Stop Loss
                    </div>
                    <p className="text-xs text-muted leading-relaxed">
                      Before clicking Buy, you must know your exact exit price if you are wrong. Stop rounds away from entry and <strong>never moves wider</strong>.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-border/70 bg-panel/60 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-success">
                      <span className="h-5 w-5 rounded-full bg-success/20 flex items-center justify-center text-[10px]">3</span>
                      Calculate Exact Shares
                    </div>
                    <p className="text-xs text-muted leading-relaxed">
                      Never guess share quantity. Risk at most <strong>1% of your account</strong> (e.g. ₹500 on ₹50,000 budget). The formula gives the exact number of shares.
                    </p>
                  </div>
                </div>

                {/* Practical Walkthrough Card */}
                <div className="p-4 rounded-xl border border-border/70 bg-panel/40 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-accent" /> Live Example with {currentSymbol} (CMP ₹{cmp})
                  </h4>
                  <div className="text-xs text-text/80 space-y-2 leading-relaxed">
                    <div className="flex items-start gap-2">
                      <ArrowRight className="h-3.5 w-3.5 text-accent mt-0.5 shrink-0" />
                      <span><strong>Check the status badge:</strong> If it says &quot;Waiting for Range Breakout&quot;, do nothing! The stock is consolidating.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <ArrowRight className="h-3.5 w-3.5 text-accent mt-0.5 shrink-0" />
                      <span><strong>When it triggers:</strong> A 5-minute candle closes strictly above the Opening Range High with confirmed volume.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <ArrowRight className="h-3.5 w-3.5 text-accent mt-0.5 shrink-0" />
                      <span><strong>Execute with a bracket:</strong> Go to the &quot;Position Sizing&quot; tab, enter your available capital, and copy the exact shares and bracket order to your broker.</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TOPIC 2: WHERE INFORMATION COMES FROM (DATA SOURCES) */}
            {activeTopic === "datasources" && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div className="p-4 rounded-xl border border-accent/30 bg-accent/5">
                  <h3 className="text-base font-bold text-accent flex items-center gap-2">
                    <Info className="h-4 w-4" /> Transparency First: What Information Comes From Where
                  </h3>
                  <p className="text-xs text-text/90 mt-1 leading-relaxed">
                    Every number, chart, alert, and score in this platform comes from verified institutional and public feeds. Here is the exact transparent mapping:
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Source 1 */}
                  <div className="p-4 rounded-xl border border-border/70 bg-panel/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-text">1. Live Prices &amp; Candlesticks</span>
                      <span className="text-[10px] font-mono bg-accent/15 text-accent border border-accent/30 px-2 py-0.5 rounded">Real-time Feed</span>
                    </div>
                    <p className="text-muted leading-relaxed">
                      <strong>Where it comes from:</strong> Direct NSE / BSE market quote endpoints and Yahoo Finance intraday 1m/5m/15m data streams.
                    </p>
                    <p className="text-[11px] text-text/80 pt-1 border-t border-border/40">
                      <strong>What uses it:</strong> CMP, Day Trader Opening Range Breakout (ORB), OHLC bars, volume spikes, and technical indicator ribbons.
                    </p>
                  </div>

                  {/* Source 2 */}
                  <div className="p-4 rounded-xl border border-border/70 bg-panel/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-text">2. Institutional &amp; Smart Money</span>
                      <span className="text-[10px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded">Filings &amp; SEBI</span>
                    </div>
                    <p className="text-muted leading-relaxed">
                      <strong>Where it comes from:</strong> Trendlyne institutional shareholding reports, quarterly SEBI shareholding disclosures, and bulk/block deal disclosures.
                    </p>
                    <p className="text-[11px] text-text/80 pt-1 border-t border-border/40">
                      <strong>What uses it:</strong> &quot;Smart Money &amp; Institutional Flow Tracker&quot;, FII/DII net changes, promoter pledging, and superstar investor tracking.
                    </p>
                  </div>

                  {/* Source 3 */}
                  <div className="p-4 rounded-xl border border-border/70 bg-panel/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-text">3. Financial Statements &amp; Ratios</span>
                      <span className="text-[10px] font-mono bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded">Audited Reports</span>
                    </div>
                    <p className="text-muted leading-relaxed">
                      <strong>Where it comes from:</strong> Audited annual reports (10-K / Annual Filings), quarterly corporate earnings, and normalized balance sheets.
                    </p>
                    <p className="text-[11px] text-text/80 pt-1 border-t border-border/40">
                      <strong>What uses it:</strong> Financials Section (Totals, Per Share, % of Sales Common-Size), ROE, ROCE, Debt/Equity, and growth CAGRs.
                    </p>
                  </div>

                  {/* Source 4 */}
                  <div className="p-4 rounded-xl border border-border/70 bg-panel/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-text">4. Forensic &amp; Bankruptcy Scores</span>
                      <span className="text-[10px] font-mono bg-purple-500/15 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded">Mathematical Domain</span>
                    </div>
                    <p className="text-muted leading-relaxed">
                      <strong>Where it comes from:</strong> Derived directly in <code>forensic-scores.ts</code> using peer-reviewed academic equations (Messod Beneish, Edward Altman, Joseph Piotroski).
                    </p>
                    <p className="text-[11px] text-text/80 pt-1 border-t border-border/40">
                      <strong>What uses it:</strong> Beneish M-Score (earnings manipulation check), Altman Z-Score (bankruptcy buffer), and Piotroski 9-point quality score.
                    </p>
                  </div>

                  {/* Source 5 */}
                  <div className="p-4 rounded-xl border border-border/70 bg-panel/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-text">5. Options Chain &amp; Greeks</span>
                      <span className="text-[10px] font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded">NSE Derivatives</span>
                    </div>
                    <p className="text-muted leading-relaxed">
                      <strong>Where it comes from:</strong> NSE Live Options Chain API (Calls, Puts, Open Interest, Volume, IV).
                    </p>
                    <p className="text-[11px] text-text/80 pt-1 border-t border-border/40">
                      <strong>What uses it:</strong> Max Pain strike, Put-Call Ratio (PCR), and Black-Scholes Delta, Gamma, Vega, Theta Greeks.
                    </p>
                  </div>

                  {/* Source 6 */}
                  <div className="p-4 rounded-xl border border-border/70 bg-panel/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-text">6. Day Trading Odds &amp; Sizing</span>
                      <span className="text-[10px] font-mono bg-accent/15 text-accent border border-accent/30 px-2 py-0.5 rounded">Local Quant Engine</span>
                    </div>
                    <p className="text-muted leading-relaxed">
                      <strong>Where it comes from:</strong> Built from <code>day-trader-skill</code> Python modules running locally (no external API leaks, no trading bot execution without your manual approval).
                    </p>
                    <p className="text-[11px] text-text/80 pt-1 border-t border-border/40">
                      <strong>What uses it:</strong> 1,000-session Monte Carlo Time Machine odds, capital budget sizing calculations, and pre-trade guardrails.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TOPIC 2: ORB EXPLAINED */}
            {activeTopic === "orb" && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div>
                  <h3 className="text-base font-bold text-text flex items-center gap-2">
                    <Zap className="h-5 w-5 text-accent" /> Opening Range Breakout (ORB)
                  </h3>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    The Opening Range is the highest and lowest price printed between <strong>9:15 AM and 9:30 AM IST</strong> (first 15 minutes of trading).
                  </p>
                </div>

                {/* Visual Diagram */}
                <div className="p-4 rounded-xl border border-border/80 bg-panel/80 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-border/40">
                    <span className="text-accent font-bold">15-Minute Range High</span>
                    <span className="text-text font-bold">₹1,065.95</span>
                    <span className="text-success font-bold text-[10px] bg-success/15 px-2 py-0.5 rounded">Breakout Trigger Level</span>
                  </div>
                  <div className="py-4 text-center text-muted italic flex items-center justify-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                    <span>9:15 - 9:30 AM Noise &amp; Institutional Positioning Area</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-t border-dashed border-border/50 text-muted">
                    <span>Midpoint (OR-Mid)</span>
                    <span>₹1,062.90</span>
                    <span className="text-danger font-bold text-[10px] bg-danger/15 px-2 py-0.5 rounded">Recommended Stop Loss</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/40">
                    <span className="text-danger font-bold">15-Minute Range Low</span>
                    <span className="text-text font-bold">₹1,059.85</span>
                    <span className="text-muted text-[10px]">Conservative Stop Level</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-text flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-500" /> Why Wicks Do Not Count
                  </h4>
                  <p className="text-xs text-muted leading-relaxed">
                    A common beginner trap is buying as soon as the price spikes above the high for 5 seconds. Often, smart money creates a 
                    &quot;fakeout&quot; to trap eager buyers, and the price snaps right back down into the range.
                  </p>
                  <div className="p-3 rounded-lg border border-success/30 bg-success/5 text-xs text-success leading-relaxed">
                    <strong>Rule:</strong> We only consider a breakout valid when a complete <strong>5-minute candle closes strictly above</strong> the range high.
                  </div>
                </div>
              </div>
            )}

            {/* TOPIC 3: R-MULTIPLE & EXITS */}
            {activeTopic === "rmultiple" && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div>
                  <h3 className="text-base font-bold text-text flex items-center gap-2">
                    <Target className="h-5 w-5 text-success" /> What is an R-Multiple (1R, 2R, 3R)?
                  </h3>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    <strong>&quot;R&quot; stands for Risk.</strong> It is the exact rupee amount you stand to lose if your stop-loss is triggered.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl border border-danger/30 bg-danger/5 space-y-2">
                    <div className="text-xs font-bold text-danger flex items-center gap-1.5">
                      <ShieldAlert className="h-4 w-4" /> 1R of Risk (Your Stop)
                    </div>
                    <p className="text-xs text-text/80 leading-relaxed">
                      If you buy at <strong>₹1,066</strong> with a stop-loss at <strong>₹1,063</strong>, your risk is <strong>₹3 per share</strong>. 
                      This ₹3 difference is your <strong>1R</strong>.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-success/30 bg-success/5 space-y-2">
                    <div className="text-xs font-bold text-success flex items-center gap-1.5">
                      <Target className="h-4 w-4" /> 2R Target (Your Reward)
                    </div>
                    <p className="text-xs text-text/80 leading-relaxed">
                      A <strong>2R target</strong> aims to make 2x what you risk. Since 1R = ₹3, your target is <strong>2 × ₹3 = +₹6</strong> (Target Price: <strong>₹1,072</strong>).
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-border/70 bg-panel/60 space-y-3">
                  <h4 className="text-xs font-bold text-text flex items-center gap-1.5">
                    <Lightbulb className="h-4 w-4 text-accent" /> Why 2:1 Reward-to-Risk Makes You Unstoppable
                  </h4>
                  <p className="text-xs text-muted leading-relaxed">
                    If you take 10 trades with a 2R target and you are wrong on 6 out of 10 (only 40% win rate):
                  </p>
                  <ul className="text-xs text-text/80 space-y-1 list-disc list-inside font-mono">
                    <li>6 losing trades × -1R (-₹500) = -₹3,000</li>
                    <li>4 winning trades × +2R (+₹1,000) = +₹4,000</li>
                    <li className="text-success font-bold">Net Profit = +₹1,000 (even though you lost more trades than you won!)</li>
                  </ul>
                </div>
              </div>
            )}

            {/* TOPIC 4: POSITION SIZING MATH */}
            {activeTopic === "positionsize" && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div>
                  <h3 className="text-base font-bold text-text flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-accent" /> How Position Sizing Protects Your Capital
                  </h3>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Most traders blow their accounts by &quot;all-inning&quot; their total cash on a single trade. Professional traders calculate share quantity in reverse based on max permissible loss.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-accent/40 bg-accent/5 font-mono text-xs space-y-2">
                  <div className="text-accent font-bold uppercase tracking-wider">The Professional Sizing Formula</div>
                  <div className="p-3 rounded-lg bg-panel border border-border text-text font-bold text-sm text-center">
                    Share Quantity = Max Rupee Loss ÷ (Entry Price - Stop Price)
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-border/70 bg-panel/60 space-y-3">
                  <h4 className="text-xs font-bold text-text">Worked Step-by-Step Example</h4>
                  <div className="space-y-2 text-xs text-muted">
                    <p>1. You have a <strong>₹50,000</strong> trading account.</p>
                    <p>2. You decide to risk <strong>1.0%</strong> on this trade = <strong>₹500 maximum loss</strong>.</p>
                    <p>3. Stock entry is <strong>₹1,066</strong> and stop-loss is <strong>₹1,063</strong> (Risk per share = ₹3.00).</p>
                    <p className="pt-2 border-t border-border/40 font-mono text-text">
                      Quantity = ₹500 ÷ ₹3.00 = <strong>166 shares</strong>
                    </p>
                    <p className="text-success font-semibold">
                      If the stock crashes to your stop loss, you lose exactly ₹498 (within your ₹500 rule). You stay calm and trade another day.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TOPIC 5: TIME MACHINE REPLAYS */}
            {activeTopic === "timemachine" && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div>
                  <h3 className="text-base font-bold text-text flex items-center gap-2">
                    <Radar className="h-5 w-5 text-accent" /> The Time Machine: Monte Carlo &amp; Historical Replay
                  </h3>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Adapted from <code>trader-timemachine</code>: Before you risk a single rupee, our engine replays 1,000 potential session paths using the stock&apos;s true intraday volatility.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border/70 bg-panel/60 space-y-3">
                  <h4 className="text-xs font-bold text-text">How to Read the Probability Bar</h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-success shrink-0" />
                      <span className="text-text font-medium">Target Hit Probability (Green):</span>
                      <span className="text-muted">Percentage of simulated sessions where price hit the profit target before hitting the stop.</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-danger shrink-0" />
                      <span className="text-text font-medium">Stop Hit Probability (Red):</span>
                      <span className="text-muted">Percentage of sessions where the stop-loss was triggered first.</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-amber-500 shrink-0" />
                      <span className="text-text font-medium">Open at Close (Yellow):</span>
                      <span className="text-muted">Sessions that stayed between stop and target until 3:15 PM intraday square-off.</span>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-border/70 bg-panel/30 text-xs text-muted leading-relaxed">
                  <strong>Analyst Tip:</strong> If the Target Probability is lower than 40% on a 2R trade, the risk guardrail will flag the trade. It is better to skip marginal setups and wait for high-probability setups.
                </div>
              </div>
            )}

            {/* TOPIC 6: FORENSICS & VALUATION */}
            {activeTopic === "forensics" && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div>
                  <h3 className="text-base font-bold text-text flex items-center gap-2">
                    <Scale className="h-5 w-5 text-accent" /> Forensic Accounting: Beneish M-Score &amp; Altman Z-Score
                  </h3>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    While technicals govern timing, forensics tell you if the company is cooking its books or heading toward bankruptcy.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl border border-border/70 bg-panel/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-text">Beneish M-Score</span>
                      <span className="text-[10px] font-mono text-accent bg-accent/10 px-2 py-0.5 rounded">Earnings Manipulation</span>
                    </div>
                    <p className="text-xs text-muted leading-relaxed">
                      Measures 8 financial ratios (e.g. Days Sales in Receivables, Gross Margin deterioration). 
                    </p>
                    <div className="p-2 rounded bg-panel border border-border/40 text-[11px] font-mono space-y-1">
                      <p className="text-success font-semibold">&lt; -2.22: Unlikely Manipulator (Safe)</p>
                      <p className="text-danger font-semibold">&gt; -1.78: High Risk of False Financials</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-border/70 bg-panel/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-text">Altman Z-Score</span>
                      <span className="text-[10px] font-mono text-accent bg-accent/10 px-2 py-0.5 rounded">Bankruptcy Risk</span>
                    </div>
                    <p className="text-xs text-muted leading-relaxed">
                      Measures liquidity, cumulative profitability, and balance sheet leverage.
                    </p>
                    <div className="p-2 rounded bg-panel border border-border/40 text-[11px] font-mono space-y-1">
                      <p className="text-success font-semibold">&gt; 2.99: Safe Zone (Financially Sound)</p>
                      <p className="text-amber-500 font-semibold">1.81 – 2.99: Grey Zone (Caution)</p>
                      <p className="text-danger font-semibold">&lt; 1.81: Distress Zone (High Default Risk)</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-border/70 bg-panel/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text">Reverse DCF (Growth Implied by CMP)</span>
                    <span className="text-[10px] font-mono text-accent bg-accent/10 px-2 py-0.5 rounded">Valuation Reality Check</span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed">
                    Standard DCF asks: &quot;What is this stock worth?&quot; which relies on guessing future growth rates. 
                    <strong>Reverse DCF</strong> flips the formula: &quot;What earnings growth rate is Mr. Market already pricing into today&apos;s stock price?&quot;
                  </p>
                  <p className="text-[11px] text-text/80 leading-relaxed pt-1 border-t border-border/40">
                    If today&apos;s stock price requires 35% annual profit growth for 10 straight years to break even, but the company only grows at 12%, the stock is dangerously overvalued.
                  </p>
                </div>
              </div>
            )}

            {/* TOPIC 7: GLOSSARY */}
            {activeTopic === "glossary" && (
              <div className="space-y-4 animate-in fade-in-50 duration-200">
                <div>
                  <h3 className="text-base font-bold text-text flex items-center gap-2">
                    <HelpCircle className="h-5 w-5 text-accent" /> Essential Trader Vocabulary
                  </h3>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Quick definitions for terms you see across the charts and panels.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl border border-border/60 bg-panel/40">
                    <p className="font-bold text-accent">CMP (Current Market Price)</p>
                    <p className="text-muted mt-0.5">The most recent traded price of the share on NSE/BSE.</p>
                  </div>

                  <div className="p-3 rounded-xl border border-border/60 bg-panel/40">
                    <p className="font-bold text-accent">Bracket Order (BO)</p>
                    <p className="text-muted mt-0.5">A 3-in-1 order: your buy entry, an automated stop-loss order, and a take-profit target order.</p>
                  </div>

                  <div className="p-3 rounded-xl border border-border/60 bg-panel/40">
                    <p className="font-bold text-accent">ATR (Average True Range)</p>
                    <p className="text-muted mt-0.5">A volatility indicator showing how many rupees the stock typically swings in a day.</p>
                  </div>

                  <div className="p-3 rounded-xl border border-border/60 bg-panel/40">
                    <p className="font-bold text-accent">Square-Off Time (3:15 PM)</p>
                    <p className="text-muted mt-0.5">The mandatory time when intraday broker positions are automatically closed before market close (3:30 PM).</p>
                  </div>

                  <div className="p-3 rounded-xl border border-border/60 bg-panel/40">
                    <p className="font-bold text-accent">OR-Mid (Midpoint Stop)</p>
                    <p className="text-muted mt-0.5">The exact middle price between the 15-minute high and low. Standard stop level for breakouts.</p>
                  </div>

                  <div className="p-3 rounded-xl border border-border/60 bg-panel/40">
                    <p className="font-bold text-accent">Common-Size Financials</p>
                    <p className="text-muted mt-0.5">Expressing every income statement item as a percentage of total revenue (% of sales) to spot cost creep easily.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-3 border-t border-border/60 bg-panel/90 flex items-center justify-between">
          <span className="text-[11px] text-muted flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-accent" /> Tip: Switch between simple and advanced analyst modes anytime in the top bar.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-accent text-slate-950 font-bold text-xs hover:bg-accent/90 transition-all shadow-md shadow-accent/20"
          >
            Got it, Let&apos;s Trade
          </button>
        </div>
      </div>
    </div>
  );
}
