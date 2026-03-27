import { fileURLToPath } from "node:url";

const stripSourcemapLoader = fileURLToPath(new URL("./loaders/strip-sourcemap-url-loader.cjs", import.meta.url));
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: false
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        // Cache static stock pages aggressively for CDN / search crawlers
        source: "/stocks/:symbol",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=300, stale-while-revalidate=3600",
          },
        ],
      },
    ];
  },
  webpack: (config) => {
    // Prevent noisy dev-time 404s for third-party sourcemap comments that
    // reference non-emitted *.map files in Next chunks.
    config.module.rules.push({
      test: /framer-motion[\\/]dist[\\/]es[\\/].*\.mjs$/,
      use: [
        {
          loader: stripSourcemapLoader
        }
      ]
    });
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" }
    ]
  }
};

export default nextConfig;
