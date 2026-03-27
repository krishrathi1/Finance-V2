import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/stocks/", "/screener", "/ipo", "/compare", "/portfolio", "/watchlist", "/alerts"],
        disallow: ["/api/", "/_next/", "/admin", "/*.json$"],
      },
      {
        userAgent: "Googlebot",
        allow: "/",
      },
      {
        userAgent: "Bingbot",
        allow: "/",
      },
    ],
    sitemap: "https://mystockvision.com/sitemap.xml",
    host: "https://mystockvision.com",
  };
}
