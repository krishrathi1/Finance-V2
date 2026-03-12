import { fileURLToPath } from "node:url";

const stripSourcemapLoader = fileURLToPath(new URL("./loaders/strip-sourcemap-url-loader.cjs", import.meta.url));

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
        destination: 'http://127.0.0.1:8000/api/:path*' // Proxy to Backend
      }
    ]
  }
};

export default nextConfig;
