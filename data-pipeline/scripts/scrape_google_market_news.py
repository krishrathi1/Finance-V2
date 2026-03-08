import argparse
import asyncio
import json
import re
from datetime import datetime
from email.utils import parsedate_to_datetime
from html import unescape
from pathlib import Path
from urllib.parse import quote_plus
from xml.etree import ElementTree as ET

import httpx


GOOGLE_NEWS_HEADERS = {
    "user-agent": "Mozilla/5.0",
    "accept-language": "en-US,en;q=0.9",
    "accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
    "referer": "https://news.google.com/",
}


def parse_google_news_rss(xml_text: str) -> list[dict]:
    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return []

    rows: list[dict] = []
    seen: set[str] = set()
    for item in root.findall("./channel/item"):
        raw_title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        raw_source = (item.findtext("source") or "").strip()
        raw_date = (item.findtext("pubDate") or "").strip()
        description_html = item.findtext("description") or ""

        if not raw_title or not link:
            continue

        source = raw_source
        title = raw_title
        if not source and " - " in raw_title:
            left, right = raw_title.rsplit(" - ", 1)
            if right.strip():
                title = left.strip()
                source = right.strip()
        if not source:
            source = "Google News"

        image_url = None
        image_match = re.search(r'<img[^>]+src="([^"]+)"', description_html, flags=re.IGNORECASE)
        if image_match:
            image_url = image_match.group(1).strip()

        summary = re.sub(r"<[^>]+>", " ", description_html)
        summary = unescape(summary)
        summary = re.sub(r"\s+", " ", summary).strip()

        published_at = raw_date
        if raw_date:
            try:
                published_at = parsedate_to_datetime(raw_date).isoformat()
            except Exception:
                published_at = raw_date

        unique_key = link.lower()
        if unique_key in seen:
            continue
        seen.add(unique_key)
        rows.append(
            {
                "title": title,
                "source": source,
                "publishedAt": published_at,
                "url": link,
                "summary": summary[:320],
                "imageUrl": image_url,
            }
        )
    return rows


async def fetch_query(client: httpx.AsyncClient, query: str) -> list[dict]:
    encoded_query = quote_plus(f"{query} when:1d")
    url = f"https://news.google.com/rss/search?q={encoded_query}&hl=en-IN&gl=IN&ceid=IN:en"
    response = await client.get(url)
    response.raise_for_status()
    return parse_google_news_rss(response.text)


async def scrape(queries: list[str]) -> dict:
    async with httpx.AsyncClient(timeout=20.0, headers=GOOGLE_NEWS_HEADERS) as client:
        results = await asyncio.gather(*(fetch_query(client, query) for query in queries), return_exceptions=True)

    combined: list[dict] = []
    for result in results:
        if isinstance(result, list):
            combined.extend(result)

    deduped: list[dict] = []
    seen: set[str] = set()
    for row in combined:
        url = str(row.get("url") or "").strip()
        if not url or url.lower() in seen:
            continue
        seen.add(url.lower())
        deduped.append(row)

    return {
        "generatedAt": datetime.utcnow().isoformat(),
        "queries": queries,
        "count": len(deduped),
        "data": deduped[:50],
    }


async def main(output: str, queries: list[str]) -> None:
    payload = await scrape(queries)
    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {output_path} with {payload['count']} articles")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scrape daily Indian market news from Google News RSS.")
    parser.add_argument(
        "--output",
        default="data/google_market_news.json",
        help="Output JSON file path",
    )
    parser.add_argument(
        "--query",
        action="append",
        dest="queries",
        help="Search query (can be repeated). Defaults to market queries if omitted.",
    )
    args = parser.parse_args()
    selected_queries = args.queries or ["Indian stock market", "NSE BSE stocks", "Nifty Sensex market update"]
    asyncio.run(main(output=args.output, queries=selected_queries))
