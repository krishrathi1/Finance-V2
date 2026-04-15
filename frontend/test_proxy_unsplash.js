const testUrl = 'https://images.unsplash.com/photo-1611974717482-98aa003745fc?auto=format&fit=crop&q=80&w=800';

async function testProxy() {
  console.log('Testing Unsplash fetch directly...');
  try {
    const res = await fetch(testUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    console.log('Status:', res.status);
    console.log('Content-Type:', res.headers.get('content-type'));
  } catch (e) {
    console.error('Error:', e);
  }
}

testProxy();
