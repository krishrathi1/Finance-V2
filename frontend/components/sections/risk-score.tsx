import { AlertTriangle } from "lucide-react";

import { Card } from "@/components/ui/card";

export function RiskScore({
  score,
  components,
  explanation
}: {
  score: number;
  components: Record<string, number>;
  explanation: string;
}) {
  const riskPercent = (score / 5) * 100;
  const color = riskPercent < 40 ? "bg-success" : riskPercent < 70 ? "bg-accent" : "bg-danger";

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-accent" />
        <h3 className="text-lg font-semibold">Risk Score</h3>
      </div>
      <div className="mt-4 rounded-xl border border-border/70 p-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span>Low</span>
          <span>High</span>
        </div>
        <div className="h-3 rounded-full bg-bg">
          <div className={`h-3 rounded-full ${color}`} style={{ width: `${Math.max(3, riskPercent)}%` }} />
        </div>
        <p className="mt-2 text-2xl font-bold">{score.toFixed(2)} / 5</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        {Object.entries(components).map(([key, value]) => (
          <div key={key} className="rounded-lg bg-bg px-2 py-2">
            <p className="capitalize text-muted">{key}</p>
            <p className="font-semibold">{value.toFixed(2)}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">{explanation}</p>
    </Card>
  );
}
