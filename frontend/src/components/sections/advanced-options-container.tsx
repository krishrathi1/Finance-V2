"use client";

import React, { useState } from "react";
import { Sliders, ChevronDown, ChevronUp, Cpu, Activity, ShieldAlert, BarChart3, Binary, Zap } from "lucide-react";
import { cn } from "@/shared/utils";

interface AdvancedOptionsContainerProps {
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export function AdvancedOptionsContainer({
  children,
  defaultExpanded = true,
}: AdvancedOptionsContainerProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);
  const [hasBeenOpened, setHasBeenOpened] = useState(true);

  const toggle = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div id="advanced-options" className="my-6 rounded-2xl border border-border/80 bg-panel/70 backdrop-blur-xl shadow-xl overflow-hidden transition-all duration-300">
      {/* Trigger Banner */}
      <div
        onClick={toggle}
        className="cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 hover:bg-accent/5 transition-colors border-b border-border/50"
      >
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 border border-accent/30 text-accent shadow-sm">
            <Sliders className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-text tracking-tight">
                Advanced Quantitative &amp; Derivative Options
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-accent/15 text-accent border border-accent/25">
                Pro Tools
              </span>
            </div>
            <p className="text-xs text-muted mt-0.5">
              Deep dive into Options Greeks, Smart Money FII/DII tracking, Forensic Audits, and Return Models.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <span className="text-xs font-semibold text-muted">
            {isOpen ? "Hide Advanced Options" : "Show Advanced Options"}
          </span>
          <button
            type="button"
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-panel text-text transition-transform duration-200",
              isOpen ? "bg-accent/15 text-accent border-accent/30 rotate-180" : "hover:border-accent/40"
            )}
            aria-label={isOpen ? "Collapse options" : "Expand options"}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Feature summary pills when collapsed */}
      {!isOpen && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-panel/30 border-t border-border/30 text-xs text-muted">
          <span className="font-semibold text-text/80 text-[11px] uppercase tracking-wider pl-1">Includes:</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-panel border border-border/60 text-[11px]">
            <Zap className="h-3 w-3 text-accent" /> Intraday Breakout &amp; Time Machine
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-panel border border-border/60 text-[11px]">
            <Binary className="h-3 w-3 text-accent" /> Options Chain &amp; Greeks
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-panel border border-border/60 text-[11px]">
            <Activity className="h-3 w-3 text-accent" /> Smart Money Flow Tracker
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-panel border border-border/60 text-[11px]">
            <ShieldAlert className="h-3 w-3 text-accent" /> Forensic Accounting (M-Score/Z-Score)
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-panel border border-border/60 text-[11px]">
            <BarChart3 className="h-3 w-3 text-accent" /> Rolling Returns &amp; SIP Models
          </span>
        </div>
      )}

      {/* Collapsible Content: Mounted lazily on first open to avoid premature network requests */}
      {hasBeenOpened && (
        <div className={cn("p-4 sm:p-6 space-y-6 animate-in fade-in-50 duration-200", !isOpen && "hidden")}>
          {children}
        </div>
      )}
    </div>
  );
}
