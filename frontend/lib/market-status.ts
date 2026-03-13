const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MARKET_OPEN_MINUTES = 9 * 60 + 15;
const MARKET_CLOSE_MINUTES = 15 * 60 + 30;

// Official NSE weekday trading holidays published for calendar year 2026.
const NSE_TRADING_HOLIDAYS_2026 = new Set([
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
]);

type MarketStatus = {
  isOpen: boolean;
  dotClassName: string;
  label: string;
  tooltip: string;
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

function isTradingHoliday(pseudoDate: Date) {
  const day = pseudoDate.getUTCDay();
  if (day === 0 || day === 6) return true;
  const key = dateKey(pseudoDate);
  return pseudoDate.getUTCFullYear() === 2026 && NSE_TRADING_HOLIDAYS_2026.has(key);
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
    return {
      isOpen: true,
      dotClassName: "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)] animate-pulse",
      label: "Live",
      tooltip: `NSE cash market is live. ${timeLeft} left to close. Closes at 3:30 PM IST.`
    };
  }

  const nextOpen = nextTradingOpenPseudo(
    pseudoNow.getTime() < closeTime ? pseudoNow : new Date(pseudoNow.getTime() + 24 * 60 * 60 * 1000)
  );
  const timeLeft = formatDuration(nextOpen - pseudoNow.getTime());
  return {
    isOpen: false,
    dotClassName: "bg-slate-400 shadow-[0_0_0_4px_rgba(148,163,184,0.16)]",
    label: "Closed",
    tooltip: `NSE cash market is closed. Opens in ${timeLeft} at ${formatPseudoDateTime(nextOpen)}.`
  };
}
