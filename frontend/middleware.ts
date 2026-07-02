import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { rateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

// Protected routes that require authentication
const PROTECTED_ROUTES = ["/dashboard", "/premium-request", "/profile", "/settings"];
const ADMIN_ROUTES = ["/admin"];
const AUTH_ROUTES = ["/signin", "/signup"];

// Credential endpoints: strict limit to block brute force.
const STRICT_AUTH_API = /^\/api\/v1\/auth\/(login|register|forgot-password|verify-otp|reset-password)$/;
// LLM-backed endpoints: expensive per call, keep abuse bounded.
const AI_API =
  /^\/api\/v1\/stocks\/(screener\/ai|compare-analysis|portfolio-risk|portfolio-roast|ipo\/[^/]+\/ai-analysis|[^/]+\/(chat|swot|earnings-tldr|competitor-verdict|news-analysis|watchlist-analysis|research-report))$/;

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { detail: "Too many requests. Please try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get("access_token")?.value;

  if (pathname.startsWith("/api/")) {
    const ip = clientIpFromHeaders(request.headers);

    if (STRICT_AUTH_API.test(pathname) && request.method === "POST") {
      const result = rateLimit(`auth:${ip}`, 10, 5 * 60_000);
      if (!result.ok) return tooManyRequests(result.retryAfterSeconds);
    } else if (AI_API.test(pathname)) {
      const result = rateLimit(`ai:${ip}`, 20, 60_000);
      if (!result.ok) return tooManyRequests(result.retryAfterSeconds);
    }

    return NextResponse.next();
  }

  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  const isAdminRoute = ADMIN_ROUTES.some((route) => pathname.startsWith(route));
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  // If trying to access protected or admin route without token
  if ((isProtected || isAdminRoute) && !accessToken) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // If already authenticated and trying to access auth pages, redirect to dashboard
  if (isAuthRoute && accessToken) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // For admin routes, verify is_admin claim
  if (isAdminRoute && accessToken) {
    const jwtSecretKey = process.env.JWT_SECRET_KEY;
    if (!jwtSecretKey) {
      // Fail closed: without a real secret we cannot safely verify the admin claim.
      const url = request.nextUrl.clone();
      url.pathname = "/signin";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    try {
      const secret = new TextEncoder().encode(jwtSecretKey);
      const { payload } = await jwtVerify(accessToken, secret);

      // Check if user is admin
      if (payload.admin !== true) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    } catch (error) {
      // Invalid token, redirect to signin
      const url = request.nextUrl.clone();
      url.pathname = "/signin";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
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
    "/api/v1/auth/:path*",
    "/api/v1/stocks/:path*",
  ],
};
