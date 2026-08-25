import type { MetadataRoute } from "next";

import { POPULAR_STOCK_SYMBOLS, SITE_URL } from "@/shared/seo";

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
    // Legal pages change rarely and shouldn't compete with product pages for
    // crawl budget, but they must be indexable: search engines and app/payment
    // reviewers check that a service publishes reachable policy pages.
    {
      url: `${SITE_URL}/disclaimer`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
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
