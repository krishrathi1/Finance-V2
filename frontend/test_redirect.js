const googleUrl = 'https://news.google.com/rss/articles/CBMiugFBVV95cUxNVVhyYl9uWXZaUnowYnZzU19yUE9wRkhuTFp5Unp2eW5PZzV2U2Y5eGZ6Z0Z6Z0Z6Z0Z6WmxuTjlxTjlxTjlx?oc=5'; // Sample

async function resolveAndScrape() {
  console.log('Resolving URL:', googleUrl);
  try {
    const res = await fetch(googleUrl, { 
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow'
    });
    console.log('Final URL:', res.url);
    
    if (res.url.includes('news.google.com/auto-consent')) {
      console.log('STUCK AT CONSENT PAGE!');
    }

    const html = await res.text();
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    console.log('Scavenged Image:', ogMatch ? ogMatch[1] : 'NONE');
  } catch (e) {
    console.error(e);
  }
}

resolveAndScrape();
