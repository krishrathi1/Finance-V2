const { NewsProvider } = require('./lib/providers/news');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load env
dotenv.config({ path: '.env.local' });

async function test() {
  console.log('--- TheNewsAPI & Daily Cache Verification ---');
  console.log('THE_NEWS_API_KEY present:', !!process.env.THE_NEWS_API_KEY);
  
  const provider = new NewsProvider();
  
  // Clear cache for fresh test if needed, but let's test the flow
  const cachePath = path.join(process.cwd(), 'cache', 'market_news.json');
  if (fs.existsSync(cachePath)) {
    console.log('Existing cache found. Checking if it serves...');
  } else {
    console.log('No cache found. Expecting fresh fetch.');
  }

  console.log('Fetching market news...');
  const start = Date.now();
  const articles = await provider.getMarketNews();
  const end = Date.now();

  console.log(`Fetched ${articles.length} articles in ${end - start}ms.`);
  
  if (articles.length > 0) {
    console.log('First article:', {
      title: articles[0].title,
      source: articles[0].source,
      imageUrl: articles[0].imageUrl ? 'Present' : 'Missing'
    });
  }

  if (fs.existsSync(cachePath)) {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    console.log('Cache File Verification:', {
      date: cache.date,
      count: cache.articles?.length
    });
  }

  console.log('--- Test Complete ---');
}

test().catch(console.error);
