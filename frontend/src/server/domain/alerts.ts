/**
 * Price-alert evaluation.
 *
 * Pure decision logic, deliberately free of DB and network concerns so the
 * rules that decide whether a user gets an email are directly testable.
 *
 * ## Why alerts are "armed"
 *
 * A naive alert fires whenever `price >= target`. That reads correctly until
 * you notice the alert dialog pre-fills the target with the *current* price:
 * a user who opens it and clicks Set Alert without editing anything creates
 * "notify me when price is above ₹X" at the exact moment price is already ₹X.
 * A stateless rule fires that instantly, and — now that triggering sends mail
 * — emails them about a threshold they never actually crossed.
 *
 * So an alert carries an `armed` flag. It is created disarmed when its
 * condition is already satisfied, and arms itself once price moves to the
 * other side of the target. Only an armed alert can trigger. The observable
 * behaviour is that an alert fires on a genuine *crossing*, which is what
 * "alert me when it goes above ₹X" means to a person.
 *
 * Triggering is one-shot: a triggered alert is not re-evaluated (the caller
 * filters on `triggered_at IS NULL`), so a price oscillating around the target
 * produces one notification rather than one per poll.
 */

export type AlertCondition = "above" | "below";

export type EvaluableAlert<Id = number> = {
  id: Id;
  symbol: string;
  targetPrice: number;
  condition: AlertCondition;
  armed: boolean;
};

/** What should happen to a single alert on this pass. */
export type AlertDecision =
  /** Condition met while armed — notify, and stop evaluating this alert. */
  | { kind: "trigger"; price: number }
  /** Price has moved clear of the target — the alert becomes eligible to fire. */
  | { kind: "arm" }
  /** No state change (price unknown, or nothing crossed). */
  | { kind: "none" };

export type AlertEvaluation<Id = number> = {
  triggered: Array<{ id: Id; price: number }>;
  armed: Id[];
};

/** Normalise a symbol the way both the client store and the DB do. */
export function normalizeSymbol(symbol: string): string {
  return String(symbol ?? "").trim().toUpperCase();
}

/** Is the alert's threshold satisfied at this price? */
export function conditionMet(
  condition: AlertCondition,
  targetPrice: number,
  price: number
): boolean {
  return condition === "above" ? price >= targetPrice : price <= targetPrice;
}

/**
 * Decide a single alert against a price.
 *
 * `price` is optional because a quote can legitimately be missing (provider
 * outage, delisted symbol). A missing or nonsensical price is never treated as
 * a crossing — it yields "none", leaving the alert exactly as it was, rather
 * than letting a provider hiccup fire or silence someone's alert.
 */
export function decideAlert(
  alert: Pick<EvaluableAlert, "condition" | "targetPrice" | "armed">,
  price: number | null | undefined
): AlertDecision {
  if (price === null || price === undefined) return { kind: "none" };
  if (!Number.isFinite(price) || price <= 0) return { kind: "none" };
  if (!Number.isFinite(alert.targetPrice) || alert.targetPrice <= 0) return { kind: "none" };

  const met = conditionMet(alert.condition, alert.targetPrice, price);

  if (!alert.armed) {
    // Disarmed: it only becomes live once price leaves the trigger zone.
    return met ? { kind: "none" } : { kind: "arm" };
  }

  return met ? { kind: "trigger", price } : { kind: "none" };
}

/**
 * Evaluate a batch of alerts against a price map (keyed by symbol, any case).
 * Returns the ids to mark triggered and the ids to mark armed — the caller
 * turns those into the two corresponding UPDATE statements.
 */
export function evaluateAlerts<Id>(
  alerts: Array<EvaluableAlert<Id>>,
  prices: Record<string, number>
): AlertEvaluation<Id> {
  const normalizedPrices = new Map<string, number>();
  for (const [symbol, price] of Object.entries(prices)) {
    normalizedPrices.set(normalizeSymbol(symbol), price);
  }

  const triggered: Array<{ id: Id; price: number }> = [];
  const armed: Id[] = [];

  for (const alert of alerts) {
    const decision = decideAlert(alert, normalizedPrices.get(normalizeSymbol(alert.symbol)));
    if (decision.kind === "trigger") {
      triggered.push({ id: alert.id, price: decision.price });
    } else if (decision.kind === "arm") {
      armed.push(alert.id);
    }
  }

  return { triggered, armed };
}

/**
 * Should a newly created alert start armed?
 *
 * Called at creation with whatever price the caller knows. When the price is
 * unknown we default to armed — the alternative would silently swallow a
 * legitimate alert until the next price move, and an alert that never fires is
 * a worse failure than one that fires a little eagerly.
 */
export function initialArmedState(
  condition: AlertCondition,
  targetPrice: number,
  price: number | null | undefined
): boolean {
  if (price === null || price === undefined) return true;
  if (!Number.isFinite(price) || price <= 0) return true;
  return !conditionMet(condition, targetPrice, price);
}
