import requests
import json
from datetime import datetime

NSE_HEADERS = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "accept-language": "en-US,en;q=0.9",
    "accept": "application/json",
    "referer": "https://www.nseindia.com/",
}

def fetch_nse_results(symbol):
    session = requests.Session()
    session.headers.update(NSE_HEADERS)
    # Initial visit to get cookies
    session.get("https://www.nseindia.com", timeout=10)
    
    url = f"https://www.nseindia.com/api/corporates-financial-results"
    params = {
        "index": "equities",
        "symbol": symbol,
        "period": "Quarterly"
    }
    
    print(f"Fetching results for {symbol}...")
    try:
        response = session.get(url, params=params, timeout=15)
        response.raise_for_status()
        data = response.json()
        
        with open("nse_raw_data.json", "w") as f:
            json.dump(data, f, indent=2)
        
        print(f"Found {len(data)} result rows.")
        for item in data[:5]:
            print(f"To Date: {item.get('toDate')}, Filing Date: {item.get('filingDate')}, XBRL: {item.get('xbrl')}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    fetch_nse_results("RELIANCE")
