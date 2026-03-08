import { Card } from "@/components/ui/card";
import { formatPercent } from "@/lib/format";

function cellColor(value: number | null) {
  if (value === null) return "bg-zinc-500/10 text-muted";
  if (value > 0) return "bg-emerald-600 text-white font-medium";
  if (value < 0) return "bg-rose-600 text-white font-medium";
  return "bg-zinc-500/20 text-muted";
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ReturnsPanel({
  summary,
  heatmap
}: {
  summary: Array<{ label: string; value: number | null }>;
  heatmap: Array<Record<string, number | null>>;
}) {
  return (
    <div className="space-y-3">
      <Card className="p-4">
        <h3 className="text-lg font-semibold">Stock Returns</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-6">
          {summary.map((item) => (
            <div
              key={item.label}
              className={`rounded-xl p-3 ${
                item.value === null ? "bg-zinc-500/15" : item.value >= 0 ? "bg-success/20" : "bg-danger/20"
              }`}
            >
              <p className="text-sm text-muted">{item.label}</p>
              <p
                className={`mt-1 text-2xl font-semibold ${
                  item.value === null ? "text-muted" : item.value >= 0 ? "text-success" : "text-danger"
                }`}
              >
                {item.value === null ? "N/A" : formatPercent(item.value)}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="overflow-auto p-4">
        <h3 className="text-lg font-semibold">Stock Heatmap</h3>
        <table className="mt-3 w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-border p-2 text-left">Year</th>
              {months.map((month) => (
                <th key={month} className="border border-border p-2 text-left">
                  {month}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmap.map((row) => (
              <tr key={row.year}>
                <td className="border border-border p-2 font-semibold">{row.year}</td>
                {Array.from({ length: 12 }, (_, idx) => {
                  const value = row[String(idx + 1)] as number | null;
                  return (
                    <td key={idx} className={`border border-border p-2 ${cellColor(value)}`}>
                      {value === null ? "-" : formatPercent(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
