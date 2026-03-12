import asyncio
from collections import defaultdict
from datetime import datetime
import math
import re
from typing import Any, Awaitable

from app.services.providers import MarketDataProviders
from app.services.sample_data import get_sample_dashboard
from app.services.scoring import compute_risk_score, compute_smart_score


INDEX_ALIASES = {
    "NIFTY50": "NIFTY 50",
    "NIFTY 50": "NIFTY 50",
    "NIFTYBANK": "NIFTY BANK",
    "NIFTY BANK": "NIFTY BANK",
    "NIFTYFINANCIALSERVICES": "NIFTY FINANCIAL SERVICES",
    "NIFTY FINANCIAL SERVICES": "NIFTY FINANCIAL SERVICES",
    "NIFTYMIDCAP100": "NIFTY MIDCAP 100",
    "NIFTY MIDCAP 100": "NIFTY MIDCAP 100",
    "BSESENSEX": "BSE SENSEX",
    "SENSEX": "BSE SENSEX",
    "BSE SENSEX": "BSE SENSEX",
    "SPBSEBANKEX": "S&P BSE BANKEX",
    "BSEBANKEX": "S&P BSE BANKEX",
    "S&P BSE BANKEX": "S&P BSE BANKEX",
}

INDEX_FALLBACK_SYMBOLS = {
    "NIFTY BANK": [
        "HDFCBANK",
        "ICICIBANK",
        "SBIN",
        "KOTAKBANK",
        "AXISBANK",
        "INDUSINDBK",
        "BANKBARODA",
        "PNB",
        "IDFCFIRSTB",
        "AUBANK",
        "FEDERALBNK",
        "CANBK",
    ],
    "NIFTY FINANCIAL SERVICES": [
        "HDFCBANK",
        "ICICIBANK",
        "SBIN",
        "KOTAKBANK",
        "AXISBANK",
        "BAJFINANCE",
        "BAJAJFINSV",
        "JIOFIN",
        "CHOLAFIN",
        "SHRIRAMFIN",
        "RECLTD",
        "PFC",
        "SBILIFE",
        "HDFCLIFE",
        "ICICIPRULI",
        "MUTHOOTFIN",
        "HDFCAMC",
    ],
    "BSE SENSEX": [
        "RELIANCE",
        "TCS",
        "HDFCBANK",
        "INFY",
        "ICICIBANK",
        "HINDUNILVR",
        "ITC",
        "SBIN",
        "BHARTIARTL",
        "LT",
        "KOTAKBANK",
        "AXISBANK",
        "BAJFINANCE",
        "ASIANPAINT",
        "MARUTI",
        "NESTLEIND",
        "ULTRACEMCO",
        "M&M",
        "TITAN",
        "SUNPHARMA",
        "WIPRO",
        "NTPC",
        "POWERGRID",
        "TATAMOTORS",
        "TATASTEEL",
        "HCLTECH",
        "TECHM",
        "ADANIPORTS",
        "INDUSINDBK",
        "JSWSTEEL",
    ],
    "S&P BSE BANKEX": [
        "HDFCBANK",
        "ICICIBANK",
        "SBIN",
        "KOTAKBANK",
        "AXISBANK",
        "INDUSINDBK",
        "BANKBARODA",
        "PNB",
        "IDFCFIRSTB",
        "FEDERALBNK",
    ],
}


class StockDashboardService:
    def __init__(self) -> None:
        self.providers = MarketDataProviders()

    async def search_stocks(self, query: str) -> list[dict[str, str]]:
        universe = [
            {"symbol": "HDFCBANK", "name": "HDFC Bank Ltd", "exchange": "NSE"},
            {"symbol": "RELIANCE", "name": "Reliance Industries Ltd", "exchange": "NSE"},
            {"symbol": "TCS", "name": "Tata Consultancy Services Ltd", "exchange": "NSE"},
            {"symbol": "INFY", "name": "Infosys Ltd", "exchange": "NSE"},
            {"symbol": "ICICIBANK", "name": "ICICI Bank Ltd", "exchange": "NSE"},
        ]
        q = query.strip().lower()
        if not q:
            return universe
        return [item for item in universe if q in item["symbol"].lower() or q in item["name"].lower()]

    async def get_ticker_tape(self, symbols: list[str] | None = None) -> list[dict[str, Any]]:
        default_symbols = ["NIFTY 50", "HDFCBANK", "RELIANCE", "SBIN", "TCS", "INFY", "ICICIBANK", "LT", "BHARTIARTL", "ITC"]
        if symbols:
            cleaned_input: list[str] = []
            for item in symbols:
                symbol = (item or "").strip().upper()
                if symbol and symbol not in cleaned_input:
                    cleaned_input.append(symbol)
            cleaned_input = cleaned_input[:40]

            live_quotes = await asyncio.gather(*(self.providers.get_nse_quote(symbol) for symbol in cleaned_input))
            live_rows: list[dict[str, Any]] = []
            for symbol, quote in zip(cleaned_input, live_quotes):
                if not quote:
                    continue
                cmp_value = self._num(quote.get("cmp"))
                change = self._num(quote.get("change"))
                change_pct = self._num(quote.get("changePercent"))
                if cmp_value is None:
                    continue
                if change is None and change_pct is not None:
                    change = cmp_value * (change_pct / 100)
                if change_pct is None and change is not None and (cmp_value - change) != 0:
                    prev = cmp_value - change
                    change_pct = (change / prev) * 100
                live_rows.append(
                    {
                        "symbol": symbol,
                        "cmp": round(cmp_value, 2),
                        "change": round(change or 0, 2),
                        "changePercent": round(change_pct or 0, 2),
                    }
                )
            if live_rows:
                return live_rows

        market_rows = await self.providers.get_nse_market_ticker()
        if market_rows:
            if not symbols:
                return market_rows

        raw = symbols or default_symbols
        cleaned: list[str] = []
        for item in raw:
            symbol = (item or "").strip().upper()
            if not symbol:
                continue
            if symbol not in cleaned:
                cleaned.append(symbol)
        cleaned = cleaned[:25]

        quotes = await asyncio.gather(*(self.providers.get_nse_quote(symbol) for symbol in cleaned))
        rows: list[dict[str, Any]] = []

        for symbol, quote in zip(cleaned, quotes):
            if not quote:
                continue
            cmp_value = self._num(quote.get("cmp"))
            change = self._num(quote.get("change"))
            change_pct = self._num(quote.get("changePercent"))
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
                    "change": round(change or 0, 2),
                    "changePercent": round(change_pct or 0, 2),
                }
            )

        return rows

    async def get_index_heatmap(self, index_name: str) -> dict[str, Any]:
        canonical = self._canonical_index_name(index_name)
        rows: list[dict[str, Any]] = []

        if canonical in {"BSE SENSEX", "S&P BSE BANKEX"}:
            rows = await self.get_ticker_tape(INDEX_FALLBACK_SYMBOLS.get(canonical, []))
        else:
            provider_rows = await self.providers.get_nse_index_constituents(canonical)
            if provider_rows:
                rows = provider_rows
            elif canonical in INDEX_FALLBACK_SYMBOLS:
                rows = await self.get_ticker_tape(INDEX_FALLBACK_SYMBOLS[canonical])

        normalized_rows = self._normalize_ticker_rows(rows)
        normalized_rows.sort(key=lambda row: row["changePercent"], reverse=True)

        return {
            "indexName": canonical,
            "updatedAt": datetime.utcnow().isoformat(),
            "rows": normalized_rows,
        }

    async def get_market_news(self) -> list[dict[str, Any]]:
        queries = [
            "Indian stock market",
            "NSE BSE stocks",
            "Nifty Sensex market update",
        ]
        query_results = await asyncio.gather(
            *(self.providers.get_google_market_news(query) for query in queries),
            return_exceptions=True,
        )

        combined: list[dict[str, Any]] = []
        for result in query_results:
            if isinstance(result, list):
                combined.extend(result)

        if not combined:
            fallback_news = await self.providers.get_news("Indian stock market")
            if fallback_news:
                for item in fallback_news[:20]:
                    published_at = str(item.get("publishedAt") or "")[:10]
                    combined.append(
                        {
                            "title": str(item.get("title") or "").strip(),
                            "source": ((item.get("source") or {}).get("name") or "News").strip(),
                            "publishedAt": published_at,
                            "url": str(item.get("url") or "").strip(),
                            "summary": str(item.get("description") or "").strip(),
                            "imageUrl": item.get("urlToImage"),
                        }
                    )

        deduped: list[dict[str, Any]] = []
        seen: set[str] = set()
        for row in combined:
            title = str(row.get("title") or "").strip()
            url = str(row.get("url") or "").strip()
            if not title or not url:
                continue
            key = url.lower()
            if key in seen:
                continue
            seen.add(key)
            deduped.append(
                {
                    "title": title,
                    "source": str(row.get("source") or "News").strip() or "News",
                    "publishedAt": str(row.get("publishedAt") or ""),
                    "url": url,
                    "summary": str(row.get("summary") or "").strip()[:320],
                    "imageUrl": row.get("imageUrl"),
                }
            )

        def sort_key(item: dict[str, Any]) -> datetime:
            raw = str(item.get("publishedAt") or "").strip()
            for fmt in ("%Y-%m-%d", "%d-%m-%Y"):
                try:
                    return datetime.strptime(raw[:10], fmt)
                except Exception:
                    continue
            return datetime.min

        deduped.sort(key=sort_key, reverse=True)
        top_rows = deduped[:24]
        return await self.providers.enrich_news_images(top_rows, max_items=10)

    async def get_dashboard(self, symbol: str, timeframe: str = "5Y") -> dict[str, Any]:
        data = get_sample_dashboard(symbol=symbol)

        (
            nse_quote,
            nse_events,
            nse_quarterly_results,
            groww_candles,
            news_data,
            yahoo_quote,
            yahoo_candles,
            yfinance_bundle,
            groww_data,
            fmp_quote,
            fmp_candles,
            fmp_quarterly_results,
            polygon_quote,
            polygon_candles,
            trendlyne_brokerage,
            trendlyne_financials,
            trendlyne_shareholding,
            trendlyne_documents,
        ) = await self._fetch_provider_data(symbol, timeframe)

        # FMP is primary as requested for more current and accurate charts.
        selected_candles = fmp_candles
        if not selected_candles:
            if polygon_candles:
                selected_candles = polygon_candles
            elif yfinance_bundle and yfinance_bundle.get("candles"):
                selected_candles = yfinance_bundle["candles"]
            else:
                selected_candles = yahoo_candles or groww_candles
        
        if yfinance_bundle and yfinance_bundle.get("intraday"):
            data["price"]["intraday"] = yfinance_bundle["intraday"]
        if selected_candles:
            history = self._normalize_history(selected_candles)
            data["price"]["history"] = history
            if len(history) >= 2:
                if history[-1].get("close") and history[-2].get("close"):
                    close = float(history[-1]["close"])
                    previous = float(history[-2]["close"])
                    data["price"]["cmp"] = round(close, 2)
                    data["price"]["change"] = round(close - previous, 2)
                    data["price"]["changePercent"] = round(((close - previous) / previous) * 100, 2)
            
            valid_closes = [item["close"] for item in history[-252:] if item.get("close") is not None]
            if valid_closes:
                data["price"]["fiftyTwoWeekLow"] = min(valid_closes)
                data["price"]["fiftyTwoWeekHigh"] = max(valid_closes)

        if nse_quote:
            if nse_quote.get("cmp") is not None:
                data["price"]["cmp"] = round(float(nse_quote["cmp"]), 2)
            if nse_quote.get("change") is not None:
                data["price"]["change"] = round(float(nse_quote["change"]), 2)
            if nse_quote.get("changePercent") is not None:
                data["price"]["changePercent"] = round(float(nse_quote["changePercent"]), 2)
            if nse_quote.get("fiftyTwoWeekLow") is not None:
                data["price"]["fiftyTwoWeekLow"] = round(float(nse_quote["fiftyTwoWeekLow"]), 2)
            if nse_quote.get("fiftyTwoWeekHigh") is not None:
                data["price"]["fiftyTwoWeekHigh"] = round(float(nse_quote["fiftyTwoWeekHigh"]), 2)
            if nse_quote.get("peRatio") is not None:
                data["metrics"]["peRatio"] = float(nse_quote["peRatio"])
            if nse_quote.get("industryPe") is not None:
                data["metrics"]["industryPe"] = float(nse_quote["industryPe"])
            if nse_quote.get("faceValue") is not None:
                data["metrics"]["faceValue"] = float(nse_quote["faceValue"])
            if nse_quote.get("outstandingShares") is not None:
                data["metrics"]["outstandingShares"] = float(nse_quote["outstandingShares"])

        if yahoo_quote:
            if not nse_quote:
                data["price"]["cmp"] = round(float(yahoo_quote.get("regularMarketPrice", data["price"]["cmp"])), 2)
                if yahoo_quote.get("regularMarketChange") is not None:
                    data["price"]["change"] = round(float(yahoo_quote.get("regularMarketChange")), 2)
                data["price"]["changePercent"] = round(float(yahoo_quote.get("regularMarketChangePercent", data["price"]["changePercent"])), 2)
            if yahoo_quote.get("marketCap") is not None:
                data["metrics"]["marketCap"] = float(yahoo_quote.get("marketCap")) / 10_000_000
            if yahoo_quote.get("trailingPE") is not None:
                data["metrics"]["peRatio"] = float(yahoo_quote.get("trailingPE"))
            if yahoo_quote.get("trailingAnnualDividendYield") is not None:
                data["metrics"]["dividendYield"] = float(yahoo_quote.get("trailingAnnualDividendYield")) * 100

        if yfinance_bundle:
            yq = yfinance_bundle.get("quote", {})
            if yq:
                if not nse_quote:
                    data["price"]["cmp"] = round(float(yq.get("cmp", data["price"]["cmp"])), 2)
                    if yq.get("change") is not None:
                        data["price"]["change"] = round(float(yq.get("change")), 2)
                    data["price"]["changePercent"] = round(float(yq.get("changePercent", data["price"]["changePercent"])), 2)
                low_value = yq.get("fiftyTwoWeekLow")
                high_value = yq.get("fiftyTwoWeekHigh")
                if low_value is not None:
                    data["price"]["fiftyTwoWeekLow"] = round(float(low_value), 2)
                if high_value is not None:
                    data["price"]["fiftyTwoWeekHigh"] = round(float(high_value), 2)
            ym = yfinance_bundle.get("metrics", {})
            for key in [
                "marketCap",
                "peRatio",
                "industryPe",
                "pegRatio",
                "pbRatio",
                "bookValue",
                "eps",
                "dividendYield",
                "roe",
                "roce",
                "roa",
                "debtToEquity",
                "totalDebt",
                "faceValue",
                "outstandingShares",
                "currentRatio",
                "evToSales",
            ]:
                value = ym.get(key)
                if value is not None:
                    data["metrics"][key] = float(value)
            yf_financials = yfinance_bundle.get("financials", {})
            if isinstance(yf_financials, dict):
                for key in ["quarterly", "yearly", "incomeStatement", "balanceSheet", "cashFlow"]:
                    if yf_financials.get(key):
                        data["financials"][key] = yf_financials[key]
            yp = yfinance_bundle.get("profile", {})
            if yp:
                if yp.get("companyName"):
                    data["companyName"] = yp["companyName"]
                if yp.get("sector"):
                    data["sector"] = yp["sector"]
                if yp.get("description"):
                    data["profile"]["description"] = yp["description"]
                if yp.get("website"):
                    data["profile"]["website"] = yp["website"]
                if yp.get("chairman"):
                    data["profile"]["chairman"] = yp["chairman"]
                if yp.get("previousName"):
                    data["profile"]["previousName"] = yp["previousName"]
            if yfinance_bundle.get("news"):
                data["news"] = [
                    {
                        **item,
                        "sentimentScore": self._simple_sentiment_score(f"{item.get('title', '')} {item.get('summary', '')}"),
                    }
                    for item in yfinance_bundle["news"]
                ]
            yf_share = yfinance_bundle.get("shareholding", {})
            if yf_share and (yf_share.get("promoters", 0) > 0 or yf_share.get("fii", 0) > 0):
                data["shareholding"].update(yf_share)

        if fmp_quote:
            # Use FMP quote strictly as fallback for live price fields.
            if not nse_quote:
                if fmp_quote.get("cmp") is not None:
                    data["price"]["cmp"] = round(float(fmp_quote["cmp"]), 2)
                if fmp_quote.get("change") is not None:
                    data["price"]["change"] = round(float(fmp_quote["change"]), 2)
                if fmp_quote.get("changePercent") is not None:
                    data["price"]["changePercent"] = round(float(fmp_quote["changePercent"]), 2)
            if fmp_quote.get("name"):
                data["companyName"] = fmp_quote["name"]

        if polygon_quote:
            # Use Polygon as another fallback/verification
            if not nse_quote and not fmp_quote and not yahoo_quote:
                if polygon_quote.get("cmp") is not None:
                    data["price"]["cmp"] = round(float(polygon_quote["cmp"]), 2)
                if polygon_quote.get("change") is not None:
                    data["price"]["change"] = round(float(polygon_quote["change"]), 2)
                if polygon_quote.get("changePercent") is not None:
                    data["price"]["changePercent"] = round(float(polygon_quote["changePercent"]), 2)

        if news_data:
            transformed = []
            for article in news_data[:10]:
                transformed.append(
                    {
                        "title": article.get("title"),
                        "source": article.get("source", {}).get("name", "News"),
                        "publishedAt": (article.get("publishedAt") or "")[:10],
                        "url": article.get("url"),
                        "summary": article.get("description") or "",
                        "sentimentScore": self._simple_sentiment_score(
                            f"{article.get('title', '')} {article.get('description', '')}"
                        ),
                    }
                )
            if transformed:
                data["news"] = transformed

        if trendlyne_brokerage:
            data["brokerageResearch"] = trendlyne_brokerage

        if nse_events:
            data["corporateActions"] = nse_events

        if nse_quarterly_results:
            quarterly_consolidated = nse_quarterly_results.get("consolidated") or []
            quarterly_standalone = nse_quarterly_results.get("standalone") or []
            quarterly_detailed_consolidated = nse_quarterly_results.get("consolidatedDetailed") or []
            quarterly_detailed_standalone = nse_quarterly_results.get("standaloneDetailed") or []

            if quarterly_consolidated:
                data["financials"]["quarterlyConsolidated"] = quarterly_consolidated
            if quarterly_standalone:
                data["financials"]["quarterlyStandalone"] = quarterly_standalone
            if quarterly_detailed_consolidated:
                data["financials"]["quarterlyDetailedConsolidated"] = quarterly_detailed_consolidated
            if quarterly_detailed_standalone:
                data["financials"]["quarterlyDetailedStandalone"] = quarterly_detailed_standalone

            preferred_quarterly = quarterly_consolidated or quarterly_standalone
            if preferred_quarterly:
                data["financials"]["quarterly"] = preferred_quarterly

        if fmp_quarterly_results:
            # Overwrite or merge FMP data into the main 'quarterly' key if it's more comprehensive
            # Actually, per user request, we want and exact FMP section too.
            data["financials"]["fmpQuarterly"] = fmp_quarterly_results
            # If we don't have NSE quarterly, use FMP as primary
            if not data["financials"]["quarterly"]:
                data["financials"]["quarterly"] = fmp_quarterly_results
                data["financials"]["quarterlyConsolidated"] = fmp_quarterly_results

        if trendlyne_financials:
            trendlyne_consolidated = trendlyne_financials.get("consolidated") or []
            trendlyne_standalone = trendlyne_financials.get("standalone") or []
            trendlyne_detailed_consolidated = trendlyne_financials.get("consolidatedDetailed") or []
            trendlyne_detailed_standalone = trendlyne_financials.get("standaloneDetailed") or []
            ratio_trends_consolidated = trendlyne_financials.get("ratioTrendsConsolidated") or {}
            ratio_trends_standalone = trendlyne_financials.get("ratioTrendsStandalone") or {}

            if trendlyne_consolidated:
                data["financials"]["quarterlyConsolidated"] = trendlyne_consolidated
            if trendlyne_standalone:
                data["financials"]["quarterlyStandalone"] = trendlyne_standalone
            if trendlyne_detailed_consolidated:
                data["financials"]["quarterlyDetailedConsolidated"] = trendlyne_detailed_consolidated
            if trendlyne_detailed_standalone:
                data["financials"]["quarterlyDetailedStandalone"] = trendlyne_detailed_standalone

            preferred_quarterly = trendlyne_consolidated or trendlyne_standalone
            if preferred_quarterly:
                data["financials"]["quarterly"] = preferred_quarterly
            data["financials"]["keyRatioTrends"] = ratio_trends_consolidated or ratio_trends_standalone

        if groww_data:
            profile = groww_data.get("profile", {})
            if profile:
                data["profile"].update(
                    {
                        "incorporationYear": profile.get("incorporationYear", data["profile"]["incorporationYear"]),
                        "headquarters": profile.get("headquarters", data["profile"]["headquarters"]),
                        "website": profile.get("website", data["profile"]["website"]),
                        "description": profile.get("description", data["profile"]["description"]),
                    }
                )
                if profile.get("companyName"):
                    data["companyName"] = profile["companyName"]
            share = groww_data.get("shareholding", {})
            if share:
                data["shareholding"].update(share)
            price = groww_data.get("price", {})
            if price:
                ltp = price.get("ltp") or price.get("lastPrice") or price.get("close")
                if ltp:
                    try:
                        data["price"]["cmp"] = round(float(ltp), 2)
                    except Exception:
                        pass
                day_change = price.get("dayChangePercent")
                if day_change is not None:
                    try:
                        data["price"]["changePercent"] = round(float(day_change), 2)
                    except Exception:
                        pass

        if trendlyne_shareholding:
            data["shareholding"].update(trendlyne_shareholding)

        if trendlyne_documents:
            data["documents"].update(trendlyne_documents)

        if self._num(data["price"].get("change")) is None:
            pct = self._num(data["price"].get("changePercent"))
            cmp_value = self._num(data["price"].get("cmp"))
            if pct is not None and cmp_value is not None:
                if abs(100 + pct) > 0.0001:
                    data["price"]["change"] = round(cmp_value * pct / (100 + pct), 2)
                else:
                    data["price"]["change"] = round(cmp_value * pct / 100, 2)

        data["metrics"] = self._finalize_key_metrics(data["metrics"], data["price"], data["financials"], data["competitors"])
        data["returnsSummary"] = self._returns_summary(data["price"]["history"])
        data["returnsHeatmap"] = self._returns_heatmap(data["price"]["history"])
        growth_snapshot = self._build_financial_growth_snapshot(
            trendlyne_financials,
            data["returnsSummary"],
            data["corporateActions"].get("dividends") or [],
        )
        if growth_snapshot:
            data["financials"]["growthSnapshot"] = growth_snapshot
        data["technicals"] = self._derive_technicals_from_history(data["price"]["history"])
        data["price"]["aiTarget"] = self._calculate_predictive_target(data["price"]["history"], data["metrics"], data["technicals"], data["price"].get("cmp", 0))
        data["smartScore"] = compute_smart_score(
            data["metrics"],
            data["technicals"],
            financials=data["financials"],
            price_history=data["price"]["history"],
            returns_summary=data["returnsSummary"],
            news_items=data["news"],
            corporate_actions=data["corporateActions"],
            shareholding=data["shareholding"],
        )
        data["riskScore"] = compute_risk_score(
            data["news"],
            data["metrics"],
            data["technicals"],
            price_history=data["price"]["history"],
            financials=data["financials"],
        )
        data["timeframe"] = timeframe
        return data

    async def _fetch_provider_data(self, symbol: str, timeframe: str = "5Y") -> tuple:
        history_days = max(self._timeframe_days(timeframe), 1825)
        return await asyncio.gather(
            self._safe_provider_call(self.providers.get_nse_quote(symbol), timeout=10),
            self._safe_provider_call(self.providers.get_nse_corporate_events(symbol), timeout=15),
            self._safe_provider_call(self.providers.get_nse_quarterly_results(symbol), timeout=20),
            self._safe_provider_call(self.providers.get_groww_candles(symbol), timeout=10),
            self._safe_provider_call(self.providers.get_news(f"{symbol} India stock"), timeout=8),
            self._safe_provider_call(self.providers.get_yahoo_quote(symbol), timeout=10),
            self._safe_provider_call(self.providers.get_yahoo_candles(symbol, history_days), timeout=15),
            self._safe_provider_call(self.providers.get_yfinance_bundle(symbol, history_days), timeout=45),
            self._safe_provider_call(self.providers.get_groww_data(symbol), timeout=12),
            self._safe_provider_call(self.providers.get_fmp_quote(symbol), timeout=8),
            self._safe_provider_call(self.providers.get_fmp_candles(symbol, "5Y"), timeout=15),
            self._safe_provider_call(self.providers.get_fmp_quarterly_results(symbol), timeout=15),
            self._safe_provider_call(self.providers.get_polygon_quote(symbol), timeout=8),
            self._safe_provider_call(self.providers.get_polygon_candles(symbol, timeframe), timeout=15),
            self._safe_provider_call(self.providers.get_trendlyne_brokerage(symbol), timeout=14),
            self._safe_provider_call(self.providers.get_trendlyne_financials(symbol), timeout=18),
            self._safe_provider_call(self.providers.get_trendlyne_shareholding(symbol), timeout=14),
            self._safe_provider_call(self.providers.get_trendlyne_documents(symbol), timeout=16),
        )

    async def _safe_provider_call(self, coro: Awaitable[Any], timeout: float) -> Any | None:
        try:
            return await asyncio.wait_for(coro, timeout=timeout)
        except asyncio.TimeoutError:
            print(f"[PROVIDER TIMEOUT] {coro} timed out after {timeout}s")
            return None
        except Exception as e:
            print(f"[PROVIDER ERROR] {coro}: {type(e).__name__}: {e}")
            return None

    def _timeframe_days(self, timeframe: str) -> int:
        mapping = {"1D": 1, "1W": 7, "1M": 30, "1Y": 365, "5Y": 1825}
        return mapping.get((timeframe or "").upper(), 1825)

    def _normalize_history(self, candles: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        for item in candles:
            date_raw = str(item.get("date", ""))
            date_part = date_raw.split("T")[0] if "T" in date_raw else date_raw
            try:
                dt = datetime.fromisoformat(date_part)
            except Exception:
                continue
            close = self._num(item.get("close"))
            if close is None:
                continue
            open_v = self._num(item.get("open")) or close
            high_v = self._num(item.get("high")) or close
            low_v = self._num(item.get("low")) or close
            volume_v = self._num(item.get("volume")) or 0
            normalized.append(
                {
                    "date": dt.date().isoformat(),
                    "open": round(open_v, 2),
                    "high": round(high_v, 2),
                    "low": round(low_v, 2),
                    "close": round(close, 2),
                    "volume": int(volume_v),
                }
            )

        normalized.sort(key=lambda row: row["date"])
        deduped: list[dict[str, Any]] = []
        seen: set[str] = set()
        for row in normalized:
            if row["date"] in seen:
                deduped[-1] = row
                continue
            seen.add(row["date"])
            deduped.append(row)
        return deduped

    def _derive_technicals_from_history(self, history: list[dict]) -> dict[str, Any]:
        closes = [float(item["close"]) for item in history if item.get("close") is not None]
        highs = [float(item["high"]) for item in history if item.get("high") is not None]
        lows = [float(item["low"]) for item in history if item.get("low") is not None]
        
        pivots = {
            "standard": {"s3": 0.0, "s2": 0.0, "s1": 0.0, "pivot": 0.0, "r1": 0.0, "r2": 0.0, "r3": 0.0},
            "fibonacci": {"s3": 0.0, "s2": 0.0, "s1": 0.0, "pivot": 0.0, "r1": 0.0, "r2": 0.0, "r3": 0.0}
        }
        
        if len(closes) > 0 and len(highs) > 0 and len(lows) > 0:
            last_idx = -2 if len(closes) > 1 else -1
            H = highs[last_idx]
            L = lows[last_idx]
            C = closes[last_idx]
            
            P = (H + L + C) / 3
            diff = H - L
            
            pivots["standard"] = {
                "s3": round(L - 2 * (H - P), 2),
                "s2": round(P - diff, 2),
                "s1": round((2 * P) - H, 2),
                "pivot": round(P, 2),
                "r1": round((2 * P) - L, 2),
                "r2": round(P + diff, 2),
                "r3": round(H + 2 * (P - L), 2)
            }
            
            pivots["fibonacci"] = {
                "s3": round(P - diff * 1.000, 2),
                "s2": round(P - diff * 0.618, 2),
                "s1": round(P - diff * 0.382, 2),
                "pivot": round(P, 2),
                "r1": round(P + diff * 0.382, 2),
                "r2": round(P + diff * 0.618, 2),
                "r3": round(P + diff * 1.000, 2)
            }

        if len(closes) < 20:
            return {"trend": "Neutral", "pivotLevels": pivots}

        ema20 = self._ema(closes, 20)
        ema50 = self._ema(closes, 50) if len(closes) >= 50 else ema20
        rsi14 = self._rsi(closes, 14)
        macd = self._ema(closes, 12) - self._ema(closes, 26) if len(closes) >= 26 else 0.0
        current = closes[-1]
        
        return {
            "rsi14": round(rsi14, 2),
            "ema20": round(ema20, 2),
            "ema50": round(ema50, 2),
            "macd": round(macd, 2),
            "trend": "Bullish" if current >= ema20 else "Bearish",
            "pivotLevels": pivots,
        }

    def _calculate_predictive_target(self, history: list[dict], metrics: dict[str, Any], technicals: dict[str, Any], cmp_value: float) -> float | None:
        if not history or len(history) < 252 or not cmp_value or cmp_value <= 0:  # Need at least a year
            return round(cmp_value * 1.12 ** 3, 2) if cmp_value and cmp_value > 0 else 0.0

        # Calculate absolute historic annualized return over entire dataset (max 10 years)
        oldest_price = history[0].get("close", cmp_value)
        years_spanned = len(history) / 252.0
        if oldest_price <= 0 or years_spanned < 1:
            base_cagr = 0.12
        else:
            total_return = cmp_value / oldest_price
            base_cagr = (total_return ** (1 / years_spanned)) - 1.0

        # Heuristic 1: Value Adjustment
        pe_ratio = metrics.get("peRatio")
        if pe_ratio is not None:
            if pe_ratio < 15:
                base_cagr += 0.02
            elif pe_ratio > 40:
                base_cagr -= 0.02
        
        # Heuristic 2: Technical Momentum Adjusment
        trend = technicals.get("trend")
        if trend == "Bullish":
            base_cagr += 0.01
        elif trend == "Bearish":
            base_cagr -= 0.01

        # Bounds check (-10% to +30% sanity rails)
        final_cagr = max(-0.10, min(0.30, base_cagr))
        
        # Return 3-Year Future Value
        target_price = cmp_value * ((1 + final_cagr) ** 3)
        return round(target_price, 2)

    def _ema(self, values: list[float], period: int) -> float:
        if not values:
            return 0.0
        k = 2 / (period + 1)
        ema = values[0]
        for value in values[1:]:
            ema = (value * k) + (ema * (1 - k))
        return ema

    def _rsi(self, values: list[float], period: int) -> float:
        if len(values) <= period:
            return 50.0
        gains = []
        losses = []
        for i in range(1, len(values)):
            diff = values[i] - values[i - 1]
            gains.append(max(diff, 0))
            losses.append(abs(min(diff, 0)))
        avg_gain = sum(gains[:period]) / period
        avg_loss = sum(losses[:period]) / period
        for i in range(period, len(gains)):
            avg_gain = ((avg_gain * (period - 1)) + gains[i]) / period
            avg_loss = ((avg_loss * (period - 1)) + losses[i]) / period
        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))

    def _simple_sentiment_score(self, text: str) -> float:
        positive = ["beat", "upgrade", "growth", "bullish", "strong", "record", "profit"]
        negative = ["downgrade", "fraud", "risk", "probe", "decline", "bearish", "drop"]
        t = text.lower()
        pos = sum(1 for item in positive if item in t)
        neg = sum(1 for item in negative if item in t)
        score = 0.5 + (pos * 0.08) - (neg * 0.1)
        return round(max(0.0, min(1.0, score)), 2)

    def _canonical_index_name(self, index_name: str) -> str:
        raw = (index_name or "").strip().upper()
        if not raw:
            return "NIFTY 50"
        if raw in INDEX_ALIASES:
            return INDEX_ALIASES[raw]
        normalized = re.sub(r"[^A-Z0-9]", "", raw)
        return INDEX_ALIASES.get(normalized, raw)

    def _normalize_ticker_rows(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        seen: set[str] = set()
        for row in rows:
            symbol = str(row.get("symbol") or "").strip().upper()
            if not symbol or symbol in seen:
                continue
            cmp_value = self._num(row.get("cmp"))
            change = self._num(row.get("change"))
            change_pct = self._num(row.get("changePercent"))
            if cmp_value is None:
                continue
            if change is None and change_pct is not None:
                change = cmp_value * (change_pct / 100)
            if change_pct is None and change is not None and (cmp_value - change) != 0:
                prev = cmp_value - change
                change_pct = (change / prev) * 100
            normalized.append(
                {
                    "symbol": symbol,
                    "cmp": round(cmp_value, 2),
                    "change": round(change or 0.0, 2),
                    "changePercent": round(change_pct or 0.0, 2),
                }
            )
            seen.add(symbol)
        return normalized

    def _num(self, value: Any) -> float | None:
        try:
            if value is None:
                return None
            numeric = float(value)
            if not math.isfinite(numeric):
                return None
            return numeric
        except Exception:
            return None

    def _finalize_key_metrics(
        self,
        metrics: dict[str, Any],
        price: dict[str, Any],
        financials: dict[str, Any],
        competitors: list[dict[str, Any]],
    ) -> dict[str, Any]:
        out = dict(metrics)
        cmp_value = self._num(price.get("cmp"))
        market_cap = self._num(out.get("marketCap"))
        outstanding = self._num(out.get("outstandingShares"))
        book_value = self._num(out.get("bookValue"))
        pb = self._num(out.get("pbRatio"))
        pe = self._num(out.get("peRatio"))
        peg = self._num(out.get("pegRatio"))
        div_yield = self._num(out.get("dividendYield"))
        debt_to_equity = self._num(out.get("debtToEquity"))

        if outstanding is None and market_cap is not None and cmp_value and cmp_value > 0:
            out["outstandingShares"] = market_cap / cmp_value
            outstanding = out["outstandingShares"]

        if market_cap is None and outstanding is not None and cmp_value is not None:
            out["marketCap"] = outstanding * cmp_value

        if pb is None and book_value and cmp_value and book_value > 0:
            out["pbRatio"] = cmp_value / book_value
            pb = out["pbRatio"]
        if book_value is None and pb and cmp_value and pb > 0:
            out["bookValue"] = cmp_value / pb

        if out.get("industryPe") is None and competitors:
            peer_pes = [self._num(item.get("pe")) for item in competitors]
            peer_pes = [value for value in peer_pes if value is not None and value > 0]
            if peer_pes:
                out["industryPe"] = sum(peer_pes) / len(peer_pes)

        if peg is None and pe is not None:
            growth_pct = None
            quarterly = financials.get("quarterly") or []
            if len(quarterly) >= 5:
                prev = self._num(quarterly[-5].get("profit"))
                curr = self._num(quarterly[-1].get("profit"))
                if prev and curr and prev > 0:
                    growth_pct = ((curr - prev) / prev) * 100
            if growth_pct and growth_pct > 0.01:
                out["pegRatio"] = pe / growth_pct

        if div_yield is not None:
            if div_yield > 100:
                out["dividendYield"] = div_yield / 100
            elif div_yield < 0:
                out["dividendYield"] = None

        if debt_to_equity is not None and debt_to_equity > 10:
            # Upstream may occasionally provide D/E in percentage points.
            out["debtToEquity"] = debt_to_equity / 100

        ev_sales = self._num(out.get("evToSales"))
        if ev_sales is not None and ev_sales > 100:
            out["evToSales"] = None

        if out.get("profitMargin") is None:
            detailed_sets = [
                financials.get("quarterlyDetailedConsolidated") or [],
                financials.get("quarterlyDetailedStandalone") or [],
            ]
            derived_profit_margin = None
            for rows in detailed_sets:
                if not rows:
                    continue
                latest = rows[-1]
                derived_profit_margin = self._num(latest.get("netProfitMarginPct"))
                if derived_profit_margin is not None:
                    break
            if derived_profit_margin is None:
                ratio_trends = financials.get("keyRatioTrends") or {}
                profitability_cards = ratio_trends.get("profitability") if isinstance(ratio_trends, dict) else []
                for card in profitability_cards or []:
                    if str(card.get("label") or "").upper() == "NPM":
                        series = card.get("series") or []
                        if series:
                            derived_profit_margin = self._num(series[-1].get("value"))
                        break
            if derived_profit_margin is not None:
                out["profitMargin"] = derived_profit_margin

        peg = self._num(out.get("pegRatio"))
        if peg is not None and (peg <= 0.2 or peg > 10):
            out["pegRatio"] = None

        for key, value in list(out.items()):
            numeric = self._num(value)
            out[key] = round(numeric, 2) if numeric is not None else None

        return out

    def _returns_summary(self, history: list[dict]) -> list[dict]:
        closes = [item["close"] for item in history if item.get("close") is not None]
        if len(closes) < 5:
            return []

        def pct(days: int) -> float | None:
            if len(closes) <= days:
                return None
            idx = len(closes) - days - 1
            previous = closes[idx]
            current = closes[-1]
            if previous == 0:
                return None
            return round(((current - previous) / previous) * 100, 2)

        return [
            {"label": "1 Week", "value": pct(5)},
            {"label": "1 Month", "value": pct(21)},
            {"label": "6 Months", "value": pct(126)},
            {"label": "1 Year", "value": pct(252)},
            {"label": "3 Years", "value": pct(756)},
            {"label": "5 Years", "value": pct(1260)},
        ]

    def _build_financial_growth_snapshot(
        self,
        trendlyne_financials: dict[str, Any] | None,
        returns_summary: list[dict[str, Any]],
        dividends: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        if not isinstance(trendlyne_financials, dict):
            return None

        annual_consolidated = trendlyne_financials.get("annualConsolidated") or []
        annual_standalone = trendlyne_financials.get("annualStandalone") or []
        annual_rows = annual_consolidated if annual_consolidated else annual_standalone
        if not annual_rows:
            return None

        basis = "consolidated" if annual_consolidated else "standalone"

        def annual_value(index_from_end: int, key: str) -> float | None:
            if len(annual_rows) <= index_from_end:
                return None
            row = annual_rows[-(index_from_end + 1)]
            if not isinstance(row, dict):
                return None
            return self._num(row.get(key))

        dividend_yearly_totals: list[float] = []
        if dividends:
            grouped_dividends: dict[int, float] = defaultdict(float)
            for row in dividends:
                if not isinstance(row, dict):
                    continue
                amount = self._num(row.get("dividendAmount"))
                if amount is None:
                    continue
                date_raw = str(row.get("exDate") or row.get("recordDate") or row.get("date") or "").strip()
                if not date_raw:
                    continue
                parsed_year = None
                for fmt in ("%d-%b-%Y", "%Y-%m-%d", "%d %b %Y"):
                    try:
                        parsed_year = datetime.strptime(date_raw[:11], fmt).year
                        break
                    except Exception:
                        continue
                if parsed_year is None:
                    continue
                grouped_dividends[parsed_year] += amount
            if grouped_dividends:
                dividend_yearly_totals = [grouped_dividends[year] for year in sorted(grouped_dividends.keys())[-6:]]

        def growth_from_series(values: list[float], years: int) -> float | None:
            if years == 1:
                if len(values) < 2:
                    return None
                latest = self._num(values[-1])
                previous = self._num(values[-2])
                if latest is None or previous is None or latest <= 0 or previous <= 0:
                    return None
                return round(((latest - previous) / previous) * 100, 2)

            if len(values) <= years:
                return None
            latest = self._num(values[-1])
            base = self._num(values[-(years + 1)])
            if latest is None or base is None or latest <= 0 or base <= 0:
                return None
            try:
                return round((((latest / base) ** (1 / years)) - 1) * 100, 2)
            except Exception:
                return None

        def one_year_change(key: str) -> float | None:
            latest = annual_value(0, key)
            previous = annual_value(1, key)
            if latest is None or previous in {None, 0}:
                return None
            if latest <= 0 or previous <= 0:
                return None
            return round(((latest - previous) / previous) * 100, 2)

        def cagr_change(key: str, years: int) -> float | None:
            latest = annual_value(0, key)
            base = annual_value(years, key)
            if latest is None or base is None or latest <= 0 or base <= 0:
                return None
            try:
                return round((((latest / base) ** (1 / years)) - 1) * 100, 2)
            except Exception:
                return None

        def returns_cagr(years: int) -> float | None:
            label_map = {1: "1 Year", 3: "3 Years", 5: "5 Years"}
            target = next((item for item in returns_summary if item.get("label") == label_map[years]), None)
            total_return = self._num(target.get("value")) if isinstance(target, dict) else None
            if total_return is None:
                return None
            if years == 1:
                return round(total_return, 2)
            gross = 1 + (total_return / 100)
            if gross <= 0:
                return None
            try:
                return round(((gross ** (1 / years)) - 1) * 100, 2)
            except Exception:
                return None

        periods = []
        for years, label in ((1, "1 Year CAGR"), (3, "3 Year CAGR"), (5, "5 Year CAGR")):
            dividend_value = one_year_change("dividend") if years == 1 else cagr_change("dividend", years)
            if dividend_value is None and dividend_yearly_totals:
                dividend_value = growth_from_series(dividend_yearly_totals, years)

            period_metrics = [
                {"label": "Revenue Growth", "value": one_year_change("totalRevenue") if years == 1 else cagr_change("totalRevenue", years)},
                {"label": "Net Profit Growth", "value": one_year_change("netProfit") if years == 1 else cagr_change("netProfit", years)},
                {
                    "label": "Financing Profit Growth",
                    "value": one_year_change("financingProfit") if years == 1 else cagr_change("financingProfit", years),
                },
                {"label": "Dividend Growth", "value": dividend_value},
                {"label": "Stock Returns CAGR", "value": returns_cagr(years)},
            ]
            periods.append({"label": label, "metrics": period_metrics})

        if not any(metric.get("value") is not None for period in periods for metric in period["metrics"]):
            return None

        return {"basis": basis, "periods": periods}

    def _returns_heatmap(self, history: list[dict]) -> list[dict]:
        grouped: dict[int, dict[int, list[float]]] = defaultdict(lambda: defaultdict(list))
        for point in history:
            date_raw = str(point["date"])
            dt = datetime.fromisoformat(date_raw.split("T")[0] if "T" in date_raw else date_raw)
            grouped[dt.year][dt.month].append(point["close"])

        rows = []
        for year in sorted(grouped.keys(), reverse=True)[:5]:
            row: dict[str, Any] = {"year": year}
            for month in range(1, 13):
                values = grouped[year].get(month)
                if not values or len(values) < 2:
                    row[str(month)] = None
                    continue
                row[str(month)] = round(((values[-1] - values[0]) / values[0]) * 100, 2)
            rows.append(row)
        return rows
