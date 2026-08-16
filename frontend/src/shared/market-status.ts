const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MARKET_OPEN_MINUTES = 9 * 60 + 15;
const MARKET_CLOSE_MINUTES = 15 * 60 + 30;

/**
 * Official NSE weekday trading holidays, keyed by calendar year.
 *
 * MAINTENANCE: NSE publishes the next year's list late in the preceding year.
 * Add it here as a new key — nothing else needs to change.
 *
 * Previously this was a single flat set guarded by `year === 2026`, which meant
 * the calendar silently stopped applying on 1 January 2027: every 2027 holiday
 * would have been treated as an ordinary trading day and the header would have
 * read "Live" through Republic Day. A year with no list is now reported as
 * uncovered (see `hasHolidayCalendar`) so the UI can say the schedule is
 * weekday-only rather than asserting a session that isn't happening.
 */
const NSE_TRADING_HOLIDAYS: Record<number, ReadonlySet<string>> = {
  2026: new Set([
    "2026-01-26",
    "2026-02-18",
    "2026-03-06",
    "2026-04-02",
    "2026-04-03",
    "2026-04-14",
    "2026-05-01",
    "2026-09-17",
    "2026-10-02",
    "2026-10-20",
    "2026-11-25",
    "2026-12-25"
  ])
};

export type MarketStatus = {
  isOpen: boolean;
  dotClassName: string;
  label: string;
  tooltip: string;
};

export type MarketStatusScope = "capital" | "all";

export type ExchangeMarketSnapshot = {
  capitalMarketOpen: boolean;
  anyMarketOpen: boolean;
  openMarkets: string[];
};

function toIstPseudo(now: Date) {
  return new Date(now.getTime() + IST_OFFSET_MS);
}

function dateKey(pseudoDate: Date) {
  const year = pseudoDate.getUTCFullYear();
  const month = String(pseudoDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(pseudoDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * "Today" in IST as a YYYY-MM-DD key. IST is UTC+5:30, so plain
 * `new Date().toISOString().slice(0, 10)` is wrong for roughly 18:30-23:59
 * UTC (00:00-05:29 IST) every day — it reports the previous calendar date,
 * which can misdate a live candle or default a form's date field to
 * yesterday during that window.
 */
export function todayIstDateKey(now: Date = new Date()): string {
  return dateKey(toIstPseudo(now));
}

/**
 * Whether a published holiday list exists for a calendar year. Exported so the
 * UI can distinguish "the market is closed today" from "we don't know this
 * year's holidays" instead of presenting both with equal confidence.
 */
export function hasHolidayCalendar(year: number): boolean {
  return Object.prototype.hasOwnProperty.call(NSE_TRADING_HOLIDAYS, year);
}

/** True on IST weekends and, where the year's calendar is known, its holidays. */
function isTradingHoliday(pseudoDate: Date) {
  const day = pseudoDate.getUTCDay();
  if (day === 0 || day === 6) return true;
  return NSE_TRADING_HOLIDAYS[pseudoDate.getUTCFullYear()]?.has(dateKey(pseudoDate)) ?? false;
}

function pseudoTimeForMinutes(pseudoDate: Date, totalMinutes: number) {
  return Date.UTC(
    pseudoDate.getUTCFullYear(),
    pseudoDate.getUTCMonth(),
    pseudoDate.getUTCDate(),
    Math.floor(totalMinutes / 60),
    totalMinutes % 60
  );
}

function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatPseudoDateTime(pseudoTimestamp: number) {
  const pseudoDate = new Date(pseudoTimestamp);
  const hour = pseudoDate.getUTCHours();
  const minute = String(pseudoDate.getUTCMinutes()).padStart(2, "0");
  const meridiem = hour >= 12 ? "PM" : "AM";
  const normalizedHour = hour % 12 || 12;
  const weekday = pseudoDate.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
  return `${weekday}, ${normalizedHour}:${minute} ${meridiem} IST`;
}

function nextTradingOpenPseudo(nowPseudo: Date) {
  let cursor = new Date(Date.UTC(nowPseudo.getUTCFullYear(), nowPseudo.getUTCMonth(), nowPseudo.getUTCDate()));
  for (let step = 0; step < 10; step += 1) {
    if (!isTradingHoliday(cursor)) {
      const openTime = pseudoTimeForMinutes(cursor, MARKET_OPEN_MINUTES);
      if (step > 0 || nowPseudo.getTime() <= openTime) {
        return openTime;
      }
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return pseudoTimeForMinutes(nowPseudo, MARKET_OPEN_MINUTES);
}

export function getIndianMarketStatus(now: Date = new Date()): MarketStatus {
  const pseudoNow = toIstPseudo(now);
  const openTime = pseudoTimeForMinutes(pseudoNow, MARKET_OPEN_MINUTES);
  const closeTime = pseudoTimeForMinutes(pseudoNow, MARKET_CLOSE_MINUTES);

  if (!isTradingHoliday(pseudoNow) && pseudoNow.getTime() >= openTime && pseudoNow.getTime() < closeTime) {
    const timeLeft = formatDuration(closeTime - pseudoNow.getTime());
    // Without this year's holiday list, "Live" only means "a weekday inside
    // session hours" — which is wrong on every festival. Saying so is better
    // than asserting a session that may not be running; the exchange-backed
    // status (getExchangeBackedMarketStatus) supersedes this when available.
    const unverified = hasHolidayCalendar(pseudoNow.getUTCFullYear())
      ? ""
      : ` Holiday calendar for ${pseudoNow.getUTCFullYear()} is not loaded, so trading holidays aren't accounted for.`;
    return {
      isOpen: true,
      dotClassName: "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)] animate-pulse",
      label: "Live",
      tooltip: `NSE cash market is live. ${timeLeft} left to close. Closes at 3:30 PM IST.${unverified}`
    };
  }

  const nextOpen = nextTradingOpenPseudo(pseudoNow);
  const timeLeft = formatDuration(nextOpen - pseudoNow.getTime());
  return {
    isOpen: false,
    dotClassName: "bg-slate-400 shadow-[0_0_0_4px_rgba(148,163,184,0.16)]",
    label: "Closed",
    tooltip: `NSE cash market is closed. Opens in ${timeLeft} at ${formatPseudoDateTime(nextOpen)}.`
  };
}

export function getExchangeBackedMarketStatus(
  snapshot: ExchangeMarketSnapshot,
  scope: MarketStatusScope,
  now: Date = new Date(),
): MarketStatus {
  const isOpen = scope === "all" ? snapshot.anyMarketOpen : snapshot.capitalMarketOpen;
  if (isOpen) {
    const scheduled = getIndianMarketStatus(now);
    const openMarkets = snapshot.openMarkets.filter(Boolean);
    const tooltip =
      scope === "all"
        ? `NSE markets live: ${openMarkets.join(", ") || "active trading session"}.`
        : scheduled.isOpen
          ? scheduled.tooltip
          : "NSE cash market reports a live trading session.";
    return {
      isOpen: true,
      dotClassName: "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)] animate-pulse",
      label: "Live",
      tooltip,
    };
  }

  return {
    isOpen: false,
    dotClassName: "bg-slate-400 shadow-[0_0_0_4px_rgba(148,163,184,0.16)]",
    label: "Closed",
    tooltip: scope === "all" ? "All NSE market segments are closed." : "NSE cash market is closed.",
  };
}
