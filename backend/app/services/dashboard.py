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


class StockDashboardService:
    def __init__(self) -> None:
        self.providers = MarketDataProviders()

    async def search_stocks(self, query: str) -> list[dict[str, str]]:
        q = query.strip().lower()
        if not q:
            return []

        provider_results = await self.providers.search_indian_stocks(query, limit=25)
        return provider_results

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
            bse_symbols = await self.providers.get_bse_index_symbols(canonical)
            if bse_symbols:
                rows = await self.get_ticker_tape(bse_symbols)
        else:
            provider_rows = await self.providers.get_nse_index_constituents(canonical)
            if provider_rows:
                rows = provider_rows

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
        newsapi_results = await asyncio.gather(
            *(self.providers.get_news(query) for query in queries),
            return_exceptions=True,
        )
        google_results = await asyncio.gather(
            *(self.providers.get_google_market_news(query) for query in queries),
            return_exceptions=True,
        )

        combined: list[dict[str, Any]] = []
        for result in newsapi_results:
            if isinstance(result, list):
                for item in result[:12]:
                    published_at = str(item.get("publishedAt") or "")[:10]
                    combined.append(
                        {
                            "title": str(item.get("title") or "").strip(),
                            "source": ((item.get("source") or {}).get("name") or "News").strip(),
                            "publishedAt": published_at,
                            "url": str(item.get("url") or "").strip(),
                            "summary": str(item.get("description") or "").strip(),
                            "imageUrl": item.get("urlToImage") if self.providers._is_usable_news_image_url(item.get("urlToImage")) else None,
                        }
                    )

        for result in google_results:
            if isinstance(result, list):
                combined.extend(result)

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

        deduped.sort(
            key=lambda item: (
                1 if self.providers._is_usable_news_image_url(item.get("imageUrl")) else 0,
                sort_key(item),
            ),
            reverse=True,
        )
        top_rows = deduped[:24]
        return await self.providers.enrich_news_images(top_rows, max_items=24)

    async def get_dashboard(self, symbol: str, timeframe: str = "5Y") -> dict[str, Any]:
        data = get_sample_dashboard(symbol=symbol)

        (
            nse_quote,
            nse_events,
            nse_quarterly_results,
            news_data,
            yahoo_quote,
            yahoo_candles,
            yfinance_bundle,
            fmp_quote,
            fmp_candles,
            fmp_quarterly_results,
            trendlyne_brokerage,
            trendlyne_financials,
            trendlyne_shareholding,
            trendlyne_documents,
        ) = await self._fetch_provider_data(symbol, timeframe)

        # FMP is primary as requested for more current and accurate charts.
        selected_candles = fmp_candles
        if not selected_candles:
            if yfinance_bundle and yfinance_bundle.get("candles"):
                selected_candles = yfinance_bundle["candles"]
            else:
                selected_candles = yahoo_candles
        
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
                "ebitdaMargin",
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
                if yp.get("industry"):
                    data["profile"]["industry"] = yp["industry"]
                if yp.get("description"):
                    data["profile"]["description"] = yp["description"]
                if yp.get("website"):
                    data["profile"]["website"] = yp["website"]
                if yp.get("chairman"):
                    data["profile"]["chairman"] = yp["chairman"]
                if yp.get("previousName"):
                    data["profile"]["previousName"] = yp["previousName"]
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

        data["news"] = self._build_company_news(
            symbol=symbol,
            company_name=data.get("companyName", ""),
            sector=data.get("sector", ""),
            industry=(data.get("profile") or {}).get("industry", ""),
            yahoo_news=(yfinance_bundle or {}).get("news") if isinstance(yfinance_bundle, dict) else [],
            api_news=news_data or [],
        )

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

        if trendlyne_shareholding:
            data["shareholding"].update(trendlyne_shareholding)

        data["shareholding"] = self._normalize_shareholding(data["shareholding"])
        self._backfill_quarterly_financials(data["financials"])
        self._backfill_statement_tables(data["financials"], trendlyne_financials)

        if trendlyne_documents:
            data["documents"].update(trendlyne_documents)

        data["competitors"] = {
            "table": [],
            "sectorName": str(data.get("sector") or ""),
            "industryName": str((data.get("profile") or {}).get("industry") or ""),
            "sectorCompanies": [],
            "industryCompanies": [],
        }

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
        data["financials"]["keyRatioTrends"] = self._finalize_key_ratio_trends(
            data["financials"].get("keyRatioTrends"),
            data["metrics"],
            data["financials"],
            data["price"]["history"],
            data.get("sector", ""),
        )
        data["metrics"] = self._enrich_metrics_from_ratio_trends(data["metrics"], data["financials"]["keyRatioTrends"])
        growth_snapshot = self._build_financial_growth_snapshot(
            trendlyne_financials,
            data["financials"],
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
            brokerage_research=data.get("brokerageResearch"),
        )
        data["timeframe"] = timeframe
        if not self._has_live_dashboard_core(data):
            raise ValueError(f"Live dashboard data is incomplete for {symbol.upper()}")
        return data

    def _has_live_dashboard_core(self, data: dict[str, Any]) -> bool:
        price = data.get("price") if isinstance(data, dict) else {}
        history = price.get("history") if isinstance(price, dict) else []
        cmp_value = self._num(price.get("cmp")) if isinstance(price, dict) else None
        company_name = str(data.get("companyName") or "").strip() if isinstance(data, dict) else ""
        symbol = str(data.get("symbol") or "").strip().upper() if isinstance(data, dict) else ""
        has_real_company_name = bool(company_name and company_name.upper() != symbol)
        return bool(cmp_value and cmp_value > 0 and isinstance(history, list) and len(history) >= 30 and has_real_company_name)

    async def _fetch_provider_data(self, symbol: str, timeframe: str = "5Y") -> tuple:
        history_days = max(self._timeframe_days(timeframe), 1825)
        calls: list[tuple[Awaitable[Any], float]] = [
            (self.providers.get_nse_quote(symbol), 5),
            (self.providers.get_nse_corporate_events(symbol), 7),
            (self.providers.get_nse_quarterly_results(symbol), 7),
            (self.providers.get_news(f"{symbol} India stock"), 5),
            (self.providers.get_yahoo_quote(symbol), 5),
            (self.providers.get_yahoo_candles(symbol, history_days), 7),
            (self.providers.get_yfinance_bundle(symbol, history_days), 10),
            (self.providers.get_fmp_quote(symbol), 5),
            (self.providers.get_fmp_candles(symbol, "5Y"), 7),
            (self.providers.get_fmp_quarterly_results(symbol), 7),
            (self.providers.get_trendlyne_brokerage(symbol), 6),
            (self.providers.get_trendlyne_financials(symbol), 8),
            (self.providers.get_trendlyne_shareholding(symbol), 6),
            (self.providers.get_trendlyne_documents(symbol), 9),
        ]
        tasks = [asyncio.create_task(self._safe_provider_call(coro, timeout=timeout)) for coro, timeout in calls]
        done, pending = await asyncio.wait(tasks, timeout=12)
        for task in pending:
            task.cancel()
        results: list[Any | None] = []
        for task in tasks:
            if task in done and not task.cancelled():
                try:
                    results.append(task.result())
                except Exception:
                    results.append(None)
            else:
                results.append(None)
        return tuple(results)

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

        final_cagr = base_cagr
        if pe_ratio is not None:
            if pe_ratio > 50:
                final_cagr = min(final_cagr, 0.10)
            elif pe_ratio < 0:
                final_cagr = min(final_cagr, 0.05)

        conservative_anchor = 0.10
        blend_weight = 0.60
        final_cagr = (blend_weight * final_cagr) + ((1 - blend_weight) * conservative_anchor)
        final_cagr = max(-0.10, min(0.30, final_cagr))
        
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

    def _news_keywords(self, value: str) -> list[str]:
        cleaned = re.sub(r"[^a-z0-9 ]+", " ", str(value or "").lower())
        stop_words = {
            "ltd",
            "limited",
            "india",
            "bank",
            "company",
            "corp",
            "corporation",
            "industries",
            "industry",
            "services",
            "financial",
            "retail",
            "global",
            "private",
            "public",
            "the",
            "and",
        }
        tokens = []
        for token in cleaned.split():
            if len(token) < 4 or token in stop_words:
                continue
            if token not in tokens:
                tokens.append(token)
        return tokens

    def _score_company_news_relevance(
        self,
        symbol: str,
        company_name: str,
        sector: str,
        industry: str,
        row: dict[str, Any],
    ) -> tuple[int, str | None]:
        title = str(row.get("title") or "")
        summary = str(row.get("summary") or "")
        url = str(row.get("url") or "")
        text = f"{title} {summary} {url}".lower()
        symbol_lower = str(symbol or "").strip().lower()
        company_lower = str(company_name or "").strip().lower()

        score = 0
        bucket: str | None = None

        if symbol_lower and re.search(rf"(?<![a-z0-9]){re.escape(symbol_lower)}(?![a-z0-9])", text):
            score += 7
            bucket = "stock"

        if company_lower and len(company_lower) >= 6 and company_lower in text:
            score += 7
            bucket = "stock"

        company_tokens = self._news_keywords(company_name)
        token_hits = sum(1 for token in company_tokens if token in text)
        if token_hits >= 2:
            score += 5
            bucket = "stock"
        elif token_hits == 1:
            score += 2
            bucket = bucket or "stock"

        sector_tokens = self._news_keywords(sector)
        industry_tokens = self._news_keywords(industry)
        sector_hits = sum(1 for token in sector_tokens if token in text)
        industry_hits = sum(1 for token in industry_tokens if token in text)
        if bucket != "stock":
            if industry_hits >= 1:
                score += 3
                bucket = "industry"
            elif sector_hits >= 1:
                score += 2
                bucket = "sector"

        return score, bucket

    def _build_company_news(
        self,
        symbol: str,
        company_name: str,
        sector: str,
        industry: str,
        yahoo_news: list[dict[str, Any]] | None,
        api_news: list[dict[str, Any]] | None,
    ) -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []

        if isinstance(yahoo_news, list):
            for item in yahoo_news:
                if not isinstance(item, dict):
                    continue
                candidates.append(
                    {
                        "title": str(item.get("title") or "").strip(),
                        "source": str(item.get("source") or "Yahoo Finance").strip() or "Yahoo Finance",
                        "publishedAt": str(item.get("publishedAt") or "")[:10],
                        "url": str(item.get("url") or "").strip(),
                        "summary": str(item.get("summary") or "").strip(),
                    }
                )

        if isinstance(api_news, list):
            for article in api_news:
                if not isinstance(article, dict):
                    continue
                candidates.append(
                    {
                        "title": str(article.get("title") or "").strip(),
                        "source": str((article.get("source") or {}).get("name") or "News").strip() or "News",
                        "publishedAt": str(article.get("publishedAt") or "")[:10],
                        "url": str(article.get("url") or "").strip(),
                        "summary": str(article.get("description") or "").strip(),
                    }
                )

        ranked: list[dict[str, Any]] = []
        seen: set[str] = set()
        for row in candidates:
            title = str(row.get("title") or "").strip()
            url = str(row.get("url") or "").strip()
            if not title:
                continue
            score, bucket = self._score_company_news_relevance(symbol, company_name, sector, industry, row)
            if score <= 0:
                continue
            key = (url or title).lower()
            if key in seen:
                continue
            seen.add(key)
            ranked.append(
                {
                    **row,
                    "sentimentScore": self._simple_sentiment_score(f"{title} {row.get('summary', '')}"),
                    "_relevance": score,
                    "_bucket": bucket or "stock",
                }
            )

        def published_sort_value(item: dict[str, Any]) -> datetime:
            raw = str(item.get("publishedAt") or "").strip()
            for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S"):
                try:
                    probe = raw[:19] if "T" in fmt else raw[:10]
                    return datetime.strptime(probe, fmt)
                except Exception:
                    continue
            try:
                return datetime.fromisoformat(raw.replace("Z", "+00:00"))
            except Exception:
                return datetime.min

        stock_rows = [row for row in ranked if row.get("_bucket") == "stock"]
        fallback_rows = [row for row in ranked if row.get("_bucket") != "stock"]
        selected = stock_rows if stock_rows else fallback_rows
        selected.sort(key=lambda item: (int(item.get("_relevance", 0)), published_sort_value(item)), reverse=True)

        cleaned: list[dict[str, Any]] = []
        for row in selected[:10]:
            cleaned.append(
                {
                    "title": row.get("title"),
                    "source": row.get("source"),
                    "publishedAt": row.get("publishedAt"),
                    "url": row.get("url"),
                    "summary": row.get("summary"),
                    "sentimentScore": row.get("sentimentScore"),
                }
            )
        return cleaned

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

    def _normalize_shareholding(self, shareholding: dict[str, Any]) -> dict[str, Any]:
        if not shareholding:
            return shareholding

        normalized = dict(shareholding)
        history = normalized.get("history") or []
        normalized_history: list[dict[str, Any]] = []

        for row in history:
            if not isinstance(row, dict):
                continue
            normalized_row = dict(row)
            promoters = self._num(normalized_row.get("promoters")) or 0.0
            fii = self._num(normalized_row.get("fii")) or 0.0
            dii = self._num(normalized_row.get("dii")) or 0.0
            public_value = self._num(normalized_row.get("public"))

            if public_value is None or public_value <= 0:
                public_value = max(0.0, 100.0 - (promoters + fii + dii))

            total = promoters + fii + dii + public_value
            if total > 100.5 and public_value > 0:
                public_value = max(0.0, public_value - (total - 100.0))

            normalized_row["promoters"] = round(promoters, 2)
            normalized_row["fii"] = round(fii, 2)
            normalized_row["dii"] = round(dii, 2)
            normalized_row["public"] = round(public_value, 2)
            normalized_history.append(normalized_row)

        normalized["history"] = normalized_history
        latest = normalized_history[0] if normalized_history else {}

        if latest:
            if latest.get("quarter"):
                normalized["quarter"] = latest.get("quarter")
            for key in ("promoters", "fii", "dii", "public"):
                latest_value = self._num(latest.get(key))
                if latest_value is not None:
                    normalized[key] = round(latest_value, 2)

        promoters = self._num(normalized.get("promoters")) or 0.0
        fii = self._num(normalized.get("fii")) or 0.0
        dii = self._num(normalized.get("dii")) or 0.0
        public_value = self._num(normalized.get("public"))

        if public_value is None or public_value <= 0:
            inferred_public = round(max(0.0, 100.0 - (promoters + fii + dii)), 2)
            if inferred_public > 0:
                normalized["public"] = inferred_public
                public_value = inferred_public

        total = promoters + fii + dii + (public_value or 0.0)
        if total > 100.5 and (public_value or 0.0) > 0:
            normalized["public"] = round(max(0.0, (public_value or 0.0) - (total - 100.0)), 2)

        return normalized

    def _backfill_quarterly_financials(self, financials: dict[str, Any]) -> None:
        if not isinstance(financials, dict):
            return

        def clean_summary(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
            cleaned: list[dict[str, Any]] = []
            for row in rows:
                if not isinstance(row, dict):
                    continue
                period = str(row.get("period") or "").strip()
                revenue = self._num(row.get("revenue"))
                profit = self._num(row.get("profit"))
                if not period or (revenue is None and profit is None):
                    continue
                cleaned.append({"period": period, "revenue": revenue, "profit": profit})
            return cleaned[-4:]

        def summary_from_details(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
            summary: list[dict[str, Any]] = []
            for row in rows:
                if not isinstance(row, dict):
                    continue
                period = str(row.get("period") or "").strip()
                revenue = self._num(row.get("totalRevenue"))
                profit = self._num(row.get("netProfit"))
                if not period or (revenue is None and profit is None):
                    continue
                summary.append(
                    {
                        "period": period,
                        "revenue": round(revenue, 2) if revenue is not None else None,
                        "profit": round(profit, 2) if profit is not None else None,
                    }
                )
            return summary[-4:]

        financials["quarterlyConsolidated"] = clean_summary(financials.get("quarterlyConsolidated") or [])
        financials["quarterlyStandalone"] = clean_summary(financials.get("quarterlyStandalone") or [])
        financials["quarterly"] = clean_summary(financials.get("quarterly") or [])

        if not financials.get("quarterlyConsolidated") and financials.get("quarterlyDetailedConsolidated"):
            financials["quarterlyConsolidated"] = summary_from_details(financials["quarterlyDetailedConsolidated"])
        if not financials.get("quarterlyStandalone") and financials.get("quarterlyDetailedStandalone"):
            financials["quarterlyStandalone"] = summary_from_details(financials["quarterlyDetailedStandalone"])
        if not financials.get("quarterly"):
            financials["quarterly"] = financials.get("quarterlyConsolidated") or financials.get("quarterlyStandalone") or []

    def _backfill_statement_tables(self, financials: dict[str, Any], trendlyne_financials: dict[str, Any] | None) -> None:
        if not isinstance(financials, dict):
            return

        def clean_rows(rows: list[dict[str, Any]], numeric_keys: tuple[str, ...]) -> list[dict[str, Any]]:
            cleaned: list[dict[str, Any]] = []
            for row in rows:
                if not isinstance(row, dict):
                    continue
                period = str(row.get("period") or "").strip()
                if not period:
                    continue
                if not any(self._num(row.get(key)) is not None for key in numeric_keys):
                    continue
                cleaned.append(row)
            return cleaned

        annual_rows: list[dict[str, Any]] = []
        if isinstance(trendlyne_financials, dict):
            annual_rows = (
                trendlyne_financials.get("annualConsolidated")
                or trendlyne_financials.get("annualStandalone")
                or []
            )

        financials["yearly"] = clean_rows(financials.get("yearly") or [], ("revenue", "profit", "assets", "cashFlow"))
        financials["incomeStatement"] = clean_rows(financials.get("incomeStatement") or [], ("revenue", "ebit", "netIncome"))
        financials["balanceSheet"] = clean_rows(financials.get("balanceSheet") or [], ("totalAssets", "totalDebt", "equity", "currentAssets", "currentLiabilities"))
        financials["cashFlow"] = clean_rows(financials.get("cashFlow") or [], ("operatingCashFlow", "investingCashFlow", "financingCashFlow", "freeCashFlow"))

        yearly_rows = financials.get("yearly") or []
        if not yearly_rows and annual_rows:
            financials["yearly"] = [
                {
                    "period": str(row.get("period") or ""),
                    "revenue": self._num(row.get("totalRevenue")),
                    "profit": self._num(row.get("netProfit")),
                    "assets": self._num(row.get("assets")),
                    "cashFlow": self._num(row.get("operatingCashFlow")) or self._num(row.get("financingProfit")),
                }
                for row in annual_rows
                if isinstance(row, dict) and row.get("period")
            ]
            yearly_rows = financials["yearly"]

        if not financials.get("incomeStatement"):
            statement_rows = []
            source_rows = annual_rows or yearly_rows
            for row in source_rows:
                if not isinstance(row, dict):
                    continue
                period = str(row.get("period") or "").strip()
                if not period:
                    continue
                statement_rows.append(
                    {
                        "period": period,
                        "revenue": self._num(row.get("revenue")) if row in yearly_rows else self._num(row.get("totalRevenue")),
                        "ebit": self._num(row.get("ebit")) if row in yearly_rows else self._num(row.get("ebit")),
                        "netIncome": self._num(row.get("profit")) if row in yearly_rows else self._num(row.get("netProfit")),
                    }
                )
            financials["incomeStatement"] = [row for row in statement_rows if any(self._num(row.get(key)) is not None for key in ("revenue", "ebit", "netIncome"))]

        if not financials.get("balanceSheet") and annual_rows:
            balance_rows = []
            for row in annual_rows:
                if not isinstance(row, dict):
                    continue
                period = str(row.get("period") or "").strip()
                if not period:
                    continue
                balance_rows.append(
                    {
                        "period": period,
                        "totalAssets": self._num(row.get("assets")),
                        "totalDebt": self._num(row.get("totalDebt")),
                        "equity": self._num(row.get("equity")),
                        "currentAssets": self._num(row.get("currentAssets")),
                        "currentLiabilities": self._num(row.get("currentLiabilities")),
                    }
                )
            financials["balanceSheet"] = [row for row in balance_rows if any(self._num(row.get(key)) is not None for key in ("totalAssets", "totalDebt", "equity", "currentAssets", "currentLiabilities"))]

        if not financials.get("cashFlow") and annual_rows:
            cash_rows = []
            for row in annual_rows:
                if not isinstance(row, dict):
                    continue
                period = str(row.get("period") or "").strip()
                if not period:
                    continue
                cash_rows.append(
                    {
                        "period": period,
                        "operatingCashFlow": self._num(row.get("operatingCashFlow")),
                        "investingCashFlow": self._num(row.get("investingCashFlow")),
                        "financingCashFlow": self._num(row.get("financingCashFlow")) or self._num(row.get("financingProfit")),
                        "freeCashFlow": self._num(row.get("freeCashFlow")),
                    }
                )
            financials["cashFlow"] = [row for row in cash_rows if any(self._num(row.get(key)) is not None for key in ("operatingCashFlow", "investingCashFlow", "financingCashFlow", "freeCashFlow"))]

    def _finalize_key_metrics(
        self,
        metrics: dict[str, Any],
        price: dict[str, Any],
        financials: dict[str, Any],
        competitors: dict[str, Any] | list[dict[str, Any]],
    ) -> dict[str, Any]:
        out = dict(metrics)
        competitor_rows = competitors.get("table") if isinstance(competitors, dict) else competitors
        competitor_rows = competitor_rows if isinstance(competitor_rows, list) else []
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

        if out.get("industryPe") is None and competitor_rows:
            peer_pes = [self._num(item.get("pe")) for item in competitor_rows]
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

    def _enrich_metrics_from_ratio_trends(self, metrics: dict[str, Any], ratio_trends: dict[str, Any] | None) -> dict[str, Any]:
        out = dict(metrics)
        trends = ratio_trends if isinstance(ratio_trends, dict) else {}
        liquidity_cards = trends.get("liquidity") if isinstance(trends.get("liquidity"), list) else []

        def latest_or_average(label: str) -> float | None:
            for card in liquidity_cards:
                if not isinstance(card, dict):
                    continue
                if str(card.get("label") or "").strip().lower() != label.strip().lower():
                    continue
                series = card.get("series") if isinstance(card.get("series"), list) else []
                for point in reversed(series):
                    if not isinstance(point, dict):
                        continue
                    value = self._num(point.get("value"))
                    if value is not None:
                        return round(value, 2)
                average = self._num(card.get("average3Y"))
                return round(average, 2) if average is not None else None
            return None

        if self._num(out.get("casaRatio")) is None:
            casa_ratio = latest_or_average("CASA Ratio")
            if casa_ratio is not None:
                out["casaRatio"] = casa_ratio

        if self._num(out.get("netInterestMargin")) is None:
            net_interest_margin = latest_or_average("Net Interest Margin")
            if net_interest_margin is not None:
                out["netInterestMargin"] = net_interest_margin

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

    def _finalize_key_ratio_trends(
        self,
        existing_trends: dict[str, Any] | None,
        metrics: dict[str, Any],
        financials: dict[str, Any],
        price_history: list[dict[str, Any]],
        sector: str = "",
    ) -> dict[str, Any]:
        trends = existing_trends if isinstance(existing_trends, dict) else {}

        def clone_card(card: dict[str, Any]) -> dict[str, Any]:
            return {
                "label": str(card.get("label") or ""),
                "average3Y": self._num(card.get("average3Y")),
                "series": [
                    {"period": str(item.get("period") or ""), "value": self._num(item.get("value"))}
                    for item in (card.get("series") or [])
                    if isinstance(item, dict)
                ],
            }

        normalized = {
            "profitability": [clone_card(card) for card in trends.get("profitability", []) if isinstance(card, dict)],
            "valuation": [clone_card(card) for card in trends.get("valuation", []) if isinstance(card, dict)],
            "liquidity": [clone_card(card) for card in trends.get("liquidity", []) if isinstance(card, dict)],
        }

        def get_or_create_card(group: str, label: str) -> dict[str, Any]:
            cards = normalized.setdefault(group, [])
            for card in cards:
                if card.get("label") == label:
                    return card
            card = {"label": label, "average3Y": None, "series": []}
            cards.append(card)
            return card

        def card_is_blank(card: dict[str, Any]) -> bool:
            values = [self._num(item.get("value")) for item in card.get("series", []) if isinstance(item, dict)]
            values = [value for value in values if value is not None]
            avg = self._num(card.get("average3Y"))
            return (avg is None or abs(avg) < 1e-9) and (not values or all(abs(value) < 1e-9 for value in values))

        def average_from_series(series: list[dict[str, Any]]) -> float | None:
            values = [self._num(item.get("value")) for item in series[-3:]]
            values = [value for value in values if value is not None]
            if not values:
                return None
            return round(sum(values) / len(values), 2)

        def parse_period(period: str) -> datetime | None:
            raw = str(period or "").strip()
            for fmt in ("%b %y", "%b %Y"):
                try:
                    return datetime.strptime(raw, fmt)
                except Exception:
                    continue
            return None

        history_pairs: list[tuple[datetime, float]] = []
        for row in price_history:
            date_raw = str(row.get("date") or "").split("T")[0]
            close = self._num(row.get("close"))
            if not date_raw or close is None:
                continue
            try:
                history_pairs.append((datetime.fromisoformat(date_raw), close))
            except Exception:
                continue
        history_pairs.sort(key=lambda item: item[0])

        shares_outstanding = self._num(metrics.get("outstandingShares"))
        if shares_outstanding is None:
            market_cap = self._num(metrics.get("marketCap"))
            cmp_value = self._num(metrics.get("cmp"))
            if market_cap is not None and cmp_value not in {None, 0}:
                shares_outstanding = market_cap / cmp_value

        pcf_card = get_or_create_card("valuation", "Price to Cash Flow")
        if card_is_blank(pcf_card):
            series: list[dict[str, Any]] = []
            cash_flow_rows = financials.get("cashFlow") or []
            parsed_cash_flow_rows: list[tuple[datetime, dict[str, Any]]] = []
            for row in cash_flow_rows:
                if not isinstance(row, dict):
                    continue
                period = str(row.get("period") or "").strip()
                parsed_dt = None
                for fmt in ("%b %y", "%b %Y"):
                    try:
                        parsed_dt = datetime.strptime(period, fmt)
                        break
                    except Exception:
                        continue
                if parsed_dt is None:
                    continue
                parsed_cash_flow_rows.append((parsed_dt, row))
            parsed_cash_flow_rows.sort(key=lambda item: item[0])

            for parsed_dt, row in parsed_cash_flow_rows[-5:]:
                operating_cf = self._num(row.get("operatingCashFlow"))
                if operating_cf in {None, 0} or shares_outstanding in {None, 0}:
                    continue
                fiscal_end = datetime(parsed_dt.year, parsed_dt.month, 31 if parsed_dt.month in {1, 3, 5, 7, 8, 10, 12} else 30)
                close = None
                for history_dt, history_close in history_pairs:
                    if history_dt <= fiscal_end:
                        close = history_close
                    else:
                        break
                if close is None:
                    continue
                value = round((close * shares_outstanding) / operating_cf, 2)
                series.append({"period": str(parsed_dt.year), "value": value})

            if series:
                pcf_card["series"] = series
                recent_values = [self._num(item.get("value")) for item in series[-3:]]
                recent_values = [value for value in recent_values if value is not None]
                pcf_card["average3Y"] = round(sum(recent_values) / len(recent_values), 2) if recent_values else None

        net_npa_card = get_or_create_card("liquidity", "NET NPA")
        if card_is_blank(net_npa_card):
            detailed_sets = [
                financials.get("quarterlyDetailedConsolidated") or [],
                financials.get("quarterlyDetailedStandalone") or [],
            ]
            series: list[dict[str, Any]] = []
            for rows in detailed_sets:
                if not rows:
                    continue
                temp_series = []
                for row in rows[-5:]:
                    if not isinstance(row, dict):
                        continue
                    value = self._num(row.get("netNpa"))
                    if value is None:
                        continue
                    temp_series.append({"period": str(row.get("period") or ""), "value": round(value, 2)})
                if temp_series:
                    series = temp_series
                    break
            if series:
                net_npa_card["series"] = series
                recent_values = [self._num(item.get("value")) for item in series[-3:]]
                recent_values = [value for value in recent_values if value is not None]
                net_npa_card["average3Y"] = round(sum(recent_values) / len(recent_values), 2) if recent_values else None

        sector_text = str(sector or "").lower()
        is_financial = any(token in sector_text for token in ["financial", "bank", "insurance"])
        if not is_financial:
            balance_rows = financials.get("balanceSheet") or []
            yearly_rows = financials.get("yearly") or []

            current_ratio_series: list[dict[str, Any]] = []
            debt_equity_series: list[dict[str, Any]] = []
            for row in balance_rows:
                if not isinstance(row, dict):
                    continue
                parsed_dt = parse_period(str(row.get("period") or ""))
                if parsed_dt is None:
                    continue
                current_assets = self._num(row.get("currentAssets"))
                current_liabilities = self._num(row.get("currentLiabilities"))
                total_debt = self._num(row.get("totalDebt"))
                equity = self._num(row.get("equity"))
                if current_assets is not None and current_liabilities not in {None, 0}:
                    current_ratio_series.append({"period": str(parsed_dt.year), "value": round(current_assets / current_liabilities, 2)})
                if total_debt is not None and equity not in {None, 0}:
                    debt_equity_series.append({"period": str(parsed_dt.year), "value": round(total_debt / equity, 2)})

            asset_turnover_series: list[dict[str, Any]] = []
            cash_flow_margin_series: list[dict[str, Any]] = []
            for row in yearly_rows:
                if not isinstance(row, dict):
                    continue
                parsed_dt = parse_period(str(row.get("period") or ""))
                if parsed_dt is None:
                    continue
                revenue = self._num(row.get("revenue"))
                assets = self._num(row.get("assets"))
                cash_flow = self._num(row.get("cashFlow"))
                if revenue is not None and assets not in {None, 0}:
                    asset_turnover_series.append({"period": str(parsed_dt.year), "value": round(revenue / assets, 2)})
                if revenue not in {None, 0} and cash_flow is not None:
                    cash_flow_margin_series.append({"period": str(parsed_dt.year), "value": round((cash_flow / revenue) * 100.0, 2)})

            if not current_ratio_series and self._num(metrics.get("currentRatio")) is not None:
                current_ratio_series = [{"period": point.get("period") or str(2021 + idx), "value": round(float(metrics["currentRatio"]), 2)} for idx, point in enumerate((asset_turnover_series or [{"period": str(2021 + idx)} for idx in range(5)]))]
            if not debt_equity_series and self._num(metrics.get("debtToEquity")) is not None:
                debt_equity_series = [{"period": point.get("period") or str(2021 + idx), "value": round(float(metrics["debtToEquity"]), 2)} for idx, point in enumerate((asset_turnover_series or [{"period": str(2021 + idx)} for idx in range(5)]))]

            normalized["liquidity"] = [
                {
                    "label": "Current Ratio",
                    "average3Y": average_from_series(current_ratio_series),
                    "series": current_ratio_series[-5:],
                },
                {
                    "label": "Debt to Equity",
                    "average3Y": average_from_series(debt_equity_series),
                    "series": debt_equity_series[-5:],
                },
                {
                    "label": "Asset Turnover",
                    "average3Y": average_from_series(asset_turnover_series),
                    "series": asset_turnover_series[-5:],
                },
                {
                    "label": "Operating CF Margin",
                    "average3Y": average_from_series(cash_flow_margin_series),
                    "series": cash_flow_margin_series[-5:],
                },
            ]

        for group in ("profitability", "valuation", "liquidity"):
            normalized[group] = [card for card in normalized.get(group, []) if not card_is_blank(card)]

        return normalized

    def _build_financial_growth_snapshot(
        self,
        trendlyne_financials: dict[str, Any] | None,
        financials: dict[str, Any] | None,
        returns_summary: list[dict[str, Any]],
        dividends: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        annual_consolidated = trendlyne_financials.get("annualConsolidated") or [] if isinstance(trendlyne_financials, dict) else []
        annual_standalone = trendlyne_financials.get("annualStandalone") or [] if isinstance(trendlyne_financials, dict) else []
        annual_rows = annual_consolidated if annual_consolidated else annual_standalone
        basis = "consolidated" if annual_consolidated else "standalone"

        if not annual_rows and isinstance(financials, dict):
            yearly_rows = financials.get("yearly") or []
            annual_rows = [
                {
                    "period": row.get("period"),
                    "totalRevenue": row.get("revenue"),
                    "netProfit": row.get("profit"),
                    "dividend": None,
                }
                for row in yearly_rows
                if isinstance(row, dict) and row.get("period")
            ]
            basis = "standalone"
        if not annual_rows:
            return None

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
