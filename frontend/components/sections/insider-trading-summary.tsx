import { Card } from "@/components/ui/card";
import { ActionRow } from "@/lib/types";
import { useMemo } from "react";

export function InsiderTradingSummary({ insiderTrades = [] }: { insiderTrades: ActionRow[] }) {
    const stats = useMemo(() => {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const result = {
            '1D': { buys: 0, sells: 0 },
            '1W': { buys: 0, sells: 0 },
            '1M': { buys: 0, sells: 0 },
        };

        insiderTrades.forEach((trade) => {
            // Parse DD-MMM-YYYY or YYYY-MM-DD uniformly as Date
            const date = new Date(trade.date);
            if (isNaN(date.getTime())) return;

            const isBuy = trade.transactionType === "Buy";
            const isSell = trade.transactionType === "Sell";

            if (date >= oneDayAgo) {
                if (isBuy) result['1D'].buys++;
                if (isSell) result['1D'].sells++;
            }
            if (date >= oneWeekAgo) {
                if (isBuy) result['1W'].buys++;
                if (isSell) result['1W'].sells++;
            }
            if (date >= oneMonthAgo) {
                if (isBuy) result['1M'].buys++;
                if (isSell) result['1M'].sells++;
            }
        });

        return result;
    }, [insiderTrades]);

    return (
        <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4">Insider Trading Summary</h3>
            <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl bg-bg p-3 text-center transition-all hover:bg-muted/10">
                    <p className="text-xs font-medium text-muted uppercase tracking-wider mb-2">1 Day</p>
                    <div className="flex flex-col gap-1 text-sm">
                        <span className="text-success font-semibold flex items-center justify-between">
                            Buys <span>{stats['1D'].buys}</span>
                        </span>
                        <span className="text-destructive font-semibold flex items-center justify-between">
                            Sells <span>{stats['1D'].sells}</span>
                        </span>
                    </div>
                </div>
                <div className="rounded-xl bg-bg p-3 text-center transition-all hover:bg-muted/10">
                    <p className="text-xs font-medium text-muted uppercase tracking-wider mb-2">1 Week</p>
                    <div className="flex flex-col gap-1 text-sm">
                        <span className="text-success font-semibold flex items-center justify-between">
                            Buys <span>{stats['1W'].buys}</span>
                        </span>
                        <span className="text-destructive font-semibold flex items-center justify-between">
                            Sells <span>{stats['1W'].sells}</span>
                        </span>
                    </div>
                </div>
                <div className="rounded-xl bg-bg p-3 text-center transition-all hover:bg-muted/10">
                    <p className="text-xs font-medium text-muted uppercase tracking-wider mb-2">1 Month</p>
                    <div className="flex flex-col gap-1 text-sm">
                        <span className="text-success font-semibold flex items-center justify-between">
                            Buys <span>{stats['1M'].buys}</span>
                        </span>
                        <span className="text-destructive font-semibold flex items-center justify-between">
                            Sells <span>{stats['1M'].sells}</span>
                        </span>
                    </div>
                </div>
            </div>
        </Card>
    );
}
