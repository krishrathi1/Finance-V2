const today = new Date().toISOString().split('T')[0];

async function testImages() {
  const apiKey = 'afb02bd75fab48038f89f82830127389';
  const query = 'Indian stock market';
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&from=${today}&sortBy=publishedAt&language=en&pageSize=5&apiKey=${apiKey}`;

  console.log('Testing NewsAPI images...');
  try {
    const res = await fetch(url);
    const data = await res.json();
    const articles = data.articles || [];
    articles.forEach((a, i) => {
      console.log(`[${i}] Source: ${a.source.name}`);
      console.log(`    Image: ${a.urlToImage}`);
    });
  } catch (e) {
    console.error(e);
  }
}

testImages();
