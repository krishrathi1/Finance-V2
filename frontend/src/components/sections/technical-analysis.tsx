import { Activity, ArrowDown, ArrowUp, BarChart3, Gauge, Layers, Minus } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { PricePoint } from "@/shared/price-stats";
import {
  bollingerBands,
  macd,
  movingAverages,
  pivotLevels,
  rsi,
  volumeProfile,
} from "@/shared/technical-indicators";
import { volatilityRegime } from "@/shared/return-analytics";

function inr(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function signed(value: number, digits = 1) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function Row({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "bad" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "text-success"
      : tone === "bad"
      ? "text-danger"
      : tone === "warn"
      ? "text-amber-400"
      : "text-text";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/30 py-1.5 last:border-0">
      <div className="min-w-0">
        <p className="text-xs font-medium">{label}</p>
        {hint ? <p className="text-[11px] leading-4 text-muted">{hint}</p> : null}
      </div>
      <p className={`shrink-0 text-sm font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

/**
 * Technical indicators computed client-side from the price history already in
 * the payload — moving averages, momentum, bands, volume and pivots.
 *
 * Each block renders only if its indicator has enough history, so a recently
 * listed stock shows the few that are valid rather than a grid of dashes.
 */
export function TechnicalAnalysis({ history }: { history?: PricePoint[] }) {
  const ma = movingAverages(history);
  const rsiReading = rsi(history);
  const macdReading = macd(history);
  const bands = bollingerBands(history);
  const volume = volumeProfile(history);
  const pivots = pivotLevels(history);
  const regime = volatilityRegime(history);

  if (!ma && !rsiReading && !macdReading && !bands && !volume && !pivots) return null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-violet-400 to-fuchsia-500" />
        <h3 className="text-lg font-semibold">Technical Analysis</h3>
        {ma?.trend ? (
          <span
            className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold ${
              ma.trend === "golden-cross"
                ? "bg-success/15 text-success"
                : "bg-danger/15 text-danger"
            }`}
          >
            {ma.trend === "golden-cross" ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )}
            {ma.trend === "golden-cross" ? "Golden cross" : "Death cross"}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {/* Trend */}
        {ma ? (
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
              <Layers className="h-3 w-3" /> Trend
            </p>
            {ma.sma50 !== null && (
              <Row
                label="50-day average"
                value={inr(ma.sma50)}
                hint={
                  ma.priceVsSma50Percent === null
                    ? undefined
                    : `Price ${signed(ma.priceVsSma50Percent)} vs 50DMA`
                }
                tone={(ma.priceVsSma50Percent ?? 0) >= 0 ? "good" : "bad"}
              />
            )}
            {ma.sma200 !== null && (
              <Row
                label="200-day average"
                value={inr(ma.sma200)}
                hint={
                  ma.priceVsSma200Percent === null
                    ? undefined
                    : `Price ${signed(ma.priceVsSma200Percent)} vs 200DMA`
                }
                tone={(ma.priceVsSma200Percent ?? 0) >= 0 ? "good" : "bad"}
              />
            )}
            {ma.sma200 === null && (
              <p className="text-[11px] text-muted">
                200-day average needs a year of prices — not available yet.
              </p>
            )}
          </div>
        ) : null}

        {/* Momentum */}
        {(rsiReading || macdReading) && (
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
              <Gauge className="h-3 w-3" /> Momentum
            </p>
            {rsiReading && (
              <Row
                label="RSI (14)"
                value={rsiReading.value.toFixed(1)}
                hint={
                  rsiReading.zone === "overbought"
                    ? "Above 70 — stretched to the upside"
                    : rsiReading.zone === "oversold"
                    ? "Below 30 — stretched to the downside"
                    : "Between 30 and 70 — neutral"
                }
                tone={
                  rsiReading.zone === "overbought"
                    ? "warn"
                    : rsiReading.zone === "oversold"
                    ? "bad"
                    : "neutral"
                }
              />
            )}
            {macdReading && (
              <Row
                label="MACD (12,26,9)"
                value={macdReading.histogram.toFixed(2)}
                hint={
                  macdReading.crossover === "bullish"
                    ? "MACD above its signal line"
                    : macdReading.crossover === "bearish"
                    ? "MACD below its signal line"
                    : "MACD sitting on its signal line"
                }
                tone={
                  macdReading.crossover === "bullish"
                    ? "good"
                    : macdReading.crossover === "bearish"
                    ? "bad"
                    : "neutral"
                }
              />
            )}
          </div>
        )}

        {/* Bands + volatility */}
        {(bands || regime) && (
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
              <Activity className="h-3 w-3" /> Volatility
            </p>
            {bands && (
              <>
                <Row
                  label="Bollinger position"
                  value={`${bands.percentB.toFixed(0)}%`}
                  hint={`${inr(bands.lower)} – ${inr(bands.upper)} band`}
                  tone={bands.percentB > 100 ? "warn" : bands.percentB < 0 ? "bad" : "neutral"}
                />
                <Row
                  label="Band width"
                  value={`${bands.bandwidthPercent.toFixed(1)}%`}
                  hint="Narrow bands often precede a breakout"
                />
              </>
            )}
            {regime && (
              <Row
                label="Volatility regime"
                value={regime.regime === "elevated" ? "Elevated" : regime.regime === "calm" ? "Calm" : "Normal"}
                hint={`30-day ${regime.recentPercent.toFixed(0)}% vs ${regime.baselinePercent.toFixed(0)}% typical`}
                tone={regime.regime === "elevated" ? "warn" : "neutral"}
              />
            )}
          </div>
        )}

        {/* Volume */}
        {volume && (
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
              <BarChart3 className="h-3 w-3" /> Volume
            </p>
            <Row
              label="Relative volume"
              value={`${volume.relativeVolume.toFixed(2)}x`}
              hint={volume.isSpike ? "Spike — over twice the 20-day average" : "Against the 20-day average"}
              tone={volume.isSpike ? "warn" : "neutral"}
            />
            <Row
              label="Volume trend"
              value={
                volume.trend === "rising" ? "Rising" : volume.trend === "falling" ? "Falling" : "Steady"
              }
              hint="20-day average vs 50-day"
              tone={volume.trend === "rising" ? "good" : "neutral"}
            />
          </div>
        )}
      </div>

      {/* Pivots */}
      {pivots && (
        <div className="mt-4 border-t border-border/40 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            <Minus className="h-3 w-3" /> Support &amp; resistance (from the last session)
          </p>
          <div className="grid grid-cols-5 gap-1.5 text-center">
            {[
              { label: "S2", value: pivots.support2, tone: "text-danger" },
              { label: "S1", value: pivots.support1, tone: "text-danger/80" },
              { label: "Pivot", value: pivots.pivot, tone: "text-text" },
              { label: "R1", value: pivots.resistance1, tone: "text-success/80" },
              { label: "R2", value: pivots.resistance2, tone: "text-success" },
            ].map((level) => (
              <div key={level.label} className="rounded-lg border border-border/40 bg-bg/40 px-1 py-1.5">
                <p className="text-[10px] font-medium text-muted">{level.label}</p>
                <p className={`text-[11px] font-semibold tabular-nums ${level.tone}`}>
                  {inr(level.value)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-4 text-muted/70">
        Technical indicators describe past price behaviour. They are not predictions and not
        investment advice.
      </p>
    </Card>
  );
}
