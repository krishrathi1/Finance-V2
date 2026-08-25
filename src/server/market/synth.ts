// Deterministic fundamentals synthesizer for directory stocks that sit
// outside the curated 173-stock universe. Given the same directory entry it
// always produces the same StockSeed, so quotes, charts, scores, financials
// and AI research for every NSE/BSE directory stock are stable across
// requests — the same philosophy as the rest of the market engine.

import type { StockSeed } from "./universe";
import type { DirectoryEntry } from "./directory";
import { hashString, mulberry32 } from "./rng";

const INDUSTRIES_BY_SECTOR: Record<string, string[]> = {
  "Financial Services": ["NBFC — Diversified", "Private Sector Bank", "Asset Management", "Insurance — General", "Insurance — Life", "Capital Markets", "Housing Finance", "Small Finance Bank"],
  "Industrials": ["Engineering & Construction", "Industrial Machinery", "Defence", "Logistics", "Electrical Equipment", "Heavy Engineering", "Consulting & Engineering"],
  "Basic Materials": ["Specialty Chemicals", "Fertilizers & Agrochemicals", "Cement & Cement Products", "Steel", "Chemicals", "Metals & Mining", "Paper & Paper Products"],
  "Consumer Cyclical": ["Auto Components", "Apparel & Luxury Goods", "Household Appliances", "Restaurants", "Auto — 2/3 Wheelers", "Auto — Passenger Vehicles", "Retail — Apparel", "Travel & Leisure"],
  "Healthcare": ["Pharmaceuticals", "Hospitals & Diagnostics", "Medical Equipment", "Contract Research & Manufacturing"],
  "Technology": ["IT Services", "Software — Products", "Digital Platforms", "Electronics Manufacturing", "IT Consulting"],
  "Consumer Defensive": ["Packaged Foods", "Beverages", "Household Products", "Agricultural Products", "Food Processing"],
  "Utilities": ["Power Generation", "Power Transmission & Distribution", "Renewable Energy", "Gas Distribution"],
  "Energy": ["Oil & Gas Refining", "Oil & Gas E&P", "Oilfield Services", "Coal", "Oil Marketing"],
  "Real Estate": ["Real Estate Development", "Warehousing", "Integrated Townships"],
  "Communication Services": ["TV Broadcasting", "Publishing", "Telecom", "Digital Media", "Film Production & Distribution"],
};

const seedCache = new Map<string, StockSeed>();

/** Deterministically derive a full StockSeed from a directory entry. */
export function synthesizeSeed(entry: DirectoryEntry): StockSeed {
  const cached = seedCache.get(entry.s);
  if (cached) return cached;

  const rand = mulberry32(hashString(`synth-${entry.s}`));
  const r = () => rand();

  // Market cap: log-uniform ₹120 Cr – ₹45,000 Cr (directory is mid/small-cap biased)
  const mc = Math.round(Math.exp(Math.log(120) + r() * Math.log(45000 / 120)));
  // Shares outstanding (Cr) chosen so the price lands in a plausible band.
  const sharesCr = 0.35 + r() * 90;
  const p = Math.round(Math.min(Math.max(mc / sharesCr, 7), 9500) * 100) / 100;

  const pe = r() < 0.16 ? null : Math.round((5.5 + r() * 58) * 10) / 10;
  const pb = Math.round((0.35 + r() * 8.5) * 10) / 10;
  const roe = Math.round((-9 + r() * 40) * 10) / 10;
  const roce = Math.round((0.5 + r() * 28) * 10) / 10;
  const de = Math.round(r() * 2.4 * 100) / 100;
  let ph = Math.round(15 + r() * 62); // promoter-heavy small caps
  const fii = Math.round(r() * 17);
  const dii = Math.round(r() * 11);
  if (ph + fii + dii > 92) ph = Math.max(10, 92 - fii - dii);
  const dy = Math.round(r() * 3.4 * 10) / 10;
  const rg = Math.round(-14 + r() * 48);
  const pg = Math.round(-28 + r() * 68);
  const v = Math.round((0.95 + r() * 0.95) * 100) / 100;
  const d = Math.round((-0.06 + r() * 0.22) * 1000) / 1000;

  const industries = INDUSTRIES_BY_SECTOR[entry.sec] ?? ["Diversified Operations"];
  const ind = industries[Math.floor(rand() * industries.length)];

  const seed: StockSeed = {
    s: entry.s,
    n: entry.n,
    sec: entry.sec,
    ind,
    p,
    mc,
    pe,
    pb,
    roe,
    roce,
    de,
    ph,
    fii,
    dii,
    dy,
    rg,
    pg,
    v,
    d,
    ex: entry.ex,
  };

  if (seedCache.size > 1200) seedCache.clear();
  seedCache.set(entry.s, seed);
  return seed;
}
