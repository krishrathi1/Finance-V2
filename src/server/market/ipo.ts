// IPO tracker — curated realistic upcoming and recently listed issues.

import { mulberry32, hashString, istDateKey } from "./rng";

export interface IpoItem {
  symbol: string;
  company: string;
  sector: string;
  date: string; // listing / open date (ISO)
  priceRange: string;
  issueSizeCr: number;
  totalSharesLakh: number;
  status: "Upcoming" | "Open" | "Listed";
  listingGain?: number;
  listingPrice?: number;
  issuePrice?: number;
  gmp?: number; // grey market premium ₹
  subscription?: string;
}

const dayKey = () => istDateKey();

function shiftDays(days: number): string {
  const d = new Date(dayKey() + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function getIpoData(type: "upcoming" | "recent"): IpoItem[] {
  if (type === "upcoming") {
    return [
      {
        symbol: "TATATECH", company: "Tata Technologies", sector: "Technology", date: shiftDays(9),
        priceRange: "₹950 – ₹1,000", issueSizeCr: 4200, totalSharesLakh: 420, status: "Upcoming",
        gmp: 210, subscription: "—",
      },
      {
        symbol: "AMANTACB", company: "Amanta Consumer Brands", sector: "Consumer Defensive", date: shiftDays(14),
        priceRange: "₹324 – ₹342", issueSizeCr: 1450, totalSharesLakh: 424, status: "Upcoming",
        gmp: 48, subscription: "—",
      },
      {
        symbol: "BHARATCURE", company: "Bharat Cure Pharma", sector: "Healthcare", date: shiftDays(20),
        priceRange: "₹1,080 – ₹1,136", issueSizeCr: 2800, totalSharesLakh: 246, status: "Upcoming",
        gmp: 95, subscription: "—",
      },
      {
        symbol: "GREENINFRA", company: "GreenInfra Renewables", sector: "Utilities", date: shiftDays(27),
        priceRange: "₹512 – ₹538", issueSizeCr: 3600, totalSharesLakh: 670, status: "Upcoming",
        gmp: 36, subscription: "—",
      },
      {
        symbol: "NEXFINTECH", company: "Nexfintech Platforms", sector: "Financial Services", date: shiftDays(35),
        priceRange: "₹899 – ₹945", issueSizeCr: 2100, totalSharesLakh: 222, status: "Upcoming",
        gmp: 122, subscription: "—",
      },
      {
        symbol: "SPICELOG", company: "SpiceLog Logistics", sector: "Industrials", date: shiftDays(42),
        priceRange: "₹410 – ₹432", issueSizeCr: 980, totalSharesLakh: 227, status: "Upcoming",
        gmp: 18, subscription: "—",
      },
    ];
  }
  return [
    {
      symbol: "OLAELEC", company: "Ola Electric Mobility", sector: "Consumer Cyclical", date: shiftDays(-46),
      priceRange: "₹72 – ₹76", issueSizeCr: 6100, totalSharesLakh: 8039, status: "Listed",
      issuePrice: 76, listingPrice: 92, listingGain: 21.1, subscription: "4.56x",
    },
    {
      symbol: "FIRSTCRY", company: "Brainbees Solutions (FirstCry)", sector: "Consumer Cyclical", date: shiftDays(-95),
      priceRange: "₹440 – ₹465", issueSizeCr: 4883, totalSharesLakh: 1050, status: "Listed",
      issuePrice: 465, listingPrice: 452, listingGain: -2.8, subscription: "12.16x",
    },
    {
      symbol: "UNIMACON", company: "Unimech Aerospace", sector: "Industrials", date: shiftDays(-70),
      priceRange: "₹1,285 – ₹1,350", issueSizeCr: 840, totalSharesLakh: 62, status: "Listed",
      issuePrice: 1350, listingPrice: 1622, listingGain: 20.1, subscription: "148.4x",
    },
    {
      symbol: "SAKTHISUG", company: "Sakthi Sugar Refineries", sector: "Consumer Defensive", date: shiftDays(-120),
      priceRange: "₹168 – ₹177", issueSizeCr: 510, totalSharesLakh: 288, status: "Listed",
      issuePrice: 177, listingPrice: 168, listingGain: -5.1, subscription: "1.98x",
    },
    {
      symbol: "KAYNES", company: "Kaynes Technology", sector: "Technology", date: shiftDays(-210),
      priceRange: "₹1,382 – ₹1,407", issueSizeCr: 860, totalSharesLakh: 61, status: "Listed",
      issuePrice: 1407, listingPrice: 1776, listingGain: 26.2, subscription: "36.4x",
    },
    {
      symbol: "SWIGGY", company: "Swiggy", sector: "Consumer Cyclical", date: shiftDays(-150),
      priceRange: "₹371 – ₹390", issueSizeCr: 11327, totalSharesLakh: 29010, status: "Listed",
      issuePrice: 390, listingPrice: 420, listingGain: 7.7, subscription: "3.59x",
    },
    {
      symbol: "NTPCGREEN", company: "NTPC Green Energy", sector: "Utilities", date: shiftDays(-100),
      priceRange: "₹102 – ₹108", issueSizeCr: 10000, totalSharesLakh: 9260, status: "Listed",
      issuePrice: 108, listingPrice: 111, listingGain: 2.8, subscription: "2.91x",
    },
  ];
}

export function getIpoRiskProfile(ipo: IpoItem): { level: "Low" | "Medium" | "High"; reasons: string[] } {
  const rand = mulberry32(hashString(ipo.symbol));
  const reasons: string[] = [];
  let risk = 1;

  if (ipo.issueSizeCr < 1500) {
    risk += 1;
    reasons.push("Small issue size — thin float can amplify listing volatility");
  }
  if (ipo.sector === "Technology" || ipo.sector === "Consumer Cyclical") {
    risk += 0.5;
    reasons.push("New-age sector premium — valuations price in execution ahead of profits");
  }
  if (ipo.gmp !== undefined && ipo.gmp > 100) {
    risk -= 0.5;
    reasons.push("Strong grey-market premium signals healthy demand");
  }
  if (ipo.status === "Upcoming") {
    risk += 0.5;
    reasons.push("Unlisted — no trading history to anchor expectations");
  }
  if (ipo.subscription && parseFloat(ipo.subscription) > 10) {
    risk -= 0.5;
    reasons.push("Heavy oversubscription suggests institutional conviction");
  }
  if (reasons.length === 0) reasons.push("Balanced risk profile — standard IPO caveats apply");
  const level = risk >= 2 ? "High" : risk >= 1.4 ? "Medium" : "Low";
  void rand;
  return { level, reasons };
}
