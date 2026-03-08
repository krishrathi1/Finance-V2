import { Card } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/format";

export function TechnicalsSection({ technicals }: { technicals: Record<string, any> }) {
  const pivots = technicals.pivotLevels || {};
  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold">Technicals</h3>
      <div className="mt-3 overflow-auto rounded-xl border border-border/70">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-bg">
            <tr>
              <th className="border-b border-border p-3 text-left font-semibold">Type</th>
              {["S3", "S2", "S1", "Pivot Points", "R1", "R2", "R3"].map((level) => (
                <th key={level} className="border-b border-border p-3 text-left font-semibold">
                  {level}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {["Standard", "Fibonacci"].map((type) => {
              const rowData = pivots[type.toLowerCase()] || {};
              return (
                <tr key={type} className="border-b border-border/50 last:border-0 hover:bg-bg/50">
                  <td className="p-3 font-medium">{type}</td>
                  {["s3", "s2", "s1", "pivot", "r1", "r2", "r3"].map((key) => (
                    <td key={key} className="p-3 text-muted">
                      {formatCurrency(rowData[key] || 0, "INR")}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
