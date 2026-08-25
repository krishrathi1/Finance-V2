"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bell, Calendar, CalendarRange, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChangePill } from "@/components/shared/change-pill";
import { SectionHeading } from "@/components/shared/section-heading";
import { apiGet } from "@/lib/api";
import { useApp } from "@/lib/store";
import { fmtCr, fmtInr, type IpoItem } from "@/lib/types";
import { cn } from "@/lib/utils";

interface IpoResponse {
  items: IpoItem[];
  type: string;
}

/** Client-side risk heuristic mirroring the platform's IPO risk rules. */
function ipoRisk(item: IpoItem): { level: "Low" | "Medium" | "High"; reasons: string[] } {
  const reasons: string[] = [];
  let risk = 1;
  if (item.issueSizeCr < 1500) {
    risk += 1;
    reasons.push("Small issue size");
  }
  if (item.sector === "Technology" || item.sector === "Consumer Cyclical") {
    risk += 0.5;
    reasons.push("Premium new-age sector");
  }
  if (item.gmp !== undefined && item.gmp > 100) {
    risk -= 0.5;
    reasons.push("Strong GMP");
  }
  if (item.status === "Upcoming") {
    risk += 0.5;
    reasons.push("Unlisted — no trading history");
  }
  const sub = item.subscription ? parseFloat(item.subscription) : NaN;
  if (Number.isFinite(sub) && sub > 10) {
    risk -= 0.5;
    reasons.push("Heavily oversubscribed");
  }
  if (reasons.length === 0) reasons.push("Balanced profile — standard IPO caveats apply");
  const level: "Low" | "Medium" | "High" = risk >= 2 ? "High" : risk >= 1.4 ? "Medium" : "Low";
  return { level, reasons };
}

function fmtIpoDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function statusClass(status: IpoItem["status"]): string {
  if (status === "Upcoming") return "border-brand/40 text-brand";
  if (status === "Open") return "border-success/40 text-success";
  return "border-border/50 text-muted-foreground";
}

function riskClass(level: "Low" | "Medium" | "High"): string {
  if (level === "High") return "border-danger/40 text-danger";
  if (level === "Medium") return "border-warn/40 text-warn";
  return "border-success/40 text-success";
}

function IpoCard({ item }: { item: IpoItem }) {
  const setView = useApp((s) => s.setView);
  const risk = ipoRisk(item);
  const isListed = item.status === "Listed";

  return (
    <article
      className="flex flex-col rounded-[24px] border border-border/50 bg-panel/60 p-5 backdrop-blur-sm transition-colors hover:border-brand/30"
      aria-label={`${item.company} IPO`}
    >
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold leading-tight text-text">{item.company}</h3>
          <span className="mt-1 inline-block rounded border border-border/50 bg-bg/60 px-1.5 py-px text-[10px] font-semibold tracking-wide text-muted-foreground">
            {item.symbol}
          </span>
        </div>
        <Badge variant="secondary" className="max-w-[9rem] truncate text-[10px]">
          {item.sector}
        </Badge>
      </div>

      {/* date + status */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 tabular-nums">
          <Calendar className="h-3.5 w-3.5 text-brand" aria-hidden />
          {fmtIpoDate(item.date)}
        </span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            statusClass(item.status)
          )}
        >
          {item.status}
        </span>
      </div>

      {/* price band */}
      <p className="mt-3 text-sm font-semibold tabular-nums text-text">{item.priceRange}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Price band</p>

      {/* stats */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border/40 bg-bg/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Issue size</p>
          <p className="text-sm font-semibold tabular-nums text-text">{fmtCr(item.issueSizeCr)}</p>
        </div>
        <div className="rounded-xl border border-border/40 bg-bg/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Shares</p>
          <p className="text-sm font-semibold tabular-nums text-text">{item.totalSharesLakh} L</p>
        </div>
      </div>

      {/* live/demand block */}
      {isListed ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">
            {fmtInr(item.issuePrice)} → <span className="font-semibold text-text">{fmtInr(item.listingPrice)}</span>
          </span>
          <ChangePill value={item.listingGain} size="xs" />
          {item.subscription && (
            <span className="rounded-full border border-border/50 bg-bg/60 px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              Subscription {item.subscription}
            </span>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {item.gmp !== undefined ? (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums",
                item.gmp > 0
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-danger/40 bg-danger/10 text-danger"
              )}
            >
              GMP ₹{item.gmp}
            </span>
          ) : (
            <span className="rounded-full border border-border/50 bg-bg/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              GMP —
            </span>
          )}
          <span className="rounded-full border border-border/50 bg-bg/60 px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            Subscription {item.subscription ?? "—"}
          </span>
        </div>
      )}

      {/* risk profile */}
      <div className="mt-4 flex items-start gap-2 border-t border-border/40 pt-3">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <span
            className={cn(
              "inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              riskClass(risk.level)
            )}
          >
            {risk.level} risk
          </span>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
            {risk.reasons.join(" · ")}
          </p>
        </div>
      </div>

      {/* footer action */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setView("alerts")}
        className="mt-4 w-full gap-1.5 border border-border/50 text-xs text-muted-foreground hover:border-brand/40 hover:text-brand"
        aria-label={`Set a price alert for ${item.company}`}
      >
        <Bell className="h-3.5 w-3.5" />
        Set Alert
      </Button>
    </article>
  );
}

export function IpoView() {
  const [tab, setTab] = useState<"upcoming" | "recent">("upcoming");
  const [items, setItems] = useState<IpoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<IpoResponse>(`/api/stocks/ipo?type=${tab}`)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setError(null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load the IPO list. Please retry.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const switchTab = (v: string) => {
    const next = v === "recent" ? "recent" : "upcoming";
    if (next === tab) return;
    setTab(next);
    setLoading(true);
    setError(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="stagger-fade space-y-4"
    >
      <SectionHeading
        icon={CalendarRange}
        kicker="Primary Market"
        title="IPO Tracker"
        right={
          <Tabs value={tab} onValueChange={switchTab}>
            <TabsList className="h-9 bg-bg/60">
              <TabsTrigger value="upcoming" className="px-3 text-xs">
                Upcoming
              </TabsTrigger>
              <TabsTrigger value="recent" className="px-3 text-xs">
                Recent
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {error && !loading && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="shimmer h-80 rounded-[24px] bg-muted/40" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/50 py-16 text-center">
          <CalendarRange className="h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            No {tab === "upcoming" ? "upcoming" : "recently listed"} IPOs right now — check back soon.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <IpoCard key={item.symbol} item={item} />
          ))}
        </div>
      )}

      <p className="px-1 text-[11px] leading-4 text-muted-foreground">
        Risk profile is a quick client-side heuristic (issue size, sector premium, GMP, subscription) — not investment
        advice. GMP = grey market premium in ₹ per share.
      </p>
    </motion.div>
  );
}
