import { describe, expect, it } from "vitest";

import { analystConsensus, comparePeers, median, type PeerRow } from "./peer-analytics";

const PEERS: PeerRow[] = [
  { name: "A", marketCap: 500000, pe: 20, pb: 3, roe: 15 },
  { name: "B", marketCap: 300000, pe: 30, pb: 4, roe: 18 },
  { name: "C", marketCap: 200000, pe: 40, pb: 5, roe: 12 },
  { name: "D", marketCap: 100000, pe: 50, pb: 6, roe: 20 },
];

describe("median", () => {
  it("averages the middle pair for an even count", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("takes the middle value for an odd count", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("is order-independent", () => {
    expect(median([50, 20, 40, 30])).toBe(median([20, 30, 40, 50]));
  });

  it("returns null for an empty list", () => {
    expect(median([])).toBeNull();
  });
});

describe("comparePeers", () => {
  it("marks a cheap multiple as favourable", () => {
    // Peer median P/E is 35; this stock at 15 is a deep discount.
    const result = comparePeers({ peRatio: 15 }, PEERS)!;
    const pe = result.comparisons.find((c) => c.metric === "pe")!;
    expect(pe.peerMedian).toBe(35);
    expect(pe.verdict).toBe("favourable");
    expect(pe.premiumPercent).toBeCloseTo(-57.14, 1);
    expect(pe.rank).toBe(1); // cheapest in the group
    expect(pe.percentile).toBe(0);
  });

  it("marks an expensive multiple as unfavourable", () => {
    const pe = comparePeers({ peRatio: 60 }, PEERS)!.comparisons.find((c) => c.metric === "pe")!;
    expect(pe.verdict).toBe("unfavourable");
    expect(pe.rank).toBe(5);
    expect(pe.percentile).toBe(100);
  });

  it("treats a value near the median as in line", () => {
    // Within +/-10% of the median shouldn't flip verdicts on data noise.
    expect(comparePeers({ peRatio: 36 }, PEERS)!.comparisons.find((c) => c.metric === "pe")!.verdict).toBe(
      "inline"
    );
  });

  it("inverts the reading for ROE, where higher is better", () => {
    // Same "above median" position, opposite verdict from a P/E.
    const roe = comparePeers({ roe: 25 }, PEERS)!.comparisons.find((c) => c.metric === "roe")!;
    expect(roe.lowerIsBetter).toBe(false);
    expect(roe.verdict).toBe("favourable");

    const weak = comparePeers({ roe: 5 }, PEERS)!.comparisons.find((c) => c.metric === "roe")!;
    expect(weak.verdict).toBe("unfavourable");
  });

  it("excludes loss-making peers from a valuation median", () => {
    // A negative P/E would drag the median below zero and make every
    // profitable peer look expensive.
    const withLosses: PeerRow[] = [...PEERS, { name: "E", pe: -80 }, { name: "F", pe: null }];
    const pe = comparePeers({ peRatio: 35 }, withLosses)!.comparisons.find((c) => c.metric === "pe")!;
    expect(pe.peerCount).toBe(4);
    expect(pe.peerMedian).toBe(35);
  });

  it("skips a metric when fewer than two peers report it", () => {
    const sparse: PeerRow[] = [{ name: "A", pe: 20 }, { name: "B" }, { name: "C" }];
    const result = comparePeers({ peRatio: 25, roe: 15 }, sparse);
    expect(result?.comparisons.find((c) => c.metric === "pe")).toBeUndefined();
  });

  it("refuses to rank a loss-making company on P/E", () => {
    const result = comparePeers({ peRatio: -12, roe: 10 }, PEERS)!;
    expect(result.comparisons.find((c) => c.metric === "pe")).toBeUndefined();
    // ROE is still comparable — a loss doesn't invalidate every metric.
    expect(result.comparisons.find((c) => c.metric === "roe")).toBeDefined();
  });

  it("ranks by size within the group including the company itself", () => {
    const result = comparePeers({ peRatio: 30, marketCap: 400000 }, PEERS)!;
    expect(result.sizeRank).toBe(2); // only peer A (500k) is larger
    expect(result.sizeGroup).toBe(5);
  });

  it("returns null without a usable peer group", () => {
    expect(comparePeers({ peRatio: 20 }, [])).toBeNull();
    expect(comparePeers({ peRatio: 20 }, [{ name: "A", pe: 10 }])).toBeNull();
    expect(comparePeers(null, PEERS)).toBeNull();
  });
});

describe("analystConsensus", () => {
  const reports = [
    { broker: "X", targetPrice: 1200 },
    { broker: "Y", targetPrice: 1400 },
    { broker: "Z", targetPrice: 1600 },
  ];

  it("computes the rating, average target and upside", () => {
    const result = analystConsensus({ buy: 8, hold: 2, sell: 0 }, reports, 1200)!;
    expect(result.total).toBe(10);
    expect(result.buySharePercent).toBe(80);
    expect(result.rating).toBe("Strong Buy");
    expect(result.averageTarget).toBeCloseTo(1400, 6);
    expect(result.upsidePercent).toBeCloseTo(16.67, 1);
  });

  it("keeps the target spread, which the mean alone hides", () => {
    // A tight cluster and a wild disagreement share the same average.
    const result = analystConsensus({ buy: 3 }, reports, 1200)!;
    expect(result.lowTarget).toBe(1200);
    expect(result.highTarget).toBe(1600);
    expect(result.targetCount).toBe(3);
  });

  it("grades the rating from the distribution", () => {
    expect(analystConsensus({ buy: 10, hold: 0, sell: 0 }, [], 100)!.rating).toBe("Strong Buy");
    expect(analystConsensus({ buy: 6, hold: 4, sell: 0 }, [], 100)!.rating).toBe("Buy");
    expect(analystConsensus({ buy: 2, hold: 6, sell: 2 }, [], 100)!.rating).toBe("Hold");
    expect(analystConsensus({ buy: 1, hold: 2, sell: 7 }, [], 100)!.rating).toBe("Sell");
  });

  it("reports negative upside when the price is above the average target", () => {
    const result = analystConsensus({ buy: 2, hold: 1 }, reports, 2000)!;
    expect(result.upsidePercent).toBeLessThan(0);
  });

  it("still returns a rating when no targets were published", () => {
    // 4 of 6 = 67%, inside the Buy band (5 of 6 would be 83% = Strong Buy).
    const result = analystConsensus({ buy: 4, hold: 2 }, [], 1000)!;
    expect(result.rating).toBe("Buy");
    expect(result.averageTarget).toBeNull();
    expect(result.upsidePercent).toBeNull();
  });

  it("ignores unusable target prices", () => {
    const result = analystConsensus(
      { buy: 3 },
      [{ targetPrice: 1000 }, { targetPrice: 0 }, { targetPrice: null }, { targetPrice: -5 }],
      1000
    )!;
    expect(result.targetCount).toBe(1);
    expect(result.averageTarget).toBe(1000);
  });

  it("returns null when nobody covers the stock", () => {
    expect(analystConsensus({ buy: 0, hold: 0, sell: 0 }, [], 100)).toBeNull();
    expect(analystConsensus(null, [], 100)).toBeNull();
  });

  it("omits upside when the current price is unknown", () => {
    const result = analystConsensus({ buy: 3 }, reports, null)!;
    expect(result.averageTarget).toBeCloseTo(1400, 6);
    expect(result.upsidePercent).toBeNull();
  });
});
