import requests
import json
from datetime import datetime, timedelta

def test_nse_historical(symbol="HDFCBANK"):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.nseindia.com/get-quotes/equity?symbol=" + symbol,
    }
    
    session = requests.Session()
    session.headers.update(headers)
    
    print("Initial hit...")
    try:
        session.get("https://www.nseindia.com", timeout=10)
    except Exception as e:
        print("Initial hit failed:", e)
        return

    # NSE historical API for equities
    # Note: 'series' must be exactly '["EQ"]'
    now = datetime.now()
    # 7 days for quick test
    from_date = (now - timedelta(days=7)).strftime("%d-%m-%Y")
    to_date = now.strftime("%d-%m-%Y")
    
    url = f"https://www.nseindia.com/api/historical/cm/equity"
    params = {
        "symbol": symbol,
        "series": '["EQ"]',
        "from": from_date,
        "to": to_date
    }
    
    print(f"Requesting: {url} with {params}")
    try:
        r = session.get(url, params=params, timeout=15)
        print("Status Code:", r.status_code)
        if r.status_code == 200:
            data = r.json()
            print("Response Data (Truncated):", json.dumps(data, indent=2)[:2000])
        else:
            print("Response Text (Truncated):", r.text[:1000])
    except Exception as e:
        print("Request failed:", e)

if __name__ == "__main__":
    test_nse_historical()
