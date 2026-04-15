import requests
import json
from datetime import datetime

NSE_HEADERS = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "accept-language": "en-US,en;q=0.9",
    "accept": "application/json, text/plain, */*",
    "referer": "https://www.nseindia.com/",
    "x-requested-with": "XMLHttpRequest",
}

def check_nse_index(index_name="NIFTY 50"):
    session = requests.Session()
    session.headers.update(NSE_HEADERS)
    
    print("Step 1: Visiting main page for cookies...")
    try:
        session.get("https://www.nseindia.com", timeout=10)
    except Exception as e:
        print(f"Failed to reach main page: {e}")
        return

    print(f"Step 2: Fetching index {index_name}...")
    url = "https://www.nseindia.com/api/equity-stockIndices"
    try:
        r = session.get(url, params={"index": index_name}, timeout=15)
        print(f"Status Code: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            stocks = data.get("data", [])
            print(f"Found {len(stocks)} stocks in the response.")
            if len(stocks) > 0:
                print("First 3 symbols:", [s.get("symbol") for s in stocks[:3]])
                print("Last 3 symbols:", [s.get("symbol") for s in stocks[-3:]])
        else:
            print(f"Error: {r.text[:500]}")
    except Exception as e:
        print(f"Failed to fetch index: {e}")

if __name__ == "__main__":
    check_nse_index()
