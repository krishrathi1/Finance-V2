"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Client-side IST market status: open 09:15–15:30 IST, Mon–Fri. */
export function useMarketStatus() {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000);
      const day = ist.getDay();
      const mins = ist.getHours() * 60 + ist.getMinutes();
      const isOpen = day !== 0 && day !== 6 && mins >= 555 && mins <= 930;
      setOpen(isOpen);
      let l = "Market Closed";
      if (isOpen) {
        const closeIn = 930 - mins;
        l = closeIn > 60 ? `Closes in ${Math.floor(closeIn / 60)}h ${closeIn % 60}m` : `Closes in ${closeIn}m`;
      } else if (day >= 1 && day <= 5) {
        if (mins < 555) {
          const openIn = 555 - mins;
          l = `Opens in ${Math.floor(openIn / 60)}h ${openIn % 60}m`;
        } else {
          l = "Opens tomorrow 09:15 IST";
        }
      } else {
        l = "Opens Monday 09:15 IST";
      }
      setLabel(l);
    };
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, []);

  return { open, label };
}

export function MarketStatusBadge({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { open, label } = useMarketStatus();
  return (
    <span
      title={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
        open
          ? "border-success/35 bg-success/10 text-success"
          : "border-border/60 bg-panel/70 text-muted-foreground",
        className
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          open ? "bg-success pulse-dot" : "bg-muted-foreground/60"
        )}
      />
      {compact ? (open ? "Live" : "Closed") : open ? "Market Open" : "Market Closed"}
    </span>
  );
}
