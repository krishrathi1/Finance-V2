const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

async function debugNews() {
  const token = process.env.THE_NEWS_API_KEY;
  const queries = ['Sensex', 'Nifty', '"stock market"', '"share market"'];
  const domains = 'moneycontrol.com,economictimes.indiatimes.com,livemint.com,reuters.com,businesstoday.in,ndtvprofit.com';
  
  for (const query of queries) {
    const url = `https://api.thenewsapi.com/v1/news/all?search=${encodeURIComponent(query)}&locale=in&language=en&categories=business&domains=${domains}&published_after=2026-04-12&sort=published_at&limit=3&api_token=${token}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      console.log(`Query: ${query} -> Results: ${data.data?.length || 0}`);
      if (data.data) {
        data.data.forEach((i) => console.log(`  - ${i.title.substring(0, 50)}...`));
      }
    } catch (e) {
      console.error(`Query: ${query} failed`, e);
    }
  }
}

debugNews();
