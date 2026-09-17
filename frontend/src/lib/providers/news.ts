
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
  private cache: { timestamp: number; articles: NewsArticle[] } | null = null;
  private CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  async getMarketNews(force = false): Promise<NewsArticle[]> {
    const now = Date.now();
    
    // 1. Try Cache First (within TTL)
    if (!force && this.cache && (now - this.cache.timestamp < this.CACHE_TTL_MS) && this.cache.articles.length > 0) {
      return this.cache.articles;
    }

    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    let articles: NewsArticle[] = [];

    // Use TheNewsAPI if available
    if (this.theNewsApiKey) {
      try {
        articles = await this.getTheNewsAPIArticles();
      } catch (err) {
        console.warn('[NewsProvider] TheNewsAPI error:', err);
      }
    }

    // Fallback to NewsAPI if TheNewsAPI failed or empty
    if (articles.length < 5 && this.apiKey) {
      try {
        const newsApiArticles = await this.getNewsAPIArticles(yesterday);
        const seen = new Set(articles.map((a) => a.url));
        for (const a of newsApiArticles) {
          if (!seen.has(a.url)) articles.push(a);
        }
      } catch (err) {
        console.warn('[NewsProvider] NewsAPI error:', err);
      }
    }

    // Primary & Fallback: High-Quality Indian Finance RSS Feeds with rich images
    try {
      const rssArticles = await this.getRichIndianMarketFeeds();
      const seenUrls = new Set(articles.map((a) => a.url));
      const seenTitles = new Set(articles.map((a) => this.normalizeTitle(a.title)));

      for (const article of rssArticles) {
        const norm = this.normalizeTitle(article.title);
        if (!seenUrls.has(article.url) && !seenTitles.has(norm)) {
          seenUrls.add(article.url);
          seenTitles.add(norm);
          articles.push(article);
        }
      }
    } catch (err) {
      console.warn('[NewsProvider] RSS feeds error:', err);
    }

    // Scrape OpenGraph images for top articles that don't have images yet
    const articlesNeedingImages = articles.filter((a) => !a.imageUrl).slice(0, 10);
    if (articlesNeedingImages.length > 0) {
      await Promise.all(
        articlesNeedingImages.map(async (article) => {
          try {
            const scavenged = await this.fetchOgImage(article.url);
            if (scavenged) {
              article.imageUrl = scavenged;
            }
          } catch {
            // Handled below with curated topic photo
          }
        })
      );
    }

    // Ensure EVERY single article has a high-quality relevant image
    for (let i = 0; i < articles.length; i++) {
      if (!articles[i].imageUrl) {
        articles[i].imageUrl = this.getTopicFallbackImage(articles[i].title, i);
      }
    }

    // Sort by latest publish date
    const finalArticles = articles.sort((a, b) => 
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    ).slice(0, 30);

    if (finalArticles.length > 0) {
      this.cache = { timestamp: now, articles: finalArticles };
    }

    return finalArticles;
  }

  private getTopicFallbackImage(title: string, index = 0): string {
    const photos = [
      "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&q=80&w=800", // Candlestick chart
      "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&q=80&w=800", // Stock charts
      "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&q=80&w=800", // Banking
      "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=800", // Corporate
      "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=800", // Tech
      "https://images.unsplash.com/photo-1579532537598-459ecdaf39cc?auto=format&fit=crop&q=80&w=800", // Investment
      "https://images.unsplash.com/photo-1535320903710-d993d3d77d29?auto=format&fit=crop&q=80&w=800", // Exchange
      "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&q=80&w=800", // Currency
    ];
    const lower = (title || "").toLowerCase();
    if (/tech|it|software|ai|digital|cyber/i.test(lower)) return photos[4];
    if (/bank|loan|interest|rbi|rate|inflation|currency|rupee|tax|income/i.test(lower)) return photos[7];
    if (/ipo|listing|wealth|mutual|fund|sip|invest|savings|annapurna|scheme/i.test(lower)) return photos[5];
    if (/corporate|company|deal|promoter|merger|tata|reliance/i.test(lower)) return photos[3];
    if (/nifty|sensex|bse|nse|stock|market|rally|trade|shares|gain|loss/i.test(lower)) return photos[0];

    let hash = index;
    for (let i = 0; i < title.length; i++) {
      hash = (hash << 5) - hash + title.charCodeAt(i);
    }
    return photos[Math.abs(hash) % photos.length];
  }

  private normalizeTitle(title: string): string {
    return (title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private cleanImageUrl(url: string): string | null {
    if (!url) return null;
    let clean = url.trim().replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
    if (clean.includes('%20(') || clean.includes('(Photo') || clean.includes('(photo') || clean.length > 500) {
      return null;
    }
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) return null;
    if (clean.includes('pixel') || clean.includes('tracker')) return null;
    return clean;
  }

  private cleanText(str: string): string {
    if (!str) return '';
    let clean = str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');
    clean = clean.replace(/\]\]>$/g, '');
    clean = this.decodeHTML(clean);
    clean = clean.replace(/<[^>]+>/g, ' ');
    return clean.replace(/\s+/g, ' ').trim();
  }

  private decodeHTML(str: string): string {
    if (!str) return '';
    return str
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/&(?:ndash|mdash|#8211|#8212);/gi, '-')
      .replace(/&hellip;|&#8230;/gi, '...');
  }

  private extractImageUrl(itemXml: string): string | null {
    // 1. media:content / media:thumbnail
    const mediaMatch = itemXml.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)["']/i);
    if (mediaMatch && mediaMatch[1]) {
      const u = this.cleanImageUrl(mediaMatch[1]);
      if (u) return u;
    }

    // 2. enclosure
    const enclosureMatch = itemXml.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
    if (enclosureMatch && enclosureMatch[1]) {
      const u = this.cleanImageUrl(enclosureMatch[1]);
      if (u) return u;
    }

    // 3. image tag within item
    const imageTagMatch = itemXml.match(/<image[^>]*>[\s\S]*?<url>([^<]+)<\/url>/i);
    if (imageTagMatch && imageTagMatch[1]) {
      const u = this.cleanImageUrl(imageTagMatch[1]);
      if (u) return u;
    }

    // 4. encoded <img> or raw <img> in description or content:encoded
    const imgMatch = itemXml.match(/(?:&lt;|<)img[^>]+src=(?:&quot;|["'])([^"'\s&]+)(?:&quot;|["'])/i);
    if (imgMatch && imgMatch[1]) {
      let src = imgMatch[1];
      if (src.startsWith('//')) src = 'https:' + src;
      const u = this.cleanImageUrl(src);
      if (u) return u;
    }

    return null;
  }

  private async fetchFeed(feedUrl: string, defaultSource: string): Promise<NewsArticle[]> {
    try {
      const response = await fetch(feedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
        },
        signal: AbortSignal.timeout(6000)
      });
      if (!response.ok) return [];
      const xml = await response.text();
      return this.parseFeedXml(xml, defaultSource);
    } catch {
      return [];
    }
  }

  private parseFeedXml(xml: string, defaultSource: string): NewsArticle[] {
    const articles: NewsArticle[] = [];
    const items = xml.split(/<item[\s>]/i).slice(1);

    for (const item of items) {
      const extract = (tag: string) => {
        const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
        return match ? match[1] : '';
      };

      const rawTitle = extract('title');
      const rawLink = extract('link');
      const rawPubDate = extract('pubDate');
      const rawDesc = extract('description');
      const rawSource = extract('source');

      const title = this.cleanText(rawTitle);
      const url = this.cleanText(rawLink).replace(/\s+/g, '');
      if (!title || !url || !url.startsWith('http')) continue;

      let source = this.cleanText(rawSource) || defaultSource;
      if (source === 'Google News' && title.includes(' - ')) {
        const parts = title.split(' - ');
        source = parts.pop() || defaultSource;
      }

      const imageUrl = this.extractImageUrl(item);
      const summaryText = this.cleanText(rawDesc);
      const summary = summaryText.length > 15 ? summaryText.slice(0, 250) : title;

      const dateObj = rawPubDate ? new Date(rawPubDate) : new Date();
      const publishedAt = Number.isNaN(dateObj.getTime()) ? new Date().toISOString() : dateObj.toISOString();

      articles.push({
        title,
        source,
        url,
        summary,
        imageUrl,
        publishedAt
      });
    }
    return articles;
  }

  private async getRichIndianMarketFeeds(): Promise<NewsArticle[]> {
    const feeds = [
      { url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', source: 'Economic Times' },
      { url: 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms', source: 'ET Markets' },
      { url: 'https://www.business-standard.com/rss/markets-106.rss', source: 'Business Standard' },
      { url: 'https://feeds.feedburner.com/ndtvprofit-latest', source: 'NDTV Profit' },
      { url: 'https://www.moneycontrol.com/rss/MCtopnews.xml', source: 'Moneycontrol' },
      { url: 'https://www.moneycontrol.com/rss/marketreports.xml', source: 'Moneycontrol' }
    ];

    const results = await Promise.all(feeds.map((f) => this.fetchFeed(f.url, f.source)));
    return results.flat();
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
    const publishedAfter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    
    try {
      const results = await Promise.all(
        queries.map(async (query) => {
          try {
            const url = `https://api.thenewsapi.com/v1/news/all?search=${encodeURIComponent(query)}&locale=in&language=en&categories=business&domains=${domains}&published_after=${publishedAfter}&sort=published_at&limit=8&api_token=${this.theNewsApiKey}`;
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
          title: this.cleanText(item.title),
          source: item.source || 'Market News',
          publishedAt: item.published_at,
          url: item.url,
          summary: this.cleanText(item.snippet || item.description || ''),
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
        redirect: 'follow',
        signal: AbortSignal.timeout(4500)
      });
      
      if (!response.ok) return null;
      
      const finalUrl = response.url;
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
    if (url.startsWith('/') && !url.startsWith('//')) return false;
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
          title: this.cleanText(article.title),
          source: article.source?.name || 'News',
          publishedAt: article.publishedAt,
          url: article.url,
          summary: this.cleanText(article.description || ''),
          imageUrl: article.urlToImage || null,
        });
      }
      return uniqueArticles;
    } catch { return []; }
  }
}

export const newsProvider = new NewsProvider();
