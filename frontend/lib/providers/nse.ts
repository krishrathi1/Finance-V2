const NSE_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
  'accept': 'application/json, text/plain, */*',
  'referer': 'https://www.nseindia.com/',
  'x-requested-with': 'XMLHttpRequest',
};

export interface HeatmapRow {
  symbol: string;
  cmp: number;
  change: number;
  changePercent: number;
  high?: number;
  low?: number;
}

export class NSEProvider {
  private cookies: string | null = null;

  private async ensureCookies(): Promise<string> {
    if (this.cookies) return this.cookies;

    try {
      const response = await fetch('https://www.nseindia.com', {
        headers: NSE_HEADERS,
        next: { revalidate: 3600 } // Cache cookies for an hour
      });

      // undici's Headers.get('set-cookie') returns null for multi-cookie responses;
      // use getSetCookie() and keep only the name=value part of each cookie.
      const headersAny = response.headers as Headers & { getSetCookie?: () => string[] };
      let parts: string[] = [];
      if (typeof headersAny.getSetCookie === 'function') {
        parts = headersAny.getSetCookie();
      } else {
        const raw = response.headers.get('set-cookie');
        if (raw) parts = [raw];
      }
      this.cookies = parts.map((c) => c.split(';')[0].trim()).filter((c) => c.includes('=')).join('; ');
      return this.cookies;
    } catch (error) {
      console.error('NSE Cookie fetch failed:', error);
      return '';
    }
  }

  async getIndexHeatmap(indexName: string): Promise<HeatmapRow[]> {
    const cookies = await this.ensureCookies();
    const url = `https://www.nseindia.com/api/equity-stockIndices?index=${encodeURIComponent(indexName)}`;

    try {
      const response = await fetch(url, {
        headers: {
          ...NSE_HEADERS,
          Cookie: cookies,
        },
        next: { revalidate: 60 } // Cache data for 60 seconds
      });

      if (!response.ok) {
        throw new Error(`NSE API returned status: ${response.status}`);
      }

      const payload = await response.json();
      const data = payload?.data || [];
      
      const rows: HeatmapRow[] = data
        .filter((item: any) => {
          const symbol = (item.symbol || '').trim().toUpperCase();
          return symbol && symbol !== indexName.toUpperCase();
        })
        .map((item: any) => ({
          symbol: item.symbol,
          cmp: parseFloat(item.lastPrice) || 0,
          change: parseFloat(item.change) || 0,
          changePercent: parseFloat(item.pChange) || 0,
          high: parseFloat(item.dayHigh) || undefined,
          low: parseFloat(item.dayLow) || undefined,
        }))
        .filter((row: HeatmapRow) => row.cmp > 0);

      // Sort by percent change descending
      return rows.sort((a, b) => b.changePercent - a.changePercent);
    } catch (error) {
      console.error(`Failed to fetch NSE index ${indexName}:`, error);
      return [];
    }
  }

  async getAllIndices(): Promise<HeatmapRow[]> {
    const cookies = await this.ensureCookies();
    const url = 'https://www.nseindia.com/api/allIndices';

    try {
      const response = await fetch(url, {
        headers: {
          ...NSE_HEADERS,
          Cookie: cookies,
        },
        next: { revalidate: 60 }
      });

      if (!response.ok) return [];

      const payload = await response.json();
      const data = payload?.data || [];

      return data.map((item: any) => ({
        symbol: (item.index || '').trim(),
        cmp: parseFloat(item.last) || 0,
        change: parseFloat(item.variation) || 0,
        changePercent: parseFloat(item.percentChange) || 0,
      }));
    } catch (error) {
      console.error('Failed to fetch all NSE indices:', error);
      return [];
    }
  }
}

export const nseProvider = new NSEProvider();
