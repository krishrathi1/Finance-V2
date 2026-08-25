import { describe, expect, it } from "vitest";

import {
  coveredCall,
  impliedLeverage,
  optionBreakeven,
  optionPayoff,
  optionPayoffCurve,
  protectivePut,
} from "@/shared/options-tools";

describe("optionPayoff", () => {
  it("prices a long call in the money", () => {
    const result = optionPayoff({
      optionType: "call",
      position: "long",
      strikePrice: 100,
      premium: 5,
      spotAtExpiry: 120,
    })!;
    expect(result.intrinsicValue).toBe(20);
    expect(result.payoffPerShare).toBe(15);
    expect(result.payoffPerLot).toBe(15);
    expect(result.profitable).toBe(true);
  });

  it("floors a long call's loss at the premium paid, out of the money", () => {
    const result = optionPayoff({
      optionType: "call",
      position: "long",
      strikePrice: 100,
      premium: 5,
      spotAtExpiry: 60,
    })!;
    expect(result.intrinsicValue).toBe(0);
    expect(result.payoffPerShare).toBe(-5);
    expect(result.profitable).toBe(false);
  });

  it("prices a long put in the money", () => {
    const result = optionPayoff({
      optionType: "put",
      position: "long",
      strikePrice: 100,
      premium: 5,
      spotAtExpiry: 80,
    })!;
    expect(result.intrinsicValue).toBe(20);
    expect(result.payoffPerShare).toBe(15);
    expect(result.profitable).toBe(true);
  });

  it("keeps a long's loss floored no matter how far out of the money the option finishes", () => {
    // A ₹5 premium paid can never cost more than ₹5, whether spot lands
    // 1% or 99% away from the strike.
    const near = optionPayoff({
      optionType: "call",
      position: "long",
      strikePrice: 100,
      premium: 5,
      spotAtExpiry: 99,
    })!;
    const far = optionPayoff({
      optionType: "call",
      position: "long",
      strikePrice: 100,
      premium: 5,
      spotAtExpiry: 1,
    })!;
    expect(near.payoffPerShare).toBe(-5);
    expect(far.payoffPerShare).toBe(-5);
  });

  it("gives a short call an unbounded loss as spot runs away — no floor", () => {
    const modest = optionPayoff({
      optionType: "call",
      position: "short",
      strikePrice: 100,
      premium: 5,
      spotAtExpiry: 150,
    })!;
    const extreme = optionPayoff({
      optionType: "call",
      position: "short",
      strikePrice: 100,
      premium: 5,
      spotAtExpiry: 100_000,
    })!;
    expect(modest.payoffPerShare).toBe(-45);
    expect(extreme.payoffPerShare).toBe(-99_895);
    // The loss keeps growing — proof there is deliberately no floor here,
    // unlike the long side.
    expect(extreme.payoffPerShare).toBeLessThan(modest.payoffPerShare);
  });

  it("caps a short's profit at the premium collected, deep in the money for the buyer", () => {
    const result = optionPayoff({
      optionType: "put",
      position: "short",
      strikePrice: 100,
      premium: 5,
      spotAtExpiry: 100_000,
    })!;
    // Spot far above strike: the put is worthless, short keeps the full premium.
    expect(result.intrinsicValue).toBe(0);
    expect(result.payoffPerShare).toBe(5);
  });

  it("scales by lotSize and defaults it to 1 (per-share) when omitted", () => {
    const perShare = optionPayoff({
      optionType: "call",
      position: "long",
      strikePrice: 100,
      premium: 5,
      spotAtExpiry: 120,
    })!;
    const perLot = optionPayoff({
      optionType: "call",
      position: "long",
      strikePrice: 100,
      premium: 5,
      spotAtExpiry: 120,
      lotSize: 50,
    })!;
    expect(perShare.payoffPerLot).toBe(perShare.payoffPerShare);
    expect(perLot.payoffPerLot).toBe(perShare.payoffPerShare * 50);
  });

  it("falls back to lotSize 1 for any unusable lotSize instead of failing", () => {
    for (const badLotSize of [0, -10, Number.NaN, Infinity, -Infinity]) {
      const result = optionPayoff({
        optionType: "call",
        position: "long",
        strikePrice: 100,
        premium: 5,
        spotAtExpiry: 120,
        lotSize: badLotSize,
      })!;
      expect(result.payoffPerLot).toBe(result.payoffPerShare);
    }
  });

  it("allows a zero premium — a free option is a valid edge case", () => {
    const result = optionPayoff({
      optionType: "call",
      position: "long",
      strikePrice: 100,
      premium: 0,
      spotAtExpiry: 110,
    })!;
    expect(result.payoffPerShare).toBe(10);
  });

  it("allows spotAtExpiry of zero — a stock that has gone to nothing", () => {
    const result = optionPayoff({
      optionType: "put",
      position: "long",
      strikePrice: 100,
      premium: 5,
      spotAtExpiry: 0,
    })!;
    expect(result.intrinsicValue).toBe(100);
    expect(result.payoffPerShare).toBe(95);
  });

  it("rejects a non-positive strike, a negative premium, and a negative spot", () => {
    const base = {
      optionType: "call" as const,
      position: "long" as const,
      strikePrice: 100,
      premium: 5,
      spotAtExpiry: 110,
    };
    expect(optionPayoff({ ...base, strikePrice: 0 })).toBeNull();
    expect(optionPayoff({ ...base, strikePrice: -100 })).toBeNull();
    expect(optionPayoff({ ...base, premium: -1 })).toBeNull();
    expect(optionPayoff({ ...base, spotAtExpiry: -1 })).toBeNull();
  });

  it("rejects unrecognised optionType and position strings", () => {
    const base = {
      strikePrice: 100,
      premium: 5,
      spotAtExpiry: 110,
    };
    expect(
      optionPayoff({ ...base, optionType: "straddle" as never, position: "long" })
    ).toBeNull();
    expect(
      optionPayoff({ ...base, optionType: "call", position: "sideways" as never })
    ).toBeNull();
  });

  it("rejects non-finite inputs and a missing input object", () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(
        optionPayoff({
          optionType: "call",
          position: "long",
          strikePrice: bad,
          premium: 5,
          spotAtExpiry: 110,
        })
      ).toBeNull();
    }
    expect(optionPayoff(null as never)).toBeNull();
    expect(optionPayoff(undefined as never)).toBeNull();
  });
});

describe("optionBreakeven", () => {
  it("is strike plus premium for a call", () => {
    expect(optionBreakeven({ optionType: "call", strikePrice: 100, premium: 5 })).toBe(105);
  });

  it("is strike minus premium for a put", () => {
    expect(optionBreakeven({ optionType: "put", strikePrice: 100, premium: 5 })).toBe(95);
  });

  it("is the same number regardless of long or short — breakeven has no position field", () => {
    // Deliberately not part of the input type; documented as position-independent.
    const call = optionBreakeven({ optionType: "call", strikePrice: 100, premium: 5 });
    expect(call).toBe(105);
  });

  it("allows a put breakeven of exactly zero", () => {
    expect(optionBreakeven({ optionType: "put", strikePrice: 50, premium: 50 })).toBe(0);
  });

  it("rejects a put breakeven that would land below zero", () => {
    expect(optionBreakeven({ optionType: "put", strikePrice: 10, premium: 50 })).toBeNull();
  });

  it("rejects a non-positive strike and a negative premium", () => {
    expect(optionBreakeven({ optionType: "call", strikePrice: 0, premium: 5 })).toBeNull();
    expect(optionBreakeven({ optionType: "call", strikePrice: -100, premium: 5 })).toBeNull();
    expect(optionBreakeven({ optionType: "call", strikePrice: 100, premium: -5 })).toBeNull();
  });

  it("rejects an unrecognised optionType", () => {
    expect(
      optionBreakeven({ optionType: "collar" as never, strikePrice: 100, premium: 5 })
    ).toBeNull();
  });

  it("returns null rather than an Infinity breakeven at extreme magnitudes", () => {
    expect(optionBreakeven({ optionType: "call", strikePrice: 1e308, premium: 1e308 })).toBeNull();
  });
});

describe("optionPayoffCurve", () => {
  it("returns 21 points centred on the strike", () => {
    const points = optionPayoffCurve({
      optionType: "call",
      position: "long",
      strikePrice: 100,
      premium: 5,
    })!;
    expect(points).toHaveLength(21);
    const centre = points[10];
    expect(centre.spot).toBe(100);
    // At the strike, intrinsic value is zero for both call and put.
    expect(centre.payoffPerLot).toBe(-5);
  });

  it("spans +/- the range percent of strike at the two endpoints, defaulting range to 30", () => {
    const points = optionPayoffCurve({
      optionType: "call",
      position: "long",
      strikePrice: 100,
      premium: 5,
    })!;
    expect(points[0].spot).toBe(70);
    expect(points[20].spot).toBe(130);
  });

  it("honours an explicit range", () => {
    const points = optionPayoffCurve({
      optionType: "put",
      position: "short",
      strikePrice: 200,
      premium: 10,
      range: 10,
    })!;
    expect(points[0].spot).toBe(180);
    expect(points[20].spot).toBe(220);
  });

  it("falls back to the default range for any unusable range value", () => {
    for (const badRange of [null, 0, -10, Number.NaN, Infinity, -Infinity]) {
      const points = optionPayoffCurve({
        optionType: "call",
        position: "long",
        strikePrice: 100,
        premium: 5,
        range: badRange,
      })!;
      expect(points[0].spot).toBe(70);
      expect(points[20].spot).toBe(130);
    }
  });

  it("forwards lotSize to every point on the curve", () => {
    const perShare = optionPayoffCurve({
      optionType: "call",
      position: "long",
      strikePrice: 100,
      premium: 5,
    })!;
    const perLot = optionPayoffCurve({
      optionType: "call",
      position: "long",
      strikePrice: 100,
      premium: 5,
      lotSize: 25,
    })!;
    for (let i = 0; i < perShare.length; i += 1) {
      expect(perLot[i].payoffPerLot).toBe(perShare[i].payoffPerLot * 25);
    }
  });

  it("floors a spot at zero rather than letting a wide range go negative", () => {
    const points = optionPayoffCurve({
      optionType: "put",
      position: "long",
      strikePrice: 100,
      premium: 5,
      range: 150,
    })!;
    expect(points[0].spot).toBe(0);
    expect(points.every((point) => point.spot >= 0)).toBe(true);
  });

  it("reuses optionPayoff's math — every point matches a direct call", () => {
    const points = optionPayoffCurve({
      optionType: "put",
      position: "short",
      strikePrice: 100,
      premium: 8,
      range: 40,
    })!;
    for (const point of points) {
      const direct = optionPayoff({
        optionType: "put",
        position: "short",
        strikePrice: 100,
        premium: 8,
        spotAtExpiry: point.spot,
      })!;
      expect(point.payoffPerLot).toBe(direct.payoffPerLot);
    }
  });

  it("drops individual points that overflow rather than failing the whole curve", () => {
    // Every non-centre point overflows once its intrinsic value is scaled by
    // an astronomical lotSize; the centre point (zero intrinsic value at the
    // strike) survives on its own.
    const points = optionPayoffCurve({
      optionType: "call",
      position: "short",
      strikePrice: 1e150,
      premium: 0,
      lotSize: 1e200,
    })!;
    expect(points.length).toBeGreaterThan(0);
    expect(points.length).toBeLessThan(21);
    for (const point of points) {
      expect(Number.isFinite(point.spot)).toBe(true);
      expect(Number.isFinite(point.payoffPerLot)).toBe(true);
    }
  });

  it("returns null when every point on the curve overflows", () => {
    const points = optionPayoffCurve({
      optionType: "call",
      position: "short",
      strikePrice: 100,
      premium: 1e308,
      lotSize: 1e10,
    });
    expect(points).toBeNull();
  });

  it("rejects an unrecognised optionType/position and a non-positive strike", () => {
    expect(
      optionPayoffCurve({
        optionType: "straddle" as never,
        position: "long",
        strikePrice: 100,
        premium: 5,
      })
    ).toBeNull();
    expect(
      optionPayoffCurve({
        optionType: "call",
        position: "long",
        strikePrice: 0,
        premium: 5,
      })
    ).toBeNull();
  });
});

describe("coveredCall", () => {
  it("combines stock and short-call P&L below the strike", () => {
    const result = coveredCall({
      sharesHeld: 100,
      buyPrice: 90,
      strikePrice: 100,
      premium: 5,
      spotAtExpiry: 95,
    })!;
    expect(result.stockPnl).toBe(500);
    expect(result.optionPnl).toBe(500); // short call keeps the full premium, OTM
    expect(result.totalPnl).toBe(1000);
    expect(result.capped).toBe(false);
  });

  it("caps totalPnl at maxProfit once spot reaches the strike", () => {
    const atStrike = coveredCall({
      sharesHeld: 100,
      buyPrice: 90,
      strikePrice: 100,
      premium: 5,
      spotAtExpiry: 100,
    })!;
    expect(atStrike.capped).toBe(true);
    expect(atStrike.totalPnl).toBe(atStrike.maxProfit);
  });

  it("keeps maxProfit exact and bounded no matter how far spot runs past the strike", () => {
    const modest = coveredCall({
      sharesHeld: 100,
      buyPrice: 90,
      strikePrice: 100,
      premium: 5,
      spotAtExpiry: 110,
    })!;
    const tenX = coveredCall({
      sharesHeld: 100,
      buyPrice: 90,
      strikePrice: 100,
      premium: 5,
      spotAtExpiry: 1000, // 10x the strike
    })!;
    expect(modest.maxProfit).toBe(1500);
    expect(tenX.maxProfit).toBe(1500);
    expect(modest.totalPnl).toBe(1500);
    expect(tenX.totalPnl).toBe(1500);
    expect(tenX.capped).toBe(true);
  });

  it("sets breakeven at buyPrice minus premium — the cushioned cost basis", () => {
    const result = coveredCall({
      sharesHeld: 100,
      buyPrice: 90,
      strikePrice: 100,
      premium: 5,
      spotAtExpiry: 95,
    })!;
    expect(result.breakeven).toBe(85);
  });

  it("rejects non-positive sharesHeld, buyPrice, strikePrice, and negative premium or spot", () => {
    const base = {
      sharesHeld: 100,
      buyPrice: 90,
      strikePrice: 100,
      premium: 5,
      spotAtExpiry: 95,
    };
    expect(coveredCall({ ...base, sharesHeld: 0 })).toBeNull();
    expect(coveredCall({ ...base, sharesHeld: -10 })).toBeNull();
    expect(coveredCall({ ...base, buyPrice: 0 })).toBeNull();
    expect(coveredCall({ ...base, strikePrice: -1 })).toBeNull();
    expect(coveredCall({ ...base, premium: -1 })).toBeNull();
    expect(coveredCall({ ...base, spotAtExpiry: -1 })).toBeNull();
  });

  it("returns null rather than an Infinity P&L at extreme magnitudes", () => {
    expect(
      coveredCall({
        sharesHeld: 1e10,
        buyPrice: 1e300,
        strikePrice: 1e300,
        premium: 1e300,
        spotAtExpiry: 1e300,
      })
    ).toBeNull();
  });
});

describe("protectivePut", () => {
  it("combines stock and long-put P&L above the strike", () => {
    const result = protectivePut({
      sharesHeld: 100,
      buyPrice: 100,
      strikePrice: 90,
      premium: 3,
      spotAtExpiry: 95,
    })!;
    expect(result.stockPnl).toBe(-500);
    expect(result.optionPnl).toBe(-300); // put worthless above strike, premium lost
    expect(result.totalPnl).toBe(-800);
  });

  it("floors totalPnl at -maxLoss once spot reaches the strike", () => {
    const atStrike = protectivePut({
      sharesHeld: 100,
      buyPrice: 100,
      strikePrice: 90,
      premium: 3,
      spotAtExpiry: 90,
    })!;
    expect(atStrike.totalPnl).toBe(-atStrike.maxLoss);
  });

  it("keeps maxLoss exact and bounded no matter how far spot falls below the strike", () => {
    const modest = protectivePut({
      sharesHeld: 100,
      buyPrice: 100,
      strikePrice: 90,
      premium: 3,
      spotAtExpiry: 70,
    })!;
    const nearZero = protectivePut({
      sharesHeld: 100,
      buyPrice: 100,
      strikePrice: 90,
      premium: 3,
      spotAtExpiry: 9, // strike / 10 — far beyond the strike on the downside
    })!;
    expect(modest.maxLoss).toBe(1300);
    expect(nearZero.maxLoss).toBe(1300);
    expect(modest.totalPnl).toBe(-1300);
    expect(nearZero.totalPnl).toBe(-1300);
  });

  it("sets breakeven at buyPrice plus premium", () => {
    const result = protectivePut({
      sharesHeld: 100,
      buyPrice: 100,
      strikePrice: 90,
      premium: 3,
      spotAtExpiry: 95,
    })!;
    expect(result.breakeven).toBe(103);
  });

  it("rejects non-positive sharesHeld, buyPrice, strikePrice, and negative premium or spot", () => {
    const base = {
      sharesHeld: 100,
      buyPrice: 100,
      strikePrice: 90,
      premium: 3,
      spotAtExpiry: 95,
    };
    expect(protectivePut({ ...base, sharesHeld: 0 })).toBeNull();
    expect(protectivePut({ ...base, buyPrice: -1 })).toBeNull();
    expect(protectivePut({ ...base, strikePrice: 0 })).toBeNull();
    expect(protectivePut({ ...base, premium: -1 })).toBeNull();
    expect(protectivePut({ ...base, spotAtExpiry: -1 })).toBeNull();
  });

  it("returns null rather than an Infinity P&L at extreme magnitudes", () => {
    expect(
      protectivePut({
        sharesHeld: 1e10,
        buyPrice: 1e300,
        strikePrice: 1e300,
        premium: 1e300,
        spotAtExpiry: 1e300,
      })
    ).toBeNull();
  });
});

describe("impliedLeverage", () => {
  it("is spotPrice divided by premium", () => {
    expect(impliedLeverage({ premium: 5, strikePrice: 100, spotPrice: 500 })).toBe(100);
  });

  it("ignores strikePrice entirely — same result regardless of its value", () => {
    const a = impliedLeverage({ premium: 5, strikePrice: 100, spotPrice: 500 });
    const b = impliedLeverage({ premium: 5, strikePrice: 999_999, spotPrice: 500 });
    const c = impliedLeverage({ premium: 5, strikePrice: -1, spotPrice: 500 });
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it("rejects a non-positive premium or spotPrice", () => {
    expect(impliedLeverage({ premium: 0, strikePrice: 100, spotPrice: 500 })).toBeNull();
    expect(impliedLeverage({ premium: -5, strikePrice: 100, spotPrice: 500 })).toBeNull();
    expect(impliedLeverage({ premium: 5, strikePrice: 100, spotPrice: 0 })).toBeNull();
    expect(impliedLeverage({ premium: 5, strikePrice: 100, spotPrice: -500 })).toBeNull();
  });

  it("returns null rather than an Infinity ratio for a vanishingly small premium", () => {
    expect(impliedLeverage({ premium: 1e-320, strikePrice: 100, spotPrice: 1 })).toBeNull();
  });

  it("rejects non-finite inputs and a missing input object", () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(impliedLeverage({ premium: bad, strikePrice: 100, spotPrice: 500 })).toBeNull();
      expect(impliedLeverage({ premium: 5, strikePrice: 100, spotPrice: bad })).toBeNull();
    }
    expect(impliedLeverage(null as never)).toBeNull();
    expect(impliedLeverage(undefined as never)).toBeNull();
  });
});

describe("never emits NaN or Infinity", () => {
  const nasty = [0, -0, 1, -1, 0.1, 100, 1e-320, 1e308, -1e308, Number.NaN, Infinity, -Infinity];
  const optionTypes = ["call", "put"] as const;
  const positions = ["long", "short"] as const;

  /**
   * Collects every non-finite value it finds instead of asserting on each one.
   *
   * The sweeps below cover a large cartesian product — the curve sweep alone
   * reaches roughly 370,000 numeric fields — and an `expect()` per field made
   * that test take 4.6s against vitest's 5s default timeout. It passed on a
   * warm machine and failed on a cold one, which is a flake rather than a
   * finding. Gathering offenders and asserting once at the end keeps the
   * coverage identical, reports every offender rather than dying at the first,
   * and takes a fraction of the time.
   */
  const collectNonFinite = (result: unknown, path: string, found: string[]): void => {
    if (result === null || result === undefined) return;
    if (typeof result === "number") {
      if (!Number.isFinite(result)) found.push(`${path} = ${result}`);
      return;
    }
    if (Array.isArray(result)) {
      result.forEach((value, index) => collectNonFinite(value, `${path}[${index}]`, found));
      return;
    }
    if (typeof result === "object") {
      for (const [key, value] of Object.entries(result as Record<string, unknown>)) {
        collectNonFinite(value, `${path}.${key}`, found);
      }
    }
  };

  /**
   * Assert-per-call form, kept for the small sweeps below where the cost is
   * irrelevant and reading `expectFinite(x)` beats threading an accumulator.
   */
  const expectFinite = (result: unknown): void => {
    const found: string[] = [];
    collectNonFinite(result, "value", found);
    expect(found).toEqual([]);
  };

  it("across every optionPayoff and optionBreakeven combination", () => {
    const found: string[] = [];
    for (const optionType of optionTypes) {
      for (const strikePrice of nasty) {
        for (const premium of nasty) {
          collectNonFinite(optionBreakeven({ optionType, strikePrice, premium }), "breakeven", found);
          for (const position of positions) {
            for (const spotAtExpiry of nasty) {
              collectNonFinite(
                optionPayoff({ optionType, position, strikePrice, premium, spotAtExpiry }),
                "payoff",
                found
              );
            }
          }
        }
      }
    }
    expect(found).toEqual([]);
  });

  it("across every optionPayoff lotSize", () => {
    for (const optionType of optionTypes) {
      for (const position of positions) {
        for (const lotSize of nasty) {
          expectFinite(
            optionPayoff({
              optionType,
              position,
              strikePrice: 100,
              premium: 5,
              spotAtExpiry: 110,
              lotSize,
            })
          );
        }
      }
    }
  });

  it("across every optionPayoffCurve strike/premium/range combination", () => {
    const found: string[] = [];
    for (const optionType of optionTypes) {
      for (const position of positions) {
        for (const strikePrice of nasty) {
          for (const premium of nasty) {
            for (const range of nasty) {
              collectNonFinite(
                optionPayoffCurve({ optionType, position, strikePrice, premium, range }),
                "curve",
                found
              );
            }
          }
        }
      }
    }
    expect(found).toEqual([]);
  });

  it("across every impliedLeverage combination", () => {
    const found: string[] = [];
    for (const premium of nasty) {
      for (const strikePrice of nasty) {
        for (const spotPrice of nasty) {
          collectNonFinite(impliedLeverage({ premium, strikePrice, spotPrice }), "leverage", found);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it("across coveredCall and protectivePut, one parameter perturbed at a time", () => {
    const coveredBase = { sharesHeld: 100, buyPrice: 90, strikePrice: 100, premium: 5, spotAtExpiry: 95 };
    const putBase = { sharesHeld: 100, buyPrice: 100, strikePrice: 90, premium: 3, spotAtExpiry: 95 };

    for (const value of nasty) {
      for (const key of ["sharesHeld", "buyPrice", "strikePrice", "premium", "spotAtExpiry"] as const) {
        expectFinite(coveredCall({ ...coveredBase, [key]: value }));
        expectFinite(protectivePut({ ...putBase, [key]: value }));
      }
    }
  });

  it("across coveredCall and protectivePut with pairs of fields perturbed together", () => {
    // Every field gets to vary against every other field at least once —
    // cheaper than a full 5-way cartesian product but still exercises every
    // pairwise interaction, including two extreme values landing together.
    const keys = ["sharesHeld", "buyPrice", "strikePrice", "premium", "spotAtExpiry"] as const;
    const coveredBase = { sharesHeld: 100, buyPrice: 90, strikePrice: 100, premium: 5, spotAtExpiry: 95 };
    const putBase = { sharesHeld: 100, buyPrice: 100, strikePrice: 90, premium: 3, spotAtExpiry: 95 };

    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        for (const a of nasty) {
          for (const b of nasty) {
            expectFinite(coveredCall({ ...coveredBase, [keys[i]]: a, [keys[j]]: b }));
            expectFinite(protectivePut({ ...putBase, [keys[i]]: a, [keys[j]]: b }));
          }
        }
      }
    }
  });
});
