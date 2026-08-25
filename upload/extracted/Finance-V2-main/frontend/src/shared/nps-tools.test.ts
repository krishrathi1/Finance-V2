import { describe, expect, it } from "vitest";

import {
  NPS_MIN_ANNUITY_SHARE_PERCENT,
  NPS_RETIREMENT_AGE,
  npsProjection,
} from "@/shared/nps-tools";
import { sipFutureValue } from "@/shared/planning-tools";

const base = {
  currentAge: 30,
  monthlyContribution: 10_000,
  expectedReturnPercent: 10,
};

describe("npsProjection — accumulation", () => {
  it("agrees with the SIP maths on identical inputs", () => {
    // An NPS corpus and a SIP corpus of the same size, rate and horizon must
    // match to the rupee — same monthly convention, no second implementation.
    const result = npsProjection(base)!;
    const sip = sipFutureValue({ monthly: 10_000, years: 30, annualReturnPercent: 10 })!;
    expect(result.corpusAtRetirement).toBeCloseTo(sip, 0);
  });

  it("runs to 60 and no further", () => {
    expect(npsProjection({ ...base, currentAge: 30 })!.yearsToRetirement).toBe(30);
    expect(npsProjection({ ...base, currentAge: 45 })!.yearsToRetirement).toBe(15);
    expect(npsProjection({ ...base, currentAge: 59 })!.yearsToRetirement).toBe(1);
  });

  it("counts an existing balance without counting it as contributed", () => {
    const withExisting = npsProjection({ ...base, existingCorpus: 500_000 })!;
    const without = npsProjection(base)!;
    expect(withExisting.corpusAtRetirement).toBeGreaterThan(without.corpusAtRetirement);
    // Contributions are what the subscriber pays in from here, not the opening
    // balance — otherwise "wealth gained" would double-count it.
    expect(withExisting.totalContributed).toBe(without.totalContributed);
  });

  it("splits the corpus into contributions and growth exactly", () => {
    const result = npsProjection(base)!;
    expect(result.totalContributed + result.wealthGained).toBeCloseTo(
      result.corpusAtRetirement,
      0
    );
  });
});

describe("npsProjection — the statutory annuity floor", () => {
  it("annuitises 40% by default", () => {
    const result = npsProjection(base)!;
    expect(result.appliedAnnuitySharePercent).toBe(NPS_MIN_ANNUITY_SHARE_PERCENT);
    expect(result.annuityCorpus).toBeCloseTo(result.corpusAtRetirement * 0.4, 0);
    expect(result.lumpSum).toBeCloseTo(result.corpusAtRetirement * 0.6, 0);
  });

  it("raises a request below the floor, and says so", () => {
    // A subscriber cannot annuitise less than 40%. Silently honouring 10%
    // would quote a lump sum the scheme will not pay.
    const result = npsProjection({ ...base, annuitySharePercent: 10 })!;
    expect(result.appliedAnnuitySharePercent).toBe(40);
    expect(result.annuityShareRaised).toBe(true);
  });

  it("honours a request above the floor", () => {
    const result = npsProjection({ ...base, annuitySharePercent: 100 })!;
    expect(result.appliedAnnuitySharePercent).toBe(100);
    expect(result.annuityShareRaised).toBe(false);
    expect(result.lumpSum).toBe(0);
  });

  it("keeps the annuity and lump sum adding to the whole corpus", () => {
    for (const share of [40, 60, 80, 100]) {
      const result = npsProjection({ ...base, annuitySharePercent: share })!;
      expect(result.annuityCorpus + result.lumpSum).toBeCloseTo(result.corpusAtRetirement, 0);
    }
  });
});

describe("npsProjection — the pension", () => {
  it("derives the pension from the annuitised portion at the annuity rate", () => {
    const result = npsProjection({ ...base, annuityRatePercent: 6 })!;
    expect(result.monthlyPensionGross).toBeCloseTo((result.annuityCorpus * 0.06) / 12, 0);
  });

  it("taxes the pension at slab, unlike the lump sum", () => {
    const result = npsProjection({ ...base, slabPercent: 30 })!;
    expect(result.monthlyPensionPostTax).toBeCloseTo(result.monthlyPensionGross * 0.7, 2);
  });

  it("leaves the pension untaxed at a zero slab", () => {
    const result = npsProjection({ ...base, slabPercent: 0 })!;
    expect(result.monthlyPensionPostTax).toBeCloseTo(result.monthlyPensionGross, 2);
  });

  it("pays a larger pension at a better annuity rate", () => {
    const low = npsProjection({ ...base, annuityRatePercent: 5 })!;
    const high = npsProjection({ ...base, annuityRatePercent: 8 })!;
    expect(high.monthlyPensionGross).toBeGreaterThan(low.monthlyPensionGross);
  });
});

describe("npsProjection — input handling", () => {
  it("refuses a subscriber already at or past vesting age", () => {
    expect(npsProjection({ ...base, currentAge: NPS_RETIREMENT_AGE })).toBeNull();
    expect(npsProjection({ ...base, currentAge: 65 })).toBeNull();
  });

  it("refuses inputs that cannot describe a plan", () => {
    expect(npsProjection({ ...base, monthlyContribution: 0 })).toBeNull();
    expect(npsProjection({ ...base, currentAge: 0 })).toBeNull();
    expect(npsProjection({ ...base, expectedReturnPercent: Number.NaN })).toBeNull();
    expect(npsProjection(null as never)).toBeNull();
  });

  it("falls back to sane defaults for garbled optional fields", () => {
    const result = npsProjection({
      ...base,
      annuityRatePercent: Number.NaN,
      slabPercent: -5,
      existingCorpus: Number.NEGATIVE_INFINITY,
    })!;
    expect(result).not.toBeNull();
    expect(Number.isFinite(result.monthlyPensionGross)).toBe(true);
    expect(result.monthlyPensionPostTax).toBeCloseTo(result.monthlyPensionGross, 2);
  });

  it("never emits a non-finite figure", () => {
    for (const rate of [0, 10, 50]) {
      for (const age of [18, 40, 59]) {
        const result = npsProjection({ ...base, currentAge: age, expectedReturnPercent: rate });
        if (!result) continue;
        for (const value of [
          result.corpusAtRetirement,
          result.annuityCorpus,
          result.lumpSum,
          result.monthlyPensionGross,
          result.monthlyPensionPostTax,
          result.wealthGained,
        ]) {
          expect(Number.isFinite(value)).toBe(true);
        }
      }
    }
  });
});
