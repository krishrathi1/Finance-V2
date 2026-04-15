import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Use raw URL parsing to get everything after 'url=' 
  // searchParams.get() can sometimes truncate if the target URL has its own query params.
  const rawUrl = request.url.split('url=')[1];
  
  if (!rawUrl) {
    return new NextResponse('Missing URL', { status: 400 });
  }

  // Decode the URL (browser sends it encoded)
  const url = decodeURIComponent(rawUrl);

  try {
    const targetUrl = new URL(url);
    
    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      return new NextResponse('Invalid protocol', { status: 400 });
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': targetUrl.origin,
      },
      // Ensure we don't get stuck on giant files
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
       // If the real image fails, return a 302 to our premium placeholder
       return NextResponse.redirect('https://images.unsplash.com/photo-1611974717482-98aa003745fc?auto=format&fit=crop&q=80&w=800');
    }

    const contentType = response.headers.get('content-type');
    
    // Safety check: ensure we are actually serving an image
    if (contentType && !contentType.startsWith('image/')) {
        return NextResponse.redirect('https://images.unsplash.com/photo-1611974717482-98aa003745fc?auto=format&fit=crop&q=80&w=800');
    }

    // Stream the body for maximum reliability
    return new NextResponse(response.body, {
      headers: {
        'Content-Type': contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.warn(`Proxy error for ${url}:`, error);
    // Silent fallback to placeholder on error
    return NextResponse.redirect('https://images.unsplash.com/photo-1611974717482-98aa003745fc?auto=format&fit=crop&q=80&w=800');
  }
}
