import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";

export function ResearchSummaryCard({ cmp, symbol, companyName, aiTarget }: { cmp: number; symbol: string; companyName: string; aiTarget: number }) {
  const upside = ((aiTarget - cmp) / cmp) * 100;
  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold">Research Report Snapshot</h3>
      <p className="mt-2 text-sm text-muted">
        {companyName} ({symbol})
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
        <div className="rounded-xl bg-bg p-3">
          <p className="text-xs text-muted">CMP</p>
          <p className="text-xl font-semibold">{formatCurrency(cmp)}</p>
        </div>
        <div className="rounded-xl bg-bg p-3">
          <p className="text-xs text-muted">AI Target</p>
          <p className="text-xl font-semibold">{formatCurrency(aiTarget)}</p>
        </div>
        <div className="rounded-xl bg-success/20 p-3">
          <p className="text-xs text-muted">Upside</p>
          <p className="text-xl font-semibold text-success">{upside.toFixed(2)}%</p>
        </div>
      </div>
    </Card>
  );
}
