import fs from 'fs';
import path from 'path';

export interface NewsArticle {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  summary: string;
  imageUrl: string | null;
}

const MARKET_PLACEHOLDER = 'https://images.unsplash.com/photo-1611974717482-98aa003745fc?auto=format&fit=crop&q=80&w=800';

export class NewsProvider {
  private apiKey: string | null = process.env.NEWS_API_KEY || null;
  private theNewsApiKey: string | null = process.env.THE_NEWS_API_KEY || null;
  private cacheFile = path.join(process.cwd(), 'cache', 'market_news.json');

  async getMarketNews(): Promise<NewsArticle[]> {
    const today = new Date().toISOString().split('T')[0];
    
    // 1. Try Cache First
    try {
      if (fs.existsSync(this.cacheFile)) {
        const cacheRaw = fs.readFileSync(this.cacheFile, 'utf8');
        const cache = JSON.parse(cacheRaw);
        if (cache.date === today && cache.articles?.length > 0) {
          console.log(`[NewsProvider] Serving cached market news for ${today}`);
          return cache.articles;
        }
      }
    } catch (e) {
      console.error('[NewsProvider] Cache read error:', e);
    }

    // 2. Fetch fresh data
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    let articles: NewsArticle[] = [];

    // Use TheNewsAPI if available (Primary for Home Page)
    if (this.theNewsApiKey) {
      articles = await this.getTheNewsAPIArticles();
    }

    // Fallback to old sources if TheNewsAPI failed or empty
    if (articles.length < 3 && this.apiKey) {
      console.log('[NewsProvider] TheNewsAPI empty, trying NewsAPI...');
      const newsApiArticles = await this.getNewsAPIArticles(yesterday);
      const seen = new Set(articles.map(a => a.url));
      for (const a of newsApiArticles) {
        if (!seen.has(a.url)) articles.push(a);
      }
    }

    // 2. Fallback to RSS if NewsAPI failed
    if (articles.length < 3) {
      console.log('NewsAPI limited or empty, fetching RSS fallback...');
      const fallbackArticles = await this.getGoogleNewsFallback();
      
      const seen = new Set(articles.map(a => a.url));
      for (const article of fallbackArticles) {
        if (!seen.has(article.url)) {
          articles.push(article);
          seen.add(article.url);
        }
      }
    }

    // 3. Image Scavenging with Redirect Resolution
    // We only scrape the top 5 articles without images to keep performance high
    const articlesNeedingImages = articles.filter(a => !a.imageUrl).slice(0, 5);
    if (articlesNeedingImages.length > 0) {
      await Promise.all(articlesNeedingImages.map(async (article) => {
        try {
          const scavenged = await this.fetchOgImage(article.url);
          if (scavenged) {
            article.imageUrl = scavenged;
          } else {
            article.imageUrl = MARKET_PLACEHOLDER;
          }
        } catch {
          article.imageUrl = MARKET_PLACEHOLDER;
        }
      }));
    }

    // 4. Final Cleanup: Ensure no 'null' images for UI
    articles.forEach(a => { if (!a.imageUrl) a.imageUrl = MARKET_PLACEHOLDER; });

    const finalArticles = articles.sort((a, b) => 
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    // 5. Save to Cache
    try {
      const cacheDir = path.dirname(this.cacheFile);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      fs.writeFileSync(this.cacheFile, JSON.stringify({
        date: today,
        articles: finalArticles
      }), 'utf8');
      console.log(`[NewsProvider] Market news cached for ${today}`);
    } catch (e) {
      console.error('[NewsProvider] Cache write error:', e);
    }

    return finalArticles;
  }

  private async getTheNewsAPIArticles(): Promise<NewsArticle[]> {
    const queries = [
      '"Nifty 50" | "BSE Sensex"',
      'IPO | Listing | SEBI',
      '"Earnings" | "Dividend" | "Quarterly Results"',
      '"Market Strategy" | "Brokerage" | "Buy Sell"',
      '"RBI Policy" | "Economy" | "Inflation"'
    ];
    const domains = 'moneycontrol.com,economictimes.indiatimes.com,livemint.com,reuters.com,businesstoday.in,ndtvprofit.com';
    
    try {
      const results = await Promise.all(
        queries.map(async (query) => {
          try {
            const url = `https://api.thenewsapi.com/v1/news/all?search=${encodeURIComponent(query)}&locale=in&language=en&categories=business&domains=${domains}&published_after=2026-04-12&sort=published_at&limit=8&api_token=${this.theNewsApiKey}`;
            const response = await fetch(url, { next: { revalidate: 3600 } });
            if (!response.ok) return [];
            const data = await response.json();
            return data?.data || [];
          } catch { return []; }
        })
      );
      
      const allData = results.flat();
      const seen = new Set<string>();
      const articles: NewsArticle[] = [];

      for (const item of allData) {
        if (!item.url || seen.has(item.url)) continue;
        seen.add(item.url);
        articles.push({
          title: item.title,
          source: item.source || 'Market News',
          publishedAt: item.published_at,
          url: item.url,
          summary: item.snippet || item.description || '',
          imageUrl: item.image_url || null,
        });
      }

      return articles;
    } catch (error) {
      console.error('[NewsProvider] Failed to fetch from TheNewsAPI:', error);
      return [];
    }
  }

  /**
   * Resolves redirects and scrapes the final page for OpenGraph images
   */
  private async fetchOgImage(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, { 
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
        },
        redirect: 'follow', // CRITICAL: Follow Google News redirects
        signal: AbortSignal.timeout(4500)
      });
      
      if (!response.ok) return null;
      
      const finalUrl = response.url;
      // Skip if we are still on a google-owned domain (consent screens, etc.)
      if (finalUrl.includes('google.com') && !finalUrl.includes('lh3.googleusercontent.com')) {
        return null;
      }

      const html = await response.text();
      
      // Look for og:image
      const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      
      if (ogMatch && this.isGoodImageUrl(ogMatch[1])) return ogMatch[1];

      // Fallback to twitter:image
      const twitterMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
      if (twitterMatch && this.isGoodImageUrl(twitterMatch[1])) return twitterMatch[1];

      return null;
    } catch (error) {
      console.warn(`Failed to scavenge image for ${url}:`, error);
      return null;
    }
  }

  private isGoodImageUrl(url: string): boolean {
    if (!url) return false;
    // Skip small icons or logos usually starting with /
    if (url.startsWith('/') && !url.startsWith('//')) return false;
    // Skip known tracker/empty images
    if (url.includes('pixel') || url.includes('tracker')) return false;
    return true;
  }

  private async getNewsAPIArticles(fromDate: string): Promise<NewsArticle[]> {
    const queries = ['Indian stock market news', 'Nifty 50 update', 'BSE Sensex news'];
    try {
      const results = await Promise.all(
        queries.map(async (query) => {
          try {
            const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&from=${fromDate}&sortBy=publishedAt&language=en&pageSize=10&apiKey=${this.apiKey}`;
            const response = await fetch(url, { next: { revalidate: 300 } });
            if (!response.ok) return [];
            const data = await response.json();
            return data?.articles || [];
          } catch { return []; }
        })
      );
      const allArticles = results.flat();
      const seen = new Set<string>();
      const uniqueArticles: NewsArticle[] = [];
      for (const article of allArticles) {
        if (!article.url || seen.has(article.url)) continue;
        seen.add(article.url);
        uniqueArticles.push({
          title: article.title,
          source: article.source?.name || 'News',
          publishedAt: article.publishedAt,
          url: article.url,
          summary: article.description || '',
          imageUrl: article.urlToImage || null,
        });
      }
      return uniqueArticles;
    } catch { return []; }
  }

  private async getGoogleNewsFallback(): Promise<NewsArticle[]> {
    const query = encodeURIComponent('Indian stock market');
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
    try {
      const response = await fetch(url, { 
        headers: { 'User-Agent': 'Mozilla/5.0' },
        next: { revalidate: 300 } 
      });
      if (!response.ok) return [];
      const xml = await response.text();
      return this.parseRSS(xml);
    } catch { return []; }
  }

  private decodeHTML(str: string): string {
    return str
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  }

  private parseRSS(xml: string): NewsArticle[] {
    const articles: NewsArticle[] = [];
    const items = xml.split('<item>').slice(1);
    for (const item of items) {
      const extract = (tag: string) => {
        const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
        return match ? match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
      };
      const titleRaw = extract('title');
      const link = extract('link');
      const pubDate = extract('pubDate');
      const descriptionRaw = extract('description');
      const sourceRaw = extract('source');
      const description = this.decodeHTML(descriptionRaw);
      
      let title = titleRaw;
      let source = sourceRaw || 'Google News';
      if (!sourceRaw && titleRaw.includes(' - ')) {
        const parts = titleRaw.split(' - ');
        source = parts.pop() || 'Google News';
        title = parts.join(' - ');
      }

      let imageUrl: string | null = null;
      const imgMatch = description.match(/<img[^>]+src="([^">]+)"/i);
      if (imgMatch) {
         imageUrl = imgMatch[1];
         if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
      }

      let summary = description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (summary.length < 10) summary = title;

      articles.push({
        title, source, url: link,
        publishedAt: new Date(pubDate).toISOString(),
        summary: summary.substring(0, 250),
        imageUrl: imageUrl
      });
      if (articles.length >= 20) break;
    }
    return articles;
  }
}

export const newsProvider = new NewsProvider();
