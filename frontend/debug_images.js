async function debugImages() {
  const query = encodeURIComponent('Indian stock market when:1d');
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    const text = await response.text();
    const items = text.split('<item>').slice(1);
    
    console.log(`Found ${items.length} items.`);
    
    let foundImages = 0;
    items.forEach((item, i) => {
      const match = item.match(/&lt;img[^&]+src=["']([^"']+)["']/i);
      if (match) {
        foundImages++;
        if (foundImages <= 3) {
          console.log(`Item [${i}] Image URL: ${match[1]}`);
        }
      }
    });
    
    console.log(`Total items with images: ${foundImages}`);
  } catch (e) {
    console.error(e);
  }
}

debugImages();
