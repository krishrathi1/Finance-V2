const today = new Date().toISOString().split('T')[0];
console.log('DEBUG: Today is', today);

async function debugNews() {
  const query = encodeURIComponent('Indian stock market when:1d');
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
  
  console.log('Step 1: Testing Google News RSS fetch...');
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    console.log('Status:', response.status);
    const text = await response.text();
    console.log('XML Length:', text.length);
    if (text.length > 500) {
      console.log('Snippet:', text.substring(0, 500));
    }
    
    const items = text.split('<item>').slice(1);
    console.log('Found items:', items.length);
    if (items.length > 0) {
      console.log('First item sample:', items[0].substring(0, 200));
    }
  } catch (e) {
    console.error('Fetch error:', e);
  }
}

debugNews();
