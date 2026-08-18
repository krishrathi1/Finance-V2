"use client";

import React, { useEffect, useState } from "react";
import {
  Layers,
  Activity,
  Gauge,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  Eye,
  EyeOff,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import type { OptionChainAnalysis, OptionStrikeData } from "@/server/domain/options-chain";

export function OptionsChainTable({
  symbol = "NIFTY",
  currentPrice = 2400,
}: {
  symbol?: string;
  currentPrice?: number;
}) {
  const [data, setData] = useState<OptionChainAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGreeks, setShowGreeks] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/v1/stocks/${encodeURIComponent(symbol)}/options?spot=${currentPrice || 2400}`);
        const json = await res.json();
        if (alive && json.status === "success" && json.data) {
          setData(json.data);
        }
      } catch (e) {
        console.error("Failed to load options chain:", e);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [symbol, currentPrice]);

  if (loading || !data) {
    return (
      <Card className="p-6 border border-border/70 bg-card/60 animate-pulse">
        <div className="h-6 w-48 bg-secondary rounded mb-4" />
        <div className="h-64 bg-secondary/40 rounded" />
      </Card>
    );
  }

  const getBuildupTone = (b: OptionStrikeData["calls"]["buildup"]) => {
    switch (b) {
      case "Long Buildup":
        return "text-emerald-400 bg-emerald-500/10";
      case "Short Buildup":
        return "text-rose-400 bg-rose-500/10";
      case "Short Covering":
        return "text-teal-400 bg-teal-500/10";
      case "Long Unwinding":
        return "text-amber-400 bg-amber-500/10";
      default:
        return "text-muted bg-secondary/40";
    }
  };

  return (
    <Card className="p-5 border border-border/70 bg-card/60 backdrop-blur-md">
      {/* Header & Sentiment Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-fg">Options Chain &amp; Volatility Analysis</h3>
            <span className="px-2 py-0.5 text-xs font-mono font-semibold rounded bg-primary/15 text-primary">
              Expiry: {data.expiryDate}
            </span>
          </div>
          <p className="text-xs text-muted-fg mt-1">
            Real-time strike ladder, Greeks, Open Interest (OI) buildup, and Max Pain.
          </p>
        </div>

        {/* Action Button: Toggle Greeks */}
        <button
          onClick={() => setShowGreeks(!showGreeks)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/60 bg-bg/50 hover:bg-secondary/60 text-xs font-medium text-fg transition-colors"
        >
          {showGreeks ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showGreeks ? "Hide Greeks" : "Show Greeks (Delta/Theta/IV)"}
        </button>
      </div>

      {/* KPI Stats Bar */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* PCR */}
        <div className="p-3.5 rounded-xl border border-border/50 bg-bg/40">
          <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">Put-Call Ratio (PCR)</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono text-fg">{data.pcr}</span>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                data.pcr > 1 ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
              }`}
            >
              {data.pcrSentiment}
            </span>
          </div>
        </div>

        {/* Max Pain */}
        <div className="p-3.5 rounded-xl border border-border/50 bg-bg/40">
          <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">Max Pain Strike</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold font-mono text-amber-400">₹{data.maxPainStrike}</span>
            <span className="text-[11px] text-muted">Expiry Anchor</span>
          </div>
        </div>

        {/* Call Resistance */}
        <div className="p-3.5 rounded-xl border border-border/50 bg-bg/40">
          <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">Major Resistance (Call OI)</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold font-mono text-rose-400">₹{data.highestCallOiStrike}</span>
            <span className="text-[11px] text-muted">Max Call OI</span>
          </div>
        </div>

        {/* Put Support */}
        <div className="p-3.5 rounded-xl border border-border/50 bg-bg/40">
          <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">Major Support (Put OI)</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold font-mono text-emerald-400">₹{data.highestPutOiStrike}</span>
            <span className="text-[11px] text-muted">Max Put OI</span>
          </div>
        </div>
      </div>

      {/* Option Chain Table */}
      <div className="mt-5 overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full text-left text-xs border-collapse font-sans">
          <thead>
            <tr className="border-b border-border/70 bg-secondary/50 font-semibold text-muted text-[11px]">
              <th colSpan={showGreeks ? 6 : 4} className="text-center py-2 text-rose-400 border-r border-border/70">
                CALLS (CE)
              </th>
              <th className="text-center py-2 text-fg font-bold bg-secondary/80 border-r border-border/70">
                STRIKE
              </th>
              <th colSpan={showGreeks ? 6 : 4} className="text-center py-2 text-emerald-400">
                PUTS (PE)
              </th>
            </tr>
            <tr className="border-b border-border/60 bg-secondary/30 text-[10px] text-muted uppercase font-mono">
              {/* Call Columns */}
              <th className="py-2 px-2.5 text-right">OI (Lots)</th>
              <th className="py-2 px-2.5 text-right">Chg OI</th>
              {showGreeks && <th className="py-2 px-2 text-right">IV %</th>}
              {showGreeks && <th className="py-2 px-2 text-right">Delta</th>}
              <th className="py-2 px-2.5 text-right">LTP (₹)</th>
              <th className="py-2 px-2 border-r border-border/70 text-center">Buildup</th>

              {/* Strike */}
              <th className="py-2 px-3 text-center font-bold text-fg bg-secondary/50 border-r border-border/70">
                Strike
              </th>

              {/* Put Columns */}
              <th className="py-2 px-2 text-center">Buildup</th>
              <th className="py-2 px-2.5 text-left">LTP (₹)</th>
              {showGreeks && <th className="py-2 px-2 text-left">Delta</th>}
              {showGreeks && <th className="py-2 px-2 text-left">IV %</th>}
              <th className="py-2 px-2.5 text-left">Chg OI</th>
              <th className="py-2 px-2.5 text-left">OI (Lots)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 font-mono text-[11px]">
            {data.strikes.map((row) => {
              const isAtm = row.isAtm;
              const isCallItm = row.strikePrice < data.underlyingPrice;
              const isPutItm = row.strikePrice > data.underlyingPrice;

              return (
                <tr
                  key={row.strikePrice}
                  className={`hover:bg-secondary/40 transition-colors ${
                    isAtm ? "bg-primary/10 font-bold" : ""
                  }`}
                >
                  {/* CALLS */}
                  <td className={`py-2 px-2.5 text-right ${isCallItm ? "bg-rose-500/5 text-fg" : "text-muted"}`}>
                    {row.calls.openInterest.toLocaleString("en-IN")}
                  </td>
                  <td
                    className={`py-2 px-2.5 text-right ${
                      row.calls.changeInOi >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {row.calls.changeInOi >= 0 ? "+" : ""}
                    {row.calls.changeInOi.toLocaleString("en-IN")}
                  </td>
                  {showGreeks && (
                    <td className="py-2 px-2 text-right text-muted">{row.calls.impliedVolatility}%</td>
                  )}
                  {showGreeks && (
                    <td className="py-2 px-2 text-right text-teal-400">{row.calls.delta}</td>
                  )}
                  <td className="py-2 px-2.5 text-right font-bold text-fg">
                    ₹{row.calls.lastPrice}
                  </td>
                  <td className="py-2 px-2 border-r border-border/70 text-center">
                    <span className={`px-1.5 py-0.5 text-[9px] rounded font-medium ${getBuildupTone(row.calls.buildup)}`}>
                      {row.calls.buildup.replace("Buildup", "B")}
                    </span>
                  </td>

                  {/* STRIKE */}
                  <td
                    className={`py-2 px-3 text-center font-bold border-r border-border/70 ${
                      isAtm
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-secondary/40 text-fg"
                    }`}
                  >
                    ₹{row.strikePrice}
                    {isAtm && <span className="block text-[8px] tracking-normal font-sans uppercase">ATM</span>}
                  </td>

                  {/* PUTS */}
                  <td className="py-2 px-2 text-center">
                    <span className={`px-1.5 py-0.5 text-[9px] rounded font-medium ${getBuildupTone(row.puts.buildup)}`}>
                      {row.puts.buildup.replace("Buildup", "B")}
                    </span>
                  </td>
                  <td className="py-2 px-2.5 text-left font-bold text-fg">
                    ₹{row.puts.lastPrice}
                  </td>
                  {showGreeks && (
                    <td className="py-2 px-2 text-left text-rose-400">{row.puts.delta}</td>
                  )}
                  {showGreeks && (
                    <td className="py-2 px-2 text-left text-muted">{row.puts.impliedVolatility}%</td>
                  )}
                  <td
                    className={`py-2 px-2.5 text-left ${
                      row.puts.changeInOi >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {row.puts.changeInOi >= 0 ? "+" : ""}
                    {row.puts.changeInOi.toLocaleString("en-IN")}
                  </td>
                  <td className={`py-2 px-2.5 text-left ${isPutItm ? "bg-emerald-500/5 text-fg" : "text-muted"}`}>
                    {row.puts.openInterest.toLocaleString("en-IN")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
