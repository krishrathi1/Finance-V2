"use client";

import { useCallback } from "react";
import { Download, FileSpreadsheet, Landmark, Receipt } from "lucide-react";

import type { HoldingWithValue } from "@/lib/portfolio";
import type { Transaction } from "@/lib/transactions";
import { capitalGainsByYear } from "@/shared/capital-gains";
import { matchFifo } from "@/shared/portfolio-returns";
import {
  capitalGainsCsv,
  holdingsCsv,
  transactionsCsv,
} from "@/shared/portfolio-export";
import { todayIstDateKey } from "@/shared/market-status";

/**
 * CSV exports: the portfolio's data, out of the app and into the user's hands.
 *
 * Everything here lives in localStorage plus a personal account — data a user
 * may need in a spreadsheet (their own analysis), in a broker-import format,
 * or in front of a CA at filing time. The capital-gains statement is the one
 * that matters most: it is the schedule an ITR-2 preparer asks for, and
 * rebuilding it by hand from a trade list is an afternoon of error-prone work
 * the app has already done.
 *
 * Generation is entirely client-side — the data never leaves the browser to
 * become a file, which is the correct place for a statement of someone's
 * taxes to be assembled.
 */
export function PortfolioExport({
  holdings,
  transactions,
}: {
  holdings: HoldingWithValue[];
  transactions: Transaction[];
}) {
  const download = useCallback((filename: string, csv: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    // Revoked on a delay: revoking synchronously races the browser actually
    // reading the blob in some engines, yielding an empty file.
    setTimeout(() => URL.revokeObjectURL(url), 2_000);
  }, []);

  const today = todayIstDateKey();
  const lots = matchFifo(transactions).lots;
  const gains = capitalGainsByYear(lots);

  const buttons = [
    {
      key: "holdings",
      label: "Holdings",
      icon: FileSpreadsheet,
      disabled: holdings.length === 0,
      onClick: () => download(`holdings-${today}.csv`, holdingsCsv(holdings)),
    },
    {
      key: "transactions",
      label: "Transactions",
      icon: Receipt,
      disabled: transactions.length === 0,
      onClick: () => download(`transactions-${today}.csv`, transactionsCsv(transactions)),
    },
    {
      key: "capital-gains",
      label: "Capital gains statement",
      icon: Landmark,
      disabled: gains.length === 0,
      onClick: () => download(`capital-gains-${today}.csv`, capitalGainsCsv(gains, lots)),
    },
  ];

  if (buttons.every((button) => button.disabled)) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
        <Download className="h-3.5 w-3.5" /> Export CSV
      </span>
      {buttons.map(({ key, label, icon: Icon, disabled, onClick }) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={onClick}
          title={disabled ? "Nothing to export yet" : `Download ${label.toLowerCase()} as CSV`}
          className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-bg/40 px-2.5 py-1.5 text-[11px] font-semibold text-muted transition hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
