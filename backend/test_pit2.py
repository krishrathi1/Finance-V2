import requests
import datetime

url = "https://www.nseindia.com/api/corporates-pit"

headers = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "accept-language": "en-US,en;q=0.9",
    "accept": "*/*",
    "referer": "https://www.nseindia.com/companies-listing/corporate-filings-insider-trading",
}

print("Init session...")
s = requests.Session()
s.headers.update(headers)
try:
    s.get("https://www.nseindia.com", timeout=5)
    print("Session ready. Fetching", url)
    now = datetime.datetime.now()
    past = now - datetime.timedelta(days=90)
    
    # Try with from/to
    params = {
        "index": "equities",
        "symbol": "HDFCBANK",
        "from": past.strftime("%d-%m-%Y"),
        "to": now.strftime("%d-%m-%Y")
    }
    r = s.get(url, params=params, timeout=5)
    print("Status:", r.status_code)
    try:
        data = r.json()
        print("Total items:", len(data.get("data", [])))
        if data.get("data"):
            print(data["data"][0])
    except Exception as e:
        print("Error parsing JSON", e, r.text[:200])
except Exception as e:
    print("Failed", e)
