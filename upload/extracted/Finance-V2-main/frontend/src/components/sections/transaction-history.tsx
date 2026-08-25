"use client";

import { AlertTriangle, ArrowDownRight, ArrowUpRight, History, Receipt, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { removeTransaction } from "@/lib/transactions";
import type { Transaction } from "@/lib/transactions";
import { matchFifo } from "@/shared/portfolio-returns";

type Tab = "trades" | "realised";

function fmt(value: number) {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtSigned(value: number) {
  return `${value >= 0 ? "+" : ""}₹${fmt(value)}`;
}

function fmtQuantity(value: number) {
  // Whole share counts are the common case and "10.0000" reads as noise; only
  // fractional units get decimals.
  return Number.isInteger(value) ? value.toLocaleString("en-IN") : value.toString();
}

/**
 * The ledger view: every recorded trade, and the profit actually booked from
 * the sales among them.
 *
 * Split into two tabs because they answer different questions — "what did I
 * do" versus "what did I make" — and merging them produced a table where half
 * the columns were blank on any given row.
 */
export function TransactionHistory({
  transactions,
  onChanged,
}: {
  transactions: Transaction[];
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>("trades");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const realised = useMemo(() => matchFifo(transactions), [transactions]);

  const ordered = useMemo(
    () =>
      [...transactions].sort((a, b) =>
        a.tradedOn === b.tradedOn ? b.id.localeCompare(a.id) : b.tradedOn.localeCompare(a.tradedOn)
      ),
    [transactions]
  );

  const handleDelete = useCallback(
    (id: string) => {
      removeTransaction(id);
      setConfirmingId(null);
      onChanged();
    },
    [onChanged]
  );

  if (transactions.length === 0) return null;

  const sellCount = transactions.filter((transaction) => transaction.side === "sell").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-accent" />
            Transaction History
          </CardTitle>

          <div
            className="flex rounded-xl border border-border/50 bg-bg/40 p-0.5"
            role="tablist"
            aria-label="Transaction views"
          >
            {([
              { key: "trades", label: `Trades (${transactions.length})` },
              { key: "realised", label: `Realised (${realised.lots.length})` },
            ] as const).map((item) => (
              <button
                key={item.key}
                role="tab"
                aria-selected={tab === item.key}
                onClick={() => setTab(item.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  tab === item.key
                    ? "bg-accent/12 text-accent"
                    : "text-muted hover:text-text"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {realised.unmatchedSellQuantity > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/5 px-3 py-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="text-[11px] leading-4 text-muted">
              <span className="font-semibold text-amber-500">
                {fmtQuantity(realised.unmatchedSellQuantity)} units sold with no matching purchase.
              </span>{" "}
              Realised P&amp;L below excludes them. Add the missing buy trades to make these figures
              complete.
            </p>
          </div>
        )}

        {tab === "trades" ? (
          <div className="space-y-2">
            <div className="hidden grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-4 px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted sm:grid">
              <span className="w-8" />
              <span>Stock / Date</span>
              <span className="w-20 text-right">Qty</span>
              <span className="w-24 text-right">Price</span>
              <span className="w-28 text-right">Value</span>
              <span className="w-8" />
            </div>

            {ordered.map((transaction) => {
              const isBuy = transaction.side === "buy";
              const gross = transaction.quantity * transaction.price;
              return (
                <div
                  key={transaction.id}
                  className="group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-border/50 bg-panel/60 px-3 py-2.5 transition hover:border-accent/30 sm:grid-cols-[auto_1fr_auto_auto_auto_auto] sm:gap-4"
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isBuy ? "bg-success/12" : "bg-danger/12"
                    }`}
                    aria-hidden="true"
                  >
                    {isBuy ? (
                      <ArrowUpRight className="h-4 w-4 text-success" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 text-danger" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <Link
                        href={`/stocks/${transaction.symbol}`}
                        className="text-sm font-semibold transition hover:text-accent"
                      >
                        {transaction.symbol}
                      </Link>
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          isBuy ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                        }`}
                      >
                        {transaction.side}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted">
                      {transaction.tradedOn}
                      {transaction.fees > 0 ? ` · ₹${fmt(transaction.fees)} charges` : ""}
                    </p>
                    {transaction.notes && (
                      <p className="truncate text-[10px] italic text-muted/70">{transaction.notes}</p>
                    )}
                    {/* Phone layout has no dedicated columns, so the numbers ride here. */}
                    <p className="mt-0.5 text-[11px] tabular-nums text-muted sm:hidden">
                      {fmtQuantity(transaction.quantity)} × ₹{fmt(transaction.price)} = ₹{fmt(gross)}
                    </p>
                  </div>

                  <span className="hidden w-20 text-right text-sm tabular-nums sm:block">
                    {fmtQuantity(transaction.quantity)}
                  </span>
                  <span className="hidden w-24 text-right text-sm tabular-nums sm:block">
                    ₹{fmt(transaction.price)}
                  </span>
                  <span className="hidden w-28 text-right text-sm font-semibold tabular-nums sm:block">
                    ₹{fmt(gross)}
                  </span>

                  {/* Two-step delete: removing a trade silently changes every
                      realised figure derived from it, so it asks first. */}
                  <span className="flex w-auto justify-end sm:w-8">
                    {confirmingId === transaction.id ? (
                      <span className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(transaction.id)}
                          className="rounded-lg bg-danger px-2 py-1 text-[10px] font-bold text-white"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmingId(null)}
                          className="rounded-lg border border-border/60 px-2 py-1 text-[10px] font-semibold text-muted"
                        >
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmingId(transaction.id)}
                        aria-label={`Delete ${transaction.side} of ${transaction.symbol}`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger sm:h-7 sm:w-7 sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ) : realised.lots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
              <Receipt className="h-7 w-7 text-accent" />
            </div>
            <h3 className="text-sm font-semibold">Nothing booked yet</h3>
            <p className="mt-1 max-w-xs text-xs text-muted">
              {sellCount === 0
                ? "Realised profit appears here once you record a sale. Use the Sell action on any holding."
                : "Your sales have no matching purchases yet, so there is nothing to book against."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Short/long split — the tax-relevant cut for Indian equity. */}
            <div className="grid grid-cols-2 gap-3">
              {([
                { label: "Short term", hint: "held ≤ 12 months", value: realised.shortTermPnl },
                { label: "Long term", hint: "held > 12 months", value: realised.longTermPnl },
              ] as const).map((bucket) => (
                <div
                  key={bucket.label}
                  className="rounded-xl border border-border/50 bg-bg/40 px-3 py-2.5"
                >
                  <p className="text-[10px] uppercase tracking-wider text-muted">{bucket.label}</p>
                  <p
                    className={`mt-0.5 text-sm font-bold tabular-nums ${
                      bucket.value >= 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {fmtSigned(bucket.value)}
                  </p>
                  <p className="text-[10px] text-muted/70">{bucket.hint}</p>
                </div>
              ))}
            </div>

            <div className="hidden grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted sm:grid">
              <span>Stock / Held</span>
              <span className="w-16 text-right">Qty</span>
              <span className="w-24 text-right">Buy</span>
              <span className="w-24 text-right">Sell</span>
              <span className="w-32 text-right">Realised</span>
            </div>

            {realised.lots.map((lot, index) => {
              const isGain = lot.realisedPnl >= 0;
              return (
                <div
                  key={`${lot.symbol}-${lot.sellDate}-${lot.buyDate}-${index}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-border/50 bg-panel/60 px-3 py-2.5 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <Link
                        href={`/stocks/${lot.symbol}`}
                        className="text-sm font-semibold transition hover:text-accent"
                      >
                        {lot.symbol}
                      </Link>
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          lot.term === "long"
                            ? "bg-accent/10 text-accent"
                            : "bg-amber-400/10 text-amber-500"
                        }`}
                      >
                        {lot.term === "long" ? "LTCG" : "STCG"}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted">
                      {lot.buyDate} → {lot.sellDate} · {lot.holdingDays} days
                    </p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-muted sm:hidden">
                      {fmtQuantity(lot.quantity)} × ₹{fmt(lot.buyPrice)} → ₹{fmt(lot.sellPrice)}
                    </p>
                  </div>

                  <span className="hidden w-16 text-right text-sm tabular-nums sm:block">
                    {fmtQuantity(lot.quantity)}
                  </span>
                  <span className="hidden w-24 text-right text-sm tabular-nums sm:block">
                    ₹{fmt(lot.buyPrice)}
                  </span>
                  <span className="hidden w-24 text-right text-sm tabular-nums sm:block">
                    ₹{fmt(lot.sellPrice)}
                  </span>

                  <div className="w-32 text-right">
                    <p
                      className={`text-sm font-bold tabular-nums ${
                        isGain ? "text-success" : "text-danger"
                      }`}
                    >
                      {fmtSigned(lot.realisedPnl)}
                    </p>
                    <p className={`text-[11px] font-semibold ${isGain ? "text-success" : "text-danger"}`}>
                      {isGain ? "+" : ""}
                      {lot.realisedPnlPercent.toFixed(2)}%
                    </p>
                  </div>
                </div>
              );
            })}

            <p className="pt-1 text-center text-[10px] leading-4 text-muted/60">
              Matched first-in-first-out, the basis Indian capital-gains rules use for listed equity.
              Charges you recorded are included. Informational only — not tax advice.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
