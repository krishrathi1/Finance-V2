"use client";

import React, { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Building2,
  PieChart as PieIcon,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import type { InstitutionalFlowsResponse } from "@/server/domain/institutional-flows";

export function InstitutionalTracker() {
  const [data, setData] = useState<InstitutionalFlowsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchFlows = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/stocks/institutional-flows");
      const json = await res.json();
      if (json.status === "success" && json.data) {
        setData(json.data);
      }
    } catch (e) {
      console.error("Failed to load institutional flows:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlows();
  }, []);

  if (loading || !data) {
    return (
      <Card className="p-6 border border-border/70 bg-card/60 animate-pulse">
        <div className="h-6 w-48 bg-secondary rounded mb-4" />
        <div className="h-20 bg-secondary/50 rounded" />
      </Card>
    );
  }

  const { latest, monthToDate, yearToDate, sectorWiseFiiFlows, summary } = data;

  return (
    <Card className="p-6 border border-border/70 bg-card/60 backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-fg">Institutional Cash &amp; Derivatives Tracker</h3>
            <span className="px-2 py-0.5 text-[10px] uppercase font-bold rounded-full bg-primary/10 text-primary">
              FII / DII Live
            </span>
          </div>
          <p className="text-xs text-muted-fg mt-1">{summary}</p>
        </div>
        <button
          onClick={fetchFlows}
          className="self-end sm:self-auto p-1.5 rounded-lg border border-border/60 hover:bg-secondary/60 text-muted transition-colors"
          title="Refresh flows"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Daily Net Flow Cards */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* FII Cash */}
        <div className="p-4 rounded-xl border border-border/60 bg-bg/40">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-medium">FII Cash Net (Daily)</span>
            {latest.fiiCashNetCr >= 0 ? (
              <ArrowUpRight className="h-4 w-4 text-emerald-400" />
            ) : (
              <ArrowDownRight className="h-4 w-4 text-rose-400" />
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-extrabold font-mono ${
                latest.fiiCashNetCr >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {latest.fiiCashNetCr >= 0 ? "+" : ""}₹{Math.abs(latest.fiiCashNetCr).toLocaleString("en-IN")}
            </span>
            <span className="text-xs text-muted font-normal">Cr</span>
          </div>
          <span className="text-[11px] text-muted">Foreign Institutional</span>
        </div>

        {/* DII Cash */}
        <div className="p-4 rounded-xl border border-border/60 bg-bg/40">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-medium">DII Cash Net (Daily)</span>
            {latest.diiCashNetCr >= 0 ? (
              <ArrowUpRight className="h-4 w-4 text-emerald-400" />
            ) : (
              <ArrowDownRight className="h-4 w-4 text-rose-400" />
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-extrabold font-mono ${
                latest.diiCashNetCr >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {latest.diiCashNetCr >= 0 ? "+" : ""}₹{Math.abs(latest.diiCashNetCr).toLocaleString("en-IN")}
            </span>
            <span className="text-xs text-muted font-normal">Cr</span>
          </div>
          <span className="text-[11px] text-muted">Domestic Mutual Funds/LIC</span>
        </div>

        {/* FII Index Futures */}
        <div className="p-4 rounded-xl border border-border/60 bg-bg/40">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-medium">FII Index Futures</span>
            <Layers className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-extrabold font-mono ${
                latest.fiiIndexFuturesNetCr >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {latest.fiiIndexFuturesNetCr >= 0 ? "+" : ""}₹{Math.abs(latest.fiiIndexFuturesNetCr).toLocaleString("en-IN")}
            </span>
            <span className="text-xs text-muted font-normal">Cr</span>
          </div>
          <span className="text-[11px] text-muted">NIFTY/BANKNIFTY Futures</span>
        </div>

        {/* Total Net Market Impact */}
        <div className="p-4 rounded-xl border border-border/60 bg-bg/40">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-medium">Net Combined Inflow</span>
            {latest.totalNetCr >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-rose-400" />
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-extrabold font-mono ${
                latest.totalNetCr >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {latest.totalNetCr >= 0 ? "+" : ""}₹{Math.abs(latest.totalNetCr).toLocaleString("en-IN")}
            </span>
            <span className="text-xs text-muted font-normal">Cr</span>
          </div>
          <span className="text-[11px] text-primary font-medium">{latest.sentiment}</span>
        </div>
      </div>

      {/* Sector-wise Accumulation Grid */}
      <div className="mt-6">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
          Sector-wise Institutional Positioning
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {sectorWiseFiiFlows.map((sec, idx) => (
            <div
              key={idx}
              className="p-3 rounded-lg border border-border/50 bg-secondary/30 flex flex-col justify-between"
            >
              <span className="text-xs font-semibold text-fg truncate">{sec.sector}</span>
              <div className="mt-2 flex items-center justify-between">
                <span
                  className={`text-xs font-mono font-bold ${
                    sec.flowCr >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {sec.flowCr >= 0 ? "+" : ""}₹{Math.abs(sec.flowCr)} Cr
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    sec.status === "Accumulating"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : sec.status === "Trimming"
                      ? "bg-rose-500/15 text-rose-300"
                      : "bg-secondary text-muted"
                  }`}
                >
                  {sec.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
