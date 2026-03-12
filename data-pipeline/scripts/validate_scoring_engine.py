import argparse
import asyncio
from typing import Any

import httpx


DEFAULT_SYMBOLS = [
    "HDFCBANK",
    "RELIANCE",
    "TCS",
    "INFY",
    "ICICIBANK",
    "SBIN",
    "LT",
    "ITC",
    "BHARTIARTL",
    "KOTAKBANK",
    "AXISBANK",
    "BAJFINANCE",
    "MARUTI",
    "SUNPHARMA",
    "ADANIPORTS",
]


async def fetch_dashboard(client: httpx.AsyncClient, base_url: str, symbol: str) -> dict[str, Any] | None:
    url = f"{base_url.rstrip('/')}/api/v1/stocks/{symbol}/dashboard?timeframe=5Y&refresh=true"
    try:
        response = await client.get(url, timeout=90.0)
        response.raise_for_status()
        payload = response.json()
        return payload.get("data", {})
    except Exception:
        return None


def metric_line(row: dict[str, Any]) -> str:
    return (
        f"{row['symbol']:<12} "
        f"score={row['score']:>4.2f} "
        f"score10={row['score10']:>4.2f} "
        f"ml_conf={row['ml_confidence']:>4.2f} "
        f"hit_rate={row['hit_rate']:>5} "
        f"samples={row['samples']:>4}"
    )


async def main(base_url: str, symbols: list[str]) -> None:
    rows: list[dict[str, Any]] = []
    async with httpx.AsyncClient() as client:
        tasks = [fetch_dashboard(client, base_url, symbol) for symbol in symbols]
        dashboards = await asyncio.gather(*tasks)

    for symbol, dashboard in zip(symbols, dashboards):
        if not dashboard:
            continue
        smart = dashboard.get("smartScore", {}) if isinstance(dashboard, dict) else {}
        validation = smart.get("validation", {}) if isinstance(smart, dict) else {}
        hit_rate = validation.get("hitRate")
        rows.append(
            {
                "symbol": symbol,
                "score": float(smart.get("score", 0.0)),
                "score10": float(smart.get("score10", 0.0)),
                "ml_confidence": float(smart.get("mlConfidence", 0.0)),
                "hit_rate": "-" if hit_rate is None else f"{float(hit_rate):.2f}",
                "hit_rate_num": None if hit_rate is None else float(hit_rate),
                "samples": int(validation.get("samples", 0)),
            }
        )

    if not rows:
        print("No rows fetched. Ensure backend is running and symbols are valid.")
        return

    rows.sort(key=lambda item: item["score"], reverse=True)
    print("\nTop Smart Scores")
    for row in rows[:5]:
        print(metric_line(row))

    print("\nBottom Smart Scores")
    for row in rows[-5:]:
        print(metric_line(row))

    weighted_samples = sum(row["samples"] for row in rows if row["hit_rate_num"] is not None)
    weighted_hit_numerator = sum(
        row["hit_rate_num"] * row["samples"] for row in rows if row["hit_rate_num"] is not None
    )
    weighted_hit_rate = (weighted_hit_numerator / weighted_samples) if weighted_samples else None

    avg_score = sum(row["score"] for row in rows) / len(rows)
    avg_conf = sum(row["ml_confidence"] for row in rows) / len(rows)
    print("\nValidation Summary")
    print(f"symbols={len(rows)} avg_score={avg_score:.2f} avg_ml_confidence={avg_conf:.2f}")
    if weighted_hit_rate is None:
        print("walk_forward_hit_rate=NA (insufficient history in sample set)")
    else:
        print(f"walk_forward_hit_rate={weighted_hit_rate:.3f} (weighted by sample count)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate smart-score model quality across multiple symbols.")
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8000",
        help="Backend base URL. Example: http://127.0.0.1:8000",
    )
    parser.add_argument(
        "--symbols",
        default=",".join(DEFAULT_SYMBOLS),
        help="Comma-separated symbol list",
    )
    args = parser.parse_args()
    symbols = [item.strip().upper() for item in args.symbols.split(",") if item.strip()]
    asyncio.run(main(args.base_url, symbols))
