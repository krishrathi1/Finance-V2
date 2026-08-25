import argparse
import asyncio
import json
import os
from datetime import date

import httpx
from dotenv import load_dotenv


load_dotenv()


async def fetch_json(client: httpx.AsyncClient, url: str, params: dict | None = None, headers: dict | None = None) -> dict:
    response = await client.get(url, params=params, headers=headers)
    response.raise_for_status()
    return response.json()


async def run(symbol: str, output: str) -> None:
    polygon_key = os.getenv("POLYGON_API_KEY", "")
    fmp_key = os.getenv("FMP_API_KEY", "")
    news_key = os.getenv("NEWS_API_KEY", "")
    groww_mode = os.getenv("GROWW_AUTH_MODE", "access_token").strip().lower()
    groww_access_token = os.getenv("GROWW_ACCESS_TOKEN", "").strip()
    groww_api_key = os.getenv("GROWW_API_KEY", "").strip()
    groww_api_secret = os.getenv("GROWW_API_SECRET", "").strip()
    groww_totp_token = os.getenv("GROWW_TOTP_TOKEN", "").strip()
    groww_totp_secret = os.getenv("GROWW_TOTP_SECRET", "").strip()

    result = {"symbol": symbol.upper(), "generatedAt": date.today().isoformat(), "sources": {}}
    async with httpx.AsyncClient(timeout=20.0) as client:
        if polygon_key:
            try:
                result["sources"]["polygon"] = await fetch_json(
                    client,
                    f"https://api.polygon.io/v2/aggs/ticker/{symbol.upper()}/prev",
                    params={"adjusted": "true", "apiKey": polygon_key},
                )
            except Exception as exc:
                result["sources"]["polygon_error"] = str(exc)

        if fmp_key:
            try:
                result["sources"]["fmp_profile"] = await fetch_json(
                    client,
                    "https://financialmodelingprep.com/stable/profile",
                    params={"symbol": symbol.upper(), "apikey": fmp_key},
                )
            except Exception as exc:
                result["sources"]["fmp_error"] = str(exc)

        if news_key:
            try:
                result["sources"]["newsapi"] = await fetch_json(
                    client,
                    "https://newsapi.org/v2/everything",
                    params={"q": f"{symbol} India stock", "pageSize": 5, "apiKey": news_key},
                )
            except Exception as exc:
                result["sources"]["news_error"] = str(exc)

        try:
            groww_payload = await asyncio.to_thread(
                fetch_groww_with_sdk,
                symbol.upper(),
                groww_mode,
                groww_access_token,
                groww_api_key,
                groww_api_secret,
                groww_totp_token,
                groww_totp_secret,
            )
            if groww_payload:
                result["sources"]["groww"] = groww_payload
        except Exception as exc:
            result["sources"]["groww_error"] = str(exc)

    with open(output, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    print(f"Wrote {output}")


def fetch_groww_with_sdk(
    symbol: str,
    mode: str,
    access_token: str,
    api_key: str,
    api_secret: str,
    totp_token: str,
    totp_secret: str,
) -> dict:
    try:
        from growwapi import GrowwAPI  # type: ignore
    except Exception:
        return {}

    token = access_token
    if not token and mode in {"api_secret", "api_key_secret"} and api_key and api_secret:
        try:
            token = GrowwAPI.get_access_token(api_key=api_key, secret=api_secret)
        except Exception:
            token = ""
    if not token and mode == "totp" and totp_token and totp_secret:
        try:
            import pyotp  # type: ignore

            totp = pyotp.TOTP(totp_secret).now()
            token = GrowwAPI.get_access_token(api_key=totp_token, totp=totp)
        except Exception:
            token = ""

    if not token:
        return {}

    try:
        groww = GrowwAPI(token)
    except Exception:
        return {}

    data: dict = {}
    for candidate in ("get_company_profile", "get_stock_profile", "get_fundamentals"):
        fn = getattr(groww, candidate, None)
        if fn is None:
            continue
        try:
            data["profile"] = fn(symbol=symbol)
            break
        except TypeError:
            try:
                data["profile"] = fn(symbol)
                break
            except Exception:
                continue
        except Exception:
            continue
    for candidate in ("get_shareholding_pattern", "get_shareholding", "get_share_holding_pattern"):
        fn = getattr(groww, candidate, None)
        if fn is None:
            continue
        try:
            data["shareholding"] = fn(symbol=symbol)
            break
        except TypeError:
            try:
                data["shareholding"] = fn(symbol)
                break
            except Exception:
                continue
        except Exception:
            continue

    return data


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch market data snapshots for Financial Forensics AI.")
    parser.add_argument("--symbol", required=True, help="Stock symbol, e.g. HDFCBANK")
    parser.add_argument("--output", default="market_snapshot.json", help="Output JSON path")
    args = parser.parse_args()
    asyncio.run(run(symbol=args.symbol, output=args.output))
