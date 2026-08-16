import { fileURLToPath } from "node:url";

const stripSourcemapLoader = fileURLToPath(new URL("./loaders/strip-sourcemap-url-loader.cjs", import.meta.url));
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle at .next/standalone, with only the
  // node_modules actually reached by the traced imports. The Docker image
  // copies that instead of the full dependency tree, which is the difference
  // between shipping a ~1.5 GB image and a ~350 MB one — and a smaller image
  // is the whole point when it has to be handed to someone else.
  //
  // This is additive: `next start` and `next dev` are unaffected.
  output: "standalone",
  experimental: {
    typedRoutes: false
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    // 'unsafe-eval' is only needed for webpack/Fast Refresh in dev; drop it in
    // production. 'unsafe-inline' on script-src stays in both — the app emits
    // an inline JSON-LD <script> (app/layout.tsx) which isn't worth wiring
    // per-request nonces for — but everything else here (object-src, base-uri,
    // frame-ancestors, disallowing arbitrary external script/frame sources)
    // still meaningfully shrinks the blast radius if XSS is ever achieved.
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");

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
          { key: "Content-Security-Policy", value: csp },
          // Only meaningful over HTTPS; browsers ignore it on plain HTTP, so
          // it's safe to send unconditionally (Vercel/most hosts terminate TLS
          // in front of Next.js).
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
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
  // next/image is only used for local assets; external images (news
  // thumbnails) go through /api/v1/stocks/proxy-image with its own guards.
  // No remotePatterns — keeping /_next/image from acting as an open proxy.
};

export default nextConfig;
