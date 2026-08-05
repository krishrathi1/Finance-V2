import type { MetadataRoute } from "next";

import { SITE_URL } from "@/shared/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Account-flow and one-time-token pages have no search value, and
        // indexing them wastes crawl budget on URLs that either bounce to a
        // login or carry a token that is already spent by the time a user
        // arrives from a search result. /email-preview is an internal tool
        // (404s in production) and must never appear in an index.
        disallow: [
          "/api/",
          "/signin",
          "/signup",
          "/reset-password",
          "/verify-email",
          "/premium-request",
          "/email-preview",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
