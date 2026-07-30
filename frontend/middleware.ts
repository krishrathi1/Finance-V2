import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { rateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

// Protected routes that require authentication
const PROTECTED_ROUTES = ["/dashboard", "/premium-request", "/profile", "/settings"];
const ADMIN_ROUTES = ["/admin"];
const AUTH_ROUTES = ["/signin", "/signup"];

// Credential endpoints: strict limit to block brute force.
const STRICT_AUTH_API = /^\/api\/v1\/auth\/(login|register|forgot-password|verify-otp|reset-password|resend-verification)$/;
// LLM-backed endpoints: expensive per call, keep abuse bounded.
const AI_API =
  /^\/api\/v1\/stocks\/(screener\/ai|compare-analysis|portfolio-risk|portfolio-roast|ipo\/[^/]+\/ai-analysis|[^/]+\/(swot|earnings-tldr|competitor-verdict|news-analysis|watchlist-analysis|research-report))$/;
// CPU/memory-heavy document parsing (PDF/DOCX extraction) — no auth required
// (portfolio import is intentionally usable without a login) but must be
// rate-limited so it can't be used as a resource-exhaustion vector.
const DOCUMENT_PARSE_API = /^\/api\/v1\/portfolio\/parse-document$/;

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { detail: "Too many requests. Please try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get("access_token")?.value;

  if (pathname === "/email-preview" && process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  if (pathname.startsWith("/api/")) {
    const ip = clientIpFromHeaders(request.headers);

    if (STRICT_AUTH_API.test(pathname) && request.method === "POST") {
      // IP-only: NAT'd users share a limit, and it doesn't stop a distributed
      // attacker rotating IPs against one account — the per-email limiter in
      // the login/forgot-password routes covers that gap. This is just the
      // outer bound (was 10/5min = 120/hr; now ~36/hr).
      const result = await rateLimit(`auth:${ip}`, 6, 10 * 60_000);
      if (!result.ok) return tooManyRequests(result.retryAfterSeconds);
    } else if (AI_API.test(pathname)) {
      // AI-backed endpoints hit paid LLM quota per call — require a logged-in user
      // in addition to rate limiting, so anonymous traffic can't drain it.
      const rawSecret = process.env.JWT_SECRET_KEY?.trim();
      let authed = false;
      if (accessToken && rawSecret) {
        try {
          await jwtVerify(accessToken, new TextEncoder().encode(rawSecret));
          authed = true;
        } catch {
          authed = false;
        }
      }
      if (!authed) {
        return NextResponse.json({ detail: "Authentication required." }, { status: 401 });
      }

      const result = await rateLimit(`ai:${ip}`, 20, 60_000);
      if (!result.ok) return tooManyRequests(result.retryAfterSeconds);
    } else if (DOCUMENT_PARSE_API.test(pathname) && request.method === "POST") {
      const result = await rateLimit(`doc-parse:${ip}`, 10, 5 * 60_000);
      if (!result.ok) return tooManyRequests(result.retryAfterSeconds);
    }

    return NextResponse.next();
  }

  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  const isAdminRoute = ADMIN_ROUTES.some((route) => pathname.startsWith(route));
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));
  let tokenPayload: Awaited<ReturnType<typeof jwtVerify>>["payload"] | null = null;
  if (accessToken && (isProtected || isAdminRoute || isAuthRoute)) {
    const rawSecret = process.env.JWT_SECRET_KEY?.trim();
    if (rawSecret) {
      try {
        tokenPayload = (await jwtVerify(accessToken, new TextEncoder().encode(rawSecret))).payload;
      } catch {
        tokenPayload = null;
      }
    }
  }

  // If trying to access protected or admin route without token
  if ((isProtected || isAdminRoute) && !tokenPayload) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // If already authenticated and trying to access auth pages, redirect to dashboard
  if (isAuthRoute && tokenPayload) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // For admin routes, verify is_admin claim
  if (isAdminRoute && tokenPayload && tokenPayload.admin !== true) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/premium-request/:path*",
    "/profile/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/signin",
    "/signup",
    "/email-preview",
    "/api/v1/auth/:path*",
    "/api/v1/stocks/:path*",
    "/api/v1/portfolio/:path*",
  ],
};
