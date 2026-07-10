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
  if (!rawUrl) return placeholderSvg();

  try {
    let targetUrl = new URL(rawUrl);
    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      if (!isPlausiblyPublicUrl(targetUrl)) return placeholderSvg();

      // Use undici's fetch with a pinned-lookup dispatcher (not the global
      // fetch) so the address validated by pinnedPublicLookup is the exact
      // address connected to — see pinnedPublicLookup for why.
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
        if (!location || redirectCount === 3) return placeholderSvg();
        targetUrl = new URL(location, targetUrl);
        continue;
      }

      const contentType = (response.headers.get("content-type") || "")
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (!response.ok || !ALLOWED_IMAGE_TYPES.has(contentType)) return placeholderSvg();
      const body = await readLimitedBody(response);
      if (!body) return placeholderSvg();

      const responseBody = body.buffer.slice(
        body.byteOffset,
        body.byteOffset + body.byteLength
      ) as ArrayBuffer;
      return new NextResponse(responseBody, {
        headers: { ...IMAGE_HEADERS, "Content-Type": contentType },
      });
    }
    return placeholderSvg();
  } catch (error) {
    console.warn("Proxy image failed:", error);
    return placeholderSvg();
  }
}
