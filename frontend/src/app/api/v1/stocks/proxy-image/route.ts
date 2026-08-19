import { NextRequest, NextResponse } from "next/server";
import dns from "node:dns";
import { Agent, fetch as undiciFetch, type Response as UndiciResponse } from "undici";

const IMAGE_HEADERS = {
  "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
};

// Failure responses (the placeholder SVG) must not be cached anywhere near
// as long as a real image — a transient upstream/DNS blip would otherwise
// get stuck for a full day for every viewer.
const PLACEHOLDER_HEADERS = {
  "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const THEMES = [
  {
    category: "MARKET RALLY",
    gradient: ["#052e16", "#047857", "#10b981"],
    chartPath: "M 60 320 Q 200 280 350 200 T 740 80",
    glowColor: "#34d399",
    tag: "BULLISH MOMENTUM"
  },
  {
    category: "FED & INTEREST RATES",
    gradient: ["#0f172a", "#1e3a8a", "#3b82f6"],
    chartPath: "M 60 120 Q 250 180 450 260 T 740 280",
    glowColor: "#60a5fa",
    tag: "CENTRAL BANK"
  },
  {
    category: "TECH & IT SECTOR",
    gradient: ["#2e1065", "#6b21a8", "#a855f7"],
    chartPath: "M 60 280 Q 220 160 420 180 T 740 60",
    glowColor: "#c084fc",
    tag: "SECTOR INTELLIGENCE"
  },
  {
    category: "SENSEX & NIFTY 50",
    gradient: ["#1e1b4b", "#4338ca", "#6366f1"],
    chartPath: "M 60 240 Q 240 280 440 180 T 740 100",
    glowColor: "#818cf8",
    tag: "EQUITY INDEX"
  },
  {
    category: "MARKET VOLATILITY",
    gradient: ["#450a0a", "#991b1b", "#ef4444"],
    chartPath: "M 60 100 Q 220 140 420 280 T 740 320",
    glowColor: "#f87171",
    tag: "BEARISH WAVE"
  },
  {
    category: "GLOBAL ECONOMY",
    gradient: ["#14532d", "#15803d", "#22c55e"],
    chartPath: "M 60 260 Q 220 200 450 160 T 740 90",
    glowColor: "#4ade80",
    tag: "MACRO RESEARCH"
  }
];

function selectTheme(title: string, index: number) {
  const lower = title.toLowerCase();
  if (/fed|rate|rbi|inflation|bank|hike|interest/i.test(lower)) return THEMES[1];
  if (/surge|jump|rally|rise|gain|soar|high|record|bull/i.test(lower)) return THEMES[0];
  if (/fall|drop|slump|plunge|loss|decline|bear|red/i.test(lower)) return THEMES[4];
  if (/tech|it|software|wipro|tcs|hcl|ai|digital/i.test(lower)) return THEMES[2];
  if (/nifty|sensex|bse|nse|index/i.test(lower)) return THEMES[3];
  
  let hash = index;
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i);
  }
  return THEMES[Math.abs(hash) % THEMES.length];
}

function placeholderSvg(title = "", idx = 0) {
  const theme = selectTheme(title, idx);
  const cleanTitle = title.length > 50 ? title.slice(0, 47) + "..." : title || "Market Intelligence";
  const escapedTitle = cleanTitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return new NextResponse(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450" role="img" aria-label="Market news">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${theme.gradient[0]}"/>
          <stop offset="50%" stop-color="${theme.gradient[1]}"/>
          <stop offset="100%" stop-color="${theme.gradient[2]}"/>
        </linearGradient>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="800" height="450" fill="url(#bg)"/>
      <rect width="800" height="450" fill="url(#grid)"/>
      
      <path d="${theme.chartPath}" fill="none" stroke="${theme.glowColor}" stroke-opacity="0.3" stroke-width="28" stroke-linecap="round"/>
      <path d="${theme.chartPath}" fill="none" stroke="#ffffff" stroke-opacity="0.85" stroke-width="12" stroke-linecap="round"/>
      
      <rect x="50" y="50" width="220" height="34" rx="17" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
      <circle cx="70" cy="67" r="5" fill="${theme.glowColor}"/>
      <text x="85" y="72" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" letter-spacing="1.5">${theme.tag}</text>

      <text x="50" y="330" fill="${theme.glowColor}" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="800" letter-spacing="2">${theme.category}</text>
      <text x="50" y="375" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="700">${escapedTitle}</text>
    </svg>`,
    {
      status: 200,
      headers: {
        ...PLACEHOLDER_HEADERS,
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    }
  );
}

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
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

function isPrivateIp(host: string): boolean {
  if (isPrivateIpv4(host)) return true;
  if (host.includes(":")) {
    const h = host.replace(/^\[|\]$/g, "").toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) IPv6
    // literals — unwrap and re-check the embedded IPv4 address, otherwise
    // e.g. ::ffff:127.0.0.1 or ::ffff:169.254.169.254 sail through as
    // "public" despite mapping straight to a loopback/link-local address.
    const mapped = /^::(ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h);
    if (mapped) return isPrivateIpv4(mapped[2]);
    return h === "::1" || h === "::" || /^f[cde]/.test(h) || /^fe[89ab]/.test(h);
  }
  return false;
}

/** Synchronous, pre-DNS checks — protocol and obviously-local hostnames. */
function isPlausiblyPublicUrl(url: URL): boolean {
  if (!["http:", "https:"].includes(url.protocol)) return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host.endsWith(".local") || host.endsWith(".internal")) {
    return false;
  }
  return !isPrivateIp(host);
}

/**
 * Custom `dns.lookup` used as the Agent's connect-time resolver so the
 * address that's validated is the address that's actually connected to —
 * no separate later re-resolution, closing the DNS-rebinding TOCTOU gap
 * where a hostname could resolve to a public IP at validation time and a
 * private one moments later at connect time.
 */
function pinnedPublicLookup(
  hostname: string,
  _options: unknown,
  callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
): void {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = (addresses as Array<{ address: string; family: number }>) || [];
    const valid = list.find((a) => !isPrivateIp(a.address));
    if (!valid) {
      const notFound = new Error(`No public address for ${hostname}`) as NodeJS.ErrnoException;
      notFound.code = "ENOTFOUND";
      return callback(notFound, "", 4);
    }
    callback(null, valid.address, valid.family);
  });
}

const pinnedDispatcher = new Agent({ connect: { lookup: pinnedPublicLookup as any } });

async function readLimitedBody(response: UndiciResponse): Promise<Uint8Array | null> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) return null;
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  const title = request.nextUrl.searchParams.get("title") || "";
  const idx = Number(request.nextUrl.searchParams.get("idx") || 0);

  if (!rawUrl) return placeholderSvg(title, idx);

  try {
    let targetUrl = new URL(rawUrl);
    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      if (!isPlausiblyPublicUrl(targetUrl)) return placeholderSvg(title, idx);

      const response = await undiciFetch(targetUrl.toString(), {
        dispatcher: pinnedDispatcher,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: targetUrl.origin,
        },
        redirect: "manual",
        signal: AbortSignal.timeout(6000),
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirectCount === 3) return placeholderSvg(title, idx);
        targetUrl = new URL(location, targetUrl);
        continue;
      }

      const contentType = (response.headers.get("content-type") || "")
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (!response.ok || !ALLOWED_IMAGE_TYPES.has(contentType)) return placeholderSvg(title, idx);
      const body = await readLimitedBody(response);
      if (!body) return placeholderSvg(title, idx);

      const responseBody = body.buffer.slice(
        body.byteOffset,
        body.byteOffset + body.byteLength
      ) as ArrayBuffer;
      return new NextResponse(responseBody, {
        headers: { ...IMAGE_HEADERS, "Content-Type": contentType },
      });
    }
    return placeholderSvg(title, idx);
  } catch (error) {
    console.warn("Proxy image failed:", error);
    return placeholderSvg(title, idx);
  }
}
