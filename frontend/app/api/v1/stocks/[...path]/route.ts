import type { NextRequest } from "next/server";

const DEFAULT_DEV_BACKEND_BASE = "http://127.0.0.1:8000";
const DEFAULT_BACKEND_BASE = "https://financial-forensics-ai-india.onrender.com";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getBackendBase() {
  const fallback = process.env.NODE_ENV === "production" ? DEFAULT_BACKEND_BASE : DEFAULT_DEV_BACKEND_BASE;
  return String(process.env.INTERNAL_API_BASE || process.env.NEXT_PUBLIC_API_BASE || fallback)
    .trim()
    .replace(/\/$/, "");
}

async function proxy(request: NextRequest, { params }: { params: { path: string[] } }) {
  const path = (params.path || []).map((part) => encodeURIComponent(part)).join("/");
  const target = `${getBackendBase()}/api/v1/stocks/${path}${request.nextUrl.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.set("accept-encoding", "identity");

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
      cache: "no-store",
      redirect: "follow"
    });

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    responseHeaders.delete("transfer-encoding");
    responseHeaders.delete("connection");
    responseHeaders.delete("keep-alive");
    responseHeaders.set("cache-control", "no-store");

    const body =
      request.method === "HEAD" || upstream.status === 204 || upstream.status === 304
        ? null
        : await upstream.arrayBuffer();

    return new Response(body, {
      status: upstream.status,
      headers: responseHeaders
    });
  } catch (error) {
    return Response.json(
      {
        detail: "API proxy error",
        message: error instanceof Error ? error.message : "Unknown proxy error",
        target
      },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest, context: { params: { path: string[] } }) {
  return proxy(request, context);
}

export async function POST(request: NextRequest, context: { params: { path: string[] } }) {
  return proxy(request, context);
}

export async function HEAD(request: NextRequest, context: { params: { path: string[] } }) {
  return proxy(request, context);
}
