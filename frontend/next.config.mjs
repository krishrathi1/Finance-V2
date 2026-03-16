import { fileURLToPath } from "node:url";

const stripSourcemapLoader = fileURLToPath(new URL("./loaders/strip-sourcemap-url-loader.cjs", import.meta.url));
const apiBase = (process.env.INTERNAL_API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000").replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: false
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
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        // Keep local dev working while allowing Cloudflare/Vercel builds to point at the hosted API.
        destination: `${apiBase}/api/:path*`
      }
    ]
  }
};

export default nextConfig;
