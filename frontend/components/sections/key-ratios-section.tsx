import { Card } from "@/components/ui/card";

function RatioBar({ label, value, max = 30 }: { label: string; value: number; max?: number }) {
  const width = `${Math.min(100, (value / max) * 100)}%`;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span>{value.toFixed(2)}</span>
      </div>
      <div className="h-2 rounded-full bg-bg">
        <div className="h-2 rounded-full bg-gradient-to-r from-violet-400 to-indigo-400" style={{ width }} />
      </div>
    </div>
  );
}

export function KeyRatiosSection({ metrics }: { metrics: Record<string, number | null> }) {
  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold">Key Ratio Trends</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <RatioBar label="ROE" value={Number(metrics.roe || 0)} />
        <RatioBar label="ROCE" value={Number(metrics.roce || 0)} />
        <RatioBar label="Profit Margin" value={Number(metrics.profitMargin || 0)} />
        <RatioBar label="Dividend Yield" value={Number(metrics.dividendYield || 0)} max={8} />
      </div>
    </Card>
  );
}
