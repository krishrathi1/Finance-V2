// Mock for Next.js environment
process.env.NEWS_API_KEY = 'afb02bd75fab48038f89f82830127389';

async function testProvider() {
  const { NewsProvider } = require('./lib/providers/news');
  const provider = new NewsProvider();
  
  console.log('Testing NewsProvider.getMarketNews()...');
  try {
    const articles = await provider.getMarketNews();
    console.log('Returned articles count:', articles.length);
    if (articles.length > 0) {
      console.log('First article:', JSON.stringify(articles[0], null, 2));
    } else {
      console.error('ERROR: Provider returned zero articles!');
    }
  } catch (e) {
    console.error('Provider crashed:', e);
  }
}

testProvider();
