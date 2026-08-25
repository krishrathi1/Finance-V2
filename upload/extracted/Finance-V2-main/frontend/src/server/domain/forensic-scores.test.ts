import { describe, expect, it } from "vitest";
import {
  calculateBeneishMScore,
  calculateAltmanZScore,
  calculatePiotroskiFScore,
  computeForensicAudit,
} from "./forensic-scores";

describe("Forensic Scores Engine", () => {
  it("computes low manipulation risk for healthy financials", () => {
    const res = calculateBeneishMScore({
      revenue: 10000,
      revenuePrev: 9000,
      receivables: 1200,
      receivablesPrev: 1100,
      grossProfit: 3500,
      grossProfitPrev: 3100,
      totalAssets: 15000,
      totalAssetsPrev: 14000,
      currentAssets: 6000,
      currentAssetsPrev: 5500,
      netIncome: 1200,
      operatingCashFlow: 1400,
    });

    expect(res.score).toBeLessThan(-1.78);
    expect(res.manipulationRisk).toBe("Low");
  });

  it("identifies distress zone in Altman Z-Score for high-debt companies", () => {
    const res = calculateAltmanZScore({
      totalAssets: 1000,
      currentAssets: 200,
      currentLiabilities: 400, // negative working capital
      retainedEarnings: -100,
      ebit: 10,
      marketCap: 200,
      totalLiabilities: 800,
      revenue: 300,
    });

    expect(res.score).toBeLessThan(1.81);
    expect(res.zone).toBe("Distress");
    expect(res.bankruptcyRisk).toBe("High");
  });

  it("calculates Piotroski F-score with all 9 criteria", () => {
    const audit = computeForensicAudit({
      revenue: 5000,
      revenuePrev: 4500,
      grossProfit: 2000,
      grossProfitPrev: 1700,
      netIncome: 600,
      netIncomePrev: 500,
      operatingCashFlow: 800,
      operatingCashFlowPrev: 700,
      totalAssets: 6000,
      totalAssetsPrev: 5800,
      currentAssets: 2500,
      currentAssetsPrev: 2300,
      currentLiabilities: 1000,
      currentLiabilitiesPrev: 1000,
      longTermDebt: 800,
      longTermDebtPrev: 900,
      sharesOutstanding: 100,
      sharesOutstandingPrev: 100,
      promoterPledgePct: 0,
      promoterHoldingChangePct: 0.5,
    });

    expect(audit.fScore.score).toBeGreaterThanOrEqual(7);
    expect(audit.fScore.rating).toBe("Strong");
    expect(audit.governanceFlags).toHaveLength(2);
    expect(audit.compositeForensicVerdict.overallHealth).toBe("Pristine");
  });

  it("handles empty or sparse inputs gracefully without throwing or NaN", () => {
    const emptyAudit = computeForensicAudit({});
    expect(isNaN(emptyAudit.mScore.score)).toBe(false);
    expect(isNaN(emptyAudit.zScore.score)).toBe(false);
    expect(isNaN(emptyAudit.fScore.score)).toBe(false);
    expect(["Pristine", "Healthy", "Caution", "High Risk"]).toContain(
      emptyAudit.compositeForensicVerdict.overallHealth
    );
  });
});
