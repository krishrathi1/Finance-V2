/**
 * Forensic Accounting & Quality Health Engine
 * 
 * Computes:
 * 1. Beneish M-Score: Probability of earnings manipulation (M-Score > -1.78 suggests manipulation risk)
 * 2. Altman Z-Score: Financial distress & bankruptcy prediction (Z > 2.99 Safe, 1.81 - 2.99 Grey, < 1.81 Distress)
 * 3. Piotroski F-Score: 9-point fundamental trend strength metric (0-3 Weak, 4-6 Moderate, 7-9 Strong)
 * 4. Corporate Governance & Accrual Audit Checklist
 */

export interface ForensicMetrics {
  mScore: {
    score: number;
    manipulationRisk: "Low" | "Moderate" | "High";
    explanation: string;
    details: {
      dsri: number; // Days Sales in Receivables Index
      gmi: number;  // Gross Margin Index
      aqi: number;  // Asset Quality Index
      sgi: number;  // Sales Growth Index
      depi: number; // Depreciation Index
      sgai: number; // SG&A Expense Index
      tata: number; // Total Accruals to Total Assets
      lvgi: number; // Leverage Index
    };
  };
  zScore: {
    score: number;
    zone: "Safe" | "Grey" | "Distress";
    bankruptcyRisk: "Low" | "Moderate" | "High";
    explanation: string;
    components: {
      x1WorkingCapitalToAssets: number;
      x2RetainedEarningsToAssets: number;
      x3EbitToAssets: number;
      x4MarketCapToLiabilities: number;
      x5SalesToAssets: number;
    };
  };
  fScore: {
    score: number; // 0 to 9
    rating: "Strong" | "Moderate" | "Weak";
    points: Array<{
      category: "Profitability" | "Leverage & Liquidity" | "Operating Efficiency";
      name: string;
      passed: boolean;
      description: string;
    }>;
  };
  governanceFlags: Array<{
    title: string;
    severity: "low" | "medium" | "high" | "clean";
    description: string;
  }>;
  compositeForensicVerdict: {
    overallHealth: "Pristine" | "Healthy" | "Caution" | "High Risk";
    summary: string;
  };
}

export interface FinancialStatementsInput {
  marketCap?: number;
  totalAssets?: number;
  totalAssetsPrev?: number;
  currentAssets?: number;
  currentAssetsPrev?: number;
  currentLiabilities?: number;
  currentLiabilitiesPrev?: number;
  totalLiabilities?: number;
  longTermDebt?: number;
  longTermDebtPrev?: number;
  revenue?: number;
  revenuePrev?: number;
  grossProfit?: number;
  grossProfitPrev?: number;
  netIncome?: number;
  netIncomePrev?: number;
  operatingCashFlow?: number;
  operatingCashFlowPrev?: number;
  ebit?: number;
  retainedEarnings?: number;
  receivables?: number;
  receivablesPrev?: number;
  depreciation?: number;
  depreciationPrev?: number;
  sgaExpense?: number;
  sgaExpensePrev?: number;
  promoterPledgePct?: number;
  promoterHoldingChangePct?: number;
  sharesOutstanding?: number;
  sharesOutstandingPrev?: number;
}

/**
 * Calculates Beneish M-Score:
 * M = -4.84 + 0.920*DSRI + 0.528*GMI + 0.404*AQI + 0.892*SGI + 0.115*DEPI - 0.172*SGAI + 4.037*TATA + 0.0327*LVGI
 */
export function calculateBeneishMScore(input: FinancialStatementsInput) {
  const rev = input.revenue || 1;
  const revPrev = input.revenuePrev || rev || 1;
  const rec = input.receivables || rev * 0.12;
  const recPrev = input.receivablesPrev || revPrev * 0.12;

  const dsri = (rec / rev) / ((recPrev / revPrev) || 1);

  const gp = input.grossProfit || rev * 0.35;
  const gpPrev = input.grossProfitPrev || revPrev * 0.35;
  const gm = gp / rev;
  const gmPrev = gpPrev / revPrev;
  const gmi = (gmPrev || 1) / (gm || 1);

  const assets = input.totalAssets || (input.marketCap ? input.marketCap * 0.7 : 1000);
  const assetsPrev = input.totalAssetsPrev || assets * 0.92;
  const ca = input.currentAssets || assets * 0.4;
  const caPrev = input.currentAssetsPrev || assetsPrev * 0.4;
  const nonCurrentRatio = 1 - (ca / assets);
  const nonCurrentRatioPrev = 1 - (caPrev / assetsPrev);
  const aqi = nonCurrentRatio / (nonCurrentRatioPrev || 1);

  const sgi = rev / revPrev;

  const dep = input.depreciation || assets * 0.04;
  const depPrev = input.depreciationPrev || assetsPrev * 0.04;
  const depRate = dep / ((assets - ca) || 1);
  const depRatePrev = depPrev / ((assetsPrev - caPrev) || 1);
  const depi = (depRatePrev || 1) / (depRate || 1);

  const sga = input.sgaExpense || rev * 0.15;
  const sgaPrev = input.sgaExpensePrev || revPrev * 0.15;
  const sgai = (sga / rev) / ((sgaPrev / revPrev) || 1);

  const netInc = input.netIncome ?? rev * 0.1;
  const cfo = input.operatingCashFlow ?? netInc * 1.1;
  const tata = (netInc - cfo) / assets;

  const tl = input.totalLiabilities || (assets * 0.45);
  const tlPrev = assetsPrev * 0.45;
  const lvgi = (tl / assets) / ((tlPrev / assetsPrev) || 1);

  // Clamped indices to prevent runaway anomalies on sparse data
  const cDSRI = Math.max(0.5, Math.min(3, isNaN(dsri) ? 1 : dsri));
  const cGMI = Math.max(0.5, Math.min(3, isNaN(gmi) ? 1 : gmi));
  const cAQI = Math.max(0.5, Math.min(3, isNaN(aqi) ? 1 : aqi));
  const cSGI = Math.max(0.5, Math.min(3, isNaN(sgi) ? 1 : sgi));
  const cDEPI = Math.max(0.5, Math.min(3, isNaN(depi) ? 1 : depi));
  const cSGAI = Math.max(0.5, Math.min(3, isNaN(sgai) ? 1 : sgai));
  const cTATA = Math.max(-0.5, Math.min(0.5, isNaN(tata) ? -0.02 : tata));
  const cLVGI = Math.max(0.5, Math.min(3, isNaN(lvgi) ? 1 : lvgi));

  const rawMScore =
    -4.84 +
    0.92 * cDSRI +
    0.528 * cGMI +
    0.404 * cAQI +
    0.892 * cSGI +
    0.115 * cDEPI -
    0.172 * cSGAI +
    4.037 * cTATA +
    0.0327 * cLVGI;

  const score = isNaN(rawMScore) ? -2.25 : Number(rawMScore.toFixed(2));
  let manipulationRisk: "Low" | "Moderate" | "High" = "Low";
  let explanation = "Financial statements reflect healthy, standard accounting practices with negligible risk of earnings manipulation.";

  if (score > -1.78) {
    manipulationRisk = "High";
    explanation = "Beneish M-Score exceeds the -1.78 threshold, signaling aggressive revenue recognition, high accruals, or asset capitalization anomalies.";
  } else if (score > -2.22) {
    manipulationRisk = "Moderate";
    explanation = "Beneish M-Score lies in the moderate boundary. While not critical, accruals and revenue growth velocity should be monitored.";
  }

  return {
    score,
    manipulationRisk,
    explanation,
    details: {
      dsri: Number((isNaN(cDSRI) ? 1 : cDSRI).toFixed(2)),
      gmi: Number((isNaN(cGMI) ? 1 : cGMI).toFixed(2)),
      aqi: Number((isNaN(cAQI) ? 1 : cAQI).toFixed(2)),
      sgi: Number((isNaN(cSGI) ? 1 : cSGI).toFixed(2)),
      depi: Number((isNaN(cDEPI) ? 1 : cDEPI).toFixed(2)),
      sgai: Number((isNaN(cSGAI) ? 1 : cSGAI).toFixed(2)),
      tata: Number((isNaN(cTATA) ? -0.02 : cTATA).toFixed(3)),
      lvgi: Number((isNaN(cLVGI) ? 1 : cLVGI).toFixed(2)),
    },
  };
}

/**
 * Calculates Altman Z-Score:
 * Z = 1.2*X1 + 1.4*X2 + 3.3*X3 + 0.6*X4 + 0.999*X5
 */
export function calculateAltmanZScore(input: FinancialStatementsInput) {
  const assets = Math.max(1, input.totalAssets || (input.marketCap ? input.marketCap * 0.7 : 1000));
  const ca = input.currentAssets || assets * 0.4;
  const cl = input.currentLiabilities || assets * 0.25;
  const workingCapital = ca - cl;
  const x1 = workingCapital / assets;

  const retainedEarnings = input.retainedEarnings || assets * 0.28;
  const x2 = retainedEarnings / assets;

  const ebit = input.ebit ?? (input.revenue ? input.revenue * 0.16 : assets * 0.12);
  const x3 = ebit / assets;

  const mcap = Math.max(0, input.marketCap || assets * 1.5);
  const tl = Math.max(1, input.totalLiabilities || (assets * 0.4));
  const x4 = mcap / tl;

  const rev = Math.max(0, input.revenue || assets * 0.8);
  const x5 = rev / assets;

  const rawZ = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 0.999 * x5;
  const score = isNaN(rawZ) ? 3.10 : Number(Math.max(0, rawZ).toFixed(2));

  let zone: "Safe" | "Grey" | "Distress" = "Safe";
  let bankruptcyRisk: "Low" | "Moderate" | "High" = "Low";
  let explanation = "Altman Z-Score is well within the Safe Zone (> 2.99), indicating robust solvency, low leverage risk, and strong financial buffer.";

  if (score < 1.81) {
    zone = "Distress";
    bankruptcyRisk = "High";
    explanation = "Altman Z-Score falls in the Distress Zone (< 1.81), indicating elevated liquidity pressure, heavy debt burden, or structural cash flow deficits.";
  } else if (score < 2.99) {
    zone = "Grey";
    bankruptcyRisk = "Moderate";
    explanation = "Altman Z-Score is in the Grey Zone (1.81 – 2.99). The business is solvent but requires disciplined debt and working capital management.";
  }

  return {
    score,
    zone,
    bankruptcyRisk,
    explanation,
    components: {
      x1WorkingCapitalToAssets: Number(x1.toFixed(3)),
      x2RetainedEarningsToAssets: Number(x2.toFixed(3)),
      x3EbitToAssets: Number(x3.toFixed(3)),
      x4MarketCapToLiabilities: Number(x4.toFixed(3)),
      x5SalesToAssets: Number(x5.toFixed(3)),
    },
  };
}

/**
 * Calculates Piotroski F-Score (0 to 9):
 */
export function calculatePiotroskiFScore(input: FinancialStatementsInput) {
  const assets = input.totalAssets || 1000;
  const assetsPrev = input.totalAssetsPrev || assets * 0.95;
  const netInc = input.netIncome ?? 100;
  const netIncPrev = input.netIncomePrev ?? 85;
  const cfo = input.operatingCashFlow ?? (netInc * 1.15);
  const rev = input.revenue || 1000;
  const revPrev = input.revenuePrev || 900;
  const gp = input.grossProfit || rev * 0.35;
  const gpPrev = input.grossProfitPrev || revPrev * 0.34;

  const ca = input.currentAssets || assets * 0.4;
  const caPrev = input.currentAssetsPrev || assetsPrev * 0.38;
  const cl = input.currentLiabilities || assets * 0.22;
  const clPrev = input.currentLiabilitiesPrev || assetsPrev * 0.23;

  const ltDebt = input.longTermDebt ?? assets * 0.15;
  const ltDebtPrev = input.longTermDebtPrev ?? assetsPrev * 0.16;

  const shares = input.sharesOutstanding || 100;
  const sharesPrev = input.sharesOutstandingPrev || 100;

  // 1. Positive Net Income
  const p1 = netInc > 0;
  // 2. Positive Operating Cash Flow
  const p2 = cfo > 0;
  // 3. ROA Higher than Previous Year
  const roa = netInc / assets;
  const roaPrev = netIncPrev / assetsPrev;
  const p3 = roa > roaPrev;
  // 4. Quality of Earnings (CFO > Net Income)
  const p4 = cfo > netInc;

  // 5. Lower Long-Term Debt / Assets
  const p5 = (ltDebt / assets) <= (ltDebtPrev / assetsPrev);
  // 6. Higher Current Ratio
  const cr = ca / (cl || 1);
  const crPrev = caPrev / (clPrev || 1);
  const p6 = cr >= crPrev;
  // 7. No Share Dilution
  const p7 = shares <= sharesPrev;

  // 8. Higher Gross Margin
  const gm = gp / rev;
  const gmPrev = gpPrev / revPrev;
  const p8 = gm >= gmPrev;
  // 9. Higher Asset Turnover
  const at = rev / assets;
  const atPrev = revPrev / assetsPrev;
  const p9 = at >= atPrev;

  const points: ForensicMetrics["fScore"]["points"] = [
    {
      category: "Profitability",
      name: "Positive Net Income",
      passed: p1,
      description: p1 ? "Positive bottom-line profit reported this period." : "Reported net loss for the recent period.",
    },
    {
      category: "Profitability",
      name: "Positive Cash Flow from Operations",
      passed: p2,
      description: p2 ? "Operating activities generated positive cash inflow." : "Negative operating cash flow.",
    },
    {
      category: "Profitability",
      name: "Return on Assets (ROA) Expansion",
      passed: p3,
      description: p3 ? "Asset profitability expanded compared to previous year." : "ROA contracted year-over-year.",
    },
    {
      category: "Profitability",
      name: "Cash Quality (CFO > Net Income)",
      passed: p4,
      description: p4 ? "Operating cash flow exceeds net profit, confirming strong cash realization." : "Net profit exceeds cash flow (higher accruals).",
    },
    {
      category: "Leverage & Liquidity",
      name: "Decreasing Long-Term Debt Ratio",
      passed: p5,
      description: p5 ? "Long-term debt leverage declined or remained conservative." : "Long-term debt leverage expanded relative to assets.",
    },
    {
      category: "Leverage & Liquidity",
      name: "Current Ratio Improvement",
      passed: p6,
      description: p6 ? "Short-term liquidity buffer strengthened." : "Current ratio contracted compared to previous year.",
    },
    {
      category: "Leverage & Liquidity",
      name: "Zero Equity Dilution",
      passed: p7,
      description: p7 ? "No new equity shares issued, protecting shareholder value." : "Share count increased (equity dilution).",
    },
    {
      category: "Operating Efficiency",
      name: "Gross Margin Expansion",
      passed: p8,
      description: p8 ? "Pricing power and gross margin improved." : "Gross margin compressed compared to prior year.",
    },
    {
      category: "Operating Efficiency",
      name: "Asset Turnover Acceleration",
      passed: p9,
      description: p9 ? "Asset turnover improved, generating more revenue per rupee of asset." : "Asset turnover slowed.",
    },
  ];

  const score = points.filter((p) => p.passed).length;
  let rating: "Strong" | "Moderate" | "Weak" = "Strong";
  if (score <= 3) rating = "Weak";
  else if (score <= 6) rating = "Moderate";

  return {
    score,
    rating,
    points,
  };
}

/**
 * Computes all forensic metrics, governance flags, and composite verdict.
 */
export function computeForensicAudit(input: FinancialStatementsInput): ForensicMetrics {
  const mScore = calculateBeneishMScore(input);
  const zScore = calculateAltmanZScore(input);
  const fScore = calculatePiotroskiFScore(input);

  const governanceFlags: ForensicMetrics["governanceFlags"] = [];

  // Promoter Pledge check
  const pledge = input.promoterPledgePct ?? 0;
  if (pledge > 35) {
    governanceFlags.push({
      title: "High Promoter Share Pledge",
      severity: "high",
      description: `Promoter pledge is at ${pledge.toFixed(1)}%, posing margin call and ownership transition risks during sharp market corrections.`,
    });
  } else if (pledge > 10) {
    governanceFlags.push({
      title: "Moderate Promoter Pledge",
      severity: "medium",
      description: `Promoter pledge is ${pledge.toFixed(1)}%. Monitor debt obligations to ensure encumbered shares are systematically released.`,
    });
  } else {
    governanceFlags.push({
      title: "Clean Promoter Encumbrance",
      severity: "clean",
      description: "Negligible or zero promoter share pledge detected, indicating unencumbered promoter backing.",
    });
  }

  // Accrual / Cash Realization check
  const netInc = input.netIncome ?? 100;
  const cfo = input.operatingCashFlow ?? (netInc * 1.1);
  if (netInc > 0 && cfo < 0) {
    governanceFlags.push({
      title: "Severe Accrual Divergence (CFO < 0 despite Profit)",
      severity: "high",
      description: "Company reported positive accounting net profit while operating cash flow was negative, indicating uncollected revenues or aggressive inventory build.",
    });
  } else if (netInc > 0 && cfo < netInc * 0.7) {
    governanceFlags.push({
      title: "Elevated Accruals",
      severity: "medium",
      description: "Operating cash flow is less than 70% of reported net profit, indicating slower cash conversion.",
    });
  } else {
    governanceFlags.push({
      title: "High Cash Flow Conversion",
      severity: "clean",
      description: "Operating cash flow strongly tracks or exceeds reported net profits.",
    });
  }

  // Promoter Holding Trend
  const promoterChange = input.promoterHoldingChangePct ?? 0;
  if (promoterChange < -2) {
    governanceFlags.push({
      title: "Promoter Stake Reduction",
      severity: "medium",
      description: `Promoter stake declined by ${Math.abs(promoterChange).toFixed(1)}% over recent quarters. Verify if divestment was for growth capital or promoter exit.`,
    });
  }

  // Determine Overall Forensic Health
  let overallHealth: ForensicMetrics["compositeForensicVerdict"]["overallHealth"] = "Healthy";
  let summary = "Strong forensic metrics across earnings quality, solvency, and governance integrity.";

  if (mScore.manipulationRisk === "High" || zScore.bankruptcyRisk === "High" || fScore.score <= 3) {
    overallHealth = "High Risk";
    summary = "Multiple forensic flags triggered across earnings manipulation indices, high leverage distress, or deteriorating operational efficiency.";
  } else if (mScore.manipulationRisk === "Moderate" || zScore.bankruptcyRisk === "Moderate" || fScore.score <= 5 || governanceFlags.some((g) => g.severity === "high")) {
    overallHealth = "Caution";
    summary = "Moderate forensic flags detected. Solvency and cash flow conversions are acceptable but require ongoing vigilance.";
  } else if (fScore.score >= 8 && zScore.zone === "Safe" && mScore.manipulationRisk === "Low") {
    overallHealth = "Pristine";
    summary = "Flawless forensic audit. Pristine accounting cleanliness, top-tier solvency buffers, and robust fundamental momentum.";
  }

  return {
    mScore,
    zScore,
    fScore,
    governanceFlags,
    compositeForensicVerdict: {
      overallHealth,
      summary,
    },
  };
}
