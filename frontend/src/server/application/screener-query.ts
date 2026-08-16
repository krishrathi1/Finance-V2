/**
 * Free-text screener query parser — the Screener.in-style custom query the app
 * was missing.
 *
 * Accepts a conjunction of comparisons over the numeric fields a ScreenerResult
 * actually carries, e.g.
 *
 *     pe < 20 and market cap > 50000 and dividend yield > 1
 *
 * Deliberately narrow: AND only, no OR/parentheses, no arithmetic. A partial
 * parse never silently drops a clause — anything unrecognised is reported back
 * so the UI can tell the user which part was ignored rather than returning
 * confidently wrong results.
 */

import type { ScreenerResult } from "@/shared/types";

/** Numeric fields that can be filtered, with the aliases a user might type. */
const FIELD_ALIASES: Record<keyof ScreenerResult | string, string[]> = {
  marketCap: ["marketcap", "market cap", "mcap", "market capitalization", "market capitalisation"],
  price: ["price", "cmp", "current price", "share price"],
  pe: ["pe", "p/e", "pe ratio", "price to earning", "price to earnings"],
  pb: ["pb", "p/b", "pb ratio", "price to book"],
  roe: ["roe", "return on equity"],
  dividendYield: ["dividendyield", "dividend yield", "div yield", "dy"],
  beta: ["beta"],
  volume: ["volume", "vol"],
  changePercent: ["changepercent", "change percent", "change %", "day change", "pchange"],
};

const OPERATORS = [">=", "<=", "!=", "=", ">", "<"] as const;
type Operator = (typeof OPERATORS)[number];

export type QueryClause = {
  field: string;
  operator: Operator;
  value: number;
};

export type ParsedQuery = {
  clauses: QueryClause[];
  /** Fragments that could not be understood, verbatim, for user feedback. */
  unparsed: string[];
};

/** Resolve a typed field name to a ScreenerResult key, or null. */
function resolveField(raw: string): string | null {
  const needle = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!needle) return null;
  for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
    if (key.toLowerCase() === needle || aliases.includes(needle)) return key;
  }
  return null;
}

/**
 * Fields already denominated in crore. A crore/lakh suffix is only meaningful
 * against these, because the conversion is to the field's own unit.
 */
const CRORE_DENOMINATED_FIELDS = new Set(["marketCap"]);

/**
 * Parse a value, accepting the shorthand Indian users actually type:
 * `50000`, `1.5`, `2cr`, `500k`, `1.2l`.
 *
 * The field matters, which is why it is a parameter. `cr`/`lakh` translate
 * into the field's own unit, so they only mean anything on a field already
 * expressed in crore. Applying them blindly turned `price > 2l` into
 * `price > 0.02` — a filter every stock passes, presented as if it had been
 * understood. Such a suffix is now rejected, which routes the fragment into
 * `unparsed` and lets the UI say the clause was ignored.
 *
 * `k` is exempt: it is a plain ×1000 that assumes nothing about the unit.
 */
function parseValue(raw: string, field: string): number | null {
  const text = raw.trim().toLowerCase().replace(/,/g, "");
  const match = text.match(/^(-?\d+(?:\.\d+)?)\s*(cr|crore|l|lakh|k)?$/);
  if (!match) return null;
  const magnitude = Number(match[1]);
  if (!Number.isFinite(magnitude)) return null;

  const suffix = match[2];
  if ((suffix === "cr" || suffix === "crore" || suffix === "l" || suffix === "lakh") &&
      !CRORE_DENOMINATED_FIELDS.has(field)) {
    return null;
  }

  switch (suffix) {
    case "k":
      return magnitude * 1_000;
    case "l":
    case "lakh":
      return magnitude / 100; // lakh -> crore
    case "cr":
    case "crore":
      return magnitude;
    default:
      return magnitude;
  }
}

export function parseScreenerQuery(input: string): ParsedQuery {
  const clauses: QueryClause[] = [];
  const unparsed: string[] = [];
  if (!input || !input.trim()) return { clauses, unparsed };

  // Split on "and" / "&" / newline. Commas are deliberately NOT separators:
  // Indian digit grouping ("1,50,000") would otherwise be torn into three
  // fragments and silently screen on a value of 1.
  const fragments = input
    .split(/\s+and\s+|\s*&&?\s*|\n+/i)
    .map((f) => f.trim())
    .filter(Boolean);

  for (const fragment of fragments) {
    // Longest operators first so ">=" is not read as ">".
    const operator = OPERATORS.find((op) => fragment.includes(op));
    if (!operator) {
      unparsed.push(fragment);
      continue;
    }
    const index = fragment.indexOf(operator);
    const field = resolveField(fragment.slice(0, index));
    // Field first: a crore/lakh suffix can only be validated against the unit
    // the field is denominated in.
    const value = field === null ? null : parseValue(fragment.slice(index + operator.length), field);
    if (field === null || value === null) {
      unparsed.push(fragment);
      continue;
    }
    clauses.push({ field, operator, value });
  }

  return { clauses, unparsed };
}

/** True if `row` satisfies every clause. Rows missing a filtered field fail. */
export function matchesQuery(row: Record<string, unknown>, clauses: QueryClause[]): boolean {
  for (const { field, operator, value } of clauses) {
    const actual = row[field];
    // A null metric is "unknown", not "passes" — excluding it keeps a screen
    // for "pe < 20" from surfacing loss-making companies that report no P/E.
    if (typeof actual !== "number" || !Number.isFinite(actual)) return false;
    switch (operator) {
      case ">":
        if (!(actual > value)) return false;
        break;
      case ">=":
        if (!(actual >= value)) return false;
        break;
      case "<":
        if (!(actual < value)) return false;
        break;
      case "<=":
        if (!(actual <= value)) return false;
        break;
      case "=":
        if (actual !== value) return false;
        break;
      case "!=":
        if (actual === value) return false;
        break;
    }
  }
  return true;
}

/** Field names and aliases, for UI hints/autocomplete. */
export function queryableFields(): Array<{ field: string; aliases: string[] }> {
  return Object.entries(FIELD_ALIASES).map(([field, aliases]) => ({ field, aliases }));
}
