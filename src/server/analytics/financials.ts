// Financial statements & shareholding, generated deterministically from the
// curated seed fundamentals. Yearly + quarterly series with realistic noise.

import { StockSeed } from "../market/universe";
import { mulberry32, hashString, istDateKey } from "../market/rng";

export interface YearlyFinancial {
  year: number;
  revenue: number; // ₹ Cr
  ebitda: number;
  netProfit: number;
  opm: number; // %
  netMargin: number;
  eps: number;
  roe: number;
}

export interface QuarterlyFinancial {
  quarter: string; // e.g. "Q3 FY25"
  revenue: number;
  netProfit: number;
  opm: number;
  eps: number;
  growthYoY: number; // revenue growth %
}

export interface ShareholdingQuarter {
  quarter: string;
  promoters: number;
  fii: number;
  dii: number;
  public: number;
}

function quarterLabel(quartersAgo: number): string {
  const now = new Date();
  // Approximate the latest completed quarter
  let fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  let q = Math.floor((now.getMonth() - 3 + 12) % 12 / 3) + 1; // Apr = Q1
  for (let i = 0; i < quartersAgo; i++) {
    q--;
    if (q === 0) {
      q = 4;
      fy--;
    }
  }
  return `Q${q} FY${String(fy).slice(2)}`;
}

export function getYearlyFinancials(seed: StockSeed): YearlyFinancial[] {
  const rand = mulberry32(hashString(`fin-${seed.s}`));
  const currentYear = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const out: YearlyFinancial[] = [];

  const revenueNow = seed.mc / Math.max(4, seed.pe ?? 25);
  // anchor revenue: net profit = mcap / PE; revenue from net margin
  const netMargin = clampNum(seed.roe / 4.5, 2, 26);
  const netProfitNow = seed.mc / Math.max(1, seed.pe ?? 25);
  const revNow = netProfitNow / (netMargin / 100);
  const opmNow = netMargin * (1.9 + rand() * 0.7);
  const sharesCr = seed.mc / seed.p;
  const epsNow = seed.p / Math.max(1, seed.pe ?? 25);

  for (let i = 5; i >= 0; i--) {
    const year = currentYear - i;
    const growthFactor = Math.pow(1 + seed.rg / 100, -i) * (1 + (rand() - 0.5) * 0.05);
    const revenue = revNow * growthFactor;
    const profitFactor = Math.pow(1 + seed.pg / 100, -i) * (1 + (rand() - 0.5) * 0.08);
    const netProfit = netProfitNow * profitFactor;
    const ebitda = revenue * (opmNow / 100) * (1 + (rand() - 0.5) * 0.03);
    const eps = epsNow * profitFactor;
    out.push({
      year,
      revenue: round1(revenue),
      ebitda: round1(ebitda),
      netProfit: round1(netProfit),
      opm: round1((ebitda / revenue) * 100),
      netMargin: round1((netProfit / revenue) * 100),
      eps: Math.round(eps * 10) / 10,
      roe: round1(seed.roe * profitFactor / growthFactor),
    });
  }
  return out;
}

export function getQuarterlyFinancials(seed: StockSeed): QuarterlyFinancial[] {
  const rand = mulberry32(hashString(`qtr-${seed.s}`));
  const netMargin = clampNum(seed.roe / 4.5, 2, 26);
  const netProfitNow = seed.mc / Math.max(1, seed.pe ?? 25);
  const revNow = netProfitNow / (netMargin / 100);
  const opmNow = netMargin * (1.9 + rand() * 0.7);
  const sharesCr = seed.mc / seed.p;

  const out: QuarterlyFinancial[] = [];
  for (let i = 7; i >= 0; i--) {
    const quarter = quarterLabel(i + 1);
    const yoyBack = Math.pow(1 + seed.rg / 100, -(i + 4) / 4);
    const seasonal = 1 + (rand() - 0.5) * 0.06;
    const revenue = (revNow / 4) * yoyBack * seasonal;
    const profitBack = Math.pow(1 + seed.pg / 100, -(i + 4) / 4);
    const netProfit = (netProfitNow / 4) * profitBack * (1 + (rand() - 0.5) * 0.12);
    out.push({
      quarter,
      revenue: round1(revenue),
      netProfit: round1(netProfit),
      opm: round1((revenue * (opmNow / 100)) / revenue * 100 * (0.92 + rand() * 0.16)),
      eps: Math.round((netProfit / sharesCr) * 10) / 10,
      growthYoY: round1(seed.rg * (0.7 + rand() * 0.6)),
    });
  }
  return out;
}

export function getShareholding(seed: StockSeed): ShareholdingQuarter[] {
  const rand = mulberry32(hashString(`sh-${seed.s}`));
  const out: ShareholdingQuarter[] = [];
  for (let i = 7; i >= 0; i--) {
    const drift = (rand() - 0.5) * 0.8 * i;
    const promoters = clampNum(seed.ph + drift * 0.2, 0, 100);
    const fii = clampNum(seed.fii - drift * 0.1, 0, 100 - promoters);
    const dii = clampNum(seed.dii + drift * 0.05, 0, 100 - promoters - fii);
    out.push({
      quarter: quarterLabel(i + 1),
      promoters: round1(promoters),
      fii: round1(fii),
      dii: round1(dii),
      public: round1(Math.max(0, 100 - promoters - fii - dii)),
    });
  }
  return out;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
