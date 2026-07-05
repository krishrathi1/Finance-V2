import { Card } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/format";

type Tone = "up" | "down" | "neutral";

function toneClass(tone: Tone) {
  if (tone === "up") return "text-success";
  if (tone === "down") return "text-danger";
  return "text-text";
}

function Indicator({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-bg/40 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${toneClass(tone)}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function TechnicalsSection({ technicals }: { technicals: Record<string, any> }) {
  const pivots = technicals.pivotLevels || {};
  const hasPivots = ["standard", "fibonacci"].some((row) => {
    const data = pivots[row];
    return data && Object.values(data).some((v) => isNum(v) && v !== 0);
  });

  const trend: string = typeof technicals.trend === "string" ? technicals.trend : "Neutral";
  const trendTone: Tone = trend === "Bullish" ? "up" : trend === "Bearish" ? "down" : "neutral";

  const rsi = technicals.rsi14;
  const rsiTone: Tone = isNum(rsi) ? (rsi >= 70 ? "down" : rsi <= 30 ? "up" : "neutral") : "neutral";
  const rsiHint = isNum(rsi) ? (rsi >= 70 ? "Overbought" : rsi <= 30 ? "Oversold" : "Neutral zone") : undefined;

  const macd = technicals.macd;
  const macdTone: Tone = isNum(macd) ? (macd > 0 ? "up" : macd < 0 ? "down" : "neutral") : "neutral";

  const indicators = [
    { key: "trend", show: true, node: <Indicator label="Trend" value={trend} tone={trendTone} hint="vs 20-EMA" /> },
    {
      key: "rsi",
      show: isNum(rsi),
      node: <Indicator label="RSI (14)" value={formatNumber(rsi)} tone={rsiTone} hint={rsiHint} />,
    },
    {
      key: "macd",
      show: isNum(macd),
      node: <Indicator label="MACD" value={formatNumber(macd)} tone={macdTone} hint="12/26" />,
    },
    {
      key: "ema20",
      show: isNum(technicals.ema20),
      node: <Indicator label="EMA 20" value={formatCurrency(technicals.ema20, "INR")} />,
    },
    {
      key: "ema50",
      show: isNum(technicals.ema50),
      node: <Indicator label="EMA 50" value={formatCurrency(technicals.ema50, "INR")} />,
    },
  ].filter((i) => i.show);

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-accent to-amber-400" />
        <h3 className="text-lg font-semibold">Technicals</h3>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {indicators.map((i) => (
          <div key={i.key}>{i.node}</div>
        ))}
      </div>

      <h4 className="mt-5 text-sm font-semibold text-muted">Pivot Levels</h4>
      {hasPivots ? (
        <div className="mt-2 overflow-auto rounded-xl border border-border/70">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-bg">
              <tr>
                <th className="border-b border-border p-3 text-left font-semibold">Type</th>
                {["S3", "S2", "S1", "Pivot", "R1", "R2", "R3"].map((level) => (
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
                        {isNum(rowData[key]) ? formatCurrency(rowData[key], "INR") : "—"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-2 rounded-xl border border-border/70 bg-bg/40 p-4 text-sm text-muted">
          Pivot levels are unavailable for this stock right now.
        </p>
      )}
    </Card>
  );
}
