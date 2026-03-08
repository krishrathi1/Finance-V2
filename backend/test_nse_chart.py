import requests
from datetime import datetime, timedelta

NSE_HEADERS = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "accept-language": "en-US,en;q=0.9",
    "accept": "application/json",
    "referer": "https://www.nseindia.com/get-quotes/equity?symbol=HDFCBANK",
}

def test_nse_historical(symbol="HDFCBANK"):
    session = requests.Session()
    session.headers.update(NSE_HEADERS)
    
    # 1. Initial hit to get cookies
    print("Getting cookies...")
    session.get("https://www.nseindia.com", timeout=10)
    
    # 2. Hit historical endpoint
    now = datetime.now()
    # NSE usually allows up to 1 year or 3 months depending on endpoint
    from_date = (now - timedelta(days=60)).strftime("%d-%m-%Y")
    to_date = now.strftime("%d-%m-%Y")
    
    url = f"https://www.nseindia.com/api/historical/cm/equity"
    params = {
        "symbol": symbol,
        "series": '["EQ"]',
        "from": from_date,
        "to": to_date
    }
    
    print(f"Fetching historical for {symbol} from {from_date} to {to_date}...")
    r = session.get(url, params=params, timeout=10)
    print("Status:", r.status_code)
    try:
        data = r.json()
        print("Data keys:", data.keys())
        if "data" in data and len(data["data"]) > 0:
            print("First row sample:", data["data"][0])
            print("Total rows:", len(data["data"]))
        else:
            print("No data found or empty list.")
    except Exception as e:
        print("Error parsing JSON:", e)
        print("Response text partial:", r.text[:500])

if __name__ == "__main__":
    test_nse_historical()
