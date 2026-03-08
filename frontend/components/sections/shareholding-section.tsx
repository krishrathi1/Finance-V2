import { ShareholdingPie } from "@/components/charts/shareholding-pie";
import { Card } from "@/components/ui/card";

export function ShareholdingSection({
  quarter,
  promoters,
  fii,
  dii,
  publicHolding
}: {
  quarter: string;
  promoters: number;
  fii: number;
  dii: number;
  publicHolding: number;
}) {
  const rows = [
    { name: "Promoters", value: promoters },
    { name: "FII", value: fii },
    { name: "DII", value: dii },
    { name: "Public", value: publicHolding }
  ];

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold">Shareholding Pattern ({quarter})</h3>
      <div className="mt-2 grid items-center gap-4 md:grid-cols-2">
        <ShareholdingPie promoters={promoters} fii={fii} dii={dii} publicHolding={publicHolding} />
        <div className="space-y-2">
          {rows.map((item) => (
            <div key={item.name} className="rounded-xl border border-border/70 p-3">
              <p className="text-sm text-muted">{item.name}</p>
              <p className="text-2xl font-semibold">{item.value.toFixed(2)}%</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
