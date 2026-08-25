// Forensic accounting audit: Beneish M-Score, Altman Z-Score and Piotroski
// F-Score — computed with the real published formulas from deterministically
// generated financial statement components.

import { StockSeed } from "../market/universe";
import { getYearlyFinancials } from "./financials";
import { mulberry32, hashString, clamp } from "../market/rng";

export interface ForensicComponents {
  DSRI: number;
  GMI: number;
  AQI: number;
  SGI: number;
  DEPI: number;
  SGAI: number;
  TATA: number;
  LVGI: number;
}

export interface ForensicAudit {
  mScore: number;
  mScoreRisk: "Low" | "Moderate" | "High";
  components: ForensicComponents;
  zScore: number;
  zZone: "Safe" | "Grey" | "Distress";
  fScore: number;
  fScoreMax: number;
  fStrength: "Weak" | "Moderate" | "Strong";
  governanceFlags: string[];
  overallHealth: "Pristine" | "Healthy" | "Caution" | "Distress";
}

export function computeForensicAudit(seed: StockSeed): ForensicAudit {
  const rand = mulberry32(hashString(`forensic-${seed.s}`));
  const fin = getYearlyFinancials(seed);
  const latest = fin[fin.length - 1];
  const prev = fin[fin.length - 2] ?? latest;

  // Beneish components (ratios ~1 = normal; >1.4 suspicious)
  const salesGrowth = (latest.revenue - prev.revenue) / Math.max(1, prev.revenue);
  const quality = clamp(1.6 - (seed.roe / 40) - (seed.pe ? 0 : 0.15), 0.85, 1.5); // quality firms distort less

  const DSRI = round3(clamp(1 + (rand() - 0.45) * 0.4 + (1 - quality) * 0.4, 0.62, 1.9));
  const GMI = round3(clamp(1 + (rand() - 0.5) * 0.25 - (seed.pg > 15 ? 0.05 : 0), 0.77, 1.6));
  const AQI = round3(clamp(1 + (rand() - 0.5) * 0.3 + seed.de * 0.06, 0.7, 1.8));
  const SGI = round3(clamp(1 + salesGrowth, 0.9, 1.65));
  const DEPI = round3(clamp(1 + (rand() - 0.52) * 0.24, 0.8, 1.5));
  const SGAI = round3(clamp(1 + (rand() - 0.5) * 0.6 - (seed.rg > 12 ? 0.06 : 0), 0.45, 2.1));
  const TATA = round3(clamp((rand() - 0.52) * 0.16 - (seed.de > 1.4 ? 0.02 : 0), -0.12, 0.14));
  const LVGI = round3(clamp(1 + (rand() - 0.45) * 0.3 + seed.de * 0.09, 0.72, 1.95));

  const mScore =
    -4.84 +
    0.92 * DSRI +
    0.528 * GMI +
    0.404 * AQI +
    0.892 * SGI +
    0.115 * DEPI -
    0.172 * SGAI +
    4.037 * TATA +
    0.0327 * LVGI;

  const mScoreRisk = mScore > -1.78 ? "High" : mScore > -2.22 ? "Moderate" : "Low";

  // Altman Z (manufacturing form): Z = 1.2·WC/TA + 1.4·RE/TA + 3.3·EBIT/TA + 0.6·MVE/TL + 1.0·Sales/TA
  const totalAssets = seed.mc / Math.max(0.5, seed.pb) * (1 + seed.de);
  const ebit = latest.ebitda * 0.72;
  const retained = totalAssets * (0.18 + rand() * 0.24);
  const workingCapital = totalAssets * (0.06 + rand() * 0.16);
  const totalLiabilities = Math.max(1, totalAssets - seed.mc / Math.max(0.5, seed.pb));
  const z =
    1.2 * (workingCapital / totalAssets) +
    1.4 * (retained / totalAssets) +
    3.3 * (ebit / totalAssets) +
    0.6 * (seed.mc / totalLiabilities) +
    1.0 * (latest.revenue / totalAssets);
  const zZone = z > 2.99 ? "Safe" : z > 1.81 ? "Grey" : "Distress";

  // Piotroski F-Score (9 signals from the yearly series)
  const signals: boolean[] = [];
  signals.push(latest.netProfit > 0); // ROA positive
  signals.push(latest.ebitda > latest.netProfit * 0.4); // CFO proxy positive
  signals.push(latest.roe > prev.roe); // improving return
  signals.push(latest.netMargin > prev.netMargin); // improving margin
  const leverageUp = seed.de > 1.1 && rand() > 0.5;
  signals.push(!leverageUp); // leverage not rising
  signals.push(seed.de <= 1.2); // manageable leverage
  const sharesStable = rand() > 0.25;
  signals.push(sharesStable); // no dilution
  signals.push(latest.revenue / totalAssets > prev.revenue / totalAssets); // improving asset turnover
  signals.push(latest.revenue > prev.revenue); // revenue growing
  const fScore = signals.filter(Boolean).length;
  const fStrength = fScore >= 7 ? "Strong" : fScore >= 4 ? "Moderate" : "Weak";

  // Governance flags
  const governanceFlags: string[] = [];
  if (seed.ph > 70) governanceFlags.push(`Promoter holding is high at ${seed.ph}% — key-person concentration.`);
  if (seed.de > 1.3) governanceFlags.push(`Debt/equity of ${seed.de.toFixed(2)} is elevated; monitor covenants and interest cover.`);
  if (seed.pe === null) governanceFlags.push("Company is loss-making at the net level.");
  if (seed.ph > 0 && seed.ph < 20 && rand() > 0.6) governanceFlags.push("Low promoter skin-in-the-game relative to peers.");
  if (mScoreRisk !== "Low") governanceFlags.push(`M-Score of ${mScore.toFixed(2)} flags ${mScoreRisk.toLowerCase()} earnings-manipulation probability.`);
  if (governanceFlags.length === 0) governanceFlags.push("No material governance flags detected.");

  const overall =
    mScoreRisk === "High" || zZone === "Distress" || fScore <= 3
      ? "Distress"
      : mScoreRisk === "Moderate" || zZone === "Grey" || fScore <= 5
        ? "Caution"
        : fScore >= 8 && zZone === "Safe"
          ? "Pristine"
          : "Healthy";

  return {
    mScore: Math.round(mScore * 1000) / 1000,
    mScoreRisk,
    components: { DSRI, GMI, AQI, SGI, DEPI, SGAI, TATA, LVGI },
    zScore: Math.round(z * 100) / 100,
    zZone,
    fScore,
    fScoreMax: 9,
    fStrength,
    governanceFlags,
    overallHealth: overall,
  };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
