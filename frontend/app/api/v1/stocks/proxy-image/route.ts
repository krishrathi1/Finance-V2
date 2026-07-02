import { NextRequest, NextResponse } from "next/server";

const IMAGE_HEADERS = {
  "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
  "Access-Control-Allow-Origin": "*",
};

function placeholderSvg() {
  return new NextResponse(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450" role="img" aria-label="Market news">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#111827"/>
          <stop offset="0.52" stop-color="#1f2937"/>
          <stop offset="1" stop-color="#f97316"/>
        </linearGradient>
      </defs>
      <rect width="800" height="450" fill="url(#bg)"/>
      <path d="M90 320 230 205 350 260 505 140 710 245" fill="none" stroke="#ffffff" stroke-opacity=".82" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="505" cy="140" r="18" fill="#fbbf24"/>
      <text x="64" y="90" fill="#fff" font-family="Arial, sans-serif" font-size="38" font-weight="700">Market Insight</text>
      <text x="64" y="132" fill="#fff" fill-opacity=".74" font-family="Arial, sans-serif" font-size="22">Live finance news</text>
    </svg>`,
    {
      status: 200,
      headers: {
        ...IMAGE_HEADERS,
        "Content-Type": "image/svg+xml; charset=utf-8",
      },
    }
  );
}

function isPrivateIp(host: string): boolean {
  // IPv4 literals in private/reserved ranges (SSRF guard).
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  // IPv6 loopback / link-local / unique-local literals.
  if (host.includes(":")) {
    const h = host.replace(/^\[|\]$/g, "");
    return h === "::1" || h === "::" || /^f[cde]/i.test(h) || /^fe[89ab]/i.test(h);
  }
  return false;
}

function isPublicHttpUrl(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) return false;
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return false;
  }
  return !isPrivateIp(host);
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) return placeholderSvg();

  try {
    const targetUrl = new URL(rawUrl);
    if (!isPublicHttpUrl(targetUrl)) {
      return placeholderSvg();
    }

    const response = await fetch(targetUrl.toString(), {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: targetUrl.origin,
      },
      signal: AbortSignal.timeout(6000),
    });

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.startsWith("image/") || !response.body) {
      return placeholderSvg();
    }

    return new NextResponse(response.body, {
      headers: {
        ...IMAGE_HEADERS,
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    console.warn("Proxy image failed:", error);
    return placeholderSvg();
  }
}
