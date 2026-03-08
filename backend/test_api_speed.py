import requests
import time

def test_dashboard(symbol="TCS"):
    url = f"http://localhost:8000/api/v1/stocks/{symbol}/dashboard"
    print(f"Testing {url}...")
    start = time.perf_counter()
    try:
        # Initial attempt (no refresh)
        r = requests.get(url, params={"refresh": "false"}, timeout=40)
        duration = time.perf_counter() - start
        print(f"Status: {r.status_code}")
        print(f"Time: {duration:.2f}s")
        if r.status_code == 200:
            data = r.json()
            print(f"Data received. Price: {data['price']['cmp']}")
            print(f"Financials count: {len(data['financials'].get('quarterly', []))}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_dashboard("TCS")
    test_dashboard("RELIANCE")
