import httpx, asyncio, json

async def main():
    # Force refresh to bypass cache
    r = await httpx.AsyncClient(timeout=90).get(
        "http://127.0.0.1:8000/api/v1/stocks/HDFCBANK/dashboard?timeframe=5Y&refresh=true"
    )
    d = r.json()
    print(f"Top-level keys: {list(d.keys())}")
    print(f"cached: {d.get('cached')}")
    
    data = d.get("data", d)
    m = data.get("metrics", {})
    print(f"ROE: {m.get('roe')}")
    print(f"ROCE: {m.get('roce')}")
    print(f"EPS: {m.get('eps')}")
    print(f"history_len: {len(data.get('price', {}).get('history', []))}")
    print(f"cmp: {data.get('price', {}).get('cmp')}")
    print(f"companyName: {data.get('companyName')}")

asyncio.run(main())
