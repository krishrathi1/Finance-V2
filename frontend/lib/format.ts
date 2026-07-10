export function formatCurrency(value: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
}

export function formatPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function brokerActionBadgeClass(action: string) {
  const value = (action || "").toLowerCase();
  if (value === "buy") return "bg-emerald-600/15 text-emerald-700";
  if (value === "sell") return "bg-rose-600/15 text-rose-700";
  return "bg-amber-600/15 text-amber-800";
}

export function formatReportDate(value: string, emptyFallback = "N/A") {
  if (!value) return emptyFallback;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
