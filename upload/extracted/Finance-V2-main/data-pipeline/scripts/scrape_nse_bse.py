import argparse
import asyncio
import json
from datetime import datetime

import httpx


NSE_HEADERS = {
    "user-agent": "Mozilla/5.0",
    "accept-language": "en-US,en;q=0.9",
    "accept": "application/json",
    "referer": "https://www.nseindia.com/"
}


async def fetch_json(client: httpx.AsyncClient, url: str, params: dict | None = None) -> dict:
    response = await client.get(url, params=params)
    response.raise_for_status()
    return response.json()


async def scrape(symbol: str) -> dict:
    payload = {"symbol": symbol.upper(), "fetchedAt": datetime.utcnow().isoformat(), "data": {}}
    async with httpx.AsyncClient(timeout=25.0, headers=NSE_HEADERS, follow_redirects=True) as client:
        # Warm-up call to set NSE cookies
        await client.get("https://www.nseindia.com")

        endpoints = {
            "corporate_actions": "https://www.nseindia.com/api/corporates-corporateActions",
            "board_meetings": "https://www.nseindia.com/api/corporates-boardMeetings",
            "insider_trading": "https://www.nseindia.com/api/corporates-pit",
            "bulk_deals": "https://www.nseindia.com/api/historicalOR/bulk",
            "block_deals": "https://www.nseindia.com/api/historicalOR/block",
        }

        for key, url in endpoints.items():
            try:
                params = {"symbol": symbol.upper()} if "corporates" in url else None
                payload["data"][key] = await fetch_json(client, url, params=params)
            except Exception as exc:
                payload["data"][f"{key}_error"] = str(exc)
    return payload


async def main(symbol: str, output: str) -> None:
    data = await scrape(symbol)
    with open(output, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scrape NSE/BSE style market events for Financial Forensics AI.")
    parser.add_argument("--symbol", required=True, help="Ticker symbol")
    parser.add_argument("--output", default="nse_events.json", help="Output json file path")
    args = parser.parse_args()
    asyncio.run(main(args.symbol, args.output))
