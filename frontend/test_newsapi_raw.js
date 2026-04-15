const apiKey = 'afb02bd75fab48038f89f82830127389';
const fromDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const query = encodeURIComponent('Indian stock market news');
const url = `https://newsapi.org/v2/everything?q=${query}&from=${fromDate}&sortBy=publishedAt&language=en&pageSize=5&apiKey=${apiKey}`;

async function testNewsAPI() {
  console.log('Testing NewsAPI raw response...');
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log('Status Code:', res.status);
    console.log('Response Payload:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Fetch Failed:', e);
  }
}

testNewsAPI();
