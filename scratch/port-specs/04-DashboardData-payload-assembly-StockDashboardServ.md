# DashboardData payload assembly — StockDashboardService.get_dashboard (backend/app/services/dashboard.py) + GET /stocks/{symbol}/dashboard (backend/app/api/v1/endpoints/stocks.py)

# DashboardData Assembly Spec

Source of truth:
- `C:\Users\KRISH\Desktop\Finance-V2\backend\app\services\dashboard.py` — `StockDashboardService.get_dashboard` (lines 248–618) and helpers.
- `C:\Users\KRISH\Desktop\Finance-V2\backend\app\api\v1\endpoints\stocks.py` — `get_stock_dashboard` endpoint (lines 814–857) and enrichment helpers (lines 26–372).
- Base/default shape: `C:\Users\KRISH\Desktop\Finance-V2\backend\app\services\sample_data.py` — `get_sample_dashboard`.

---

## 1. HTTP endpoint, query params, and response ENVELOPE

`GET /stocks/{symbol}/dashboard` (`get_stock_dashboard`, stocks.py:814).

Query params:
- `timeframe: str = "5Y"`
- `refresh: bool = False`
- `exchange: str = "NSE"` (normalized: `str(exchange or "NSE").strip().upper()`)

Cache keys:
- `cache_key = f"dashboard:{symbol.upper()}:{timeframe}:{normalized_exchange}"`
- `stale_key = f"dashboard:last:{symbol.upper()}:{timeframe}:{normalized_exchange}"`

The response is ALWAYS a JSON object with `data` plus optional flags. The exact envelope variants:

| Scenario | Returned object |
|---|---|
| Cache HIT (refresh=False, key present) | `{"cached": True, "data": <cached>}` |
| Fresh build success | `{"cached": False, "data": <data>}` |
| Build failed, stale exists | `{"cached": True, "stale": True, "data": <stale>}` |
| Build failed, no stale | `{"cached": True, "stale": True, "fallback": True, "warning": "Live dashboard data timed out. Showing fallback data.", "data": <sample>}` |

Other endpoints (siblings, same file) use the same envelope vocabulary: `cached`, `stale`, plus `index-heatmap`/`market-news` spread payload fields, `screener` uses `{results, count, cached}`. There is no `warning`/`fallback` outside the dashboard error path.

### Endpoint control flow (exact)
1. `cached = redis_cache.get_json(cache_key) if not refresh else None`.
2. If `cached`:
   - `cached = _enrich_score_explanations(symbol, cached, allow_gemini=False)` (sync heuristic enrichment only — never blocks on Gemini).
   - If `_dashboard_needs_ai_refresh(cached)` is True, fire-and-forget `asyncio.create_task(_refresh_dashboard_cache(...))`.
   - **Re-write both caches**: `set_json(cache_key, cached, ttl=settings.cache_ttl_seconds)` and `set_json(stale_key, cached, ttl=7 days)`. (Sliding-TTL side effect — see gotchas.)
   - Return `{"cached": True, "data": cached}`.
3. Else (miss / refresh=True): `data = await asyncio.wait_for(dashboard_service.get_dashboard(symbol, timeframe, exchange=normalized_exchange), timeout=12)`.
   - `data = _enrich_score_explanations(symbol, data, allow_gemini=False)`.
   - `set_json(cache_key, data, ttl=settings.cache_ttl_seconds)`, `set_json(stale_key, data, ttl=7 days)`.
   - If `settings.gemini_api_key` non-empty: fire background `_refresh_dashboard_cache(...)` (the only path that calls Gemini, allow_gemini=True, timeout=55s internally).
   - Return `{"cached": False, "data": data}`.
4. On ANY exception (incl. timeout AND the `ValueError` raised by `_has_live_dashboard_core`):
   - If `stale = get_json(stale_key)`: fire background refresh, return `{"cached": True, "stale": True, "data": stale}`.
   - Else: fire background refresh, build `fallback = get_sample_dashboard(symbol)`, set `fallback["timeframe"]=timeframe`, run `_enrich_score_explanations(allow_gemini=False)`, `set_json(stale_key, fallback, ttl=30 min)`, return the `fallback:True` envelope above.

### TTLs (summary)
- `cache_key`: `settings.cache_ttl_seconds` (configurable).
- `stale_key`: `60*60*24*7` = 7 days (or 30 min for the sample fallback).
- Background `_refresh_dashboard_cache`: writes `cache_key` (cache_ttl_seconds) and `stale_key` (7 days).

### AI enrichment (post-build, applied to `data` in place)
`_enrich_score_explanations` runs three steps:
- `_enrich_profile_details`: regex-extracts `incorporationYear` (`incorporated in (YYYY)`) and `headquarters` (`headquartered in ...`) from `profile.description`; if still missing AND `allow_gemini` AND key set, calls `ai_adapter.extract_profile_details` (timeout 12s) to fill `incorporationYear`/`headquarters`/`chairman`/`previousName`. Defaults `chairman`/`previousName` to `"N/A"`.
- `_enrich_smart_score_explanation`: sets `smartScore.methodology` (default text), computes `weak_hint` = lowest-scoring dimension; if Gemini enabled+allowed and current `aiExplanation` missing or `aiSource != "gemini"`, regenerates via `ai_adapter.explain_smart_score`; otherwise falls back to existing text or a templated sentence. Sets `aiSource` to `"gemini"` or `"fallback"`. Text run through `_to_plain_language_ai_text` (jargon replacement, ≤220 char trim, forced "invest slowly/weak part" closer).
- `_enrich_risk_score_explanation`: symmetric; sets `riskScore.methodology`, `high_hint` = highest component, regenerates via `ai_adapter.explain_risk_score`, `_to_plain_language_risk_text`.

`_dashboard_needs_ai_refresh` returns True if profile fields missing OR smart/risk `aiExplanation` empty OR `aiSource != "gemini"`.

---

## 2. `get_dashboard(symbol, timeframe="5Y", exchange=None)` — assembly order

### 2a. Normalize symbol/exchange (lines 249–256)
- `base_symbol` = strip `.NS`/`.BO`, strip, upper.
- `requested_exchange` = explicit param uppercased; if empty → `"BSE"` if input ends with `.BO` else `"NSE"`.
- Seed payload: `data = get_sample_dashboard(symbol=base_symbol)`, then `data["symbol"]=base_symbol`, `data["exchange"]=requested_exchange`.

### 2b. Provider fan-out: `_fetch_provider_data` (lines 645–683)
Computes `history_days = max(_timeframe_days(timeframe), 1825)` and `market_symbol = f"{base}.BO"` for BSE else `base`. `_timeframe_days`: `{1D:1,1W:7,1M:30,1Y:365,5Y:1825}` default 1825.

Builds a list of (coroutine, per-call-timeout-seconds), wraps each in `asyncio.create_task(_safe_provider_call(coro, timeout))`, then `done,pending = await asyncio.wait(tasks, timeout=12)`. Pending tasks are cancelled; results gathered **positionally** in this EXACT order (None on failure/timeout/cancel):

| # | Provider call | per-call timeout | Feeds |
|---|---|---|---|
| 0 | `get_nse_quote(base)` | 5 | price (cmp/change/52wk), metrics (peRatio/industryPe/faceValue/outstandingShares) — only when exchange != BSE |
| 1 | `get_nse_corporate_events(base)` | 7 | `corporateActions` |
| 2 | `get_nse_quarterly_results(base)` | 7 | `financials.quarterly*` |
| 3 | `get_news(f"{base} India stock")` | 5 | company `news` (api side) |
| 4 | `get_yahoo_quote(market_symbol)` | 5 | price fallback, metrics (marketCap/PE/dividendYield) |
| 5 | `get_yahoo_candles(base or market w/o .BO, history_days)` | 7 | candles (3rd choice) |
| 6 | `get_yfinance_bundle(market_symbol, history_days)` | 10 | intraday, candles(2nd), quote, metrics, financials, profile, shareholding, news |
| 7 | `get_fmp_quote(market_symbol)` | 5 | price fallback, companyName |
| 8 | `get_fmp_candles(market_symbol, "5Y")` | 7 | candles (1st choice / primary) |
| 9 | `get_fmp_quarterly_results(market_symbol)` | 7 | `financials.fmpQuarterly` |
| 10 | `get_fmp_profile(market_symbol)` | 5 | `profile` enrichment, sector |
| 11 | `get_fmp_key_metrics(market_symbol)` | 6 | `fmpKeyMetrics`, metrics backfill |
| 12 | `get_fmp_financial_growth(market_symbol)` | 6 | `fmpFinancialGrowth`, growthSnapshot |
| 13 | `get_fmp_analyst_estimates(market_symbol)` | 5 | `analystEstimates` |
| 14 | `get_trendlyne_brokerage(base)` | 6 | `brokerageResearch` |
| 15 | `get_trendlyne_financials(base)` | 8 | financials override + keyRatioTrends + statement tables |
| 16 | `get_trendlyne_shareholding(base)` | 6 | `shareholding` |
| 17 | `get_trendlyne_documents(base)` | 9 | `documents` |

`_safe_provider_call` = `asyncio.wait_for(coro, timeout)`; on TimeoutError/Exception logs and returns None. **Parallel** (all started together); the 12s `asyncio.wait` is a hard global wall on top of per-call timeouts.

### 2c. Candle selection + price history (lines 280–323)
- `selected_candles = fmp_candles or yfinance_bundle.candles or yahoo_candles` (FMP primary by design).
- If `yfinance_bundle.intraday` → `price.intraday`.
- If candles: `history = _normalize_history(selected)`, set `price.history`. If ≥2 rows with closes, derive `price.cmp` (last close), `price.change` (last−prev), `price.changePercent` ((last−prev)/prev*100). 52-week low/high from last 252 closes (min/max).
- NSE quote (only if `requested_exchange != "BSE"`): overrides cmp/change/changePercent/52wkLow/52wkHigh and metrics peRatio/industryPe/faceValue/outstandingShares when present.

### 2d. Quote/metrics fallbacks (lines 325–411)
- `yahoo_quote` (if present): price cmp/change/changePercent applied **only `if not nse_quote`**; ALWAYS — `metrics.marketCap = marketCap/10_000_000` (→ crore), `metrics.peRatio = trailingPE`, `metrics.dividendYield = trailingAnnualDividendYield*100`.
- `yfinance_bundle`: quote applied `if not nse_quote` for cmp/change/changePercent; 52wk low/high applied always when present. `metrics` map: copies any present of [marketCap, peRatio, industryPe, pegRatio, pbRatio, bookValue, eps, ebitdaMargin, dividendYield, roe, roce, roa, debtToEquity, totalDebt, faceValue, outstandingShares, currentRatio, evToSales]. `financials` keys [quarterly, yearly, incomeStatement, balanceSheet, cashFlow] copied if present. `profile` fills companyName/sector/industry/description/website/chairman/previousName. `shareholding.update(...)` if promoters>0 or fii>0.
- `fmp_quote`: price applied `if not nse_quote`; sets `companyName` if `name` present.

### 2e. FMP profile / key metrics / growth / analyst (lines 413–482)
- `fmp_profile`: fills description/website/industry/sector **only if currently empty**; always sets ceo/employees/ipoDate/country if present.
- `fmp_key_metrics`: `data["fmpKeyMetrics"] = fmp_key_metrics`; backfills from row[0] (only when target metric falsy/absent): evToEbitda, pe, pb, roe, roa, roic, debtToEquity, currentRatio; always sets freeCashFlowPerShare/freeCashFlowYield/earningsYield/netDebtToEBITDA/priceToSales.
- `fmp_financial_growth`: `data["fmpFinancialGrowth"]=...`; sets `financials.growthSnapshot` from row[0] (revenueGrowth/netIncomeGrowth/epsGrowth/freeCashFlowGrowth/operatingIncomeGrowth).
- `fmp_analyst_estimates`: `data["analystEstimates"] = ...`.

### 2f. News (lines 484–491)
`data["news"] = _build_company_news(symbol, companyName, sector, profile.industry, yahoo_news=yfinance_bundle.news, api_news=news_data)`. Scores each candidate for relevance (symbol/company token/sector/industry buckets), keeps `_bucket=="stock"` rows preferentially, dedupes by url|title, attaches `sentimentScore` (`_simple_sentiment_score`, 0.5 ± keyword weights, clamped 0–1), sorts by (relevance, publishedAt) desc, returns top 10 of `{title,source,publishedAt,url,summary,sentimentScore}`.

### 2g. Brokerage / corporate actions / quarterly chain (lines 493–557)
- `trendlyne_brokerage` → `brokerageResearch`.
- `nse_events` → `corporateActions`.
- Quarterly override CHAIN (later wins): NSE quarterly fills quarterly*+sets `quarterly` to consolidated||standalone → FMP sets `fmpQuarterly`, and fills `quarterly`/`quarterlyConsolidated` only if NSE absent → Trendlyne OVERWRITES quarterlyConsolidated/Standalone/Detailed* and `quarterly`, and sets `keyRatioTrends = ratioTrendsConsolidated || ratioTrendsStandalone`.
- `trendlyne_shareholding` → `shareholding.update`.
- `shareholding = _normalize_shareholding(...)` (infer public, cap to 100, promote latest history row).
- `_backfill_quarterly_financials(financials)`: trims quarterly*/quarterly to last 4 `{period,revenue,profit}`; derives summaries from Detailed* (totalRevenue/netProfit) when summaries empty.
- `_backfill_statement_tables(financials, trendlyne_financials)`: cleans yearly/incomeStatement/balanceSheet/cashFlow and synthesizes them from Trendlyne annualConsolidated||annualStandalone when missing.
- `trendlyne_documents` → `documents.update`.

### 2h. competitors reset (lines 559–565)
`data["competitors"]` ALWAYS reset to `{table:[], sectorName, industryName, sectorCompanies:[], industryCompanies:[]}`. (No peers populated by this path.)

### 2i. Derived/computed sections (lines 567–615) — order matters
1. If `price.change` is None but changePercent+cmp present → derive change = `cmp*pct/(100+pct)` (or `cmp*pct/100` if denom ~0).
2. `metrics = _finalize_key_metrics(metrics, price, financials, competitors)` (see §3).
3. `returnsSummary = _returns_summary(price.history)` (see §4).
4. `returnsHeatmap = _returns_heatmap(price.history)` (see §5).
5. `financials.keyRatioTrends = _finalize_key_ratio_trends(keyRatioTrends, metrics, financials, price.history, sector)` (see §6).
6. `metrics = _enrich_metrics_from_ratio_trends(metrics, keyRatioTrends)` (fills casaRatio/netInterestMargin from liquidity cards).
7. `growthSnapshot = _build_financial_growth_snapshot(trendlyne_financials, financials, returnsSummary, dividends)`; assigned to `financials.growthSnapshot` if truthy (see §7).
8. `technicals = _derive_technicals_from_history(price.history)` (see §8).
9. `price.aiTarget = _calculate_predictive_target(history, metrics, technicals, price.cmp)` (see §9).
10. `smartScore = compute_smart_score(metrics, technicals, financials, price_history, returns_summary, news_items, corporate_actions, shareholding)` (external, app.services.scoring).
11. `riskScore = compute_risk_score(news, metrics, technicals, price_history, financials, brokerage_research)` (external).
12. `data["timeframe"] = timeframe`.
13. `if not _has_live_dashboard_core(data): raise ValueError(...)` (see §10).

---

## 3. `_finalize_key_metrics` (lines 1303–1400)
Operates on a copy of `metrics`. Derivations (each only when target missing):
- `outstandingShares = marketCap / cmp` (cmp>0) if missing.
- `marketCap = outstandingShares * cmp` if missing.
- `pbRatio = cmp / bookValue` (bookValue>0) if missing; `bookValue = cmp / pbRatio` (pb>0) if missing.
- `industryPe = mean(peer pe>0)` if missing AND competitor rows exist (effectively never, since competitors reset empty).
- `pegRatio = pe / growth_pct` if missing AND pe present AND ≥5 quarterly rows AND profit growth ((q[-1].profit − q[-5].profit)/q[-5].profit*100) > 0.01.
- Sanity fixes: dividendYield>100 → /100, <0 → None; debtToEquity>10 → /100; evToSales>100 → None; profitMargin derived from Detailed* `netProfitMarginPct` or keyRatioTrends "NPM" card if missing; pegRatio kept only if 0.2<peg≤10 else None.
- Final pass: every value rounded to 2 dp, non-numeric → None.

`_enrich_metrics_from_ratio_trends`: fills `casaRatio` and `netInterestMargin` from the latest series value (or average3Y) of matching liquidity cards "CASA Ratio"/"Net Interest Margin".

---

## 4. `returnsSummary` — `_returns_summary` (lines 1436–1458)
`closes = [r.close for r in history if close not None]`. Returns `[]` if `len(closes) < 5`. For each label, `pct(days)`: None if `len(closes) <= days`; else `idx = len-days-1`, `value = round((closes[-1]-closes[idx])/closes[idx]*100, 2)` (None if base 0).

Output list (fixed order, trading-day lookbacks):
- `{"label":"1 Week","value":pct(5)}`
- `{"label":"1 Month","value":pct(21)}`
- `{"label":"6 Months","value":pct(126)}`
- `{"label":"1 Year","value":pct(252)}`
- `{"label":"3 Years","value":pct(756)}`
- `{"label":"5 Years","value":pct(1260)}`

---

## 5. `returnsHeatmap` — `_returns_heatmap` (lines 2256–2273)
Group closes by `dt.year` → `dt.month`. For the 5 most-recent years (sorted desc): row = `{"year": <int>}`; for month 1..12, `row[str(month)] = round((last_close_in_month − first_close_in_month)/first*100, 2)` or None when <2 points in that month. Returns list of such rows (newest year first).

---

## 6. `keyRatioTrends` — `_finalize_key_ratio_trends` (lines 1460–1677)
Starts from existing (Trendlyne) `{profitability, valuation, liquidity}`, cloning each card to `{label, average3Y, series:[{period,value}]}`.

Always attempts:
- valuation card **"Price to Cash Flow"** (only if blank): for last 5 cashFlow rows, `value = (close_at_fiscal_end * sharesOutstanding) / operatingCashFlow`; average3Y = mean of last 3.
- liquidity card **"NET NPA"** (only if blank): from Detailed* `netNpa` (last 5); average3Y = mean last 3.

Sector branch (`sector` lowercased contains financial/bank/insurance ⇒ financial):
- **Non-financial**: REPLACES `liquidity` entirely with 4 cards built from balanceSheet/yearly:
  - "Current Ratio" = currentAssets/currentLiabilities (per year).
  - "Debt to Equity" = totalDebt/equity.
  - "Asset Turnover" = revenue/assets.
  - "Operating CF Margin" = cashFlow/revenue*100.
  - Each series capped to last 5; `average3Y = mean(last 3 values)`. If a series is empty but metrics has currentRatio/debtToEquity, a flat synthetic series is built.
- **Financial**: keeps provider liquidity cards + the synthesized NET NPA / Price-to-CF cards.

Finally drops blank cards from each of profitability/valuation/liquidity.

`card_is_blank` = average3Y ~0 AND all series values ~0/empty.

---

## 7. `financials.growthSnapshot` — `_build_financial_growth_snapshot` (active copy lines 1874–2008)
Source rows = Trendlyne annualConsolidated (basis "consolidated") else annualStandalone (basis "standalone") else mapped from `financials.yearly` (basis "standalone"). Returns None if no annual rows.
- 1-year change: `(latest−prev)/prev*100` (both >0).
- N-year CAGR: `((latest/base)**(1/years) − 1)*100`.
- Dividends aggregated by year (from corporateActions dividends `dividendAmount` + exDate/recordDate/date); growth from yearly totals when annual `dividend` key absent.
- `returns_cagr(years)`: from returnsSummary "1 Year"/"3 Years"/"5 Years"; year=1 returns total return as-is; else CAGR of `(1+ret/100)`.
- Output: `{"basis": <consolidated|standalone>, "periods": [{label:"1 Year CAGR", metrics:[{Revenue Growth},{Net Profit Growth},{Dividend Growth},{Stock Returns CAGR}]}, {3 Year CAGR ...}, {5 Year CAGR ...}]}`. Returns None if all metric values are None.

(NOTE: a corrupted DUPLICATE first definition exists ~1679–1872; the later clean one wins — see gotchas.)

---

## 8. `technicals` — `_derive_technicals_from_history` (lines 737–792)
Inputs: closes/highs/lows lists.

Pivots use the previous completed bar (index −2 if >1 bar, else −1): `P=(H+L+C)/3`, `diff=H−L`.
- **standard**: s3=`L−2*(H−P)`, s2=`P−diff`, s1=`2P−H`, pivot=`P`, r1=`2P−L`, r2=`P+diff`, r3=`H+2*(P−L)`.
- **fibonacci**: s3=`P−diff`, s2=`P−0.618*diff`, s1=`P−0.382*diff`, pivot=`P`, r1=`P+0.382*diff`, r2=`P+0.618*diff`, r3=`P+diff`.
- All rounded 2dp; if no bars, pivots stay all-0.0.

If `len(closes) < 20`: returns ONLY `{"trend":"Neutral", "pivotLevels":pivots}` (no rsi/ema/macd keys).

Else:
- `ema20 = _ema(closes,20)`, `ema50 = _ema(closes,50)` (or ema20 if <50 closes).
- `rsi14 = _rsi(closes,14)`.
- `macd = _ema(closes,12) − _ema(closes,26)` if ≥26 closes else `0.0`.
- `trend = "Bullish" if closes[-1] >= ema20 else "Bearish"`.
- Output: `{rsi14, ema20, ema50, macd (all round 2), trend, pivotLevels}`.

`_ema(values,period)`: `k=2/(period+1)`, `ema=values[0]`, iterate `ema = v*k + ema*(1−k)` over remaining (running EMA over full history, seeded with first value — not a trailing SMA-seeded window).

`_rsi(values,period)`: returns 50.0 if `len<=period`. gains/losses from diffs; `avg_gain/avg_loss` = mean of first `period`, then Wilder smoothing `(avg*(period−1)+x)/period`; returns 100.0 if avg_loss==0; else `100 − 100/(1+avg_gain/avg_loss)`.

---

## 9. `price.aiTarget` — `_calculate_predictive_target` (lines 794–836)
- If `history<252` or cmp invalid: return `cmp*1.12**3` (or 0.0).
- Else base CAGR from full history: `total_return = cmp/oldest_close`, `years = len/252`, `base_cagr = total_return**(1/years) − 1` (0.12 if invalid).
- Heuristics: pe<15 → +0.02, pe>40 → −0.02; trend Bullish → +0.01, Bearish → −0.01. pe>50 → cap 0.10; pe<0 → cap 0.05.
- Blend: `final = 0.6*final + 0.4*0.10`; clamp `[-0.10, 0.30]`.
- Return `round(cmp*(1+final)**3, 2)` (3-year forward value).

---

## 10. Graceful degradation — what's optional + defaults

Base defaults come from `get_sample_dashboard` (sample_data.py); any section whose provider returns None keeps its default:
- `companyName`/`sector` → symbol / "" until a provider fills them.
- `profile.*` → empty/"N/A"; enriched by yfinance/fmp/regex/Gemini.
- `price` → all 0.0, `history:[]`, `currency:"INR"`; filled from candles + NSE/yahoo/yfinance/fmp.
- `metrics` → all None; filled from NSE/yahoo/yfinance/fmp + finalize derivations.
- `financials.*` → empty lists; `growthSnapshot:{basis:"consolidated",periods:[]}`; `keyRatioTrends:{profitability:[],valuation:[],liquidity:[]}`.
- `corporateActions`/`documents` → empty lists; filled by NSE events / Trendlyne docs only.
- `shareholding` → zeros + empty history; filled by yfinance/Trendlyne, always normalized.
- `brokerageResearch` → Trendlyne skeleton (`summary` all 0, `reports:[]`) until Trendlyne fills it.
- `news` → []; built from yfinance + NewsAPI news, may be [] if nothing relevant.
- `competitors` → ALWAYS the empty skeleton.
- `technicals` → Neutral skeleton (rsi14/macd/ema 0.0, pivots all 0.0) when <20 closes; partial (pivots + Neutral) and only pivots+trend when <20.
- `returnsSummary` → [] when <5 closes; `returnsHeatmap` → [] when no history.
- `smartScore`/`riskScore` → computed by scoring module; explanations layered after.

**Hard gate**: `_has_live_dashboard_core(data)` (lines 620–643) — returns True (i.e. dashboard considered usable) if `(cmp>0 AND (≥30 history OR ≥2 history OR real companyName)) OR has_news OR has_documents (annualReports/investorPresentations/creditRatings/exchangeFilings) OR has_corporate_actions (boardMeetings/dividends/bonusIssues/stockSplits/insiderTrades)`. If False, `get_dashboard` RAISES `ValueError`, which the endpoint converts into the stale/sample fallback envelope. This is the deliberate "partial dashboard rather than hard-fail" design noted in the code comments.

---

## 11. Final top-level DashboardData shape (keys present after a full build)
```
{
  symbol, companyName, exchange, sector, timeframe,
  profile: {incorporationYear, headquarters, website, description, chairman, previousName, industry, ceo?, employees?, ipoDate?, country?},
  price: {cmp, change, changePercent, currency, fiftyTwoWeekLow, fiftyTwoWeekHigh, history:[{date,open,high,low,close,volume}], intraday?, aiTarget},
  metrics: { ...sample keys (marketCap,peRatio,industryPe,pegRatio,pbRatio,bookValue,roe,roce,roa,ebitdaMargin,casaRatio,netInterestMargin,debtToEquity,totalDebt,dividendYield,eps,faceValue,outstandingShares,currentRatio,evToSales,profitMargin) plus fmp-derived (evToEbitda,pe,pb,roic,freeCashFlowPerShare,freeCashFlowYield,earningsYield,netDebtToEBITDA,priceToSales) — all 2dp or None },
  financials: {quarterly, quarterlyStandalone, quarterlyConsolidated, quarterlyDetailedStandalone, quarterlyDetailedConsolidated, fmpQuarterly?, growthSnapshot, keyRatioTrends:{profitability,valuation,liquidity}, yearly, incomeStatement, balanceSheet, cashFlow},
  corporateActions: {boardMeetings,dividends,bonusIssues,stockSplits,rightsIssues,agmEgm,deals,bulkDeals,blockDeals,insiderTrades},
  documents: {annualReports,investorPresentations,creditRatings,exchangeFilings},
  shareholding: {quarter,promoters,fii,dii,public,history,topHolders,sourceUrl},
  brokerageResearch: {source,sourceUrl,updatedAt,summary,reports},
  news: [{title,source,publishedAt,url,summary,sentimentScore}],
  competitors: {table:[], sectorName, industryName, sectorCompanies:[], industryCompanies:[]},
  technicals: {rsi14?,macd?,ema20?,ema50?,trend,pivotLevels:{standard,fibonacci}},
  returnsSummary: [{label,value}],
  returnsHeatmap: [{year, "1".."12"}],
  fmpKeyMetrics?, fmpFinancialGrowth?, analystEstimates?,
  smartScore: {score,label,dimensions,methodology,aiExplanation,aiSource,...},
  riskScore: {score,label,components,methodology,aiExplanation,aiSource,...}
}
```


## External APIs

### NSE (via providers.get_nse_quote / get_nse_corporate_events / get_nse_quarterly_results)
- URL: `internal: MarketDataProviders.get_nse_quote(base_symbol) etc.`
- Called only with base_symbol (NSE-oriented). Per-call timeouts 5/7/7s. NSE quote used as PRIMARY for live price + select metrics, applied only when requested_exchange != 'BSE'. Actual HTTP endpoints/headers live in app/services/providers.py (not in dashboard.py).

### Yahoo Finance (providers.get_yahoo_quote / get_yahoo_candles)
- URL: `internal: get_yahoo_quote(market_symbol); get_yahoo_candles(base or market w/o .BO, history_days)`
- Quote fields regularMarketPrice/Change/ChangePercent used as price fallback only if no NSE quote. marketCap divided by 10,000,000 -> crore; trailingPE -> peRatio; trailingAnnualDividendYield*100 -> dividendYield. Candles are 3rd-choice source. BSE uses ^BSESN in ticker tape path.

### yfinance bundle (providers.get_yfinance_bundle)
- URL: `internal: get_yfinance_bundle(market_symbol, history_days)`
- Returns dict with keys candles/intraday/quote/metrics/financials/profile/shareholding/news. Candles are 2nd-choice. Wide metrics map copied. Per-call timeout 10s.

### Financial Modeling Prep (providers.get_fmp_* )
- URL: `internal: get_fmp_quote / get_fmp_candles(market,'5Y') / get_fmp_quarterly_results / get_fmp_profile / get_fmp_key_metrics / get_fmp_financial_growth / get_fmp_analyst_estimates(market_symbol)`
- FMP candles are the PRIMARY chart source (always requested with literal '5Y'). FMP quote is strict price fallback. key_metrics/financial_growth/analyst_estimates feed fmpKeyMetrics/fmpFinancialGrowth/analystEstimates plus metric backfills. market_symbol uses .BO suffix for BSE.

### Trendlyne (providers.get_trendlyne_*)
- URL: `internal: get_trendlyne_brokerage / get_trendlyne_financials / get_trendlyne_shareholding / get_trendlyne_documents(base_symbol)`
- Called with base_symbol. Trendlyne financials OVERRIDE NSE/FMP quarterly tables and provide keyRatioTrends + annualConsolidated/Standalone used for statement-table backfill and growthSnapshot. Shareholding merged + normalized. Documents merged into documents section.

### News (providers.get_news, plus get_google_market_news + enrich_news_images for market-news)
- URL: `internal: get_news(f'{base} India stock') for dashboard; get_news/get_google_market_news for /market-news`
- Dashboard company news merges yfinance bundle news + NewsAPI results via _build_company_news. Market-news endpoint (separate) merges NewsAPI + Google News, dedupes, enriches images. Sentiment computed locally (no API).

### Gemini (via ai_adapter in endpoint layer)
- URL: `internal: ai_adapter.extract_profile_details / explain_smart_score / explain_risk_score`
- Only called in the endpoint enrichment layer, and only with allow_gemini=True (background _refresh_dashboard_cache) when settings.gemini_api_key is set; each guarded by asyncio.wait_for timeout 12s. Foreground responses pass allow_gemini=False.


## Gotchas
- Endpoint cache-HIT path re-writes both cache_key and stale_key TTLs on every read (sliding window) -> cached dashboards effectively never expire while actively read.
- Outer endpoint wait_for(get_dashboard, timeout=12) and inner provider asyncio.wait(timeout=12) share the same 12s budget; background refresh uses timeout=55s and is the only Gemini-calling path.
- Foreground enrichment is always allow_gemini=False; Gemini text/profile only appear after background _refresh_dashboard_cache completes (and only if gemini_api_key set on a fresh build, or _dashboard_needs_ai_refresh on a cache hit).
- _has_live_dashboard_core raises ValueError inside get_dashboard when no meaningful live data; the endpoint catches it and serves stale or get_sample_dashboard with fallback:true + warning. get_dashboard never returns a near-empty payload.
- Provider fan-out is fully parallel; each call has its own per-call timeout AND a 12s global asyncio.wait wall. Pending-at-12s tasks are cancelled -> their result slot is None and that section keeps its sample default.
- Results returned as a positional 18-tuple in exact call order; unpacking must stay aligned with the calls list. Any None = that provider failed/timed out.
- Candle precedence: FMP -> yfinance.candles -> yahoo_candles (FMP primary for charts). Live PRICE quote precedence: NSE primary (only when exchange!=BSE); yahoo/yfinance/fmp quote fields applied only `if not nse_quote`. yfinance 52wk low/high and yahoo marketCap/PE/dividend applied regardless of nse_quote.
- Unit conversions: yahoo marketCap /10,000,000 (->crore); yahoo trailingAnnualDividendYield *100 (fraction->percent). dividendYield>100 -> /100; debtToEquity>10 -> /100; evToSales>100 -> None; pegRatio kept only if 0.2<peg<=10.
- _derive_technicals_from_history uses bar index -2 (previous completed) for pivots. With <20 closes returns ONLY {trend:'Neutral', pivotLevels} (rsi14/ema/macd keys ABSENT). <26 closes -> macd=0.0; <50 closes -> ema50=ema20.
- _ema is a non-standard running EMA over the WHOLE history seeded with values[0] (no SMA seed, no trailing window). _rsi uses Wilder smoothing seeded from first `period` diffs, returns 50.0 if too short, 100.0 if avg_loss==0.
- _returns_summary returns [] if <5 closes; per-bucket None if history shorter than lookback. Lookbacks are trading-day counts 5/21/126/252/756/1260; pct compares closes[-1] vs closes[len-days-1].
- _returns_heatmap keeps the 5 newest calendar years; month value = (last-first close in month)/first*100, None if <2 points; keys are stringified months '1'..'12' + int 'year'.
- Shareholding normalized: public inferred = 100-(promoters+fii+dii) when missing/<=0, trimmed if total>100.5; latest history row (index 0) promoted to top-level fields.
- Quarterly override CHAIN where later sources win: NSE -> FMP (only fills if NSE absent, but always sets fmpQuarterly) -> Trendlyne (overwrites). Then backfill trims to last 4 and derives from Detailed*; statement tables synthesized from Trendlyne annual rows.
- competitors is ALWAYS reset to empty skeleton just before metric finalize, so industryPe peer-averaging never gets peers from this path; competitor table is not populated by get_dashboard.
- _finalize_key_metrics rounds all metrics to 2dp / None at the end and applies several unit-sanity corrections (see above).
- _finalize_key_ratio_trends REBUILDS liquidity entirely for non-financial sectors (Current Ratio/Debt to Equity/Asset Turnover/Operating CF Margin) from balanceSheet/yearly, discarding provider liquidity cards; financial sectors instead get synthesized NET NPA + Price to Cash Flow cards. Blank cards dropped.
- DUPLICATE-DEFINITION ARTIFACT: _build_financial_growth_snapshot defined twice (~1679-1872 corrupted, ~1874-2008 clean). Python keeps the LAST class-body def, so the clean one runs; the first copy is dead code that would NameError (references net_npa_card/recent_values/sector) if it executed. Cleanup candidate.
- aiTarget computed after technicals; <252 history -> cmp*1.12^3 shortcut. Otherwise base CAGR from full-history total return, PE+trend heuristics, 60/40 blend with 0.10 anchor, clamp [-0.10,0.30], return cmp*(1+cagr)^3.
- smartScore/riskScore come from app.services.scoring.compute_smart_score / compute_risk_score (fed almost the whole payload); the endpoint then layers methodology + aiExplanation/aiSource with jargon-simplification and a forced 'invest slowly/weak part' closing sentence.
- exchange resolution: base strips .NS/.BO upper; requested_exchange = param else BSE if .BO else NSE. market_symbol = base.BO for BSE else base; yahoo_candles always uses non-.BO base; NSE/Trendlyne always use base_symbol.
- history_days = max(_timeframe_days(timeframe),1825) -> always >=5Y candles requested; FMP candles always '5Y'. timeframe param is echoed to data['timeframe'] and affects yahoo/yfinance day counts, not FMP.