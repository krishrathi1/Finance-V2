import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";

function cell(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "NA";
  return `${formatNumber(value)}${suffix}`;
}

export function CompetitorsSection({
  competitors
}: {
  competitors: {
    table: Array<{
      name: string;
      marketCap: number;
      pe: number | null;
      pb: number | null;
      roe: number | null;
    }>;
    sectorName?: string;
    industryName?: string;
  };
}) {
  const rows = competitors.table ?? [];
  const title = competitors.industryName || competitors.sectorName;

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h3 className="text-lg font-semibold">Competitors</h3>
        {title ? <p className="text-sm text-muted">Peers in {title}</p> : null}
      </div>
      {rows.length ? (
        <div className="overflow-auto rounded-xl border border-border/70">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-bg">
              <tr>
                <th className="border-b border-border p-2 text-left">Company Name</th>
                <th className="border-b border-border p-2 text-left">MCap (Cr)</th>
                <th className="border-b border-border p-2 text-left">PE</th>
                <th className="border-b border-border p-2 text-left">P/B</th>
                <th className="border-b border-border p-2 text-left">ROE</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b border-border/50 last:border-none">
                  <td className="p-2">{row.name}</td>
                  <td className="p-2">{cell(row.marketCap)}</td>
                  <td className="p-2">{cell(row.pe)}</td>
                  <td className="p-2">{cell(row.pb)}</td>
                  <td className="p-2">{cell(row.roe, "%")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">No matching peer companies found for this stock yet.</p>
      )}
    </Card>
  );
}
