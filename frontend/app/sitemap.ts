import type { MetadataRoute } from "next";

import { POPULAR_STOCK_SYMBOLS, SITE_URL } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/screener`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.95,
    },
    {
      url: `${SITE_URL}/compare`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.88,
    },
    {
      url: `${SITE_URL}/portfolio`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.82,
    },
    {
      url: `${SITE_URL}/ipo`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/watchlist`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/alerts`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.68,
    },
  ];

  const stockPages: MetadataRoute.Sitemap = POPULAR_STOCK_SYMBOLS.map((symbol) => ({
    url: `${SITE_URL}/stocks/${symbol}`,
    lastModified: now,
    changeFrequency: "hourly" as const,
    priority: 0.85,
  }));

  return [...staticPages, ...stockPages];
}
