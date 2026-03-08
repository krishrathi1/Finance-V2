import requests
import json
from datetime import datetime, timedelta

def get_nse_history(symbol="HDFCBANK"):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://www.nseindia.com/",
        "Connection": "keep-alive"
    }
    
    session = requests.Session()
    session.headers.update(headers)
    
    print("Step 1: Get main page for cookies...")
    session.get("https://www.nseindia.com", timeout=10)
    
    # Sometimes another hit to a simple API helps stabilize
    print("Step 2: Hit a simple API...")
    session.get("https://www.nseindia.com/api/marketStatus", timeout=10)
    
    now = datetime.now()
    from_date = (now - timedelta(days=30)).strftime("%d-%m-%Y")
    to_date = now.strftime("%d-%m-%Y")
    
    url = "https://www.nseindia.com/api/historical/cm/equity"
    params = {
        "symbol": symbol,
        "series": '["EQ"]',
        "from": from_date,
        "to": to_date
    }
    
    print(f"Step 3: Fetching historical for {symbol}...")
    r = session.get(url, params=params, timeout=15)
    print("Response Code:", r.status_code)
    try:
        data = r.json()
        if "data" in data and len(data["data"]) > 0:
            print(f"Success! Found {len(data['data'])} rows.")
            print("First row:", json.dumps(data["data"][0], indent=2))
        else:
            print("Empty data or error:", data)
    except Exception as e:
        print("Parsing error:", e)
        print("Raw head:", r.text[:200])

if __name__ == "__main__":
    get_nse_history()
