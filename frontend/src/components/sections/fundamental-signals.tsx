import { Check, HelpCircle, Minus, X } from "lucide-react";

import { Card } from "@/components/ui/card";
import { piotroskiFScore, type PiotroskiSignal } from "@/shared/forensic-scores";

const CATEGORY_LABELS: Record<PiotroskiSignal["category"], string> = {
  profitability: "Profitability & cash",
  leverage: "Leverage & liquidity",
  efficiency: "Operating efficiency",
};

function strengthTone(strength: "weak" | "moderate" | "strong") {
  if (strength === "strong") return "bg-success/15 text-success";
  if (strength === "moderate") return "bg-amber-400/15 text-amber-400";
  return "bg-danger/15 text-danger";
}

function SignalIcon({ passed }: { passed: boolean | null }) {
  if (passed === null) {
    return <Minus className="h-3.5 w-3.5 shrink-0 text-muted/60" aria-hidden="true" />;
  }
  return passed ? (
    <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
  ) : (
    <X className="h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
  );
}

/**
 * Piotroski F-Score card.
 *
 * Complements the Quality & Safety card rather than repeating it: that one
 * scores the company's *current* ratios against fixed thresholds, while this
 * asks whether the business got better or worse than last year — the same
 * ratios can look healthy while every one of them is deteriorating.
 */
export function FundamentalSignals({
  financials,
}: {
  financials?: { incomeStatement?: any[]; balanceSheet?: any[]; cashFlow?: any[] };
}) {
  const result = piotroskiFScore({
    incomeStatement: financials?.incomeStatement,
    balanceSheet: financials?.balanceSheet,
    cashFlow: financials?.cashFlow,
  });

  if (!result) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <div className="h-5 w-1 rounded-full bg-gradient-to-b from-sky-400 to-indigo-500" />
          <h3 className="text-lg font-semibold">Year-on-Year Signals</h3>
        </div>
        <p className="mt-3 text-sm text-muted">
          Needs two years of financial statements. Not enough reported data for this company yet.
        </p>
      </Card>
    );
  }

  const grouped = (["profitability", "leverage", "efficiency"] as const).map((category) => ({
    category,
    signals: result.signals.filter((signal) => signal.category === category),
  }));

  const untestable = result.maxScore - result.testable;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-sky-400 to-indigo-500" />
        <h3 className="text-lg font-semibold">Year-on-Year Signals</h3>
        <span className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${strengthTone(result.strength)}`}>
          {result.label}
        </span>
        <span className="ml-auto text-sm font-bold tabular-nums">
          {result.score}
          <span className="text-muted">/{result.testable}</span>
        </span>
      </div>

      <p className="mt-2 text-xs leading-5 text-muted">
        The Piotroski F-Score: {result.maxScore} checks on whether this business improved on last
        year. Measures direction of travel, not absolute size.
      </p>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-bg">
        <div
          className={`h-full rounded-full transition-all ${
            result.strength === "strong"
              ? "bg-success"
              : result.strength === "moderate"
              ? "bg-amber-400"
              : "bg-danger"
          }`}
          style={{ width: `${result.testable > 0 ? (result.score / result.testable) * 100 : 0}%` }}
        />
      </div>

      <div className="mt-4 space-y-3">
        {grouped.map(({ category, signals }) => (
          <div key={category}>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
              {CATEGORY_LABELS[category]}
            </p>
            <ul className="space-y-1.5">
              {signals.map((signal) => (
                <li key={signal.key} className="flex items-start gap-2">
                  <span className="mt-0.5">
                    <SignalIcon passed={signal.passed} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`text-xs font-medium ${
                        signal.passed === null ? "text-muted/70" : "text-text"
                      }`}
                    >
                      {signal.label}
                    </span>
                    <span className="block text-[11px] leading-4 text-muted">{signal.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Stating what couldn't be measured keeps the denominator honest — the
          alternative is a score out of 9 that silently treats absent data as a
          pass or a fail. */}
      {untestable > 0 && (
        <p className="mt-3 flex items-start gap-1.5 border-t border-border/40 pt-2 text-[11px] leading-4 text-muted/80">
          <HelpCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            {untestable} of {result.maxScore} checks need data this dataset doesn&apos;t carry, so the
            score is out of {result.testable}.
          </span>
        </p>
      )}
    </Card>
  );
}
