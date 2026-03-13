import asyncio
from email.utils import parsedate_to_datetime
from html import unescape
from io import StringIO
import json
import math
import re
import time
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import quote_plus, urlparse
from xml.etree import ElementTree as ET

import httpx
import pandas as pd
import requests
from bs4 import BeautifulSoup
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import get_settings


settings = get_settings()
NSE_HEADERS = {
    "user-agent": "Mozilla/5.0",
    "accept-language": "en-US,en;q=0.9",
    "accept": "application/json",
    "referer": "https://www.nseindia.com/",
}
GOOGLE_NEWS_HEADERS = {
    "user-agent": "Mozilla/5.0",
    "accept-language": "en-US,en;q=0.9",
    "accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
    "referer": "https://news.google.com/",
}
WEB_PAGE_HEADERS = {
    "user-agent": "Mozilla/5.0",
    "accept-language": "en-US,en;q=0.9",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


class MarketDataProviders:
    def __init__(self) -> None:
        self._timeout = httpx.Timeout(5.0, connect=2.0)
        self._groww_client: Any | None = None
        self._last_nse_quotes: dict[str, dict[str, Any]] = {}
        self._nse_xbrl_cache: dict[str, dict[str, float] | None] = {}
        self._nse_session: requests.Session | None = None
        self._trendlyne_symbol_url_map: dict[str, str] = {}
        self._trendlyne_map_loaded_at: float = 0.0
        self._trendlyne_reports_cache: dict[str, tuple[float, dict[str, Any] | None]] = {}
        self._trendlyne_equity_meta_map: dict[str, tuple[str, str]] = {}
        self._trendlyne_equity_map_loaded_at: float = 0.0
        self._trendlyne_bulk_block_cache: dict[str, tuple[float, dict[str, list[dict[str, Any]]] | None]] = {}
        self._trendlyne_financials_cache: dict[str, tuple[float, dict[str, Any] | None]] = {}
        self._trendlyne_shareholding_cache: dict[str, tuple[float, dict[str, Any] | None]] = {}
        self._trendlyne_documents_cache: dict[str, tuple[float, dict[str, Any] | None]] = {}

    async def search_indian_stocks(self, query: str, limit: int = 25) -> list[dict[str, str]]:
        return await asyncio.to_thread(self._search_indian_stocks_sync, query, limit)

    @retry(stop=stop_after_attempt(1), wait=wait_exponential(multiplier=0.2, min=0.2, max=1.0))
    async def _get(self, url: str, params: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> Any:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            return response.json()

    async def get_groww_candles(self, symbol: str) -> list[dict] | None:
        symbol_raw = symbol.replace(".NS", "").replace(".BO", "").upper()
        url = f"https://groww.in/v1/api/charting_service/v2/chart/exchange/NSE/segment/CASH/{symbol_raw}?intervalInMinutes=1440&minimal=true"
        
        try:
            payload = await self._get(url)
            if not payload or not isinstance(payload, dict):
                return None
                
            candles = payload.get("candles", [])
            if not candles:
                return None
                
            formatted = []
            for c in candles:
                if len(c) >= 5:
                    ts = float(c[0])
                    if ts > 1_000_000_000_000:
                        ts = ts / 1000
                    dt = datetime.fromtimestamp(ts)
                    formatted.append({
                        "date": dt.strftime("%Y-%m-%d"),
                        "open": float(c[1]),
                        "high": float(c[2]),
                        "low":  float(c[3]),
                        "close": float(c[4]),
                        "volume": float(c[5]) if len(c) > 5 else 0.0
                    })
            return sorted(formatted, key=lambda row: row["date"])
        except Exception:
            return None

    async def get_fmp_candles(self, symbol: str, timeframe: str = "1Y") -> list[dict] | None:
        # FMP uses SYMBOL.NS for NSE stocks
        fmp_symbol = symbol.upper()
        if not fmp_symbol.endswith(".NS") and not fmp_symbol.endswith(".BO"):
            fmp_symbol = f"{fmp_symbol}.NS"
            
        url = "https://financialmodelingprep.com/stable/historical-price-eod/full"
        try:
            payload = await self._get(url, params={"symbol": fmp_symbol, "apikey": settings.fmp_api_key})
            if not payload or not isinstance(payload, list):
                return None
            
            # Filter by timeframe
            days = 365
            if timeframe == "1M": days = 30
            elif timeframe == "1W": days = 7
            elif timeframe == "5Y": days = 1825
            
            cutoff = datetime.now() - timedelta(days=days)
            formatted = []
            for r in payload:
                dt = datetime.strptime(r["date"], "%Y-%m-%d")
                if dt < cutoff:
                    continue
                formatted.append({
                    "date": r["date"],
                    "open": float(r["open"]),
                    "high": float(r["high"]),
                    "low": float(r["low"]),
                    "close": float(r["close"]),
                    "volume": float(r.get("volume", 0)),
                })
            # FMP returns descending, we need ascending for charts
            return sorted(formatted, key=lambda x: x["date"])
        except Exception:
            return None

    async def get_fmp_quote(self, symbol: str) -> dict[str, Any] | None:
        fmp_symbol = symbol.upper()
        if not fmp_symbol.endswith(".NS") and not fmp_symbol.endswith(".BO"):
            fmp_symbol = f"{fmp_symbol}.NS"
            
        url = "https://financialmodelingprep.com/stable/quote"
        try:
            payload = await self._get(url, params={"symbol": fmp_symbol, "apikey": settings.fmp_api_key})
            if not payload or not isinstance(payload, list):
                return None
            
            quote = payload[0]
            return {
                "cmp": float(quote.get("price") or 0.0),
                "change": float(quote.get("change") or 0.0),
                "changePercent": float(quote.get("changePercentage") or 0.0),
                "high": float(quote.get("dayHigh") or 0.0),
                "low": float(quote.get("dayLow") or 0.0),
                "volume": float(quote.get("volume") or 0.0),
                "name": quote.get("name"),
            }
        except Exception:
            return None

    async def get_fmp_quarterly_results(self, symbol: str) -> list[dict[str, Any]] | None:
        fmp_symbol = symbol.upper()
        if not fmp_symbol.endswith(".NS") and not fmp_symbol.endswith(".BO"):
            fmp_symbol = f"{fmp_symbol}.NS"

        url = "https://financialmodelingprep.com/stable/income-statement"
        try:
            params = {"symbol": fmp_symbol, "period": "quarter", "limit": 12, "apikey": settings.fmp_api_key}
            payload = await self._get(url, params=params)
            if not payload or not isinstance(payload, list):
                return None

            results = []
            for item in payload:
                # Map FMP fields to TradeBrains-style UI fields
                date_str = item.get("date", "")
                period_text = date_str
                try:
                    period_text = datetime.strptime(date_str, "%Y-%m-%d").strftime("%b %y")
                except Exception:
                    pass

                revenue = float(item.get("revenue") or 0.0)
                net_profit = float(item.get("netIncome") or 0.0)
                pbt = float(item.get("incomeBeforeTax") or 0.0)
                tax = float(item.get("incomeTaxExpense") or 0.0)
                expenses = float(item.get("operatingExpenses") or 0.0)
                op_income = float(item.get("operatingIncome") or 0.0)
                
                # Bank specific logic (FMP might have these if it's a bank)
                interest_earned = float(item.get("interestIncome") or 0.0)
                interest_expended = float(item.get("interestExpense") or 0.0)
                net_interest_income = float(item.get("netInterestIncome") or 0.0)
                
                # If it's a bank and netInterestIncome is 0 but we have earned/expended
                if net_interest_income == 0 and interest_earned > 0:
                    net_interest_income = interest_earned - interest_expended

                results.append({
                    "period": period_text,
                    "date": date_str,
                    "totalRevenue": round(revenue / 10_000_000, 2) if revenue else 0.0,
                    "netProfit": round(net_profit / 10_000_000, 2) if net_profit else 0.0,
                    "profitBeforeTax": round(pbt / 10_000_000, 2) if pbt else 0.0,
                    "tax": round(tax / 10_000_000, 2) if tax else 0.0,
                    "expenses": round(expenses / 10_000_000, 2) if expenses else 0.0,
                    "operatingProfit": round(op_income / 10_000_000, 2) if op_income else 0.0,
                    "basicEps": float(item.get("eps") or 0.0),
                    "dilutedEps": float(item.get("epsdiluted") or 0.0),
                    "interestEarned": round(interest_earned / 10_000_000, 2) if interest_earned else 0.0,
                    "interestExpended": round(interest_expended / 10_000_000, 2) if interest_expended else 0.0,
                    "netInterestIncome": round(net_interest_income / 10_000_000, 2) if net_interest_income else 0.0,
                    "opmPct": round((op_income / revenue * 100), 2) if op_income and revenue else 0.0,
                    "taxPct": round((tax / pbt * 100), 2) if tax and pbt else 0.0,
                    "netProfitMarginPct": round((net_profit / revenue * 100), 2) if net_profit and revenue else 0.0,
                })

            # Sort by date ascending
            sorted_results = sorted(results, key=lambda x: x["date"])
            
            # Return only the most recent 8 quarters to ensure the view stays fresh (2025/2026 focus)
            return sorted_results[-8:]
        except Exception:
            return None

    async def get_news(self, query: str) -> list[dict] | None:
        if not settings.news_api_key:
            return None
        try:
            payload = await self._get(
                "https://newsapi.org/v2/everything",
                params={"q": query, "sortBy": "publishedAt", "language": "en", "pageSize": 10, "apiKey": settings.news_api_key},
            )
            return payload.get("articles")
        except Exception:
            return None

    async def get_trendlyne_brokerage(self, symbol: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._get_trendlyne_brokerage_sync, symbol)

    def _get_trendlyne_brokerage_sync(self, symbol: str) -> dict[str, Any] | None:
        key = symbol.replace(".NS", "").replace(".BO", "").strip().upper()
        if not key:
            return None

        now = time.time()
        cached = self._trendlyne_reports_cache.get(key)
        if cached and now - cached[0] < 900:
            return cached[1]

        source_url = self._resolve_trendlyne_stock_report_url(key)
        if not source_url:
            self._trendlyne_reports_cache[key] = (now, None)
            return None

        try:
            response = requests.get(
                source_url,
                headers={**WEB_PAGE_HEADERS, "referer": "https://trendlyne.com/"},
                timeout=10,
            )
            response.raise_for_status()
            payload = self._parse_trendlyne_brokerage_payload(source_url, response.text)
            self._trendlyne_reports_cache[key] = (now, payload)
            return payload
        except Exception:
            # Fall back to stale cached value when page fetch fails.
            return cached[1] if cached else None

    def _resolve_trendlyne_stock_report_url(self, symbol: str) -> str | None:
        self._refresh_trendlyne_symbol_map_if_needed()
        if not self._trendlyne_symbol_url_map:
            return None

        exact = self._trendlyne_symbol_url_map.get(symbol)
        if exact:
            return exact

        normalized = re.sub(r"[^A-Z0-9]", "", symbol)
        if not normalized:
            return None
        for key, value in self._trendlyne_symbol_url_map.items():
            if re.sub(r"[^A-Z0-9]", "", key) == normalized:
                return value
        return None

    def _refresh_trendlyne_symbol_map_if_needed(self) -> None:
        now = time.time()
        if self._trendlyne_symbol_url_map and now - self._trendlyne_map_loaded_at < 6 * 60 * 60:
            return

        built: dict[str, str] = {}
        try:
            stock_reports_xml = requests.get(
                "https://trendlyne.com/equity-sitemap-stockreports.xml",
                headers=WEB_PAGE_HEADERS,
                timeout=15,
            ).text
            for loc in re.findall(r"<loc>(.*?)</loc>", stock_reports_xml):
                match = re.search(r"/research-reports/stock/\d+/([^/]+)/", loc)
                if not match:
                    continue
                symbol = str(match.group(1)).strip().upper()
                if not symbol:
                    continue
                built[symbol] = loc.strip()
        except Exception:
            pass

        # This sitemap is keyed by symbol and id, so it improves lookup reliability.
        try:
            posts_xml = requests.get(
                "https://trendlyne.com/equity-sitemap-stock-research-reports-posts.xml",
                headers=WEB_PAGE_HEADERS,
                timeout=15,
            ).text
            for loc in re.findall(r"<loc>(.*?)</loc>", posts_xml):
                match = re.search(r"/research-reports/post/([^/]+)/(\d+)/([^/]+)/", loc)
                if not match:
                    continue
                symbol = str(match.group(1)).strip().upper()
                stock_id = str(match.group(2)).strip()
                slug = str(match.group(3)).strip()
                if not symbol or not stock_id or not slug:
                    continue
                built[symbol] = f"https://trendlyne.com/research-reports/stock/{stock_id}/{symbol}/{slug}/"
        except Exception:
            pass

        if built:
            self._trendlyne_symbol_url_map = built
            self._trendlyne_map_loaded_at = now

    def _parse_trendlyne_brokerage_payload(self, source_url: str, html: str) -> dict[str, Any]:
        reports: list[dict[str, Any]] = []
        seen: set[str] = set()

        for script in re.findall(
            r"<script[^>]+type\s*=\s*[\"']application/ld\+json[\"'][^>]*>(.*?)</script>",
            html,
            flags=re.IGNORECASE | re.DOTALL,
        ):
            payload_raw = unescape((script or "").strip())
            if not payload_raw:
                continue
            try:
                payload = json.loads(payload_raw)
            except Exception:
                continue

            items = payload if isinstance(payload, list) else [payload]
            for item in items:
                if not isinstance(item, dict):
                    continue
                if str(item.get("@type") or "").strip().lower() != "review":
                    continue

                author = item.get("author") if isinstance(item.get("author"), dict) else {}
                rating = item.get("reviewRating") if isinstance(item.get("reviewRating"), dict) else {}
                headline = " ".join(str(item.get("name") or "").split())
                summary = " ".join(str(item.get("description") or "").split())
                link = str(item.get("url") or "").strip()
                date_value = self._parse_trendlyne_review_date(str(item.get("datePublished") or ""))
                action = self._extract_trendlyne_reco_action(headline, summary)
                key = link or f"{author.get('name')}|{date_value}|{headline}"
                if key in seen:
                    continue
                seen.add(key)

                reports.append(
                    {
                        "broker": str(author.get("name") or "Broker").strip() or "Broker",
                        "action": action,
                        "targetPrice": self._extract_trendlyne_target_price(summary),
                        "rating": self._to_float(rating.get("ratingValue")),
                        "date": date_value,
                        "headline": headline[:220],
                        "summary": summary[:360],
                        "url": link,
                    }
                )

        reports.sort(key=lambda row: row.get("date") or "", reverse=True)
        reports = reports[:20]

        now = datetime.utcnow()
        summary = {"1D": 0, "1W": 0, "1M": 0, "buy": 0, "hold": 0, "sell": 0, "total": len(reports)}
        for row in reports:
            action = str(row.get("action") or "").strip().lower()
            if action == "buy":
                summary["buy"] += 1
            elif action == "sell":
                summary["sell"] += 1
            elif action == "hold":
                summary["hold"] += 1

            row_date_raw = str(row.get("date") or "").strip()
            try:
                row_date = datetime.strptime(row_date_raw[:10], "%Y-%m-%d")
            except Exception:
                continue
            age_days = (now - row_date).days
            if age_days <= 1:
                summary["1D"] += 1
            if age_days <= 7:
                summary["1W"] += 1
            if age_days <= 30:
                summary["1M"] += 1

        return {
            "source": "Trendlyne",
            "sourceUrl": source_url,
            "updatedAt": datetime.utcnow().isoformat(),
            "summary": summary,
            "reports": reports,
        }

    def _parse_trendlyne_review_date(self, raw_date: str) -> str:
        value = " ".join((raw_date or "").split())
        if not value:
            return ""
        value = value.replace("Sept.", "Sep.")
        value = value.replace("a.m.", "AM").replace("p.m.", "PM")
        value = re.sub(r"(?<=\b[A-Za-z]{3})\.", "", value)
        value = re.sub(r",\s*midnight\b", ", 00:00", value, flags=re.IGNORECASE)
        value = re.sub(r",\s*noon\b", ", 12:00", value, flags=re.IGNORECASE)

        for fmt in (
            "%b %d, %Y, %H:%M",
            "%b %d, %Y, %I:%M %p",
            "%b %d, %Y",
            "%Y-%m-%d",
            "%d-%m-%Y",
        ):
            try:
                return datetime.strptime(value, fmt).date().isoformat()
            except Exception:
                continue
        try:
            return parsedate_to_datetime(value).date().isoformat()
        except Exception:
            return value[:10]

    def _extract_trendlyne_target_price(self, text: str) -> float | None:
        value = " ".join((text or "").split())
        if not value:
            return None
        patterns = [
            r"target(?:\s+price)?[^0-9]{0,20}([0-9][0-9,]*(?:\.\d+)?)",
            r"\bto\s+([0-9][0-9,]*(?:\.\d+)?)\b",
        ]
        for pattern in patterns:
            match = re.search(pattern, value, flags=re.IGNORECASE)
            if not match:
                continue
            return self._to_float(match.group(1))
        return None

    def _extract_trendlyne_reco_action(self, headline: str, summary: str) -> str:
        text = f"{headline} {summary}".lower()
        if re.search(r"\b(sell|reduce|underperform|underweight)\b", text):
            return "sell"
        if re.search(r"\b(hold|neutral)\b", text):
            return "hold"
        if re.search(r"\b(buy|accumulate|add|outperform|overweight)\b", text):
            return "buy"
        return "hold"

    def _refresh_trendlyne_equity_map_if_needed(self) -> None:
        now = time.time()
        if self._trendlyne_equity_meta_map and now - self._trendlyne_equity_map_loaded_at < 6 * 60 * 60:
            return

        built: dict[str, tuple[str, str]] = {}
        try:
            xml_text = requests.get(
                "https://trendlyne.com/equity-sitemap-stocks.xml",
                headers=WEB_PAGE_HEADERS,
                timeout=20,
            ).text
            for loc in re.findall(r"<loc>(.*?)</loc>", xml_text):
                match = re.search(r"/equity/(\d+)/([^/]+)/([^/]+)/", loc)
                if not match:
                    continue
                stock_id = str(match.group(1)).strip()
                symbol = str(match.group(2)).strip().upper()
                slug = str(match.group(3)).strip()
                if not stock_id or not symbol or not slug:
                    continue
                built[symbol] = (stock_id, slug)
        except Exception:
            pass

        # Fallback from the already-known research report map.
        if self._trendlyne_symbol_url_map:
            for symbol, url in self._trendlyne_symbol_url_map.items():
                match = re.search(r"/research-reports/stock/(\d+)/([^/]+)/([^/]+)/", url)
                if not match:
                    continue
                stock_id = str(match.group(1)).strip()
                slug = str(match.group(3)).strip()
                if symbol and stock_id and slug and symbol not in built:
                    built[symbol] = (stock_id, slug)

        if built:
            self._trendlyne_equity_meta_map = built
            self._trendlyne_equity_map_loaded_at = now

    def _resolve_trendlyne_equity_meta(self, symbol: str) -> tuple[str, str] | None:
        self._refresh_trendlyne_equity_map_if_needed()
        if not self._trendlyne_equity_meta_map:
            return None

        key = symbol.replace(".NS", "").replace(".BO", "").strip().upper()
        exact = self._trendlyne_equity_meta_map.get(key)
        if exact:
            return exact

        normalized = re.sub(r"[^A-Z0-9]", "", key)
        if not normalized:
            return None
        for raw, meta in self._trendlyne_equity_meta_map.items():
            if re.sub(r"[^A-Z0-9]", "", raw) == normalized:
                return meta
        return None

    def _search_indian_stocks_sync(self, query: str, limit: int = 25) -> list[dict[str, str]]:
        q = str(query or "").strip().lower()
        if not q:
            return []

        self._refresh_trendlyne_equity_map_if_needed()
        rows: list[dict[str, str]] = []
        seen: set[str] = set()

        for symbol, meta in self._trendlyne_equity_meta_map.items():
            stock_symbol = str(symbol or "").strip().upper()
            if not stock_symbol or stock_symbol in seen:
                continue
            slug = str(meta[1] if isinstance(meta, tuple) and len(meta) > 1 else "").strip()
            company_name = self._trendlyne_name_from_slug(slug, stock_symbol)
            rows.append({"symbol": stock_symbol, "name": company_name, "exchange": "NSE/BSE"})
            seen.add(stock_symbol)

        def score(item: dict[str, str]) -> tuple[int, int, str]:
            symbol = item["symbol"].lower()
            name = item["name"].lower()
            if symbol == q:
                rank = 0
            elif symbol.startswith(q):
                rank = 1
            elif q in symbol:
                rank = 2
            elif name.startswith(q):
                rank = 3
            elif q in name:
                rank = 4
            else:
                rank = 9
            return (rank, len(symbol), item["symbol"])

        matches = [item for item in rows if q in item["symbol"].lower() or q in item["name"].lower()]
        matches.sort(key=score)
        return matches[: max(1, int(limit or 25))]

    def _trendlyne_name_from_slug(self, slug: str, symbol: str) -> str:
        cleaned = str(slug or "").strip().strip("/")
        if not cleaned:
            return symbol

        words: list[str] = []
        for part in cleaned.split("-"):
            token = part.strip()
            if not token:
                continue
            if token in {"ltd", "limited", "inc", "plc", "bank", "india"}:
                words.append(token.upper() if token == "ltd" else token.title())
                continue
            if token.isupper() and len(token) <= 5:
                words.append(token)
            else:
                words.append(token.title())
        name = " ".join(words).strip()
        return name or symbol

    def _parse_trendlyne_bulk_block_deals(self, html: str, symbol: str) -> dict[str, list[dict[str, Any]]]:
        result: dict[str, list[dict[str, Any]]] = {"bulkDeals": [], "blockDeals": []}
        table_match = re.search(r"<table[^>]*>(.*?)</table>", html, flags=re.IGNORECASE | re.DOTALL)
        if not table_match:
            return result

        seen: set[str] = set()
        for row_html in re.findall(r"<tr[^>]*>(.*?)</tr>", table_match.group(1), flags=re.IGNORECASE | re.DOTALL):
            cols = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row_html, flags=re.IGNORECASE | re.DOTALL)
            if len(cols) < 8:
                continue

            cleaned: list[str] = []
            for cell in cols[:8]:
                text = unescape(re.sub(r"<[^>]+>", " ", cell))
                text = " ".join(text.split())
                cleaned.append(text)

            client, deal_type, action_raw, date_raw, avg_price_raw, quantity_raw, _intraday, exchange_raw = cleaned
            action = action_raw.strip().lower()
            order_type = "Buy" if action.startswith(("pur", "buy")) else "Sell" if action.startswith(("sell", "sal")) else (action_raw or "Deal")
            deal_type_norm = (deal_type or "").strip().lower()
            bucket = "bulkDeals" if "bulk" in deal_type_norm else "blockDeals"
            exchange = (exchange_raw or "NSE").strip().upper() or "NSE"

            date_value = date_raw
            for fmt in ("%d %b %Y", "%d %B %Y", "%d-%b-%Y", "%Y-%m-%d"):
                try:
                    date_value = datetime.strptime(date_raw, fmt).date().isoformat()
                    break
                except Exception:
                    continue

            price_num = self._to_float(avg_price_raw)
            row = {
                "date": date_value,
                "client": client or symbol,
                "orderType": order_type,
                "quantity": quantity_raw or "-",
                "price": round(price_num, 2) if price_num is not None else (avg_price_raw or "-"),
                "exchange": exchange,
            }
            row_key = f"{row['date']}|{row['client']}|{row['orderType']}|{row['quantity']}|{row['price']}|{row['exchange']}"
            if row_key in seen:
                continue
            seen.add(row_key)
            result[bucket].append(row)

        def parse_sort_date(value: str) -> datetime:
            for fmt in ("%Y-%m-%d", "%d %b %Y", "%d-%b-%Y", "%d-%m-%Y"):
                try:
                    return datetime.strptime(value, fmt)
                except Exception:
                    continue
            return datetime.min

        result["bulkDeals"].sort(key=lambda row: parse_sort_date(str(row.get("date") or "")), reverse=True)
        result["blockDeals"].sort(key=lambda row: parse_sort_date(str(row.get("date") or "")), reverse=True)
        return result

    def _get_trendlyne_bulk_block_deals_sync(self, symbol: str) -> dict[str, list[dict[str, Any]]] | None:
        key = symbol.replace(".NS", "").replace(".BO", "").strip().upper()
        if not key:
            return None

        now = time.time()
        cached = self._trendlyne_bulk_block_cache.get(key)
        if cached and now - cached[0] < 900:
            return cached[1]

        meta = self._resolve_trendlyne_equity_meta(key)
        if not meta:
            self._trendlyne_bulk_block_cache[key] = (now, None)
            return None
        stock_id, slug = meta
        url = f"https://trendlyne.com/equity/bulk-block-deals/{key}/{stock_id}/{slug}/"

        try:
            response = requests.get(
                url,
                headers={**WEB_PAGE_HEADERS, "referer": "https://trendlyne.com/"},
                timeout=12,
                allow_redirects=True,
            )
            response.raise_for_status()
            parsed = self._parse_trendlyne_bulk_block_deals(response.text, key)
            self._trendlyne_bulk_block_cache[key] = (now, parsed)
            return parsed
        except Exception:
            return cached[1] if cached else None

    async def get_trendlyne_financials(self, symbol: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._get_trendlyne_financials_sync, symbol)

    async def get_trendlyne_shareholding(self, symbol: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._get_trendlyne_shareholding_sync, symbol)

    async def get_trendlyne_documents(self, symbol: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._get_trendlyne_documents_sync, symbol)

    def _get_trendlyne_shareholding_sync(self, symbol: str) -> dict[str, Any] | None:
        key = symbol.replace(".NS", "").replace(".BO", "").strip().upper()
        if not key:
            return None

        now = time.time()
        cached = self._trendlyne_shareholding_cache.get(key)
        if cached and now - cached[0] < 900:
            return cached[1]

        meta = self._resolve_trendlyne_equity_meta(key)
        if not meta:
            self._trendlyne_shareholding_cache[key] = (now, None)
            return None

        stock_id, slug = meta
        page_url = f"https://trendlyne.com/equity/share-holding/{stock_id}/{key}/{slug}/"
        try:
            response = requests.get(
                page_url,
                headers={**WEB_PAGE_HEADERS, "referer": "https://trendlyne.com/"},
                timeout=12,
            )
            response.raise_for_status()
            parsed = self._parse_trendlyne_shareholding_page(response.text)
            if parsed is not None:
                parsed["sourceUrl"] = page_url
            self._trendlyne_shareholding_cache[key] = (now, parsed)
            return parsed
        except Exception:
            return cached[1] if cached else None

    def _parse_trendlyne_shareholding_page(self, html: str) -> dict[str, Any] | None:
        try:
            tables = pd.read_html(StringIO(html))
        except Exception:
            return None

        if not tables:
            return None

        summary_table = None
        for table in tables:
            columns = [str(col).strip() for col in getattr(table, "columns", [])]
            if columns and columns[0].lower() == "summary":
                summary_table = table
                break

        if summary_table is None or summary_table.empty:
            return None

        columns = [str(col).strip() for col in summary_table.columns]
        if len(columns) < 2:
            return None
        summary_table.columns = columns

        metric_aliases = {
            "promoters": [
                ("promoter and promoter group", 100),
                ("promoter & promoter group", 100),
                ("promoters", 90),
                ("promoter", 80),
                ("promoter group", 30),
            ],
            "fii": [
                ("fii/fpi", 100),
                ("fii + fpi", 95),
                ("foreign institutional investors", 95),
                ("foreign portfolio investors", 90),
                ("foreign institutions", 80),
                ("fii", 70),
            ],
            "dii": [
                ("domestic institutional investors", 95),
                ("domestic institutions", 85),
                ("mutual funds", 75),
                ("insurance companies", 70),
                ("banks / financial institutions", 65),
                ("banks and financial institutions", 65),
                ("dii", 60),
            ],
            "public": [
                ("public shareholding", 100),
                ("public holding", 95),
                ("public shareholders", 90),
                ("public & others", 85),
                ("public and others", 85),
                ("retail and others", 80),
                ("retail investors", 75),
                ("non institutions", 70),
                ("non-institutions", 70),
                ("non institutional investors", 70),
                ("other investors", 60),
                ("public", 50),
            ],
        }

        def normalize_label(value: Any) -> str:
            normalized = str(value or "").lower().replace("&", " & ").replace("/", " / ")
            normalized = normalized.replace("-", " ").replace("_", " ")
            return " ".join(normalized.split())

        def resolve_metric(label: str) -> tuple[str | None, int]:
            normalized = normalize_label(label)
            best_target: str | None = None
            best_score = -1
            wrapped = f" {normalized} "
            for target, aliases in metric_aliases.items():
                for alias, score in aliases:
                    alias_normalized = normalize_label(alias)
                    if normalized == alias_normalized:
                        candidate_score = score + 1000
                    elif normalized.startswith(f"{alias_normalized} "):
                        candidate_score = score + 200
                    elif len(alias_normalized) >= 8 and f" {alias_normalized} " in wrapped:
                        candidate_score = score
                    else:
                        continue
                    if candidate_score > best_score:
                        best_target = target
                        best_score = candidate_score
            return best_target, best_score

        def parse_pct(value: Any) -> float:
            text = str(value or "").replace("%", "").replace(",", "").strip()
            numeric = self._to_float(text)
            return round(numeric or 0.0, 2)

        quarter_columns = columns[1:]
        history: list[dict[str, Any]] = []
        for quarter in quarter_columns:
            entry = {"quarter": quarter, "promoters": 0.0, "fii": 0.0, "dii": 0.0, "public": 0.0}
            seen_metrics: set[str] = set()
            match_scores: dict[str, int] = {}
            for _, row in summary_table.iterrows():
                label = str(row.iloc[0] or "").strip()
                mapped, score = resolve_metric(label)
                if not mapped:
                    continue
                value = parse_pct(row.get(quarter))
                current_score = match_scores.get(mapped, -1)
                if score > current_score or (score == current_score and value > entry[mapped]):
                    entry[mapped] = value
                    match_scores[mapped] = score
                seen_metrics.add(mapped)

            known_total = round(entry["promoters"] + entry["fii"] + entry["dii"] + entry["public"], 2)
            if "public" not in seen_metrics and 0 < known_total < 100:
                entry["public"] = round(max(0.0, 100.0 - (entry["promoters"] + entry["fii"] + entry["dii"])), 2)
            if "promoters" not in seen_metrics:
                other_total = round(entry["fii"] + entry["dii"] + entry["public"], 2)
                if 0 < other_total < 100:
                    entry["promoters"] = round(max(0.0, 100.0 - other_total), 2)

            recomputed_total = entry["promoters"] + entry["fii"] + entry["dii"] + entry["public"]
            if recomputed_total > 100.5 and entry["public"] > 0:
                overflow = recomputed_total - 100.0
                entry["public"] = round(max(0.0, entry["public"] - overflow), 2)
            history.append(entry)

        if not history:
            return None

        def parse_quarter_label(raw: str) -> datetime | None:
            text = str(raw or "").strip()
            for fmt in ("%b %Y", "%b %y", "%B %Y"):
                try:
                    return datetime.strptime(text, fmt)
                except Exception:
                    continue
            return None

        history.sort(
            key=lambda item: parse_quarter_label(str(item.get("quarter") or "")) or datetime.min,
            reverse=True,
        )

        top_holders: list[dict[str, Any]] = []
        if len(tables) >= 3:
            holders_table = tables[2].copy()
            flattened = []
            for col in holders_table.columns:
                if isinstance(col, tuple):
                    flattened.append(" ".join(str(part).strip() for part in col if str(part).strip()))
                else:
                    flattened.append(str(col).strip())
            holders_table.columns = flattened

            name_col = next((col for col in holders_table.columns if col.lower().startswith("name")), None)
            holding_col = next((col for col in holders_table.columns if "%" in col.lower()), None)
            if name_col and holding_col:
                skip_names = {
                    "mutual funds",
                    "foreign portfolio investors category i",
                    "foreign portfolio investors category ii",
                    "insurance companies",
                    "banks",
                    "trusts",
                    "fii",
                    "foreign banks",
                    "other financial institutions",
                    "other foreign institutions",
                }
                collected_holders: list[dict[str, Any]] = []
                for _, row in holders_table.iterrows():
                    name = " ".join(str(row.get(name_col) or "").split()).strip()
                    if not name or name.lower() in skip_names:
                        continue
                    collected_holders.append({"name": name, "value": parse_pct(row.get(holding_col))})
                top_holders = sorted(collected_holders, key=lambda item: item["value"], reverse=True)[:4]

        latest = history[0]
        return {
            "quarter": latest["quarter"],
            "promoters": latest["promoters"],
            "fii": latest["fii"],
            "dii": latest["dii"],
            "public": latest["public"],
            "history": history,
            "topHolders": top_holders,
        }

    def _get_trendlyne_documents_sync(self, symbol: str) -> dict[str, Any] | None:
        key = symbol.replace(".NS", "").replace(".BO", "").strip().upper()
        if not key:
            return None

        now = time.time()
        cached = self._trendlyne_documents_cache.get(key)
        if cached and now - cached[0] < 900:
            return cached[1]

        meta = self._resolve_trendlyne_equity_meta(key)
        if not meta:
            self._trendlyne_documents_cache[key] = (now, None)
            return None

        stock_id, slug = meta
        documents_url = f"https://trendlyne.com/fundamentals/annual-earnings-credit/None/{stock_id}/"
        filings_url = f"https://trendlyne.com/latest-news/BSE-Announcements/{stock_id}/{key}/{slug}/"
        try:
            docs_html = requests.get(
                documents_url,
                headers={**WEB_PAGE_HEADERS, "referer": f"https://trendlyne.com/fundamentals/documents/{stock_id}/{key}/{slug}/"},
                timeout=15,
            )
            docs_html.raise_for_status()

            filings_html = requests.get(
                filings_url,
                headers={**WEB_PAGE_HEADERS, "referer": "https://trendlyne.com/"},
                timeout=15,
            )
            filings_html.raise_for_status()

            parsed = self._parse_trendlyne_documents(docs_html.text, filings_html.text)
            self._trendlyne_documents_cache[key] = (now, parsed)
            return parsed
        except Exception:
            return cached[1] if cached else None

    def _parse_trendlyne_documents(self, docs_html: str, filings_html: str) -> dict[str, Any]:
        soup = BeautifulSoup(docs_html, "html.parser")

        def unique_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
            output: list[dict[str, Any]] = []
            seen: set[str] = set()
            for row in rows:
                url = str(row.get("url") or "").strip()
                title = " ".join(str(row.get("title") or "").split())
                if not title or not url:
                    continue
                key = f"{title}|{url}"
                if key in seen:
                    continue
                seen.add(key)
                output.append({"title": title, "url": url})
            return output

        def parse_annual_reports() -> list[dict[str, Any]]:
            pane = soup.select_one('.tab-pane[data-targetid="annualreport"]')
            if not pane:
                return []
            rows: list[dict[str, Any]] = []
            for card in pane.select(".annual-reports-card"):
                title_el = card.select_one(".title")
                link_el = card.select_one('a[href*="get-document"]')
                title = " ".join(title_el.get_text(" ", strip=True).split()) if title_el else ""
                href = link_el.get("href", "").strip() if link_el else ""
                if title and href:
                    rows.append({"title": title, "url": href})
            return unique_rows(rows)

        def parse_card_pane(target_id: str) -> list[dict[str, Any]]:
            pane = soup.select_one(f'.tab-pane[data-targetid="{target_id}"]')
            if not pane:
                return []
            rows: list[dict[str, Any]] = []
            for card in pane.select(".earnings-template-card, .credit-ratings-card"):
                title = ""
                link = ""
                header_link = card.select_one(".main-header a[href]")
                if header_link:
                    title = " ".join(header_link.get_text(" ", strip=True).split())
                pdf_link = card.select_one('a[href*="get-document"]')
                post_link = card.select_one('a[href*="/posts/"]')
                link = (pdf_link.get("href", "").strip() if pdf_link else "") or (post_link.get("href", "").strip() if post_link else "")
                if title and link:
                    rows.append({"title": title, "url": link})
            return unique_rows(rows)

        filings_soup = BeautifulSoup(filings_html, "html.parser")
        exchange_rows: list[dict[str, Any]] = []
        for block in filings_soup.select("div.card-block.p-x-0"):
            title = " ".join(block.get_text(" ", strip=True).split())
            if not title:
                continue
            link = ""
            for a in block.select("a[href]"):
                href = a.get("href", "").strip()
                if "get-document/post/pdf/" in href or "/posts/" in href:
                    link = href
                    break
            if link:
                exchange_rows.append({"title": title, "url": link})

        return {
            "annualReports": parse_annual_reports()[:12],
            "investorPresentations": parse_card_pane("investorpresentation")[:12],
            "creditRatings": parse_card_pane("creditrating")[:12],
            "exchangeFilings": unique_rows(exchange_rows)[:20],
        }

    def _get_trendlyne_financials_sync(self, symbol: str) -> dict[str, Any] | None:
        key = symbol.replace(".NS", "").replace(".BO", "").strip().upper()
        if not key:
            return None

        now = time.time()
        cached = self._trendlyne_financials_cache.get(key)
        if cached and now - cached[0] < 900:
            return cached[1]

        meta = self._resolve_trendlyne_equity_meta(key)
        if not meta:
            self._trendlyne_financials_cache[key] = (now, None)
            return None

        stock_id, slug = meta
        page_url = f"https://trendlyne.com/fundamentals/financials/{stock_id}/{key}/{slug}/"

        try:
            page_response = requests.get(
                page_url,
                headers={**WEB_PAGE_HEADERS, "referer": "https://trendlyne.com/"},
                timeout=12,
            )
            page_response.raise_for_status()

            url_match = re.search(r'data-tablesurl="([^"]+)"', page_response.text)
            if not url_match:
                self._trendlyne_financials_cache[key] = (now, None)
                return None

            data_url = url_match.group(1)
            data_response = requests.get(
                data_url,
                headers={**NSE_HEADERS, "referer": page_url},
                timeout=15,
            )
            data_response.raise_for_status()
            payload = data_response.json() if data_response.content else {}
            body = payload.get("body", {}) if isinstance(payload, dict) else {}
            parsed = self._parse_trendlyne_financials_payload(body)
            self._trendlyne_financials_cache[key] = (now, parsed)
            return parsed
        except Exception:
            return cached[1] if cached else None

    def _parse_trendlyne_financials_payload(self, body: dict[str, Any]) -> dict[str, Any] | None:
        if not isinstance(body, dict):
            return None

        quarterly_order = body.get("quarterlyOrder")
        quarterly_dump = body.get("quarterlyDataDump")
        annual_order = body.get("annualOrder")
        annual_dump = body.get("annualDataDump")
        if not isinstance(quarterly_order, list) or not isinstance(quarterly_dump, dict):
            return None

        latest_four = [str(period) for period in quarterly_order[:4] if period]
        if not latest_four:
            return None
        selected_periods = list(reversed(latest_four))
        selected_annual_periods = list(reversed([str(period) for period in annual_order[:6] if period])) if isinstance(annual_order, list) else []

        def period_label(period_text: str) -> str:
            for fmt in ("%b %Y", "%B %Y"):
                try:
                    return datetime.strptime(period_text, fmt).strftime("%b %y")
                except Exception:
                    continue
            return period_text

        def as_float(row: dict[str, Any], *keys: str) -> float | None:
            for item in keys:
                value = row.get(item)
                numeric = self._to_float(value)
                if numeric is not None:
                    return numeric
            return None

        def parse_mode(mode_key: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
            mode_rows = quarterly_dump.get(mode_key)
            if not isinstance(mode_rows, dict):
                return [], []

            summary_rows: list[dict[str, Any]] = []
            detailed_rows: list[dict[str, Any]] = []

            for raw_period in selected_periods:
                raw = mode_rows.get(raw_period)
                if not isinstance(raw, dict):
                    continue

                revenue = as_float(raw, "TOTAL_SR_Q", "SR_Q", "OperatingIncome_Q") or 0.0
                profit = as_float(raw, "NP_Q", "PL_After_TaxFromOrdineryActivities_Q") or 0.0
                pbt = as_float(raw, "PBT_Q")
                tax = as_float(raw, "TAX_Q")

                summary_rows.append(
                    {
                        "period": period_label(raw_period),
                        "revenue": round(revenue, 2),
                        "profit": round(profit, 2),
                    }
                )

                detailed_rows.append(
                    {
                        "period": period_label(raw_period),
                        "totalRevenue": as_float(raw, "TOTAL_SR_Q", "SR_Q"),
                        "totalRevenueGrowthPct": as_float(raw, "REV4Q_Q"),
                        "operatingRevenue": as_float(raw, "OperatingIncome_Q", "SR_Q"),
                        "otherIncome": as_float(raw, "OI_Q", "Others_Q", "IncomeOnInvestment_Q"),
                        "expenses": as_float(raw, "OEXPNS_Q"),
                        "interestExpended": as_float(raw, "INT_Q"),
                        "operatingExpenses": as_float(raw, "OEXPNS_Q"),
                        "operatingProfit": as_float(raw, "OP_Q", "OperatingProfitBeforeProvisionsAndContingencies_Q"),
                        "opmPct": as_float(raw, "OPMPCT_Q"),
                        "depreciations": as_float(raw, "DEP_Q"),
                        "profitBeforeTax": pbt,
                        "tax": tax,
                        "taxPct": round((tax / pbt) * 100, 2) if tax is not None and pbt not in {None, 0} else None,
                        "netProfit": as_float(raw, "NP_Q", "PL_After_TaxFromOrdineryActivities_Q"),
                        "netProfitGrowthPct": as_float(raw, "NP_Q_GROWTH"),
                        "netProfitMarginPct": as_float(raw, "NETPCT_Q"),
                        "epsAdjusted": as_float(raw, "EPS_adj_Q"),
                        "basicEps": as_float(raw, "EPS_Q"),
                        "dilutedEps": as_float(raw, "AfterDilutedEPS_Q"),
                        "netProfitTtm": as_float(raw, "NP_TTM"),
                        "basicEpsTtm": as_float(raw, "EPS_TTM"),
                        "grossNpa": as_float(raw, "GNPARAT_Q", "GrossNPA_Q"),
                        "netNpa": as_float(raw, "NNPARAT_Q", "NetNPA_Q"),
                        "grossNpaIsPercent": as_float(raw, "GNPARAT_Q") is not None,
                        "netNpaIsPercent": as_float(raw, "NNPARAT_Q") is not None,
                    }
                )

            return summary_rows, detailed_rows

        def parse_annual_mode(mode_key: str) -> list[dict[str, Any]]:
            if not isinstance(annual_dump, dict):
                return []

            mode_rows = annual_dump.get(mode_key)
            if not isinstance(mode_rows, dict):
                return []

            annual_rows: list[dict[str, Any]] = []
            for raw_period in selected_annual_periods:
                raw = mode_rows.get(raw_period)
                if not isinstance(raw, dict):
                    continue

                annual_rows.append(
                    {
                        "period": period_label(raw_period),
                        "totalRevenue": as_float(raw, "TOTAL_SR_A", "SR_A", "TotalOperatingRevenues_A"),
                        "netProfit": as_float(raw, "NP_A", "PAT_A"),
                        "financingProfit": as_float(raw, "CFA_A"),
                        "dividend": as_float(raw, "DividendPerShare_A", "DIV_A", "EquityShareDividend_A"),
                    }
                )

            return annual_rows

        def parse_ratio_trends(mode_key: str) -> dict[str, list[dict[str, Any]]]:
            if not isinstance(annual_dump, dict):
                return {"profitability": [], "valuation": [], "liquidity": []}

            mode_rows = annual_dump.get(mode_key)
            if not isinstance(mode_rows, dict):
                return {"profitability": [], "valuation": [], "liquidity": []}

            ratio_periods = [str(period) for period in annual_order[:6] if period] if isinstance(annual_order, list) else []
            ratio_periods = list(reversed(ratio_periods))

            annual_points: list[dict[str, Any]] = []
            for raw_period in ratio_periods:
                raw = mode_rows.get(raw_period)
                if not isinstance(raw, dict):
                    continue
                annual_points.append(
                    {
                        "period": str(datetime.strptime(raw_period, "%b %Y").year) if re.match(r"^[A-Za-z]{3} \d{4}$", raw_period) else raw_period[-4:],
                        "roe": as_float(raw, "ROE_A"),
                        "roce": as_float(raw, "ROCE_A"),
                        "roa": as_float(raw, "ROA_A"),
                        "npm": as_float(raw, "NETPCT_A"),
                        "pe": as_float(raw, "PE_A"),
                        "evEbitda": as_float(raw, "EVPerEBITDA_A"),
                        "pbv": as_float(raw, "PBV_A"),
                        "pcf": as_float(raw, "PCFO_A"),
                        "netNpa": as_float(raw, "NNPARAT_A", "NetNPAToAdvancesPercentage_A"),
                        "casa": as_float(raw, "CASA_A"),
                        "nim": as_float(raw, "NIM_A"),
                        "advances": as_float(raw, "Advances_A"),
                    }
                )

            if len(annual_points) < 1:
                return {"profitability": [], "valuation": [], "liquidity": []}

            def average_last_3(key: str) -> float | None:
                values = [self._to_float(point.get(key)) for point in annual_points[-3:]]
                values = [value for value in values if value is not None]
                if not values:
                    return 0.0
                return round(sum(values) / len(values), 2)

            def to_series(key: str) -> list[dict[str, Any]]:
                series = []
                for point in annual_points[-5:]:
                    value = self._to_float(point.get(key))
                    series.append({"period": point["period"], "value": round(value, 2) if value is not None else 0.0})
                return series

            advance_series: list[dict[str, Any]] = []
            latest_five = annual_points[-5:]
            for idx, point in enumerate(latest_five):
                current_adv = self._to_float(point.get("advances"))
                previous_adv = self._to_float(annual_points[-6 + idx].get("advances")) if len(annual_points) >= 6 else None
                growth = 0.0
                if current_adv is not None and previous_adv not in {None, 0}:
                    growth = round(((current_adv - previous_adv) / previous_adv) * 100, 2)
                elif idx > 0:
                    fallback_prev = self._to_float(latest_five[idx - 1].get("advances"))
                    if current_adv is not None and fallback_prev not in {None, 0}:
                        growth = round(((current_adv - fallback_prev) / fallback_prev) * 100, 2)
                advance_series.append({"period": point["period"], "value": growth})

            advance_avg_values = [self._to_float(item.get("value")) or 0.0 for item in advance_series[-3:]]
            advance_avg = round(sum(advance_avg_values) / len(advance_avg_values), 2) if advance_avg_values else 0.0

            return {
                "profitability": [
                    {"label": "ROE", "average3Y": average_last_3("roe"), "series": to_series("roe")},
                    {"label": "ROCE", "average3Y": average_last_3("roce"), "series": to_series("roce")},
                    {"label": "ROA", "average3Y": average_last_3("roa"), "series": to_series("roa")},
                    {"label": "NPM", "average3Y": average_last_3("npm"), "series": to_series("npm")},
                ],
                "valuation": [
                    {"label": "P/E Ratio", "average3Y": average_last_3("pe"), "series": to_series("pe")},
                    {"label": "EV/EBITDA", "average3Y": average_last_3("evEbitda"), "series": to_series("evEbitda")},
                    {"label": "Price to Book Value", "average3Y": average_last_3("pbv"), "series": to_series("pbv")},
                    {"label": "Price to Cash Flow", "average3Y": average_last_3("pcf"), "series": to_series("pcf")},
                ],
                "liquidity": [
                    {"label": "NET NPA", "average3Y": average_last_3("netNpa"), "series": to_series("netNpa")},
                    {"label": "CASA Ratio", "average3Y": average_last_3("casa"), "series": to_series("casa")},
                    {"label": "Advance Growth", "average3Y": advance_avg, "series": advance_series},
                    {"label": "Net Interest Margin", "average3Y": average_last_3("nim"), "series": to_series("nim")},
                ],
            }

        standalone, standalone_detailed = parse_mode("standalone")
        consolidated, consolidated_detailed = parse_mode("consolidated")
        annual_standalone = parse_annual_mode("standalone")
        annual_consolidated = parse_annual_mode("consolidated")
        ratio_trends_standalone = parse_ratio_trends("standalone")
        ratio_trends_consolidated = parse_ratio_trends("consolidated")
        if not standalone and not consolidated:
            return None

        return {
            "standalone": standalone,
            "consolidated": consolidated,
            "standaloneDetailed": standalone_detailed,
            "consolidatedDetailed": consolidated_detailed,
            "annualStandalone": annual_standalone,
            "annualConsolidated": annual_consolidated,
            "ratioTrendsStandalone": ratio_trends_standalone,
            "ratioTrendsConsolidated": ratio_trends_consolidated,
        }

    async def get_google_market_news(self, query: str = "Indian stock market") -> list[dict[str, Any]] | None:
        return await asyncio.to_thread(self._get_google_market_news_sync, query)

    def _get_google_market_news_sync(self, query: str) -> list[dict[str, Any]] | None:
        try:
            encoded_query = quote_plus(f"{query} when:1d")
            url = f"https://news.google.com/rss/search?q={encoded_query}&hl=en-IN&gl=IN&ceid=IN:en"
            response = requests.get(url, headers=GOOGLE_NEWS_HEADERS, timeout=8)
            response.raise_for_status()
            return self._parse_google_news_rss(response.text)
        except Exception:
            return None

    def _parse_google_news_rss(self, rss_xml: str) -> list[dict[str, Any]]:
        try:
            root = ET.fromstring(rss_xml)
        except Exception:
            return []

        rows: list[dict[str, Any]] = []
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

            article_url = link
            candidate_links = re.findall(r'href="([^"]+)"', description_html, flags=re.IGNORECASE)
            for candidate in candidate_links:
                if candidate.startswith("http"):
                    host = (urlparse(candidate).hostname or "").lower()
                    if "news.google.com" not in host:
                        article_url = candidate
                        break

            image_url = self._extract_image_from_rss_item(item, description_html)

            summary = re.sub(r"<[^>]+>", " ", description_html)
            summary = unescape(summary)
            summary = re.sub(r"\s+", " ", summary).strip()
            if summary.startswith("More"):
                summary = ""

            published_at = raw_date
            if raw_date:
                try:
                    published_at = parsedate_to_datetime(raw_date).date().isoformat()
                except Exception:
                    published_at = raw_date

            unique_key = link or title
            if unique_key in seen:
                continue
            seen.add(unique_key)
            rows.append(
                {
                    "title": title,
                    "source": source,
                    "publishedAt": published_at,
                    "url": article_url,
                    "summary": summary[:320],
                    "imageUrl": image_url,
                }
            )

        return rows

    def _extract_image_from_rss_item(self, item: ET.Element, description_html: str) -> str | None:
        image_match = re.search(r'<img[^>]+src="([^"]+)"', description_html, flags=re.IGNORECASE)
        if image_match:
            candidate = image_match.group(1).strip()
            if candidate:
                return candidate

        enclosure = item.find("enclosure")
        if enclosure is not None:
            enc_url = (enclosure.attrib.get("url") or "").strip()
            enc_type = (enclosure.attrib.get("type") or "").lower()
            if enc_url and ("image" in enc_type or enc_url.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))):
                return enc_url

        media_tag = None
        for child in item:
            tag_name = str(child.tag or "").lower()
            if tag_name.endswith("content") or tag_name.endswith("thumbnail"):
                media_tag = child
                break
        if media_tag is not None:
            media_url = (media_tag.attrib.get("url") or "").strip()
            if media_url:
                return media_url

        return None

    async def enrich_news_images(self, rows: list[dict[str, Any]], max_items: int = 10) -> list[dict[str, Any]]:
        async def enrich_row(row: dict[str, Any]) -> dict[str, Any]:
            image_url = str(row.get("imageUrl") or "").strip()
            if image_url:
                return row
            url = str(row.get("url") or "").strip()
            if not url:
                return row
            fetched = await asyncio.to_thread(self._extract_og_image_sync, url)
            if fetched:
                row["imageUrl"] = fetched
            return row

        tasks: list[asyncio.Task] = []
        for idx, row in enumerate(rows):
            if idx >= max_items:
                break
            tasks.append(asyncio.create_task(enrich_row(row)))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        return rows

    def _extract_og_image_sync(self, url: str) -> str | None:
        try:
            response = requests.get(url, headers=WEB_PAGE_HEADERS, timeout=5, allow_redirects=True)
            if response.status_code >= 400 or not response.text:
                return None
            html = response.text

            patterns = [
                r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
                r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
                r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
            ]
            for pattern in patterns:
                match = re.search(pattern, html, flags=re.IGNORECASE)
                if match:
                    img = match.group(1).strip()
                    if img.startswith("http"):
                        return img
            return None
        except Exception:
            return None

    async def get_nse_quote(self, symbol: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._get_nse_quote_sync, symbol)

    async def get_nse_quarterly_results(self, symbol: str) -> dict[str, list[dict[str, Any]]] | None:
        return await asyncio.to_thread(self._get_nse_quarterly_results_sync, symbol)

    async def get_nse_market_ticker(self) -> list[dict[str, Any]] | None:
        return await asyncio.to_thread(self._get_nse_market_ticker_sync)

    def _get_nse_market_ticker_sync(self) -> list[dict[str, Any]] | None:
        try:
            if self._nse_session is None:
                session = requests.Session()
                session.headers.update(NSE_HEADERS)
                session.get("https://www.nseindia.com", timeout=6)
                self._nse_session = session

            response = self._nse_session.get(
                "https://www.nseindia.com/api/market-data-pre-open",
                params={"key": "ALL"},
                timeout=8,
            )
            if response.status_code in {401, 403}:
                self._nse_session.get("https://www.nseindia.com", timeout=6)
                response = self._nse_session.get(
                    "https://www.nseindia.com/api/market-data-pre-open",
                    params={"key": "ALL"},
                    timeout=8,
                )
            response.raise_for_status()
            payload = response.json() if response.content else {}
            data = payload.get("data", []) if isinstance(payload, dict) else []

            rows: list[dict[str, Any]] = []
            for item in data:
                metadata = item.get("metadata", {}) if isinstance(item, dict) else {}
                symbol = str(metadata.get("symbol") or "").strip().upper()
                if not symbol:
                    continue
                cmp_value = self._to_float(metadata.get("lastPrice"))
                change = self._to_float(metadata.get("change"))
                change_pct = self._to_float(metadata.get("pChange"))
                if cmp_value is None:
                    continue
                if change is None and change_pct is not None:
                    change = cmp_value * (change_pct / 100)
                if change_pct is None and change is not None and (cmp_value - change) != 0:
                    prev = cmp_value - change
                    change_pct = (change / prev) * 100
                rows.append(
                    {
                        "symbol": symbol,
                        "cmp": round(cmp_value, 2),
                        "change": round(change or 0.0, 2),
                        "changePercent": round(change_pct or 0.0, 2),
                    }
                )

            rows.sort(key=lambda row: row["symbol"])
            return rows
        except Exception:
            return None

    async def get_nse_index_constituents(self, index_name: str) -> list[dict[str, Any]] | None:
        return await asyncio.to_thread(self._get_nse_index_constituents_sync, index_name)

    def _get_nse_index_constituents_sync(self, index_name: str) -> list[dict[str, Any]] | None:
        key = (index_name or "").strip().upper()
        if not key:
            return None
        try:
            if self._nse_session is None:
                session = requests.Session()
                session.headers.update(NSE_HEADERS)
                session.get("https://www.nseindia.com", timeout=6)
                self._nse_session = session

            response = self._nse_session.get(
                "https://www.nseindia.com/api/equity-stockIndices",
                params={"index": index_name},
                timeout=8,
            )
            if response.status_code in {401, 403}:
                self._nse_session.get("https://www.nseindia.com", timeout=6)
                response = self._nse_session.get(
                    "https://www.nseindia.com/api/equity-stockIndices",
                    params={"index": index_name},
                    timeout=8,
                )
            response.raise_for_status()
            payload = response.json() if response.content else {}
            data = payload.get("data", []) if isinstance(payload, dict) else []

            rows: list[dict[str, Any]] = []
            for item in data:
                symbol = str(item.get("symbol") or "").strip().upper()
                if not symbol or symbol == key:
                    continue
                cmp_value = self._to_float(item.get("lastPrice"))
                change = self._to_float(item.get("change"))
                change_pct = self._to_float(item.get("pChange"))
                prev_close = self._to_float(item.get("previousClose"))
                if cmp_value is None:
                    continue
                if change is None and prev_close is not None:
                    change = cmp_value - prev_close
                if change_pct is None and change is not None and (cmp_value - change) != 0:
                    prev = cmp_value - change
                    change_pct = (change / prev) * 100
                rows.append(
                    {
                        "symbol": symbol,
                        "cmp": round(cmp_value, 2),
                        "change": round(change or 0.0, 2),
                        "changePercent": round(change_pct or 0.0, 2),
                    }
                )

            rows.sort(key=lambda row: row["changePercent"], reverse=True)
            return rows
        except Exception:
            return None

    async def get_nse_index_quote(self, symbol: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._get_nse_index_quote_sync, symbol)

    def _get_nse_index_quote_sync(self, symbol: str) -> dict[str, Any] | None:
        key = symbol.upper().strip()
        try:
            if self._nse_session is None:
                session = requests.Session()
                session.headers.update(NSE_HEADERS)
                session.get("https://www.nseindia.com", timeout=6)
                self._nse_session = session

            response = self._nse_session.get("https://www.nseindia.com/api/allIndices", timeout=6)
            if response.status_code in {401, 403}:
                self._nse_session.get("https://www.nseindia.com", timeout=6)
                response = self._nse_session.get("https://www.nseindia.com/api/allIndices", timeout=6)
            response.raise_for_status()
            payload = response.json() if response.content else {}
            rows = payload.get("data", []) if isinstance(payload, dict) else []

            def normalize(value: str) -> str:
                return re.sub(r"[^A-Z0-9]", "", (value or "").upper())

            target = normalize(key)
            matched: dict[str, Any] | None = None
            for item in rows:
                idx_name = str(item.get("index") or "")
                idx_symbol = str(item.get("indexSymbol") or "")
                if normalize(idx_name) == target or normalize(idx_symbol) == target:
                    matched = item
                    break

            if not matched:
                return None

            parsed = {
                "cmp": self._to_float(matched.get("last")),
                "change": self._to_float(matched.get("variation")),
                "changePercent": self._to_float(matched.get("percentChange")),
                "fiftyTwoWeekHigh": None,
                "fiftyTwoWeekLow": None,
                "faceValue": None,
                "outstandingShares": None,
                "industryPe": None,
                "peRatio": None,
                "currency": "INR",
            }
            if parsed.get("cmp") is not None:
                self._last_nse_quotes[key] = parsed
            return parsed if parsed.get("cmp") is not None else None
        except Exception:
            return self._last_nse_quotes.get(key)

    def _get_nse_quote_sync(self, symbol: str) -> dict[str, Any] | None:
        key = symbol.upper()
        try:
            if self._nse_session is None:
                session = requests.Session()
                session.headers.update(NSE_HEADERS)
                session.get("https://www.nseindia.com", timeout=6)
                self._nse_session = session

            response = self._nse_session.get("https://www.nseindia.com/api/quote-equity", params={"symbol": key}, timeout=6)
            if response.status_code in {401, 403}:
                # Refresh NSE cookies once and retry.
                self._nse_session.get("https://www.nseindia.com", timeout=6)
                response = self._nse_session.get("https://www.nseindia.com/api/quote-equity", params={"symbol": key}, timeout=6)
            response.raise_for_status()
            payload = response.json()

            price_info = payload.get("priceInfo", {}) or {}
            week = price_info.get("weekHighLow", {}) or {}
            security_info = payload.get("securityInfo", {}) or {}
            metadata = payload.get("metadata", {}) or {}
            parsed = {
                "cmp": self._to_float(price_info.get("lastPrice")),
                "change": self._to_float(price_info.get("change")),
                "changePercent": self._to_float(price_info.get("pChange")),
                "fiftyTwoWeekHigh": self._to_float(week.get("max")),
                "fiftyTwoWeekLow": self._to_float(week.get("min")),
                "faceValue": self._to_float(security_info.get("faceValue")),
                "outstandingShares": (
                    self._to_float(security_info.get("issuedSize")) / 10_000_000
                    if self._to_float(security_info.get("issuedSize")) is not None
                    else None
                ),
                "industryPe": self._to_float(metadata.get("pdSectorPe")),
                "peRatio": self._to_float(metadata.get("pdSymbolPe")),
                "currency": "INR",
            }
            if parsed.get("cmp") is None:
                index_quote = self._get_nse_index_quote_sync(key)
                if index_quote and index_quote.get("cmp") is not None:
                    return index_quote
            if parsed.get("cmp") is not None:
                self._last_nse_quotes[key] = parsed
            return parsed
        except Exception:
            index_quote = self._get_nse_index_quote_sync(key)
            if index_quote and index_quote.get("cmp") is not None:
                return index_quote
            return self._last_nse_quotes.get(key)

    def _get_nse_quarterly_results_sync(self, symbol: str) -> dict[str, list[dict[str, Any]]] | None:
        key = symbol.upper().strip()
        max_quarters = 4
        result: dict[str, list[dict[str, Any]]] = {
            "standalone": [],
            "consolidated": [],
            "standaloneDetailed": [],
            "consolidatedDetailed": [],
        }
        try:
            if self._nse_session is None:
                session = requests.Session()
                session.headers.update(NSE_HEADERS)
                session.get("https://www.nseindia.com", timeout=6)
                self._nse_session = session

            now = datetime.utcnow().date()
            from_date = (now - timedelta(days=365 * 6)).strftime("%d-%m-%Y")
            to_date = now.strftime("%d-%m-%Y")

            response = self._nse_session.get(
                "https://www.nseindia.com/api/corporates-financial-results",
                params={"index": "equities", "symbol": key, "period": "Quarterly", "from_date": from_date, "to_date": to_date},
                timeout=8,
            )
            if response.status_code in {401, 403}:
                self._nse_session.get("https://www.nseindia.com", timeout=6)
                response = self._nse_session.get(
                    "https://www.nseindia.com/api/corporates-financial-results",
                    params={"index": "equities", "symbol": key, "period": "Quarterly", "from_date": from_date, "to_date": to_date},
                    timeout=8,
                )
            response.raise_for_status()
            rows = response.json() if response.content else []
            if not isinstance(rows, list):
                return None

            def parse_date(value: str) -> datetime:
                for fmt in ("%d-%b-%Y", "%d-%m-%Y", "%Y-%m-%d", "%d-%b-%Y %H:%M", "%d-%b-%Y %H:%M:%S"):
                    try:
                        return datetime.strptime(value, fmt)
                    except Exception:
                        continue
                return datetime.min

            rows = sorted(
                rows,
                key=lambda item: (
                    parse_date(str(item.get("toDate") or "")),
                    parse_date(str(item.get("filingDate") or "")),
                ),
                reverse=True,
            )

            revenue_keys = [
                "RevenueFromOperations",
                "RevenueFromOperationsDisclosedInStatementOfProfitAndLoss",
                "TotalRevenue",
                "Revenue",
                "Income",
                "SegmentRevenueFromOperations",
            ]
            profit_keys = [
                "ProfitLossForThePeriod",
                "ProfitLossForPeriod",
                "ProfitLossForPeriodFromContinuingOperations",
                "ProfitLossAfterTaxesMinorityInterestAndShareOfProfitLossOfAssociates",
                "NetProfitLossForPeriod",
                "NetProfitLoss",
                "ProfitLossFromOrdinaryActivitiesAfterTax",
            ]

            detailed_by_mode: dict[str, list[dict[str, Any]]] = {"standalone": [], "consolidated": []}
            seen: dict[str, set[str]] = {"standalone": set(), "consolidated": set()}
            rows_to_process: list[dict[str, Any]] = [] # Added this line
            for item in rows:
                mode = "consolidated" if str(item.get("consolidated") or "").lower().startswith("consolidated") else "standalone"
                if len(result[mode]) >= max_quarters:
                    continue

                from_d = str(item.get("fromDate") or "").strip()
                to_d = str(item.get("toDate") or "").strip()
                if not from_d or not to_d or to_d in seen[mode]:
                    continue

                xbrl_url = str(item.get("xbrl") or "").strip()
                if not xbrl_url.endswith(".xml"):
                    continue
                
                # Gather details to fetch late in parallel
                rows_to_process.append({
                    "mode": mode,
                    "xbrl_url": xbrl_url,
                    "from_d": from_d,
                    "to_d": to_d,
                    "filingDate": item.get("filingDate")
                })
                seen[mode].add(to_d)

                if len(seen["standalone"]) >= max_quarters and len(seen["consolidated"]) >= max_quarters:
                    break

            if not rows_to_process:
                return None

            # Parallel Fetching of XBRL values
            from concurrent.futures import ThreadPoolExecutor
            
            def fetch_values(row_info):
                values = self._parse_nse_quarter_xbrl_values(
                    xbrl_url=row_info["xbrl_url"], 
                    from_date=row_info["from_d"], 
                    to_date=row_info["to_d"]
                )
                return row_info, values

            # Use a max of 8 threads for the 8 potential quarters
            with ThreadPoolExecutor(max_workers=len(rows_to_process)) as executor:
                fetch_results = list(executor.map(fetch_values, rows_to_process))

            for row_info, values in fetch_results:
                if not values:
                    continue
                
                mode = row_info["mode"]
                from_d = row_info["from_d"]
                to_d = row_info["to_d"]
                
                revenue = self._pick_metric(values, revenue_keys)
                profit = self._pick_metric(values, profit_keys)
                if revenue is None or profit is None:
                    continue

                period_text = to_d
                try:
                    # Input format is usually 31-Mar-2024
                    period_text = datetime.strptime(to_d, "%d-%b-%Y").strftime("%b %y")
                except Exception:
                    pass

                result[mode].append(
                    {
                        "period": period_text,
                        "revenue": round(revenue / 10_000_000, 2),
                        "profit": round(profit / 10_000_000, 2),
                        "fromDate": from_d,
                        "toDate": to_d,
                        "filingDate": row_info["filingDate"],
                    }
                )

                gross_npa_amount = self._pick_metric(values, ["GrossNPA", "GrossNpa"])
                net_npa_amount = self._pick_metric(values, ["NetNPA", "NetNpa"])
                gross_npa_pct = self._pick_metric(values, ["PercentageOfGrossNpa", "GrossNpaPercentage"])
                net_npa_pct = self._pick_metric(values, ["PercentageOfNpa", "NetNpaPercentage"])

                detailed_by_mode[mode].append(
                    {
                        "period": period_text,
                        "fromDate": from_d,
                        "toDate": to_d,
                        "totalRevenue": revenue,
                        "interestEarned": self._pick_metric(values, ["InterestEarned", "RevenueOnInvestments"]),
                        "otherIncome": self._pick_metric(values, ["OtherIncome"]),
                        "expenses": self._pick_metric(values, ["Expenses", "ExpenditureExcludingProvisionsAndContingencies"]),
                        "interestExpended": self._pick_metric(values, ["InterestExpended", "FinanceCosts"]),
                        "operatingExpenses": self._pick_metric(values, ["OperatingExpenses", "OtherOperatingExpenses", "EmployeeBenefitExpense", "OtherExpenses"]),
                        "operatingProfit": self._pick_metric(values, ["OperatingProfitBeforeProvisionAndContingencies", "OperatingProfit", "ProfitBeforeExceptionalItemsAndTax", "SegmentProfitBeforeTax"]),
                        "depreciations": self._pick_metric(values, ["DepreciationDepletionAndAmortisationExpense", "DepreciationAndAmortisationExpense"]),
                        "profitBeforeTax": self._pick_metric(values, ["ProfitBeforeTax", "ProfitLossFromOrdinaryActivitiesBeforeTax", "ProfitBeforeExceptionalItemsAndTax", "SegmentProfitBeforeTax"]),
                        "tax": self._pick_metric(values, ["TaxExpense", "CurrentTax"]),
                        "netProfit": profit,
                        "basicEps": self._pick_metric(
                            values,
                            [
                                "BasicEarningsPerShareAfterExtraordinaryItems",
                                "BasicEarningsPerShareBeforeExtraordinaryItems",
                                "BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations",
                                "BasicEarningsLossPerShareFromContinuingOperations",
                            ],
                        ),
                        "dilutedEps": self._pick_metric(
                            values,
                            [
                                "DilutedEarningsPerShareAfterExtraordinaryItems",
                                "DilutedEarningsPerShareBeforeExtraordinaryItems",
                                "DilutedEarningsLossPerShareFromContinuingAndDiscontinuedOperations",
                                "DilutedEarningsLossPerShareFromContinuingOperations",
                            ],
                        ),
                        "grossNpa": gross_npa_amount if gross_npa_amount is not None else gross_npa_pct,
                        "netNpa": net_npa_amount if net_npa_amount is not None else net_npa_pct,
                        "grossNpaIsPercent": gross_npa_amount is None and gross_npa_pct is not None,
                        "netNpaIsPercent": net_npa_amount is None and net_npa_pct is not None,
                    }
                )
                seen[mode].add(to_d)

                if len(result["standalone"]) >= max_quarters and len(result["consolidated"]) >= max_quarters:
                    break

            for mode in ("standalone", "consolidated"):
                result[mode].sort(key=lambda row: parse_date(str(row.get("toDate") or row.get("period") or "")))
                detailed_by_mode[mode].sort(key=lambda row: parse_date(str(row.get("toDate") or row.get("period") or "")))
                if len(result[mode]) > max_quarters:
                    result[mode] = result[mode][-max_quarters:]
                if len(detailed_by_mode[mode]) > max_quarters:
                    detailed_by_mode[mode] = detailed_by_mode[mode][-max_quarters:]
                self._compute_nse_quarterly_derived_rows(detailed_by_mode[mode])
                result[f"{mode}Detailed"] = detailed_by_mode[mode]

            return result
        except Exception:
            return None

    def _compute_nse_quarterly_derived_rows(self, rows: list[dict[str, Any]]) -> None:
        def pct(current: float | None, previous: float | None) -> float | None:
            if current is None or previous in {None, 0}:
                return None
            return ((current - previous) / abs(previous)) * 100

        monetary_keys = [
            "totalRevenue",
            "interestEarned",
            "otherIncome",
            "expenses",
            "interestExpended",
            "operatingExpenses",
            "netInterestIncome",
            "operatingProfit",
            "depreciations",
            "profitBeforeTax",
            "tax",
            "netProfit",
            "grossNpa",
            "netNpa",
        ]

        for idx, row in enumerate(rows):
            if row.get("netInterestIncome") is None:
                interest_earned = row.get("interestEarned")
                interest_expended = row.get("interestExpended")
                if interest_earned is not None and interest_expended is not None:
                    row["netInterestIncome"] = interest_earned - interest_expended

            total_revenue = row.get("totalRevenue")
            operating_profit = row.get("operatingProfit")
            pbt = row.get("profitBeforeTax")
            tax = row.get("tax")
            net_profit = row.get("netProfit")

            row["opmPct"] = (operating_profit / total_revenue * 100) if operating_profit is not None and total_revenue not in {None, 0} else None
            row["taxPct"] = (tax / pbt * 100) if tax is not None and pbt not in {None, 0} else None
            row["netProfitMarginPct"] = (net_profit / total_revenue * 100) if net_profit is not None and total_revenue not in {None, 0} else None

            previous = rows[idx - 4] if idx >= 4 else None
            row["totalRevenueGrowthPct"] = pct(total_revenue, previous.get("totalRevenue") if previous else None)
            row["niGrowthPct"] = pct(row.get("netInterestIncome"), previous.get("netInterestIncome") if previous else None)
            row["netProfitGrowthPct"] = pct(net_profit, previous.get("netProfit") if previous else None)
            row["netProfitMarginGrowthPct"] = pct(row.get("netProfitMarginPct"), previous.get("netProfitMarginPct") if previous else None)

            for key in monetary_keys:
                value = row.get(key)
                if value is None:
                    continue
                if key == "grossNpa" and row.get("grossNpaIsPercent"):
                    continue
                if key == "netNpa" and row.get("netNpaIsPercent"):
                    continue
                row[key] = round(float(value) / 10_000_000, 2)

            for key in (
                "opmPct",
                "taxPct",
                "netProfitMarginPct",
                "totalRevenueGrowthPct",
                "niGrowthPct",
                "netProfitGrowthPct",
                "netProfitMarginGrowthPct",
                "basicEps",
                "dilutedEps",
                "grossNpa",
                "netNpa",
            ):
                value = row.get(key)
                if value is not None:
                    row[key] = round(float(value), 2)

    @staticmethod
    def _pick_metric(values: dict[str, float], keys: list[str]) -> float | None:
        for key in keys:
            if key in values:
                return values[key]
        return None

    def _parse_nse_quarter_xbrl_values(self, xbrl_url: str, from_date: str, to_date: str) -> dict[str, float] | None:
        cached = self._nse_xbrl_cache.get(xbrl_url)
        if cached is not None:
            return cached

        try:
            if self._nse_session is None:
                session = requests.Session()
                session.headers.update(NSE_HEADERS)
                session.get("https://www.nseindia.com", timeout=6)
                self._nse_session = session

            response = self._nse_session.get(
                xbrl_url,
                headers={"accept": "application/xml,text/xml,*/*", "referer": "https://www.nseindia.com/"},
                timeout=12,
            )
            response.raise_for_status()

            import xml.etree.ElementTree as ET

            root = ET.fromstring(response.text)
            ns = "{http://www.xbrl.org/2003/instance}"

            from_iso = datetime.strptime(from_date, "%d-%b-%Y").date().isoformat()
            to_iso = datetime.strptime(to_date, "%d-%b-%Y").date().isoformat()

            context_dates: dict[str, tuple[str | None, str | None]] = {}
            for ctx in root.findall(f".//{ns}context"):
                cid = ctx.attrib.get("id")
                if not cid:
                    continue
                st = ctx.find(f".//{ns}startDate")
                en = ctx.find(f".//{ns}endDate")
                context_dates[cid] = (st.text if st is not None else None, en.text if en is not None else None)

            scored: dict[str, tuple[int, float]] = {}
            for el in root.iter():
                if not isinstance(el.tag, str) or "}" not in el.tag:
                    continue
                local = el.tag.split("}", 1)[1]
                text = (el.text or "").strip().replace(",", "")
                if not text:
                    continue
                try:
                    numeric = float(text)
                except Exception:
                    continue

                context_ref = str(el.attrib.get("contextRef") or "")
                start_d, end_d = context_dates.get(context_ref, (None, None))
                cref = context_ref.lower()

                score = 0
                if start_d == from_iso and end_d == to_iso:
                    score += 10
                elif end_d == to_iso:
                    score += 6
                if cref.startswith("one"):
                    score += 4
                elif cref.startswith("four"):
                    score += 1

                previous = scored.get(local)
                if previous is None or score > previous[0]:
                    scored[local] = (score, numeric)

            values = {key: value for key, (_, value) in scored.items()}
            self._nse_xbrl_cache[xbrl_url] = values
            return values
        except Exception:
            self._nse_xbrl_cache[xbrl_url] = None
            return None

    async def get_nse_corporate_events(self, symbol: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._get_nse_corporate_events_sync, symbol)

    def _get_nse_corporate_events_sync(self, symbol: str) -> dict[str, Any]:
        key = symbol.upper()
        empty = {
            "boardMeetings": [],
            "dividends": [],
            "bonusIssues": [],
            "stockSplits": [],
            "rightsIssues": [],
            "agmEgm": [],
            "deals": [],
            "bulkDeals": [],
            "blockDeals": [],
            "insiderTrades": [],
        }

        def safe_get_json(url: str, params: dict[str, Any], timeout: int = 4) -> Any:
            try:
                response = self._nse_session.get(url, params=params, timeout=timeout)
                if response.status_code in {401, 403}:
                    self._nse_session.get("https://www.nseindia.com", timeout=timeout)
                    response = self._nse_session.get(url, params=params, timeout=timeout)
                response.raise_for_status()
                return response.json()
            except Exception:
                return None

        def to_text(value: Any) -> str:
            if value is None:
                return ""
            text = str(value).strip()
            return "" if text == "-" else text

        def parse_event_date(value: str) -> datetime:
            for fmt in (
                "%d %b %Y",
                "%d-%b-%Y",
                "%d-%m-%Y",
                "%Y-%m-%d",
                "%d-%b-%Y %H:%M:%S",
                "%d-%b-%Y %H:%M",
                "%Y-%m-%d %H:%M:%S",
            ):
                try:
                    return datetime.strptime(value, fmt)
                except Exception:
                    continue
            return datetime.min

        def clean_comp_text(value: str) -> str:
            return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()

        def parse_rupee_values(subject: str) -> list[float]:
            values: list[float] = []
            for match in re.findall(r"(?:rs\.?|₹)\s*([0-9]+(?:\.[0-9]+)?)", subject or "", flags=re.IGNORECASE):
                try:
                    values.append(float(match))
                except Exception:
                    continue
            return values

        def parse_ratio(subject: str) -> str:
            m = re.search(r"(\d+\s*:\s*\d+)", subject or "")
            return m.group(1).replace(" ", "") if m else "-"

        def parse_split_ratio(subject: str) -> str:
            ratio = parse_ratio(subject)
            if ratio != "-":
                return ratio
            m = re.search(
                r"from\s*(?:rs\.?|₹)?\s*([0-9]+(?:\.[0-9]+)?)\D+to\s*(?:rs\.?|₹)?\s*([0-9]+(?:\.[0-9]+)?)",
                subject or "",
                flags=re.IGNORECASE,
            )
            if not m:
                return "-"
            return f"{m.group(1).rstrip('0').rstrip('.') if '.' in m.group(1) else m.group(1)}:{m.group(2).rstrip('0').rstrip('.') if '.' in m.group(2) else m.group(2)}"

        def parse_rights_ratio(subject: str) -> str:
            ratio = parse_ratio(subject)
            if ratio != "-":
                return ratio
            m = re.search(r"(\d+)\s*for\s*(\d+)", subject or "", flags=re.IGNORECASE)
            if not m:
                return "-"
            return f"{m.group(1)}:{m.group(2)}"

        def infer_dividend_type(subject: str) -> str:
            s = (subject or "").lower()
            labels: list[str] = []
            if "interim" in s:
                labels.append("Interim")
            if "special" in s:
                labels.append("Special")
            if "final" in s:
                labels.append("Final")
            if not labels:
                return "Dividend"
            return " + ".join(labels)

        def merge_deal_rows(bulk_rows: list[dict[str, Any]], block_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
            combined: list[dict[str, Any]] = []
            seen: set[str] = set()

            for deal_type, rows in (("Bulk", bulk_rows), ("Block", block_rows)):
                for row in rows:
                    merged_row = {**row, "dealType": deal_type}
                    row_key = "|".join(
                        [
                            str(merged_row.get("date") or ""),
                            str(merged_row.get("client") or ""),
                            str(merged_row.get("quantity") or ""),
                            str(merged_row.get("price") or ""),
                            str(merged_row.get("exchange") or ""),
                            str(merged_row.get("dealType") or ""),
                            str(merged_row.get("orderType") or ""),
                        ]
                    )
                    if row_key in seen:
                        continue
                    seen.add(row_key)
                    combined.append(merged_row)

            combined.sort(
                key=lambda row: parse_event_date(str(row.get("date") or "")),
                reverse=True,
            )
            return combined

        try:
            if self._nse_session is None:
                session = requests.Session()
                session.headers.update(NSE_HEADERS)
                session.get("https://www.nseindia.com", timeout=6)
                self._nse_session = session

            now = datetime.utcnow().date()
            from_date = (now - timedelta(days=365 * 3)).strftime("%d-%m-%Y")
            to_date = now.strftime("%d-%m-%Y")

            corp_json = safe_get_json(
                "https://www.nseindia.com/api/corporates-corporateActions",
                {"index": "equities", "symbol": key},
            )
            announcements_raw = safe_get_json(
                "https://www.nseindia.com/api/corporate-announcements",
                {"index": "equities", "symbol": key, "from_date": from_date, "to_date": to_date},
            )
            board_json = safe_get_json(
                "https://www.nseindia.com/api/corporate-board-meetings",
                {"index": "equities", "symbol": key, "from_date": from_date, "to_date": to_date},
            )
            insider_raw = safe_get_json(
                "https://www.nseindia.com/api/corporates-pit",
                {"index": "equities", "symbol": key, "from": from_date, "to": to_date},
            )
            bulk_raw = safe_get_json(
                "https://www.nseindia.com/api/historicalOR/bulk-block-short-deals",
                {"optionType": "bulk_deals", "symbol": key, "from": from_date, "to": to_date},
            )
            block_raw = safe_get_json(
                "https://www.nseindia.com/api/historicalOR/bulk-block-short-deals",
                {"optionType": "block_deals", "symbol": key, "from": from_date, "to": to_date},
            )
            corp_json = corp_json if isinstance(corp_json, list) else []
            announcements = announcements_raw if isinstance(announcements_raw, list) else []
            if isinstance(board_json, list):
                board_json = board_json
            elif isinstance(board_json, dict):
                board_json = board_json.get("data", []) or board_json.get("records", [])
                if not isinstance(board_json, list):
                    board_json = []
            else:
                board_json = []
            insider_json = (insider_raw if isinstance(insider_raw, dict) else {}).get("data", [])
            bulk_json = (bulk_raw if isinstance(bulk_raw, dict) else {}).get("data", [])
            block_json = (block_raw if isinstance(block_raw, dict) else {}).get("data", [])

            ann_by_category: dict[str, list[dict[str, Any]]] = {
                "dividend": [],
                "bonus": [],
                "split": [],
                "rights": [],
                "agm_egm": [],
            }
            for item in announcements:
                desc = (item.get("desc") or "").lower()
                if "dividend" in desc:
                    ann_by_category["dividend"].append(item)
                if "bonus" in desc:
                    ann_by_category["bonus"].append(item)
                if "split" in desc:
                    ann_by_category["split"].append(item)
                if "rights" in desc:
                    ann_by_category["rights"].append(item)
                if "annual general meeting" in desc or "agm" in desc or "egm" in desc:
                    ann_by_category["agm_egm"].append(item)

            def find_announcement_date(category: str, ex_date: str, subject: str) -> str:
                candidates = ann_by_category.get(category, [])
                if not candidates:
                    return "-"

                target_date = parse_event_date(ex_date)
                subject_norm = clean_comp_text(subject)

                scored: list[tuple[int, float, dict[str, Any]]] = []
                for item in candidates:
                    desc = str(item.get("desc") or "")
                    desc_norm = clean_comp_text(desc)
                    strong_match = 0
                    if subject_norm and (subject_norm in desc_norm or desc_norm in subject_norm):
                        strong_match = 1

                    ann_date_str = to_text(item.get("an_dt")) or to_text(item.get("sort_date"))
                    ann_date = parse_event_date(ann_date_str)
                    if target_date == datetime.min or ann_date == datetime.min:
                        distance = None
                    else:
                        distance = abs((target_date - ann_date).total_seconds())
                    scored.append((strong_match, distance, item))

                scored.sort(
                    key=lambda x: (
                        x[0],
                        float("-inf") if x[1] is None else -float(x[1]),
                    ),
                    reverse=True,
                )
                best = scored[0][2]
                return to_text(best.get("an_dt")) or to_text(best.get("sort_date")) or "-"

            for item in corp_json:
                subject_raw = to_text(item.get("subject"))
                subject = subject_raw.lower()
                face_value = self._to_float(item.get("faceVal"))
                ex_date = to_text(item.get("exDate"))
                record_date = to_text(item.get("recDate")) or to_text(item.get("bcStartDate")) or "-"
                row = {
                    "date": ex_date or record_date or "",
                    "client": item.get("symbol") or key,
                    "orderType": subject_raw or "",
                    "announcementDate": "-",
                    "exDate": ex_date or "-",
                    "recordDate": record_date or "-",
                    "details": subject_raw or "-",
                    "quantity": "-",
                    "price": "-",
                    "exchange": "NSE",
                }
                if "dividend" in subject:
                    rupee_values = parse_rupee_values(subject_raw)
                    dividend_amount = sum(rupee_values) if rupee_values else None
                    dividend_percent = None
                    if dividend_amount is not None and face_value and face_value > 0:
                        dividend_percent = (dividend_amount / face_value) * 100
                    row.update(
                        {
                            "type": infer_dividend_type(subject_raw),
                            "announcementDate": find_announcement_date("dividend", ex_date, subject_raw),
                            "dividendAmount": dividend_amount,
                            "dividendPercent": dividend_percent,
                        }
                    )
                    empty["dividends"].append(row)
                elif "bonus" in subject:
                    row.update(
                        {
                            "announcementDate": find_announcement_date("bonus", ex_date, subject_raw),
                            "bonusRatio": parse_ratio(subject_raw),
                        }
                    )
                    empty["bonusIssues"].append(row)
                elif "split" in subject:
                    row.update(
                        {
                            "announcementDate": find_announcement_date("split", ex_date, subject_raw),
                            "splitRatio": parse_split_ratio(subject_raw),
                        }
                    )
                    empty["stockSplits"].append(row)
                elif "rights" in subject:
                    row.update(
                        {
                            "announcementDate": find_announcement_date("rights", ex_date, subject_raw),
                            "rightsRatio": parse_rights_ratio(subject_raw),
                        }
                    )
                    empty["rightsIssues"].append(row)
                else:
                    if "annual general meeting" in subject or "agm" in subject or "egm" in subject:
                        row["announcementDate"] = find_announcement_date("agm_egm", ex_date, subject_raw)
                    empty["agmEgm"].append(row)

            board_rows = []
            for item in board_json:
                meeting_date = item.get("bm_date") or item.get("bmDate") or item.get("proposedMeetingDate") or item.get("date") or ""
                announcement_date = item.get("bm_timestamp") or item.get("sysTime") or ""
                agenda = item.get("bm_desc") or item.get("bm_purpose") or item.get("purpose") or "Board Meeting"
                board_rows.append(
                    {
                        "date": meeting_date,
                        "client": item.get("sm_name") or item.get("bm_symbol") or item.get("symbol") or key,
                        "orderType": item.get("bm_purpose") or "Board Meeting",
                        "agenda": agenda,
                        "announcementDate": announcement_date,
                        "quantity": "-",
                        "price": "-",
                        "exchange": "NSE",
                    }
                )

            board_rows.sort(
                key=lambda row: (
                    parse_event_date(str(row.get("date") or "")),
                    parse_event_date(str(row.get("announcementDate") or "")),
                    len(str(row.get("agenda") or "")),
                ),
                reverse=True,
            )
            seen_board_dates: set[str] = set()
            for row in board_rows:
                date_key = str(row.get("date") or "")
                if date_key in seen_board_dates:
                    continue
                seen_board_dates.add(date_key)
                empty["boardMeetings"].append(row)

            for item in insider_json:
                bq = str(item.get("buyQuantity") or "")
                sq = str(item.get("sellQuantity") or "")
                t_type = "Buy" if bq and bq not in ["0", "0.00", "-"] else "Sell" if sq and sq not in ["0", "0.00", "-"] else "Unknown"
                qty = bq if t_type == "Buy" else sq if t_type == "Sell" else "-"
                
                empty["insiderTrades"].append(
                    {
                        "date": item.get("date") or "",
                        "client": item.get("acqName") or item.get("company") or key,
                        "orderType": item.get("acqMode") or item.get("acqtoDt") or "Insider Trade",
                        "transactionType": t_type,
                        "quantity": qty,
                        "price": item.get("secVal") or "-",
                        "exchange": "NSE",
                    }
                )

            for item in bulk_json:
                empty["bulkDeals"].append(
                    {
                        "date": item.get("BD_DT_DATE") or "",
                        "client": item.get("BD_CLIENT_NAME") or key,
                        "orderType": item.get("BD_BUY_SELL") or "Bulk Deal",
                        "dealType": "Bulk",
                        "quantity": item.get("BD_QTY_TRD") or "-",
                        "price": item.get("BD_TP_WATP") or "-",
                        "exchange": "NSE",
                    }
                )

            for item in block_json:
                empty["blockDeals"].append(
                    {
                        "date": item.get("BD_DT_DATE") or "",
                        "client": item.get("BD_CLIENT_NAME") or key,
                        "orderType": item.get("BD_BUY_SELL") or "Block Deal",
                        "dealType": "Block",
                        "quantity": item.get("BD_QTY_TRD") or "-",
                        "price": item.get("BD_TP_WATP") or "-",
                        "exchange": "NSE",
                    }
                )

            trendlyne_deals = self._get_trendlyne_bulk_block_deals_sync(key)
            if trendlyne_deals:
                trend_bulk = trendlyne_deals.get("bulkDeals") or []
                trend_block = trendlyne_deals.get("blockDeals") or []
                if trend_bulk:
                    empty["bulkDeals"] = trend_bulk
                if trend_block:
                    empty["blockDeals"] = trend_block

            for action_key in ("dividends", "bonusIssues", "stockSplits", "rightsIssues", "agmEgm"):
                empty[action_key].sort(
                    key=lambda row: parse_event_date(str(row.get("exDate") or row.get("date") or "")),
                    reverse=True,
                )
            for action_key in ("bulkDeals", "blockDeals"):
                empty[action_key].sort(
                    key=lambda row: parse_event_date(str(row.get("date") or "")),
                    reverse=True,
                )
            empty["deals"] = merge_deal_rows(
                empty.get("bulkDeals") or [],
                empty.get("blockDeals") or [],
            )
            return empty
        except Exception:
            return empty

    async def get_yahoo_quote(self, symbol: str) -> dict[str, Any] | None:
        key = symbol.upper()
        if not key.endswith(".NS") and not key.endswith(".BO"):
            key = f"{key}.NS"
        try:
            payload = await self._get(
                f"{settings.yahoo_finance_base}/v7/finance/quote",
                params={"symbols": key},
            )
            results = payload.get("quoteResponse", {}).get("result", [])
            if not results:
                return None

            # Prefer INR listings (.NS/.BO).
            for item in results:
                sym = str(item.get("symbol", ""))
                if sym.endswith(".NS") or sym.endswith(".BO"):
                    return item
            return results[0]
        except Exception:
            return None

    async def get_yahoo_candles(self, symbol: str, days: int = 1825) -> list[dict] | None:
        tickers = [f"{symbol.upper()}.NS", f"{symbol.upper()}.BO"]
        for ticker in tickers:
            try:
                payload = await self._get(
                    f"{settings.yahoo_finance_base}/v8/finance/chart/{ticker}",
                    params={"range": "5y", "interval": "1d", "includePrePost": "false"},
                )
                result = (payload.get("chart", {}).get("result") or [None])[0]
                if not result:
                    continue
                ts = result.get("timestamp") or []
                quote = (result.get("indicators", {}).get("quote") or [{}])[0]
                opens = quote.get("open") or []
                highs = quote.get("high") or []
                lows = quote.get("low") or []
                closes = quote.get("close") or []
                volumes = quote.get("volume") or []

                candles: list[dict[str, Any]] = []
                for i, stamp in enumerate(ts):
                    close = self._to_float(closes[i] if i < len(closes) else None)
                    if close is None:
                        continue
                    open_v = self._to_float(opens[i] if i < len(opens) else None) or close
                    high_v = self._to_float(highs[i] if i < len(highs) else None) or close
                    low_v = self._to_float(lows[i] if i < len(lows) else None) or close
                    volume_v = int(volumes[i]) if i < len(volumes) and volumes[i] is not None else 0
                    candles.append(
                        {
                            "date": datetime.utcfromtimestamp(stamp).date().isoformat(),
                            "open": round(open_v, 2),
                            "high": round(high_v, 2),
                            "low": round(low_v, 2),
                            "close": round(close, 2),
                            "volume": volume_v,
                        }
                    )
                if candles:
                    return candles[-days:]
            except Exception:
                continue
        return None

    async def get_yfinance_bundle(self, symbol: str, days: int = 1825) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._get_yfinance_bundle_sync, symbol, days)

    def _get_yfinance_bundle_sync(self, symbol: str, days: int = 1825) -> dict[str, Any] | None:
        try:
            import yfinance as yf  # type: ignore
        except Exception:
            return None

        # Check if symbol already has valid Indian suffix to prevent .NS.NS
        key = symbol.upper()
        if key.endswith(".NS") or key.endswith(".BO"):
            candidates = [key]
        else:
            candidates = [f"{key}.NS", f"{key}.BO"]
            
        chosen = None
        chosen_history = None
        chosen_intraday = None
        chosen_info: dict[str, Any] = {}
        chosen_fast: Any = {}
        chosen_news: list[dict[str, Any]] = []
        chosen_quarterly_income = None
        chosen_annual_income = None
        chosen_annual_balance = None
        chosen_annual_cash = None
        chosen_quarterly_balance = None

        for ticker in candidates:
            try:
                tk = yf.Ticker(ticker)
                hist = tk.history(period="10y", interval="1d", auto_adjust=False)
                if hist is None or hist.empty:
                    continue
                chosen = ticker
                chosen_history = hist
                
                try:
                    # Minimal set for dashboard speed
                    # History and Intraday can sometimes be slow if done separately
                    # But tk.info and tk.financials are the real heavy hitters
                    pass
                except Exception:
                    pass
                break
            except Exception:
                continue

        if chosen is None:
            return None

        # Redefine tk for the chosen ticker
        tk = yf.Ticker(chosen)

        # Parallelize the heavy yfinance property access
        def get_prop(name):
            try:
                return getattr(tk, name)
            except Exception:
                return None

        # We use a limited set of properties to save time
        props_to_fetch = [
            "history", "quarterly_income_stmt", "income_stmt", 
            "balance_sheet", "cashflow", "quarterly_balance_sheet",
            "info", "news", "fast_info"
        ]
        
        # Use a thread pool for lazy-loaded properties that trigger network
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=len(props_to_fetch)) as executor:
            # Note: history is a method, not a property
            # Actually, most are properties. history() needs arguments.
            
            future_map = {
                "history": executor.submit(tk.history, period="10y", interval="1d", auto_adjust=False),
                "intraday": executor.submit(tk.history, period="1d", interval="5m", auto_adjust=False),
                "quarterly_income_stmt": executor.submit(get_prop, "quarterly_income_stmt"),
                "income_stmt": executor.submit(get_prop, "income_stmt"),
                "balance_sheet": executor.submit(get_prop, "balance_sheet"),
                "cashflow": executor.submit(get_prop, "cashflow"),
                "quarterly_balance_sheet": executor.submit(get_prop, "quarterly_balance_sheet"),
                "info": executor.submit(get_prop, "info"),
                "news": executor.submit(get_prop, "news"),
                "fast_info": executor.submit(get_prop, "fast_info"),
                "major_holders": executor.submit(get_prop, "major_holders"),
            }
            
            chosen_history = future_map["history"].result()
            chosen_intraday = future_map["intraday"].result()
            chosen_quarterly_income = future_map["quarterly_income_stmt"].result()
            chosen_annual_income = future_map["income_stmt"].result()
            chosen_annual_balance = future_map["balance_sheet"].result()
            chosen_annual_cash = future_map["cashflow"].result()
            chosen_quarterly_balance = future_map["quarterly_balance_sheet"].result()
            chosen_info = future_map["info"].result() or {}
            chosen_news = future_map["news"].result() or []
            chosen_fast = future_map["fast_info"].result()
            chosen_major_holders = future_map["major_holders"].result()

        if chosen_history is None:
            return None

        history_rows = chosen_history.tail(days)
        candles: list[dict[str, Any]] = []
        for idx, row in history_rows.iterrows():
            try:
                close_val = row["Adj Close"] if "Adj Close" in row else row["Close"]
                candles.append(
                    {
                        "date": idx.date().isoformat(),
                        "open": round(float(row["Open"]), 2),
                        "high": round(float(row["High"]), 2),
                        "low": round(float(row["Low"]), 2),
                        "close": round(float(close_val), 2),
                        "volume": int(float(row["Volume"])) if row["Volume"] is not None else 0,
                    }
                )
            except Exception:
                continue

        intraday_candles: list[dict[str, Any]] = []
        if chosen_intraday is not None and not chosen_intraday.empty:
            for idx, row in chosen_intraday.iterrows():
                try:
                    intraday_candles.append(
                        {
                            # Store exact timestamp for 1D chart 
                            "date": idx.isoformat(), 
                            "open": round(float(row["Open"]), 2),
                            "high": round(float(row["High"]), 2),
                            "low": round(float(row["Low"]), 2),
                            "close": round(float(row["Close"]), 2),
                            "volume": int(float(row["Volume"])) if row["Volume"] is not None else 0,
                        }
                    )
                except Exception:
                    continue

        if len(candles) < 2:
            return None

        candles = sorted(candles, key=lambda row: row["date"])

        last_close = candles[-1]["close"]
        prev_close = candles[-2]["close"]
        change_pct = round(((last_close - prev_close) / prev_close) * 100, 2) if prev_close else 0.0

        def statement_value(statement: Any, keys: list[str], column: Any) -> float | None:
            if statement is None or getattr(statement, "empty", True):
                return None
            for key in keys:
                try:
                    if key in statement.index:
                        value = statement.at[key, column]
                        numeric = self._to_float(value)
                        if numeric is not None:
                            return numeric
                except Exception:
                    continue
            return None

        def statement_series_values(statement: Any, keys: list[str], columns: list[Any]) -> list[float]:
            values: list[float] = []
            for col in columns:
                value = statement_value(statement, keys, col)
                if value is not None:
                    values.append(value)
            return values

        quarterly_cols = list(chosen_quarterly_income.columns) if chosen_quarterly_income is not None and not chosen_quarterly_income.empty else []
        annual_income_cols = list(chosen_annual_income.columns) if chosen_annual_income is not None and not chosen_annual_income.empty else []
        annual_balance_cols = list(chosen_annual_balance.columns) if chosen_annual_balance is not None and not chosen_annual_balance.empty else []
        annual_cash_cols = list(chosen_annual_cash.columns) if chosen_annual_cash is not None and not chosen_annual_cash.empty else []
        quarterly_balance_cols = list(chosen_quarterly_balance.columns) if chosen_quarterly_balance is not None and not chosen_quarterly_balance.empty else []

        revenue_keys = ["Total Revenue", "Revenue", "Operating Revenue"]
        net_income_keys = [
            "Net Income",
            "Net Income Common Stockholders",
            "Net Income From Continuing Operation Net Minority Interest",
        ]
        ebit_keys = ["EBIT", "Operating Income", "Operating Income Or Loss", "Pretax Income", "Pre Tax Income"]
        equity_keys = ["Stockholders Equity", "Total Equity Gross Minority Interest", "Common Stock Equity"]
        assets_keys = ["Total Assets"]
        current_assets_keys = ["Current Assets", "Total Current Assets"]
        current_liabilities_keys = ["Current Liabilities", "Total Current Liabilities"]
        working_capital_keys = ["Working Capital"]
        debt_keys = ["Total Debt", "Net Debt"]
        invested_capital_keys = ["Invested Capital"]
        operating_cf_keys = ["Operating Cash Flow", "Cash Flow From Continuing Operating Activities", "Operating Cash Flow"]
        investing_cf_keys = ["Investing Cash Flow", "Cash Flow From Continuing Investing Activities"]
        financing_cf_keys = ["Financing Cash Flow", "Cash Flow From Continuing Financing Activities"]
        free_cf_keys = ["Free Cash Flow"]

        latest_four_quarters = quarterly_cols[:4]
        previous_four_quarters = quarterly_cols[4:8]

        net_income_ttm = sum(statement_series_values(chosen_quarterly_income, net_income_keys, latest_four_quarters)) if latest_four_quarters else None
        if net_income_ttm in {0, None} and annual_income_cols:
            net_income_ttm = statement_value(chosen_annual_income, net_income_keys, annual_income_cols[0])

        ebit_ttm = sum(statement_series_values(chosen_quarterly_income, ebit_keys, latest_four_quarters)) if latest_four_quarters else None
        if ebit_ttm in {0, None} and annual_income_cols:
            ebit_ttm = statement_value(chosen_annual_income, ebit_keys, annual_income_cols[0])

        equity_latest = statement_value(chosen_annual_balance, equity_keys, annual_balance_cols[0]) if annual_balance_cols else None
        equity_prev = statement_value(chosen_annual_balance, equity_keys, annual_balance_cols[1]) if len(annual_balance_cols) > 1 else None
        avg_equity = None
        if equity_latest is not None and equity_prev is not None:
            avg_equity = (equity_latest + equity_prev) / 2
        elif equity_latest is not None:
            avg_equity = equity_latest

        assets_latest = statement_value(chosen_annual_balance, assets_keys, annual_balance_cols[0]) if annual_balance_cols else None
        assets_prev = statement_value(chosen_annual_balance, assets_keys, annual_balance_cols[1]) if len(annual_balance_cols) > 1 else None
        avg_assets = None
        if assets_latest is not None and assets_prev is not None:
            avg_assets = (assets_latest + assets_prev) / 2
        elif assets_latest is not None:
            avg_assets = assets_latest

        invested_capital = statement_value(chosen_annual_balance, invested_capital_keys, annual_balance_cols[0]) if annual_balance_cols else None
        if invested_capital is None and assets_latest is not None:
            current_liabilities_latest = (
                statement_value(chosen_quarterly_balance, current_liabilities_keys, quarterly_balance_cols[0])
                if quarterly_balance_cols
                else statement_value(chosen_annual_balance, current_liabilities_keys, annual_balance_cols[0]) if annual_balance_cols else None
            )
            if current_liabilities_latest is not None:
                invested_capital = assets_latest - current_liabilities_latest

        current_assets_latest = statement_value(chosen_quarterly_balance, current_assets_keys, quarterly_balance_cols[0]) if quarterly_balance_cols else None
        current_liabilities_latest = statement_value(chosen_quarterly_balance, current_liabilities_keys, quarterly_balance_cols[0]) if quarterly_balance_cols else None
        if current_assets_latest is None and current_liabilities_latest is not None:
            working_capital_latest = statement_value(chosen_quarterly_balance, working_capital_keys, quarterly_balance_cols[0]) if quarterly_balance_cols else None
            if working_capital_latest is not None:
                current_assets_latest = working_capital_latest + current_liabilities_latest
        derived_current_ratio = (
            (current_assets_latest / current_liabilities_latest)
            if current_assets_latest is not None and current_liabilities_latest not in {None, 0}
            else None
        )

        total_debt_latest = statement_value(chosen_annual_balance, debt_keys, annual_balance_cols[0]) if annual_balance_cols else None
        derived_debt_to_equity = (
            (total_debt_latest / avg_equity)
            if total_debt_latest is not None and avg_equity not in {None, 0}
            else None
        )

        derived_roe = (
            (net_income_ttm / avg_equity) * 100
            if net_income_ttm is not None and avg_equity not in {None, 0}
            else None
        )
        derived_roa = (
            (net_income_ttm / avg_assets) * 100
            if net_income_ttm is not None and avg_assets not in {None, 0}
            else None
        )
        derived_roce = (
            (ebit_ttm / invested_capital) * 100
            if ebit_ttm is not None and invested_capital not in {None, 0}
            else None
        )

        net_income_latest4 = sum(statement_series_values(chosen_quarterly_income, net_income_keys, latest_four_quarters)) if latest_four_quarters else None
        net_income_prev4 = sum(statement_series_values(chosen_quarterly_income, net_income_keys, previous_four_quarters)) if previous_four_quarters else None
        earnings_growth_pct = None
        if net_income_latest4 is not None and net_income_prev4 not in {None, 0}:
            earnings_growth_pct = ((net_income_latest4 - net_income_prev4) / abs(net_income_prev4)) * 100

        financials = {"quarterly": [], "yearly": [], "incomeStatement": [], "balanceSheet": [], "cashFlow": []}

        if quarterly_cols:
            ordered_quarterly = list(reversed(quarterly_cols[:8]))
            for col in ordered_quarterly:
                revenue = statement_value(chosen_quarterly_income, revenue_keys, col)
                profit = statement_value(chosen_quarterly_income, net_income_keys, col)
                if revenue is None and profit is None:
                    continue
                financials["quarterly"].append(
                    {
                        "period": col.strftime("%b %y"),
                        "revenue": round((revenue or 0) / 10_000_000, 2),
                        "profit": round((profit or 0) / 10_000_000, 2),
                    }
                )

        if annual_income_cols and annual_balance_cols:
            ordered_yearly = list(reversed(annual_income_cols[:5]))
            for col in ordered_yearly:
                revenue = statement_value(chosen_annual_income, revenue_keys, col)
                profit = statement_value(chosen_annual_income, net_income_keys, col)
                assets = statement_value(chosen_annual_balance, assets_keys, col)
                operating_cf = statement_value(chosen_annual_cash, operating_cf_keys, col) if annual_cash_cols else None
                if revenue is None and profit is None and assets is None and operating_cf is None:
                    continue
                financials["yearly"].append(
                    {
                        "period": col.strftime("%b %y"),
                        "revenue": round((revenue or 0) / 10_000_000, 2),
                        "profit": round((profit or 0) / 10_000_000, 2),
                        "assets": round((assets or 0) / 10_000_000, 2),
                        "cashFlow": round((operating_cf or 0) / 10_000_000, 2),
                    }
                )

        if annual_income_cols:
            for col in annual_income_cols[:5]:
                financials["incomeStatement"].append(
                    {
                        "period": col.strftime("%b %y"),
                        "revenue": round((statement_value(chosen_annual_income, revenue_keys, col) or 0) / 10_000_000, 2),
                        "ebit": round((statement_value(chosen_annual_income, ebit_keys, col) or 0) / 10_000_000, 2),
                        "netIncome": round((statement_value(chosen_annual_income, net_income_keys, col) or 0) / 10_000_000, 2),
                    }
                )

        if annual_balance_cols:
            for col in annual_balance_cols[:5]:
                financials["balanceSheet"].append(
                    {
                        "period": col.strftime("%b %y"),
                        "totalAssets": round((statement_value(chosen_annual_balance, assets_keys, col) or 0) / 10_000_000, 2),
                        "totalDebt": round((statement_value(chosen_annual_balance, debt_keys, col) or 0) / 10_000_000, 2),
                        "equity": round((statement_value(chosen_annual_balance, equity_keys, col) or 0) / 10_000_000, 2),
                        "currentAssets": round((statement_value(chosen_annual_balance, current_assets_keys, col) or 0) / 10_000_000, 2),
                        "currentLiabilities": round((statement_value(chosen_annual_balance, current_liabilities_keys, col) or 0) / 10_000_000, 2),
                    }
                )

        if annual_cash_cols:
            for col in annual_cash_cols[:5]:
                financials["cashFlow"].append(
                    {
                        "period": col.strftime("%b %y"),
                        "operatingCashFlow": round((statement_value(chosen_annual_cash, operating_cf_keys, col) or 0) / 10_000_000, 2),
                        "investingCashFlow": round((statement_value(chosen_annual_cash, investing_cf_keys, col) or 0) / 10_000_000, 2),
                        "financingCashFlow": round((statement_value(chosen_annual_cash, financing_cf_keys, col) or 0) / 10_000_000, 2),
                        "freeCashFlow": round((statement_value(chosen_annual_cash, free_cf_keys, col) or 0) / 10_000_000, 2),
                    }
                )

        def _news_row(item: dict[str, Any]) -> dict[str, Any] | None:
            content = item.get("content") if isinstance(item, dict) else None
            if not isinstance(content, dict):
                return None
            title = content.get("title") or ""
            if not title:
                return None
            provider = (content.get("provider") or {}).get("displayName", "Yahoo Finance") if isinstance(content.get("provider"), dict) else "Yahoo Finance"
            url = content.get("canonicalUrl", {}).get("url") if isinstance(content.get("canonicalUrl"), dict) else ""
            return {
                "title": title,
                "source": provider,
                "publishedAt": str(content.get("pubDate") or "")[:10],
                "url": url or "",
                "summary": content.get("summary") or content.get("description") or "",
            }

        parsed_news = []
        for raw in chosen_news[:12]:
            row = _news_row(raw)
            if row:
                parsed_news.append(row)

        market_cap = None
        try:
            market_cap = chosen_fast.get("marketCap")
        except Exception:
            market_cap = None
        if market_cap is None:
            market_cap = chosen_info.get("marketCap")

        shares_outstanding = chosen_info.get("sharesOutstanding")
        current_price = chosen_info.get("currentPrice") or last_close
        pb_ratio = self._to_float(chosen_info.get("priceToBook"))
        book_value = self._to_float(chosen_info.get("bookValue"))
        if book_value is None and pb_ratio and current_price:
            book_value = float(current_price) / float(pb_ratio)

        dividend_rate = self._to_float(chosen_info.get("dividendRate"))
        trailing_annual_yield = self._to_float(chosen_info.get("trailingAnnualDividendYield"))
        raw_dividend_yield = self._to_float(chosen_info.get("dividendYield"))
        roe = self._to_float(chosen_info.get("returnOnEquity"))
        roa = self._to_float(chosen_info.get("returnOnAssets"))
        roce = self._to_float(chosen_info.get("returnOnCapital"))
        total_debt = self._to_float(chosen_info.get("totalDebt"))
        out_shares = self._to_float(shares_outstanding)
        debt_to_equity_raw = self._to_float(chosen_info.get("debtToEquity"))
        debt_to_equity = (debt_to_equity_raw / 100) if debt_to_equity_raw is not None and debt_to_equity_raw > 5 else debt_to_equity_raw

        dividend_yield = None
        if dividend_rate is not None and current_price and current_price > 0:
            dividend_yield = (dividend_rate / current_price) * 100
        elif trailing_annual_yield is not None and trailing_annual_yield > 0:
            dividend_yield = trailing_annual_yield * 100
        elif raw_dividend_yield is not None:
            # India symbols often already return percent points here.
            dividend_yield = raw_dividend_yield if raw_dividend_yield > 1 else raw_dividend_yield * 100

        ev_to_sales = self._to_float(chosen_info.get("enterpriseToRevenue"))
        enterprise_value = self._to_float(chosen_info.get("enterpriseValue"))
        total_revenue = self._to_float(chosen_info.get("totalRevenue"))
        if (
            ev_to_sales is None
            or ev_to_sales <= 0
            or ev_to_sales > 100
        ) and enterprise_value is not None and total_revenue is not None and total_revenue > 0:
            ev_to_sales = enterprise_value / total_revenue
        if ev_to_sales is not None and ev_to_sales > 100:
            ev_to_sales = None

        derived_peg = None
        if earnings_growth_pct is not None:
            pe_for_peg = self._to_float(chosen_info.get("trailingPE"))
            if pe_for_peg is not None and earnings_growth_pct not in {0, -0.0}:
                derived_peg = pe_for_peg / earnings_growth_pct

        return {
            "ticker": chosen,
            "candles": candles,
            "intraday": intraday_candles,
            "quote": {
                "cmp": last_close,
                "change": round(last_close - prev_close, 2),
                "changePercent": change_pct,
                "currency": chosen_info.get("currency", "INR"),
                "fiftyTwoWeekLow": min(item["close"] for item in candles[-252:]) if candles else 0,
                "fiftyTwoWeekHigh": max(item["close"] for item in candles[-252:]) if candles else 0,
            },
            "metrics": {
                "marketCap": float(market_cap) / 10_000_000 if market_cap else None,
                "peRatio": self._to_float(chosen_info.get("trailingPE")),
                "industryPe": None,
                "pegRatio": self._to_float(chosen_info.get("pegRatio")) or self._to_float(chosen_info.get("trailingPegRatio")) or derived_peg,
                "pbRatio": self._to_float(chosen_info.get("priceToBook")),
                "bookValue": book_value,
                "eps": self._to_float(chosen_info.get("trailingEps")),
                "ebitdaMargin": (
                    self._to_float(chosen_info.get("ebitdaMargins")) * 100
                    if self._to_float(chosen_info.get("ebitdaMargins")) is not None
                    else None
                ),
                "dividendYield": dividend_yield,
                "roe": (roe * 100) if roe is not None else derived_roe,
                "roa": (roa * 100) if roa is not None else derived_roa,
                "roce": (roce * 100) if roce is not None else derived_roce,
                "debtToEquity": debt_to_equity if debt_to_equity is not None else derived_debt_to_equity,
                "totalDebt": (total_debt / 10_000_000) if total_debt is not None else None,
                "faceValue": self._to_float(chosen_info.get("faceValue")),
                "outstandingShares": (out_shares / 10_000_000) if out_shares is not None else None,
                "currentRatio": self._to_float(chosen_info.get("currentRatio")) or derived_current_ratio,
                "evToSales": ev_to_sales,
            },
            "profile": {
                "companyName": chosen_info.get("longName") or chosen_info.get("shortName"),
                "sector": chosen_info.get("sector"),
                "industry": chosen_info.get("industry"),
                "description": chosen_info.get("longBusinessSummary"),
                "website": chosen_info.get("website"),
                "chairman": next((officer.get('name') for officer in chosen_info.get('companyOfficers', []) if 'chairman' in str(officer.get('title')).lower()), "N/A"),
                "previousName": chosen_info.get("previousName", "N/A"),
            },
            "financials": financials,
            "news": parsed_news,
            "shareholding": self._extract_shareholding(chosen_major_holders),
        }

    @staticmethod
    def _to_float(value: Any) -> float | None:
        if value is None:
            return None
        try:
            if isinstance(value, str):
                value = value.replace(",", "")
            numeric = float(value)
            if not math.isfinite(numeric):
                return None
            return numeric
        except Exception:
            return None

    @staticmethod
    def _extract_shareholding(major_holders: Any) -> dict[str, Any]:
        """Extract shareholding pattern from yfinance major_holders DataFrame."""
        result = {"quarter": "", "promoters": 0.0, "fii": 0.0, "dii": 0.0, "public": 0.0}
        try:
            if major_holders is None or not hasattr(major_holders, 'to_dict'):
                return result
            
            # yfinance major_holders usually returns a DataFrame with a 'Value' column
            # and the index contains 'insidersPercentHeld', 'institutionsPercentHeld', etc.
            data_dict = major_holders.to_dict()
            holders_dict = data_dict.get("Value", {})
            
            if not holders_dict:
                # Fallback: maybe it's in a different column or orientation
                # Some versions return it differently
                for col in major_holders.columns:
                    possible_dict = major_holders[col].to_dict()
                    if "insidersPercentHeld" in possible_dict:
                        holders_dict = possible_dict
                        break

            insiders = holders_dict.get("insidersPercentHeld", 0.0) * 100
            institutions = holders_dict.get("institutionsPercentHeld", 0.0) * 100
            public_pct = max(0.0, 100.0 - insiders - institutions)

            result["promoters"] = round(insiders, 2)
            result["fii"] = round(institutions, 2)
            result["dii"] = 0.0  # yfinance doesn't distinguish DII separately
            result["public"] = round(public_pct, 2)
        except Exception:
            pass
        return result

    async def get_groww_data(self, symbol: str) -> dict[str, Any] | None:
        try:
            client = await self._get_groww_client()
            if client is None:
                return None
            return await asyncio.to_thread(self._fetch_groww_symbol_bundle, client, symbol)
        except Exception:
            return None

    async def _get_groww_client(self) -> Any | None:
        if self._groww_client is not None:
            return self._groww_client
        return await asyncio.to_thread(self._build_groww_client)

    def _build_groww_client(self) -> Any | None:
        try:
            from growwapi import GrowwAPI  # type: ignore
        except Exception:
            return None

        access_token = settings.groww_access_token.strip()
        auth_mode = settings.groww_auth_mode.strip().lower()

        if not access_token and auth_mode in {"api_secret", "api_key_secret"}:
            if settings.groww_api_key and settings.groww_api_secret:
                try:
                    access_token = GrowwAPI.get_access_token(api_key=settings.groww_api_key, secret=settings.groww_api_secret)
                except Exception:
                    access_token = ""

        if not access_token and auth_mode == "totp":
            if settings.groww_totp_token and settings.groww_totp_secret:
                try:
                    import pyotp  # type: ignore

                    totp = pyotp.TOTP(settings.groww_totp_secret).now()
                    access_token = GrowwAPI.get_access_token(api_key=settings.groww_totp_token, totp=totp)
                except Exception:
                    access_token = ""

        if not access_token:
            return None

        try:
            self._groww_client = GrowwAPI(access_token)
        except Exception:
            self._groww_client = None
        return self._groww_client

    def _fetch_groww_symbol_bundle(self, client: Any, symbol: str) -> dict[str, Any]:
        bundle: dict[str, Any] = {"profile": {}, "price": {}, "shareholding": {}}

        try:
            instrument = client.get_instrument_by_exchange_and_trading_symbol(exchange=client.EXCHANGE_NSE, trading_symbol=symbol.upper())
            if isinstance(instrument, dict):
                bundle["profile"].update(
                    {
                        "companyName": instrument.get("name"),
                        "isin": instrument.get("isin"),
                        "exchange": instrument.get("exchange"),
                        "tradingSymbol": instrument.get("trading_symbol"),
                        "series": instrument.get("series"),
                    }
                )
        except Exception:
            pass

        try:
            quote = client.get_quote(trading_symbol=symbol.upper(), exchange=client.EXCHANGE_NSE, segment=client.SEGMENT_CASH)
            if isinstance(quote, dict):
                bundle["price"] = {
                    "ltp": quote.get("last_price"),
                    "dayChangePercent": quote.get("day_change_perc"),
                    "open": (quote.get("ohlc") or {}).get("open"),
                    "high": (quote.get("ohlc") or {}).get("high"),
                    "low": (quote.get("ohlc") or {}).get("low"),
                    "close": (quote.get("ohlc") or {}).get("close"),
                }
        except Exception:
            pass

        try:
            profile = client.get_user_profile()
            if isinstance(profile, dict):
                bundle["userProfile"] = {
                    "name": profile.get("name"),
                    "clientId": profile.get("client_id"),
                }
        except Exception:
            pass

        return bundle

