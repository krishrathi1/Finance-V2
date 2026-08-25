"use client";

import { cn } from "@/lib/utils";
import { fmtPct } from "@/lib/types";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

export function ChangePill({
  value,
  className,
  size = "sm",
  showArrow = true,
  withValue,
}: {
  value: number | null | undefined;
  className?: string;
  size?: "xs" | "sm" | "md";
  showArrow?: boolean;
  withValue?: number | null;
}) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }
  const positive = value > 0;
  const negative = value < 0;
  const Icon = showArrow ? (positive ? ArrowUpRight : negative ? ArrowDownRight : Minus) : null;
  const sizes = {
    xs: "text-[10px] px-1.5 py-0.5 gap-0.5",
    sm: "text-xs px-2 py-0.5 gap-1",
    md: "text-sm px-2.5 py-1 gap-1",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold tabular-nums",
        sizes[size],
        positive && "bg-success/12 text-success",
        negative && "bg-danger/12 text-danger",
        !positive && !negative && "bg-muted text-muted-foreground",
        className
      )}
    >
      {Icon && <Icon className={size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} />}
      {fmtPct(value)}
      {withValue !== undefined && withValue !== null && Number.isFinite(withValue) && (
        <span className="opacity-70">
          ({withValue >= 0 ? "+" : ""}
          {withValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })})
        </span>
      )}
    </span>
  );
}
