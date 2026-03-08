import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";

export function CompetitorsSection({
  competitors
}: {
  competitors: Array<{ name: string; marketCap: number; pe: number; pb: number; roe: number }>;
}) {
  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold">Competitors</h3>
      <div className="mt-3 overflow-auto rounded-xl border border-border/70">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-bg">
            <tr>
              <th className="border-b border-border p-2 text-left">Company</th>
              <th className="border-b border-border p-2 text-left">MCap (Cr)</th>
              <th className="border-b border-border p-2 text-left">PE</th>
              <th className="border-b border-border p-2 text-left">PB</th>
              <th className="border-b border-border p-2 text-left">ROE</th>
            </tr>
          </thead>
          <tbody>
            {competitors.map((row, index) => (
              <tr key={index} className="border-b border-border/50 last:border-none">
                <td className="p-2">{row.name}</td>
                <td className="p-2">{formatNumber(row.marketCap)}</td>
                <td className="p-2">{formatNumber(row.pe)}</td>
                <td className="p-2">{formatNumber(row.pb)}</td>
                <td className="p-2">{formatNumber(row.roe)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
