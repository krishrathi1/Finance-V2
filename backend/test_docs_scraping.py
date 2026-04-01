
import requests
import re
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import json

WEB_PAGE_HEADERS = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "accept-language": "en-US,en;q=0.9",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
}

def test_fetch_documents(symbol):
    print(f"Testing document fetch for {symbol}...")
    
    # 1. Try to resolve meta
    try:
        sitemap_url = "https://trendlyne.com/equity-sitemap-stocks.xml"
        print(f"Fetching sitemap from {sitemap_url}...")
        resp = requests.get(sitemap_url, headers=WEB_PAGE_HEADERS, timeout=15)
        resp.raise_for_status()
        xml_text = resp.text
        print(f"Sitemap size: {len(xml_text)} bytes")
        
        match = re.search(rf"/equity/(\d+)/({symbol})/([^/]+)/", xml_text, re.IGNORECASE)
        if not match:
            print(f"Could not find {symbol} in sitemap.")
            return
        
        stock_id = match.group(1)
        key = match.group(2).upper()
        slug = match.group(3)
        print(f"Resolved: stock_id={stock_id}, key={key}, slug={slug}")
        
        # 2. Fetch documents
        docs_url = f"https://trendlyne.com/fundamentals/annual-earnings-credit/{stock_id}/{key}/{slug}/"
        print(f"Fetching docs from {docs_url}...")
        docs_resp = requests.get(docs_url, headers=WEB_PAGE_HEADERS, timeout=15)
        docs_resp.raise_for_status()
        
        soup = BeautifulSoup(docs_resp.text, "html.parser")
        
        # Check annual reports pane
        pane = soup.select_one('.tab-pane[data-targetid="annualreport"]') or soup.select_one("#annualreport")
        if pane:
            print("Found Annual Reports pane.")
            links = pane.select('a[href*="get-document"], a[href*="/posts/"], a[href$=".pdf"]')
            print(f"Found {len(links)} links in pane.")
            for l in links[:3]:
                print(f"  - {l.get_text(strip=True)}: {l.get('href')}")
        else:
            print("Annual Reports pane NOT found.")
            # Print some IDs or classes to debug
            panes = soup.select('.tab-pane')
            print(f"Found {len(panes)} tab panes. IDs: {[p.get('id') for p in panes]}")
            data_targets = [p.get('data-targetid') for p in panes]
            print(f"Data targets: {data_targets}")

        # Check filings
        filings_url = f"https://trendlyne.com/latest-news/BSE-Announcements/{stock_id}/{key}/{slug}/"
        print(f"Fetching filings from {filings_url}...")
        filings_resp = requests.get(filings_url, headers=WEB_PAGE_HEADERS, timeout=15)
        if filings_resp.status_code == 200:
            f_soup = BeautifulSoup(filings_resp.text, "html.parser")
            blocks = f_soup.select("div.card-block.p-x-0")
            print(f"Found {len(blocks)} filing blocks.")
        else:
            print(f"Filings fetch failed with status {filings_resp.status_code}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_fetch_documents("RELIANCE")
