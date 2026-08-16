"use client";

import { useMemo } from "react";
import { Eye, HelpCircle, Scale, ThumbsDown, ThumbsUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import { computeQuality } from "@/lib/quality-checklist";
import { drawdownAnalysis } from "@/shared/drawdown-analysis";
import { dividendTrackRecord } from "@/shared/dividend-history";
import { investmentThesis, type ThesisSignal } from "@/shared/investment-thesis";
import { todayIstDateKey } from "@/shared/market-status";
import { comparePeers } from "@/shared/peer-analytics";
import { piotroskiFScore } from "@/shared/forensic-scores";
import { annualisedVolatility, maxDrawdown } from "@/shared/price-stats";
import { rollingReturns } from "@/shared/rolling-returns";
import { shareholdingTrend } from "@/shared/shareholding-trend";
import { cashConversion, freeCashFlowYield, growthProfile } from "@/shared/statement-analytics";
import { movingAverages, rsi } from "@/shared/technical-indicators";

const STANCE = {
  constructive: { label: "Case leans positive", chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" },
  mixed: { label: "Genuinely mixed", chip: "border-amber-500/30 bg-amber-500/10 text-amber-600" },
  cautious: { label: "Case leans negative", chip: "border-rose-500/30 bg-rose-500/10 text-rose-500" },
} as const;

function SignalRow({ signal }: { signal: ThesisSignal }) {
  const bull = signal.side === "bull";
  return (
    <li className="rounded-lg border border-border/40 bg-bg/40 px-3 py-2">
      <div className="flex items-start gap-2">
        {/* Strength as pips rather than a number: it is a rough weight, and a
            decimal would imply a precision the rules do not have. */}
        <span className="mt-1 flex shrink-0 gap-0.5" aria-label={`Weight ${signal.strength} of 3`}>
          {[1, 2, 3].map((pip) => (
            <span
              key={pip}
              className={`h-1 w-1 rounded-full ${
                pip <= signal.strength
                  ? bull
                    ? "bg-emerald-500"
                    : "bg-rose-500"
                  : "bg-border/60"
              }`}
            />
          ))}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-4">{signal.claim}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-muted">{signal.detail}</p>
        </div>
      </div>
    </li>
  );
}

/**
 * The case for and the case against, side by side.
 *
 * Every other card on this page answers one question well, which makes the
 * page easy to read selectively — a buyer sees the cheap multiple, a sceptic
 * sees the promoter selling, and both leave feeling confirmed. This states
 * both cases at the same size, names the places where two credible signals
 * disagree, and says what would change the picture.
 */
export function InvestmentThesis({ data }: { data: any }) {
  const thesis = useMemo(() => {
    const history = data?.price?.history;
    const financials = data?.financials ?? {};
    const metrics = data?.metrics ?? {};

    const peers = comparePeers(metrics, data?.competitors?.table);
    const peerPe = peers?.comparisons.find((entry) => entry.metric === "pe")?.peerMedian ?? null;

    const piotroski = piotroskiFScore(financials);
    const growth = growthProfile(financials);
    const conversion = cashConversion(financials);
    const ownership = shareholdingTrend(data?.shareholding?.history);
    const promoters = ownership?.trends.find((entry) => entry.key === "promoters");
    const dividends = dividendTrackRecord(
      data?.corporateActions?.dividends,
      data?.price?.cmp,
      todayIstDateKey()
    );
    const underwater = drawdownAnalysis(history);
    const rolling = rollingReturns(history);
    const longestWindow = rolling.length ? rolling[rolling.length - 1] : null;

    // Altman comes from the quality checklist, which suppresses it for banks
    // and NBFCs where the model does not apply — so a null here means "not
    // applicable", and the thesis correctly declines to reason from it.
    const quality = computeQuality({
      metrics,
      incomeStatement: financials.incomeStatement,
      balanceSheet: financials.balanceSheet,
      growthSnapshot: financials.growthSnapshot,
      sector: data?.sector,
    });

    const averages = movingAverages(history);
    const rsiReading = rsi(history);
    const drawdown = maxDrawdown(history);

    return investmentThesis({
      peRatio: metrics.peRatio,
      peerMedianPe: peerPe,
      pegRatio: metrics.pegRatio,
      freeCashFlowYieldPercent: freeCashFlowYield(financials, metrics.marketCap),
      revenueCagrPercent: growth?.revenueCagr ?? null,
      profitCagrPercent: growth?.profitCagr ?? null,
      roePercent: metrics.roe,
      piotroskiScore: piotroski?.score ?? null,
      piotroskiTestable: piotroski?.testable ?? null,
      cashConversionRatio: conversion?.ratio ?? null,
      debtToEquity: metrics.debtToEquity,
      interestCoverage: metrics.interestCoverage,
      altmanZ: quality.altmanZ,
      priceVsSma200Percent: averages?.priceVsSma200Percent ?? null,
      rsi: rsiReading?.value ?? null,
      maxDrawdownPercent: drawdown?.percent ?? null,
      annualisedVolatilityPercent: annualisedVolatility(history),
      rollingBeatBenchmarkPercent: longestWindow?.aboveBenchmarkPercent ?? null,
      currentlyUnderwaterPercent: underwater?.currentDepthPercent ?? null,
      promoterChangePoints:
        promoters?.comparable
          ? promoters.changeOneYearPoints ?? promoters.changeFullPoints
          : null,
      promoterStakePercent: promoters?.latest ?? null,
      dividendYieldPercent: dividends?.yieldPercent ?? null,
      dividendStreakYears: dividends?.consecutiveYears ?? null,
    });
  }, [data]);

  if (!thesis) return null;

  const stance = STANCE[thesis.stance];
  // Balance mapped to a 0-100 bar position.
  const barPosition = Math.min(100, Math.max(0, (thesis.balance + 100) / 2));

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-slate-400 to-slate-600" />
        <h3 className="text-lg font-semibold">The Case For &amp; Against</h3>
        <span className={`ml-auto rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${stance.chip}`}>
          {stance.label}
        </span>
      </div>

      <p className="mt-2 text-[11px] leading-4 text-muted">
        Both sides of the argument, drawn from the signals on this page. Built to be disagreed with —
        not a recommendation.
      </p>

      {/* Balance bar. Deliberately unlabelled with a number: it summarises the
          weight of arguments, and a decimal would read as a score. */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[10px] text-muted">
          <span className="flex items-center gap-1">
            <ThumbsDown className="h-3 w-3" /> Against ({thesis.bearScore})
          </span>
          <span className="flex items-center gap-1">
            For ({thesis.bullScore}) <ThumbsUp className="h-3 w-3" />
          </span>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-gradient-to-r from-rose-500/60 via-border/50 to-emerald-500/60">
          <div
            className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full bg-fg shadow"
            style={{ left: `calc(${barPosition}% - 2px)` }}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
            <ThumbsUp className="h-3 w-3" /> The case for
          </p>
          {thesis.bull.length ? (
            <ul className="space-y-1.5">
              {thesis.bull.map((signal) => (
                <SignalRow key={signal.key} signal={signal} />
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
              Nothing in the measured signals argues positively right now.
            </p>
          )}
        </div>

        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-rose-500">
            <ThumbsDown className="h-3 w-3" /> The case against
          </p>
          {thesis.bear.length ? (
            <ul className="space-y-1.5">
              {thesis.bear.map((signal) => (
                <SignalRow key={signal.key} signal={signal} />
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-border/40 bg-bg/40 px-3 py-2 text-[11px] text-muted">
              Nothing in the measured signals argues against right now.
            </p>
          )}
        </div>
      </div>

      {/* The tensions are the point of the card. A blended score would average
          exactly these away. */}
      {thesis.tensions.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            <Scale className="h-3 w-3" /> Where the signals disagree
          </p>
          <ul className="space-y-2">
            {thesis.tensions.map((tension) => (
              <li
                key={tension.question}
                className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-medium text-emerald-600">
                    {tension.bull}
                  </span>
                  <span className="text-muted">vs</span>
                  <span className="rounded bg-rose-500/15 px-1.5 py-0.5 font-medium text-rose-500">
                    {tension.bear}
                  </span>
                </div>
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-4">
                  <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span>{tension.question}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
          <Eye className="h-3 w-3" /> What would change this
        </p>
        <ul className="space-y-1">
          {thesis.watchItems.map((item) => (
            <li key={item} className="flex items-start gap-2 text-[11px] leading-4 text-muted">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-3 text-[10px] leading-4 text-muted/60">
        {thesis.evaluated} of {thesis.possible} checks had data behind them — the rest are silent
        because the input was missing, not because they passed. Rule-based and educational, not
        investment advice.
      </p>
    </Card>
  );
}
