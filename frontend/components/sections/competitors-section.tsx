import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";

export function CompetitorsSection({
  competitors
}: {
  competitors: {
    table: Array<{ name: string; marketCap: number; pe: number; pb: number; roe: number }>;
    sectorName?: string;
    industryName?: string;
    sectorCompanies?: Array<{ symbol: string; name: string }>;
    industryCompanies?: Array<{ symbol: string; name: string }>;
  };
}) {
  const sectorCompanies = competitors.sectorCompanies ?? [];
  const industryCompanies = competitors.industryCompanies ?? [];
  const rows = competitors.table ?? [];

  const renderCompanyGroup = (
    title: string,
    subtitle: string | undefined,
    companies: Array<{ symbol: string; name: string }>
  ) => (
    <div className="rounded-2xl border border-border/70 bg-bg p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-text/55">{title}</div>
      <div className="mt-2 text-lg font-semibold text-text">{subtitle || "Not available"}</div>
      {companies.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {companies.map((company) => (
            <div
              key={company.symbol}
              className="rounded-full border border-border/70 bg-white px-3 py-2 text-sm text-text"
            >
              <span className="font-medium">{company.symbol}</span>
              <span className="ml-2 text-text/65">{company.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-text/65">No matching companies found for this stock yet.</p>
      )}
    </div>
  );

  return (
    <Card className="space-y-4 p-4">
      <h3 className="text-lg font-semibold">Competitors</h3>
      <div className="grid gap-4 lg:grid-cols-2">
        {renderCompanyGroup("Sector", competitors.sectorName, sectorCompanies)}
        {renderCompanyGroup("Industry", competitors.industryName, industryCompanies)}
      </div>
      {rows.length ? (
        <div className="overflow-auto rounded-xl border border-border/70">
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
              {rows.map((row, index) => (
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
      ) : null}
    </Card>
  );
}
