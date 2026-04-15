const sampleEncoded = `&lt;table border="0" cellpadding="2" cellspacing="7" style="vertical-align:top;"&gt;&lt;tr&gt;&lt;td width="80" align="center" valign="top"&gt;&lt;font style="font-size:85%;font-family:arial,sans-serif"&gt;&lt;a href="https://news.google.com/rss/articles/CBMi..." target="_blank"&gt;&lt;img src="https://lh3.googleusercontent.com/proxy/ABC-123" alt="" border="1" width="80" height="80"&gt;&lt;/a&gt;&lt;/font&gt;&lt;/td&gt;&lt;td valign="top" class="j"&gt;&lt;font style="font-size:85%;font-family:arial,sans-serif"&gt;...&lt;/font&gt;&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;`;

function decodeHTML(str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

const description = decodeHTML(sampleEncoded);
console.log('Decoded Description Snippet:', description.substring(0, 200));

const imgMatch = description.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
if (imgMatch) {
  console.log('Found Image URL:', imgMatch[1]);
} else {
  console.log('ERROR: No Image URL found with regex!');
}

const summary = description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
console.log('Final Summary:', summary.substring(0, 100));
