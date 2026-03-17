import type { NextRequest } from "next/server";

const DEFAULT_BACKEND_BASE = "https://financial-forensics-ai-india.onrender.com";

export const dynamic = "force-dynamic";

function getBackendBase() {
  return String(process.env.INTERNAL_API_BASE || process.env.NEXT_PUBLIC_API_BASE || DEFAULT_BACKEND_BASE)
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

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
      cache: "no-store",
      redirect: "follow"
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: upstream.headers
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
