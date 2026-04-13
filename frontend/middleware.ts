import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Protected routes that require authentication
const PROTECTED_ROUTES = ["/dashboard", "/premium-request", "/profile", "/settings"];
const ADMIN_ROUTES = ["/admin"];
const AUTH_ROUTES = ["/signin", "/signup"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get("access_token")?.value;

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
    try {
      const secret = new TextEncoder().encode(
        process.env.JWT_SECRET_KEY || "CHANGE_ME_IN_PRODUCTION_32_CHARS_MIN"
      );
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
  ],
};
