// Shared micro-helpers for the stock detail components (formatting, clamping,
// date parsing for YYYY-MM-DD chart keys). Plain module — no client directive
// needed; it is only imported from client components.

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Tailwind text color class by sign of a percentage-like number. */
export function pctClass(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "text-muted-foreground";
  if (v > 0) return "text-success";
  if (v < 0) return "text-danger";
  return "text-muted-foreground";
}

/** Format a nullable number with fixed digits (and optional suffix), "—" when absent. */
export function numOrDash(v: number | null | undefined, digits = 1, suffix = ""): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}${suffix}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function dateParts(iso: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** "2024-03-15" → "15 Mar" (short ticks for 1W/1M/6M ranges). */
export function fmtDayMonth(iso: string): string {
  const p = dateParts(iso);
  if (!p) return iso;
  return `${p[2]} ${MONTHS[p[1] - 1] ?? ""}`;
}

/** "2024-03-15" → "Mar '24" (compact ticks for 1Y/5Y ranges). */
export function fmtMonthYear(iso: string): string {
  const p = dateParts(iso);
  if (!p) return iso;
  return `${MONTHS[p[1] - 1] ?? ""} '${String(p[0] % 100).padStart(2, "0")}`;
}

/** "2024-03-15" → "15 Mar 2024" (chart tooltips). */
export function fmtFullDate(iso: string): string {
  const p = dateParts(iso);
  if (!p) return iso;
  return `${p[2]} ${MONTHS[p[1] - 1] ?? ""} ${p[0]}`;
}
