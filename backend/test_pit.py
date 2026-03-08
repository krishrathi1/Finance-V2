import requests

url = "https://www.nseindia.com/api/corporates-pit?index=equities" # try fetching general to see if it works

headers = {
    "user-agent": "Mozilla/5.0",
    "accept-language": "en-US,en;q=0.9",
    "accept": "application/json",
    "referer": "https://www.nseindia.com/companies-listing/corporate-filings-insider-trading",
}

print("Init session...")
s = requests.Session()
s.headers.update(headers)
s.get("https://www.nseindia.com", timeout=10)

print(f"Fetching {url}")
r = s.get(url, timeout=10)
print(r.status_code)
if r.status_code == 200:
    data = r.json()
    print("Keys:", data.keys())
    print("Total items:", len(data.get('data', [])))
    if data.get('data'):
        print("Sample:", data['data'][0])
else:
    print(r.text)
