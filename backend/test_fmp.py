import asyncio
import httpx
import json

async def main():
    async with httpx.AsyncClient() as client:
        # Test FMP
        fmp_key = "1kCAXeLnkaQ3GF2L5yuuu2AqCDMGFquq"
        symbols = ["HDFCBANK.NS", "HDFCBANK.BO", "HDFCBANK", "RELIANCE.NS"]
        for s in symbols:
            url = f"https://financialmodelingprep.com/stable/ratios-ttm?symbol={s}&apikey={fmp_key}"
            res = await client.get(url)
            print(f"FMP ratios for {s}:", res.status_code, (res.json() if res.status_code==200 else res.text))
            
if __name__ == "__main__":
    asyncio.run(main())
