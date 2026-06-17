# providers.py — Corporate Actions, Shareholding, Documents, Brokerage Research, Competitors, News

# providers.py Spec — Corporate Actions, Shareholding, Documents, Brokerage, Competitors, News

File: `C:\Users\KRISH\Desktop\Finance-V2\backend\app\services\providers.py`
Class: `MarketDataProviders`. All blocking HTTP is wrapped via `asyncio.to_thread(...)`. Each `requests`/`httpx` call swallows exceptions and returns `None`/empty or stale cache.

## Shared module constants (verbatim)

```python
NSE_HEADERS = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "accept-language": "en-US,en;q=0.9",
    "accept": "application/json, text/plain, */*",
    "referer": "https://www.nseindia.com/",
    "x-requested-with": "XMLHttpRequest",
}
GOOGLE_NEWS_HEADERS = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "accept-language": "en-US,en;q=0.9",
    "accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
    "referer": "https://news.google.com/",
}
WEB_PAGE_HEADERS = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "accept-language": "en-US,en;q=0.9",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "upgrade-insecure-requests": "1",
}
TRENDLYNE_BASE_URL = "https://trendlyne.com"
```

`self._nse_session` is a shared `requests.Session()` lazily created: `Session()` → `headers.update(NSE_HEADERS)` → prime cookies with `GET https://www.nseindia.com` (timeout 6). On any `401/403`, re-prime `GET https://www.nseindia.com` once, then retry. This cookie-priming pattern repeats in every NSE method.

`self._to_float(value)` — strips commas from strings, `float()`, returns `None` if not finite / on error. Used for nearly all numeric coercion.

---

## Trendlyne symbol → (stock_id, slug) resolution (prerequisite for shareholding / documents / financials / bulk-block deals)

Symbol key normalization everywhere: `symbol.replace(".NS","").replace(".BO","").strip().upper()`.

### `_refresh_trendlyne_equity_map_if_needed()` → builds `_trendlyne_equity_meta_map: {SYMBOL: (stock_id, slug)}`
TTL: 6 hours (`6*60*60`). Two sources merged:
1. `GET https://trendlyne.com/equity-sitemap-stocks.xml` (headers=`WEB_PAGE_HEADERS`, timeout 20). Regex over `<loc>(.*?)</loc>`, then per loc: `r"/equity/(\d+)/([^/]+)/([^/]+)/"` → group1=stock_id, group2=symbol(upper), group3=slug.
2. Fallback from `_trendlyne_symbol_url_map` (research-report map): regex `r"/research-reports/stock/(\d+)/([^/]+)/([^/]+)/"` → stock_id, slug (only if symbol not already present).

### `_resolve_trendlyne_equity_meta(symbol)` 
Refreshes map, then exact key lookup; else normalize both sides via `re.sub(r"[^A-Z0-9]","",...)` and compare.

### `_resolve_trendlyne_stock_report_url(symbol)` + `_refresh_trendlyne_symbol_map_if_needed()` → builds `_trendlyne_symbol_url_map: {SYMBOL: report_url}`
TTL 6h. Two sitemaps merged:
1. `GET https://trendlyne.com/equity-sitemap-stockreports.xml` (headers=`WEB_PAGE_HEADERS`, timeout 15). Per loc: `r"/research-reports/stock/\d+/([^/]+)/"` → symbol; value = the loc URL verbatim.
2. `GET https://trendlyne.com/equity-sitemap-stock-research-reports-posts.xml` (headers=`WEB_PAGE_HEADERS`, timeout 15). Per loc: `r"/research-reports/post/([^/]+)/(\d+)/([^/]+)/"` → symbol, stock_id, slug; value rebuilt as `f"https://trendlyne.com/research-reports/stock/{stock_id}/{symbol}/{slug}/"`. (Overrides #1.)
Resolution: exact match else normalized `[^A-Z0-9]` comparison.

---

## 1. CORPORATE ACTIONS — `get_nse_corporate_events(symbol)` → `_get_nse_corporate_events_sync(symbol)`

`key = symbol.upper()`. Returns dict with these exact keys (all default `[]`):
`boardMeetings, dividends, bonusIssues, stockSplits, rightsIssues, agmEgm, deals, bulkDeals, blockDeals, insiderTrades`.

Date window: `now = datetime.utcnow().date()`; `from_date = (now - timedelta(days=365*3)).strftime("%d-%m-%Y")` (3 years); `to_date = now.strftime("%d-%m-%Y")`.

Helper `safe_get_json(url, params, timeout=4)` uses `self._nse_session.get(...)`; on 401/403 re-primes `GET https://www.nseindia.com` and retries; returns parsed JSON or `None`.

### Six NSE source calls (all via `safe_get_json`, all base `https://www.nseindia.com`):

| Bucket | URL | params |
|---|---|---|
| corporate actions (div/bonus/split/rights/agm) | `https://www.nseindia.com/api/corporates-corporateActions` | `{"index":"equities","symbol":key}` |
| announcements (for announcement-date matching) | `https://www.nseindia.com/api/corporate-announcements` | `{"index":"equities","symbol":key,"from_date":from_date,"to_date":to_date}` |
| board meetings | `https://www.nseindia.com/api/corporate-board-meetings` | `{"index":"equities","symbol":key,"from_date":from_date,"to_date":to_date}` |
| insider trades (PIT) | `https://www.nseindia.com/api/corporates-pit` | `{"index":"equities","symbol":key,"from":from_date,"to":to_date}` (NOTE: `from`/`to`, not `from_date`/`to_date`) |
| bulk deals | `https://www.nseindia.com/api/historicalOR/bulk-block-short-deals` | `{"optionType":"bulk_deals","symbol":key,"from":from_date,"to":to_date}` |
| block deals | `https://www.nseindia.com/api/historicalOR/bulk-block-short-deals` | `{"optionType":"block_deals","symbol":key,"from":from_date,"to":to_date}` |

Response shape handling:
- `corp_json` expected `list` else `[]`.
- `announcements` expected `list` else `[]`.
- `board_json`: if list use as-is; if dict use `data` else `records`; else `[]`.
- `insider_json = insider_raw.get("data", [])` (dict).
- `bulk_json = bulk_raw.get("data", [])`; `block_json = block_raw.get("data", [])`.

### Announcement categorization (`ann_by_category`)
Iterate `announcements`, lower-case `item["desc"]`, append to buckets when substring present: `"dividend"` → dividend; `"bonus"` → bonus; `"split"` → split; `"rights"` → rights; (`"annual general meeting"` OR `"agm"` OR `"egm"`) → agm_egm. (An item can land in multiple.)

`find_announcement_date(category, ex_date, subject)`: scores candidates by strong-match (subject_norm substring of desc_norm or vice-versa via `clean_comp_text` = `re.sub(r"[^a-z0-9]+"," ",lower).strip()`) then by smallest time distance between target ex_date and `an_dt`/`sort_date` (parsed via `parse_event_date`); returns best candidate's `an_dt` or `sort_date` or `"-"`.

### Corporate-action row mapping (iterate `corp_json`)
Per item: `subject_raw = to_text(item["subject"])` (`to_text` = str.strip, returns `""` if `"-"`); `subject = subject_raw.lower()`; `face_value = _to_float(item["faceVal"])`; `ex_date = to_text(item["exDate"])`; `record_date = to_text(item["recDate"]) or to_text(item["bcStartDate"]) or "-"`.

Base row:
```python
{"date": ex_date or record_date or "", "client": item["symbol"] or key,
 "orderType": subject_raw, "announcementDate": "-", "exDate": ex_date or "-",
 "recordDate": record_date or "-", "details": subject_raw or "-",
 "quantity": "-", "price": "-", "exchange": "NSE"}
```
Classification (substring of lowercased subject, in this if/elif order):
- `"dividend"` → adds `type` (via `infer_dividend_type`: combines "Interim"/"Special"/"Final" with " + ", default `"Dividend"`), `announcementDate` (find), `dividendAmount` = sum of rupee values parsed by `r"(?:rs\.?|₹)\s*([0-9]+(?:\.[0-9]+)?)"` (case-insensitive), `dividendPercent` = `(amount/faceValue)*100` if faceValue>0 else None. → `dividends`.
- `"bonus"` → `announcementDate`, `bonusRatio` = `parse_ratio` (`r"(\d+\s*:\s*\d+)"`, spaces stripped, else `"-"`). → `bonusIssues`.
- `"split"` → `announcementDate`, `splitRatio` = `parse_split_ratio` (tries ratio, else `r"from\s*(?:rs\.?|₹)?\s*([0-9.]+)\D+to\s*(?:rs\.?|₹)?\s*([0-9.]+)"` → `face_from:face_to`). → `stockSplits`.
- `"rights"` → `announcementDate`, `rightsRatio` = `parse_rights_ratio` (tries ratio, else `r"(\d+)\s*for\s*(\d+)"` → `"a:b"`). → `rightsIssues`.
- else → if subject contains AGM/EGM terms set `announcementDate`; always append to `agmEgm`.

### Board meetings (iterate `board_json`)
Per item:
```python
{"date": item.get("bm_date") or item.get("bmDate") or item.get("proposedMeetingDate") or item.get("date") or "",
 "client": item.get("sm_name") or item.get("bm_symbol") or item.get("symbol") or key,
 "orderType": item.get("bm_purpose") or "Board Meeting",
 "agenda": item.get("bm_desc") or item.get("bm_purpose") or item.get("purpose") or "Board Meeting",
 "announcementDate": item.get("bm_timestamp") or item.get("sysTime") or "",
 "quantity": "-", "price": "-", "exchange": "NSE"}
```
Sort desc by `(parse_event_date(date), parse_event_date(announcementDate), len(agenda))`; then dedupe by `date` (keep first/most-detailed per date).

### Insider trades (iterate `insider_json`)
`bq=str(item["buyQuantity"])`, `sq=str(item["sellQuantity"])`. `transactionType = "Buy"` if bq truthy and not in `["0","0.00","-"]` else `"Sell"` if sq similar else `"Unknown"`. `quantity = bq if Buy else sq if Sell else "-"`.
```python
{"date": item.get("date") or "", "client": item.get("acqName") or item.get("company") or key,
 "orderType": item.get("acqMode") or item.get("acqtoDt") or "Insider Trade",
 "transactionType": t_type, "quantity": qty, "price": item.get("secVal") or "-", "exchange": "NSE"}
```

### Bulk deals (iterate `bulk_json`) — NSE field names
```python
{"date": item.get("BD_DT_DATE") or "", "client": item.get("BD_CLIENT_NAME") or key,
 "orderType": item.get("BD_BUY_SELL") or "Bulk Deal", "dealType": "Bulk",
 "quantity": item.get("BD_QTY_TRD") or "-", "price": item.get("BD_TP_WATP") or "-", "exchange": "NSE"}
```
### Block deals (iterate `block_json`) — same fields, `"Block Deal"`/`"dealType":"Block"`.

### Trendlyne deal override (FALLBACK/OVERRIDE)
Calls `_get_trendlyne_bulk_block_deals_sync(key)`. If it returns truthy and has non-empty `bulkDeals`, **replaces** `empty["bulkDeals"]` entirely; same for `blockDeals`. (Trendlyne data wins over NSE when present.)

### Final sorting + `deals`
- `dividends, bonusIssues, stockSplits, rightsIssues, agmEgm`: sort desc by `parse_event_date(exDate or date)`.
- `bulkDeals, blockDeals`: sort desc by `parse_event_date(date)`.
- `deals` = `merge_deal_rows(bulkDeals, blockDeals)`: each row gets `dealType` "Bulk"/"Block", dedupe key = `date|client|quantity|price|exchange|dealType|orderType`, sort desc by `parse_event_date(date)`.

`parse_event_date` formats tried: `"%d %b %Y","%d-%b-%Y","%d-%m-%Y","%Y-%m-%d","%d-%b-%Y %H:%M:%S","%d-%b-%Y %H:%M","%Y-%m-%d %H:%M:%S"` → else `datetime.min`.

Entire body wrapped in try/except returning `empty` on failure.

### Trendlyne bulk/block deals — `_get_trendlyne_bulk_block_deals_sync(symbol)`
Cache `_trendlyne_bulk_block_cache`, TTL 900s (15 min). Resolve meta `(stock_id, slug)`. URL:
`f"https://trendlyne.com/equity/bulk-block-deals/{key}/{stock_id}/{slug}/"` (NOTE order: key, stock_id, slug).
`requests.get(url, headers={**WEB_PAGE_HEADERS,"referer":"https://trendlyne.com/"}, timeout=12, allow_redirects=True)`.
`_parse_trendlyne_bulk_block_deals(html, symbol)`: regex first `<table>...</table>`, iterate `<tr>`, `<t[dh]>` cells, require ≥8 cols. Cells[:8] = `client, deal_type, action_raw, date_raw, avg_price_raw, quantity_raw, _intraday, exchange_raw` (HTML stripped + whitespace-collapsed). `orderType` = "Buy" if action startswith pur/buy, "Sell" if sell/sal, else raw. Bucket = "bulkDeals" if "bulk" in deal_type else "blockDeals". Date parsed via `%d %b %Y / %d %B %Y / %d-%b-%Y / %Y-%m-%d`. Row: `{date, client, orderType, quantity, price(round2 or raw or "-"), exchange}`. Dedupe by full row string; sort desc by date.

---

## 2. SHAREHOLDING — `get_trendlyne_shareholding(symbol)` → `_get_trendlyne_shareholding_sync(symbol)`

Cache `_trendlyne_shareholding_cache`, TTL 900s. Resolve `(stock_id, slug)` via `_resolve_trendlyne_equity_meta`. 
Page URL: `f"https://trendlyne.com/equity/share-holding/{stock_id}/{key}/{slug}/"` (order: stock_id, key, slug).
`requests.get(page_url, headers={**WEB_PAGE_HEADERS,"referer":"https://trendlyne.com/"}, timeout=12)`. On success sets `parsed["sourceUrl"] = page_url`. On failure returns stale cache.

### `_parse_trendlyne_shareholding_page(html)`
`pd.read_html(StringIO(html))`. Find **summary table** = first table whose first column header lowercased == `"summary"`. Columns[0]=metric label, columns[1:]=quarter columns.

Metric matching via `metric_aliases` (target → list of (alias, score)):
- `promoters`: "promoter and promoter group"(100), "promoter & promoter group"(100), "promoters"(90), "promoter"(80), "promoter group"(30)
- `fii`: "fii/fpi"(100), "fii + fpi"(95), "foreign institutional investors"(95), "foreign portfolio investors"(90), "foreign institutions"(80), "fii"(70)
- `dii`: "domestic institutional investors"(95), "domestic institutions"(85), "mutual funds"(75), "insurance companies"(70), "banks / financial institutions"(65), "banks and financial institutions"(65), "dii"(60)
- `public`: "public shareholding"(100), "public holding"(95), "public shareholders"(90), "public & others"(85), "public and others"(85), "retail and others"(80), "retail investors"(75), "non institutions"(70), "non-institutions"(70), "non institutional investors"(70), "other investors"(60), "public"(50)

`normalize_label`: lower, `&`→" & ", `/`→" / ", `-`/`_`→" ", collapse spaces. `resolve_metric`: exact match → score+1000; startswith `"{alias} "` → score+200; alias length≥8 and `" {alias} "` substring of `" {label} "` → score. Best score wins. `parse_pct`: strip `% , `, `_to_float`, round 2.

Per quarter column build entry `{quarter, promoters, fii, dii, public}` choosing highest-scoring (tie → larger value) row per metric. Backfill rules:
- if `public` not seen and `0 < known_total < 100`: public = 100 − (promoters+fii+dii).
- if `promoters` not seen and `0 < other_total < 100`: promoters = 100 − other_total.
- if recomputed total > 100.5 and public>0: subtract overflow from public.

History sorted desc by quarter label parsed via `%b %Y / %b %y / %B %Y` (else `datetime.min`).

### Top holders
If `len(tables) >= 3`, use `tables[2]`. Flatten tuple columns (join non-empty parts). `name_col` = first col starting "name"; `holding_col` = first col containing "%". Skip aggregate names (lowercased) in set: `mutual funds, foreign portfolio investors category i, foreign portfolio investors category ii, insurance companies, banks, trusts, fii, foreign banks, other financial institutions, other foreign institutions`. Each kept row → `{name, value: parse_pct(holding)}`. Sort desc by value, take top 4.

### Return shape
```python
{"quarter": latest.quarter, "promoters", "fii", "dii", "public",
 "history": [ {quarter,promoters,fii,dii,public}, ... ],   # desc
 "topHolders": [ {name, value}, ... ]}  # <=4
```
`sourceUrl` attached by caller = the share-holding page URL.

### yfinance fallback shareholding — `_extract_shareholding(major_holders)` (used inside `get_yfinance_bundle`)
From yfinance `tk.major_holders` DataFrame. `data_dict = mh.to_dict()`, `holders_dict = data_dict.get("Value", {})`; fallback scan columns for one containing `"insidersPercentHeld"`. `promoters = insidersPercentHeld*100`, `fii = institutionsPercentHeld*100`, `dii = 0.0` (yfinance can't split DII), `public = max(0, 100 − insiders − institutions)`. Returns `{quarter:"", promoters, fii, dii, public}`. This is the yfinance-bundle `shareholding` field; Trendlyne is the richer/primary source merged at dashboard layer.

---

## 3. DOCUMENTS — `get_trendlyne_documents(symbol)` → `_get_trendlyne_documents_sync(symbol)`

Cache `_trendlyne_documents_cache`, TTL 900s. Resolve `(stock_id, slug)`.
Two URLs:
- `documents_url = f"https://trendlyne.com/fundamentals/annual-earnings-credit/{stock_id}/{key}/{slug}/"`
- `filings_url   = f"https://trendlyne.com/latest-news/BSE-Announcements/{stock_id}/{key}/{slug}/"`

Fetch docs: `requests.get(documents_url, headers={**WEB_PAGE_HEADERS,"referer": f"https://trendlyne.com/fundamentals/documents/{stock_id}/{key}/{slug}/"}, timeout=15, allow_redirects=True)` (note the referer is a *different* `/fundamentals/documents/` URL than the fetched one). Fetch filings (best-effort, separate try/except → `""` on fail): `requests.get(filings_url, headers={**WEB_PAGE_HEADERS,"referer":"https://trendlyne.com/"}, timeout=12, allow_redirects=True)`.

### `_parse_trendlyne_documents(docs_html, filings_html)` — BeautifulSoup
`absolute_url(u)` = `urljoin(TRENDLYNE_BASE_URL, u)`. `unique_rows` dedupes `{title,url}` by `f"{title}|{url}"`, requires both non-empty.

- **annualReports** (`parse_annual_reports`): pane = `.tab-pane[data-targetid="annualreport"]` or `#annualreport` or `[data-targetid*="annualreport"]`. For each card (`.annual-reports-card, .card, .document-card, li`): title from `.title` (or link text); link from `a[href*="get-document"]` else `a[href*="/posts/"], a[href$=".pdf"], a[href*="/document/"]`. Fallback: all matching `a` in pane.
- **investorPresentations** (`parse_card_pane("investorpresentation")`): pane targetid `investorpresentation`. Cards (`.earnings-template-card, .credit-ratings-card, .card, .document-card, li`): title from `.main-header a[href]`; link priority `a[href*="get-document"]` → `a[href*="/posts/"]` → `a[href$=".pdf"], a[href*="/document/"]`; title fallback `.title, .main-header, a[href]`.
- **creditRatings** (`parse_card_pane("creditrating")`): same logic, targetid `creditrating`.
- **exchangeFilings**: from `filings_html` (BeautifulSoup). Iterate `div.card-block.p-x-0`; title = full text whitespace-collapsed; link = first `a[href]` whose href contains `get-document/post/pdf/` or `/posts/`. `unique_rows`.

### Return shape (slicing limits)
```python
{"annualReports": [...][:12], "investorPresentations": [...][:12],
 "creditRatings": [...][:12], "exchangeFilings": unique_rows(...)[:20]}
```
Each entry: `{"title": str, "url": absolute_url}`.

---

## 4. BROKERAGE RESEARCH — `get_trendlyne_brokerage(symbol)` → `_get_trendlyne_brokerage_sync(symbol)`

Cache `_trendlyne_reports_cache`, TTL 900s. `source_url = _resolve_trendlyne_stock_report_url(key)` (from the two stockreports/posts sitemaps above). If none → cache `None`.
`requests.get(source_url, headers={**WEB_PAGE_HEADERS,"referer":"https://trendlyne.com/"}, timeout=10)`. Failure → stale cache.

### `_parse_trendlyne_brokerage_payload(source_url, html)`
Extract all `<script type="application/ld+json">...</script>` (regex, IGNORECASE|DOTALL), `unescape`, `json.loads`. Iterate items where `@type` (lowercased) == `"review"`. Per review:
- `author = item["author"]` (dict), `rating = item["reviewRating"]` (dict).
- `headline` = collapsed `item["name"]`; `summary` = collapsed `item["description"]`; `link = item["url"]`.
- `date` = `_parse_trendlyne_review_date(item["datePublished"])` (tries `%b %d, %Y, %H:%M / %b %d, %Y, %I:%M %p / %b %d, %Y / %Y-%m-%d / %d-%m-%Y`, normalizes "Sept."→"Sep.", a.m./p.m.→AM/PM, midnight→00:00, noon→12:00; fallback `parsedate_to_datetime`; returns ISO date or first 10 chars).
- `action` = `_extract_trendlyne_reco_action(headline, summary)`: regex over `"{headline} {summary}".lower()` — sell/reduce/underperform/underweight → "sell"; hold/neutral → "hold"; buy/accumulate/add/outperform/overweight → "buy"; default "hold".
- `targetPrice` = `_extract_trendlyne_target_price(summary)`: regex `r"target(?:\s+price)?[^0-9]{0,20}([0-9][0-9,]*(?:\.\d+)?)"` then `r"\bto\s+([0-9][0-9,]*(?:\.\d+)?)\b"`.
- `rating` = `_to_float(reviewRating.ratingValue)`.
Dedupe by `link` (or `author|date|headline`).

Report row:
```python
{"broker": author.name or "Broker", "action", "targetPrice", "rating",
 "date", "headline": headline[:220], "summary": summary[:360], "url": link}
```
Sort desc by date; truncate to **20** reports.

### Summary aggregation
```python
summary = {"1D":0,"1W":0,"1M":0,"buy":0,"hold":0,"sell":0,"total": len(reports)}
```
Count action buckets (buy/hold/sell). Time buckets via `datetime.utcnow() - row_date` (row date parsed `%Y-%m-%d` from first 10 chars): age≤1 → 1D++, ≤7 → 1W++, ≤30 → 1M++.

### Return shape
```python
{"source": "Trendlyne", "sourceUrl": source_url, "updatedAt": datetime.utcnow().isoformat(),
 "summary": {...}, "reports": [...]}
```

---

## 5. COMPETITORS

There is **no single competitor method** in providers.py; the dashboard (`dashboard.py`) initializes the competitor object with empty arrays:
```python
data["competitors"] = {"table": [], "sectorName": sector, "industryName": industry,
                       "sectorCompanies": [], "industryCompanies": []}
```
`sectorName`/`industryName` come from yfinance/FMP profile (`data["sector"]`, `data["profile"]["industry"]`). The provider-level building blocks that feed peer/competitor tables and sector/industry company lists are:

### `get_fmp_stock_screener(...)` (peer/sector/industry company source — FMP)
URL: `https://financialmodelingprep.com/stable/stock-screener`. Params (via `self._get`):
```python
{"apikey": settings.fmp_api_key, "exchange": exchange, "exchangeShortName": exchange,
 "country": country, "limit": limit}
```
Conditional params (only when >0/truthy): `sector`, `industry`, `marketCapMoreThan`(int), `marketCapLowerThan`(int), `priceMoreThan`, `priceLowerThan`, `volumeMoreThan`(int). `dividend_more_than` is intentionally NOT sent (post-filtered by yield in router).
Per item → row:
```python
{"symbol": sym(strip .NS/.BO), "companyName": companyName|name, "exchange": "BSE" if BSE/.BO else "NSE",
 "marketCap": float, "price": float, "change": float, "changePercent": float(changePercentage),
 "volume": float, "sector": str, "industry": str,
 "pe": float(pe)|None, "pb": float(pb)|None, "roe": float(roe)|None,
 "dividendYield": float(lastAnnualDividend), "beta": float(beta)|None}
```
FALLBACK: if first call empty → retry with the `country` param removed.

### `get_yfinance_screener_snapshot(symbol, exchange="NSE")` → `_get_yfinance_screener_snapshot_sync` (per-peer enrichment)
Cache `_yfinance_screener_cache` key `f"{EXCHANGE}:{KEY}"`, TTL 15min. Uses `yfinance` lib. Ticker candidates: already-suffixed → `[key]`; exchange BSE → `[f"{key}.BO", f"{key}.NS"]`; else `[f"{key}.NS", f"{key}.BO"]`. Reads `tk.info` + `tk.fast_info`. Returns:
```python
{"symbol", "exchange"("BSE" if .BO else "NSE"), "companyName", "price"(lastPrice/currentPrice/regularMarketPrice),
 "change", "changePercent"(vs previousClose), "marketCap": marketCap_inr/84.0 (USD-style),
 "volume", "sector", "industry", "pe"(trailingPE), "pb"(priceToBook),
 "roe"(returnOnEquity *100 if <=1), "dividendYield"(normalized), "beta"}
```
dividendYield normalization: `dividendRate/lastPrice*100` → `trailingAnnualDividendYield*100` → raw `dividendYield`.

### Sector/industry company universe sources:
- `get_nse_index_constituents(index_name)` → `_get_nse_index_constituents_sync`: NSE `https://www.nseindia.com/api/equity-stockIndices?index={index_name}` (param `index`), session cookie pattern, returns rows `{symbol, cmp, change, changePercent}` (excludes the index symbol itself), sorted desc by changePercent. Used as live-market peer universe (e.g. "NIFTY 500").
- `get_nse_market_ticker()` → `https://www.nseindia.com/api/market-data-pre-open?key=ALL` → rows `{symbol, cmp, change, changePercent}` sorted by symbol.
- `get_bse_index_symbols(index_name)` → `_get_bse_index_symbols_sync`: scrapes `https://www.bseindia.com/sensex/IndicesWatch_Weight.aspx` (BSE SENSEX) or `...?iname=BANKEX&index_Code=53` (S&P BSE BANKEX) via `pd.read_html`, resolves company names → symbols via `_resolve_symbol_from_company_name`.
- `get_bse_listed_scrips(segment="Equity", status="Active")` → BSE `https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w` params `{segment, status, Group:"", Scripcode:""}`, referer `https://www.bseindia.com/corporates/List_Scrips.html`, TTL 6h. Rows `{symbol(scrip_id), companyName(Issuer_Name/Scrip_Name), scripCode(SCRIP_CD), group(GROUP), industry(INDUSTRY), marketCap((Mktcap*1e7)/84.0), exchange:"BSE"}`, sorted desc by marketCap.

`industryPe` for the subject stock is later derived (in dashboard) as the average of peer `pe` from `competitors.table`.

---

## 6. NEWS

### A. Symbol/query news (NewsAPI) — `get_news(query)`
If `settings.news_api_key` falsy → `None`. `self._get("https://newsapi.org/v2/everything", params={"q":query,"sortBy":"publishedAt","language":"en","pageSize":24,"apiKey":settings.news_api_key})`. Returns `payload["articles"]` (raw NewsAPI article objects) or `None`.

### B. Market-wide / symbol news (Google News RSS) — `get_google_market_news(query="Indian stock market")` → `_get_google_market_news_sync`
Build: `encoded_query = quote_plus(f"{query} when:1d")` (forces last-day). URL:
`f"https://news.google.com/rss/search?q={encoded_query}&hl=en-IN&gl=IN&ceid=IN:en"`. `requests.get(url, headers=GOOGLE_NEWS_HEADERS, timeout=8)`. Parse with `_parse_google_news_rss`.

`_parse_google_news_rss(rss_xml)` (ElementTree, `./channel/item`):
- `title, link, source, pubDate, description`(html).
- If no `<source>` and `" - "` in title → split on last `" - "` → title/source; default source `"Google News"`.
- `article_url`: scan `href="..."` in description; pick first http link whose host is NOT `news.google.com` (de-Google the redirect).
- `imageUrl` via `_extract_image_from_rss_item` (img src in description → enclosure → media:content/thumbnail; all filtered by `_is_usable_news_image_url`).
- `summary` = HTML-stripped, unescaped, collapsed description[:320]; if starts with "More" → "".
- `publishedAt` = `parsedate_to_datetime(pubDate).date().isoformat()` else raw.
- Dedupe by `link or title`.
Row: `{title, source, publishedAt, url, summary, imageUrl}`.

### C. Symbol-level news via yfinance — inside `get_yfinance_bundle` (`bundle["news"]`)
From `tk.news[:12]`. `_news_row(item)`: requires `item["content"]` dict with `title`. `source` = `content.provider.displayName` or "Yahoo Finance". `url` = `content.canonicalUrl.url`. Row: `{title, source, publishedAt(pubDate[:10]), url, summary(summary/description)}`.

### D. Image enrichment — `enrich_news_images(rows, max_items=10)` + `_extract_og_image_sync(url)`
For first `max_items` rows with no usable `imageUrl`, fetch the article (`requests.get(url, headers=WEB_PAGE_HEADERS, timeout=5, allow_redirects=True)`) and extract og:image / twitter:image / image meta, `link[rel=image_src]`, JSON-LD image, then `<img>` src/data-src/srcset. Normalized + filtered by `_is_usable_news_image_url`.

`_is_usable_news_image_url`: must start `http`; block hosts `news.google.com`, `lh3..lh6.googleusercontent.com`, `encrypted-tbn0.gstatic.com`, `ssl.gstatic.com`, any `*.gstatic.com`, any `*.googleusercontent.com`; block terms in host+path+query: `favicon, logo, icon, placeholder, default-image, default_news, google_news, /ge/, gnews`.

News fan-out / dedup / scoring (sector vs industry vs stock bucketing) is in `dashboard.py` `_build_company_news` / `_score_company_news_relevance`, fed by these providers (Yahoo bundle news + `get_news` + Google RSS).

## External APIs

### NSE Corporate Actions
- URL: `https://www.nseindia.com/api/corporates-corporateActions`
- GET via shared cookie-primed requests.Session; params {index:equities, symbol:KEY}; headers NSE_HEADERS; on 401/403 re-prime GET https://www.nseindia.com then retry; timeout 4. Response is a list; each item: subject, faceVal, exDate, recDate, bcStartDate, symbol. Classified by substring of lowercased subject into dividend/bonus/split/rights/agmEgm.

### NSE Corporate Announcements
- URL: `https://www.nseindia.com/api/corporate-announcements`
- params {index:equities, symbol:KEY, from_date:DD-MM-YYYY, to_date:DD-MM-YYYY}; from/to = utcnow-3y..utcnow. List; items have desc, an_dt, sort_date. Used only to back-fill announcementDate for corporate actions via fuzzy subject + nearest-date matching.

### NSE Corporate Board Meetings
- URL: `https://www.nseindia.com/api/corporate-board-meetings`
- params {index:equities, symbol:KEY, from_date, to_date} (3y window). Response list OR dict(data/records). Fields: bm_date/bmDate/proposedMeetingDate/date, bm_timestamp/sysTime, bm_desc/bm_purpose/purpose, sm_name/bm_symbol/symbol. Sorted desc, deduped by date.

### NSE Insider Trading (PIT)
- URL: `https://www.nseindia.com/api/corporates-pit`
- params {index:equities, symbol:KEY, from:DD-MM-YYYY, to:DD-MM-YYYY} (NOTE from/to not from_date/to_date). Response dict.data list. Fields: buyQuantity, sellQuantity, acqName, company, acqMode, acqtoDt, secVal, date. Buy/Sell inferred from non-zero buy/sell quantity.

### NSE Bulk/Block/Short Deals
- URL: `https://www.nseindia.com/api/historicalOR/bulk-block-short-deals`
- Called twice: params {optionType:bulk_deals,...} and {optionType:block_deals,...}, plus symbol:KEY, from, to (3y). Response dict.data list. Fields: BD_DT_DATE, BD_CLIENT_NAME, BD_BUY_SELL, BD_QTY_TRD, BD_TP_WATP. OVERRIDDEN by Trendlyne bulk-block deals when those are non-empty.

### NSE Equity Stock Indices (peer universe)
- URL: `https://www.nseindia.com/api/equity-stockIndices?index={index_name}`
- param index=NAME (e.g. 'NIFTY 500','NIFTY IPO'). Session cookie pattern. data list of {symbol,lastPrice,change,pChange,previousClose,yearHigh}. Returns {symbol,cmp,change,changePercent} excluding the index symbol, sorted desc by changePercent. Used as competitor/peer & recent-IPO universe.

### NSE Market Pre-Open (ticker)
- URL: `https://www.nseindia.com/api/market-data-pre-open?key=ALL`
- param key=ALL. data[].metadata {symbol,lastPrice,change,pChange}. Returns rows {symbol,cmp,change,changePercent} sorted by symbol. Fallback peer universe.

### Trendlyne equity stocks sitemap
- URL: `https://trendlyne.com/equity-sitemap-stocks.xml`
- GET headers WEB_PAGE_HEADERS timeout 20. Regex <loc>; per loc r'/equity/(\d+)/([^/]+)/([^/]+)/' -> (stock_id, SYMBOL, slug). Builds _trendlyne_equity_meta_map; TTL 6h. Prerequisite for shareholding/documents/financials/bulk-block deal URLs.

### Trendlyne stockreports sitemap
- URL: `https://trendlyne.com/equity-sitemap-stockreports.xml`
- GET WEB_PAGE_HEADERS timeout 15. Regex per loc r'/research-reports/stock/\d+/([^/]+)/' -> SYMBOL; value = loc URL verbatim. Feeds brokerage report URL map.

### Trendlyne research-reports posts sitemap
- URL: `https://trendlyne.com/equity-sitemap-stock-research-reports-posts.xml`
- GET WEB_PAGE_HEADERS timeout 15. Regex per loc r'/research-reports/post/([^/]+)/(\d+)/([^/]+)/' -> SYMBOL, stock_id, slug; rebuilds report url as https://trendlyne.com/research-reports/stock/{stock_id}/{SYMBOL}/{slug}/ (overrides stockreports sitemap).

### Trendlyne brokerage research report page
- URL: `https://trendlyne.com/research-reports/stock/{stock_id}/{SYMBOL}/{slug}/`
- Resolved from sitemaps. GET headers {**WEB_PAGE_HEADERS, referer:https://trendlyne.com/} timeout 10. Parses ld+json @type=Review: author.name, name(headline), description(summary), url, datePublished, reviewRating.ratingValue. action/targetPrice via regex. Cache 900s. Output {source:Trendlyne, sourceUrl, updatedAt, summary{1D,1W,1M,buy,hold,sell,total}, reports[<=20]}

### Trendlyne share-holding page
- URL: `https://trendlyne.com/equity/share-holding/{stock_id}/{SYMBOL}/{slug}/`
- GET {**WEB_PAGE_HEADERS, referer:https://trendlyne.com/} timeout 12. pd.read_html: summary table (first col header=='summary'), metric alias scoring for promoters/fii/dii/public per quarter; backfill public/promoters to 100; tables[2] for topHolders(<=4, skip aggregate names). sourceUrl set to page_url. Output {quarter,promoters,fii,dii,public,history[],topHolders[]}. Cache 900s.

### Trendlyne documents (annual/earnings/credit)
- URL: `https://trendlyne.com/fundamentals/annual-earnings-credit/{stock_id}/{SYMBOL}/{slug}/`
- GET {**WEB_PAGE_HEADERS, referer:https://trendlyne.com/fundamentals/documents/{stock_id}/{SYMBOL}/{slug}/} timeout 15 allow_redirects. BeautifulSoup tab-panes data-targetid: annualreport, investorpresentation, creditrating. Links a[href*=get-document]/[/posts/]/[.pdf]/[/document/]; urljoin to https://trendlyne.com. Slices [:12].

### Trendlyne exchange filings (BSE announcements)
- URL: `https://trendlyne.com/latest-news/BSE-Announcements/{stock_id}/{SYMBOL}/{slug}/`
- GET {**WEB_PAGE_HEADERS, referer:https://trendlyne.com/} timeout 12 allow_redirects; best-effort (empty string on fail). div.card-block.p-x-0 blocks; link first a[href] containing get-document/post/pdf/ or /posts/. -> exchangeFilings[:20].

### Trendlyne bulk-block deals page
- URL: `https://trendlyne.com/equity/bulk-block-deals/{SYMBOL}/{stock_id}/{slug}/`
- NOTE url order SYMBOL,stock_id,slug. GET {**WEB_PAGE_HEADERS, referer:https://trendlyne.com/} timeout 12 allow_redirects. Regex first <table>, rows>=8 cols: client,deal_type,action,date,avg_price,qty,intraday,exchange. Buckets bulkDeals/blockDeals. Cache 900s. OVERRIDES NSE deals in corporate-events when non-empty.

### NewsAPI everything
- URL: `https://newsapi.org/v2/everything`
- GET via httpx _get. params {q:query, sortBy:publishedAt, language:en, pageSize:24, apiKey:settings.news_api_key}. Returns payload.articles (raw). Skipped if no news_api_key. Used for symbol/company query news.

### Google News RSS search
- URL: `https://news.google.com/rss/search?q={quote_plus(query+' when:1d')}&hl=en-IN&gl=IN&ceid=IN:en`
- GET headers GOOGLE_NEWS_HEADERS timeout 8. ElementTree ./channel/item: title,link,source,pubDate,description. De-Google article url (first non-news.google.com href in description). imageUrl extracted+filtered. summary[:320] (drop if startswith 'More'). Rows {title,source,publishedAt,url,summary,imageUrl}.

### Yahoo Finance quote (httpx)
- URL: `{settings.yahoo_finance_base}/v7/finance/quote?symbols={SYMBOL}`
- Used by get_yahoo_quote; prefers .NS/.BO result. Not the primary corporate/news source but provides quote.

### FMP stock screener
- URL: `https://financialmodelingprep.com/stable/stock-screener`
- GET via _get. params apikey, exchange, exchangeShortName, country, limit, + conditional sector/industry/marketCapMoreThan/LowerThan/priceMoreThan/LowerThan/volumeMoreThan. dividend NOT sent. Fallback retry without country if empty. Feeds competitor/peer & sector/industry company rows {symbol,companyName,exchange,marketCap,price,change,changePercent,volume,sector,industry,pe,pb,roe,dividendYield(lastAnnualDividend),beta}.

### BSE list of scrips
- URL: `https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w`
- GET params {segment,status,Group:'',Scripcode:''} headers {**WEB_PAGE_HEADERS, referer:https://www.bseindia.com/corporates/List_Scrips.html} timeout 20. TTL 6h. Rows {symbol(scrip_id),companyName(Issuer_Name/Scrip_Name),scripCode(SCRIP_CD),group(GROUP),industry(INDUSTRY),marketCap((Mktcap*1e7)/84),exchange:BSE} sorted desc by marketCap. Sector/industry company universe (BSE).

### BSE indices weight page (SENSEX/BANKEX)
- URL: `https://www.bseindia.com/sensex/IndicesWatch_Weight.aspx (BANKEX: ?iname=BANKEX&index_Code=53)`
- GET headers WEB_PAGE_HEADERS timeout 8, pd.read_html, pick table with a 'company' column; resolve company names to symbols via Trendlyne name->symbol map. Peer universe for BSE indices.


## Gotchas
- NSE session must be cookie-primed (GET https://www.nseindia.com) before any /api/* call, and re-primed once on 401/403 then retried. The single shared self._nse_session is reused across quote/ticker/index/quarterly/corporate-events/xbrl methods.
- Insider trades (corporates-pit) and bulk/block deals use param keys 'from'/'to', while announcements/board-meetings/financial-results use 'from_date'/'to_date'. Do not mix these up.
- Corporate-events date window is 3 years (365*3) ending today (utcnow); quarterly financial results window is 6 years (365*6).
- Bulk/block deals from NSE are silently OVERRIDDEN by Trendlyne bulk-block deals whenever Trendlyne returns non-empty lists for that bucket. 'deals' is the merged+deduped+sorted union of final bulkDeals+blockDeals with a dealType tag.
- Trendlyne URL path segment ORDER differs by page: share-holding = {stock_id}/{SYMBOL}/{slug}; documents = {stock_id}/{SYMBOL}/{slug}; bulk-block-deals = {SYMBOL}/{stock_id}/{slug}. Preserve exact ordering.
- Documents fetch uses a referer pointing at a DIFFERENT trendlyne URL (/fundamentals/documents/...) than the one actually requested (/fundamentals/annual-earnings-credit/...). exchangeFilings come from a separate best-effort BSE-Announcements page that returns '' on failure.
- Shareholding summary-table detection requires the first column header lowercased to equal exactly 'summary'. Metric mapping is alias-score based (exact +1000, startswith +200, contained substring needs alias length>=8). public/promoters are backfilled to sum ~100 and overflow trimmed from public.
- topHolders requires len(tables)>=3 and uses tables[2]; aggregate institution names (mutual funds, FPIs, insurance, banks, trusts, fii, etc.) are filtered out; capped at 4 sorted desc.
- yfinance fallback shareholding (_extract_shareholding) cannot distinguish DII (always 0.0); maps insidersPercentHeld->promoters, institutionsPercentHeld->fii. Trendlyne is the richer source.
- Brokerage reports parsed ONLY from ld+json @type=Review blocks; capped at 20; summary time-buckets (1D/1W/1M) computed against datetime.utcnow with row date parsed from first 10 chars as %Y-%m-%d. action defaults to 'hold' when no keyword matches.
- Trendlyne sitemap maps (equity, stockreports, posts) cache for 6h; report/shareholding/documents/financials/bulk-block caches are 15min (900s). All fall back to STALE cached values on fetch failure rather than erroring.
- Google News article URLs are de-Google-ified by extracting the first http href in the description that is not on news.google.com. Many image hosts (googleusercontent, gstatic, news.google) and terms (logo/favicon/placeholder/gnews) are blocklisted by _is_usable_news_image_url, so og:image enrichment runs for up to max_items=10 rows.
- get_news returns RAW NewsAPI article dicts (not normalized); normalization/bucketing into stock/sector/industry happens in dashboard.py _build_company_news, fed by yfinance bundle news + get_news + Google RSS.
- Competitors: providers.py has NO dedicated competitor method. dashboard.py initializes competitors{table:[],sectorName,industryName,sectorCompanies:[],industryCompanies:[]}; peer rows are built from get_fmp_stock_screener / get_yfinance_screener_snapshot / get_nse_index_constituents (e.g. NIFTY 500) / get_nse_market_ticker / get_bse_index_symbols / get_bse_listed_scrips. industryPe is derived as the mean of peer 'pe' values.
- Market-cap values from yfinance/BSE are divided by 84.0 to approximate FMP-style USD terms (hardcoded INR->USD rate). BSE Mktcap is in crore so multiplied by 1e7 first.
- Dividend amount parsing only recognizes Rs./₹ patterns; dividendPercent needs faceVal>0. Split ratio falls back to 'from X to Y' face-value pattern; rights ratio falls back to 'a for b'.