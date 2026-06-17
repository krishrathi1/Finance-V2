# Live Quote / Price / Price History (NSE, Yahoo Finance, yfinance, FMP) — backend/app/services/providers.py + dashboard.py


# Live Quote, Price & Price History — Exact Reimplementation Spec

Source of truth: `backend/app/services/providers.py` (raw provider fetchers) and `backend/app/services/dashboard.py` (orchestration + fallback + AI target). Defaults seeded by `backend/app/services/sample_data.py`.

## 0. CRITICAL SHAPE NOTE (zero-drift)

The output `price` object has ONLY these keys (from `sample_data.py` defaults, then mutated by `dashboard.py`):
```
price = { cmp, change, changePercent, currency:"INR", fiftyTwoWeekLow, fiftyTwoWeekHigh, history[], intraday[]?, aiTarget? }
```
- There is **NO top-level `open`, `high`, `low`, `prevClose`, `volume`, or `vwap`** in the live quote anywhere in this codebase. The task lists those, but they are NOT computed/exposed for the quote. `open/high/low/volume` exist ONLY inside per-candle rows of `history[]` and `intraday[]`. `vwap` and `prevClose` are never produced for the main quote. (`prevClose`/`previousClose` appear only in: NSE recent-IPO list, NSE index-constituent change math, and yfinance-screener change math — all unrelated to the dashboard quote.) Do NOT invent these fields.
- `intraday` is added only if yfinance bundle has intraday. `aiTarget` is always added at the end.
- All money/price values are INR. Rounding is `round(x, 2)` (Python banker's rounding — note: Python `round` is round-half-to-even; if exact parity matters, replicate half-to-even, otherwise standard rounding is acceptable but documented here as a potential micro-drift source).

## 1. Settings / base URLs (config.py)
- `yahoo_finance_base` = `https://query1.finance.yahoo.com`
- `fmp_api_key`, `news_api_key` (strings, may be empty)
- FMP base host: `https://financialmodelingprep.com`

## 2. Symbol normalization rules
- **base_symbol**: strip `.NS` and `.BO` (case-insensitive on the upper form), `.strip().upper()`.
- **requested_exchange**: from `exchange` arg upper; if empty → `"BSE"` if input ends with `.BO` else `"NSE"`.
- **market_symbol** (used for Yahoo/FMP/yfinance bundle): `f"{base_symbol}.BO"` if exchange=="BSE" else `base_symbol` (no suffix at this layer; each provider re-adds suffix).
- **Yahoo quote** (`get_yahoo_quote`): key = `symbol.upper()`; if NOT startswith `^` AND NOT endswith `.NS`/`.BO` → append `.NS`.
- **Yahoo candles** (`get_yahoo_candles`): tries `[f"{SYM}.NS", f"{SYM}.BO"]` in that order (SYM already base, no suffix passed). NOTE caller passes `base_symbol` for NSE, or `market_symbol.replace(".BO","")` for BSE → effectively always base symbol, so candles always try `.NS` first then `.BO`.
- **yfinance bundle** (`get_yfinance_bundle`): key=upper; if already endswith `.NS`/`.BO` → `[key]`; else `[f"{key}.NS", f"{key}.BO"]`.
- **FMP quote/candles** (`get_fmp_quote`,`get_fmp_candles`): upper; if NOT endswith `.NS`/`.BO` → append `.NS`.

## 3. LIVE QUOTE — providers (raw fetch) and exact field maps

### 3a. NSE quote (`_get_nse_quote_sync`) — PRIMARY for live quote fields (NSE exchange only)
- Session: lazily create `requests.Session()` with `NSE_HEADERS`, then prime with `GET https://www.nseindia.com` (timeout 6) to obtain cookies. Reuse the session.
- Request: `GET https://www.nseindia.com/api/quote-equity?symbol={SYMBOL_UPPER}` (timeout 6).
- **Cookie-priming retry**: if status 401 or 403 → re-`GET https://www.nseindia.com` (timeout 6), then retry the quote-equity GET once.
- Response JSON field map (`payload`):
  - `cmp` ← `priceInfo.lastPrice`
  - `change` ← `priceInfo.change`
  - `changePercent` ← `priceInfo.pChange`
  - `fiftyTwoWeekHigh` ← `priceInfo.weekHighLow.max`
  - `fiftyTwoWeekLow` ← `priceInfo.weekHighLow.min`
  - `faceValue` ← `securityInfo.faceValue`
  - `outstandingShares` ← `securityInfo.issuedSize / 10_000_000` (crore conversion; None if issuedSize None)
  - `industryPe` ← `metadata.pdSectorPe`
  - `peRatio` ← `metadata.pdSymbolPe`
  - `currency` = "INR" (literal)
- All numeric via `_to_float` (strips commas, returns None on non-finite/error).
- If parsed `cmp` is None → fall back to `_get_nse_index_quote_sync(key)` (for index symbols) and return that if it has cmp.
- On success (cmp not None) cache in `self._last_nse_quotes[key]`.
- On exception → try index quote; else return cached `_last_nse_quotes.get(key)`.

### 3b. NSE index quote (`_get_nse_index_quote_sync`) — used for indices & as cmp-None fallback
- Same session/priming pattern.
- `GET https://www.nseindia.com/api/allIndices` (timeout 6); 401/403 → re-prime + retry once.
- Match: normalize(value)=`re.sub('[^A-Z0-9]','',value.upper())`. Find item where `normalize(item.index)==target` OR `normalize(item.indexSymbol)==target`.
- Field map: `cmp`←`last`, `change`←`variation`, `changePercent`←`percentChange`; `fiftyTwoWeekHigh/Low/faceValue/outstandingShares/industryPe/peRatio`=None; `currency`="INR".
- Cache to `_last_nse_quotes[key]` if cmp not None.

### 3c. Yahoo quote (`get_yahoo_quote`) — raw item returned, mapped in dashboard
- `GET {yahoo_finance_base}/v7/finance/quote?symbols={KEY}` via shared async `_get` (httpx, timeout total 5s / connect 2s, 1 retry attempt via tenacity stop_after_attempt(1), wait_exponential mult 0.2 min0.2 max1.0, `raise_for_status`, returns `.json()`). NO special headers for this `_get`.
- Parse: `results = payload.quoteResponse.result` (list). If empty → None.
- **Preference**: return first item whose `symbol` endswith `.NS` or `.BO`; else `results[0]`. Returns the RAW Yahoo item dict.
- Dashboard consumes raw Yahoo fields: `regularMarketPrice`, `regularMarketChange`, `regularMarketChangePercent`, `marketCap`, `trailingPE`, `trailingAnnualDividendYield`. (Also used in ticker tape for `^BSESN`.)

### 3d. FMP quote (`get_fmp_quote`) — LAST-RESORT live-price fallback
- `GET https://financialmodelingprep.com/stable/quote?symbol={FMP_SYMBOL}&apikey={fmp_api_key}` via `_get`.
- payload is a list; take `quote = payload[0]`.
- Field map: `cmp`←`price`, `change`←`change`, `changePercent`←`changePercentage`, `high`←`dayHigh`, `low`←`dayLow`, `volume`←`volume`, `name`←`name`. Each numeric `float(x or 0.0)`.
- NOTE: only `cmp/change/changePercent/name` are consumed by dashboard; `high/low/volume` from FMP quote are NOT used by the dashboard.

### 3e. yfinance bundle quote (`_get_yfinance_bundle_sync` → `["quote"]`) — fallback live price + 52w
- Built from candles (see §5) + `info`. Quote sub-object:
  - `cmp` = `last_close` (= last candle close)
  - `change` = `round(last_close - prev_close, 2)`
  - `changePercent` = `round(((last_close - prev_close)/prev_close)*100, 2)` (0.0 if prev_close 0)
  - `currency` = `info.currency` or "INR"
  - `fiftyTwoWeekLow` = `min(close for last 252 candles)`; `fiftyTwoWeekHigh` = `max(close for last 252 candles)` (computed from CANDLE CLOSES, not yfinance 52w fields).

## 4. LIVE QUOTE — orchestration & EXACT FALLBACK ORDER (dashboard `get_dashboard`)

All providers fetched concurrently in `_fetch_provider_data` (asyncio, per-call timeouts, overall `asyncio.wait(..., timeout=12)`; pending tasks cancelled → None). Then merged into `data` (seeded from `get_sample_dashboard`) IN THIS EXACT SEQUENTIAL ORDER. **Later writes overwrite earlier ones unless guarded.** Net precedence for live cmp/change/changePercent:

1. **Candle-derived (history) seed** — if `selected_candles` (history) present and `len>=2`: set cmp/change/changePercent from last two history closes; set 52wLow/High from `min/max` of last 252 history closes (closes only). (Candle selection order: FMP candles → yfinance bundle candles → Yahoo candles. See §5.)
2. **NSE quote** — applied ONLY if `nse_quote` truthy AND `requested_exchange != "BSE"`. Overwrites cmp/change/changePercent/52wHigh/52wLow (when each field not None), plus peRatio/industryPe/faceValue/outstandingShares. **→ NSE is the highest-priority live-quote source for NSE.**
3. **Yahoo quote** — cmp/change/changePercent applied ONLY `if not nse_quote` (i.e., NSE missing). marketCap (always, `/1e7`), trailingPE→peRatio (always), trailingAnnualDividendYield*100→dividendYield (always).
4. **yfinance bundle quote** — cmp/change/changePercent applied ONLY `if not nse_quote`. 52wLow/52wHigh applied ALWAYS (when not None) → yfinance 52w can override candle-derived & even NSE 52w because it runs after NSE. plus full metrics block.
5. **FMP quote** — cmp/change/changePercent applied ONLY `if not nse_quote` (strict fallback). companyName←name always.

So effective live-price precedence: **NSE (non-BSE) → else first-non-None of {candle-derived seed, then overwritten by Yahoo if present, then yfinance if present, then FMP if present}**. Because steps 3/4/5 all gate on `not nse_quote` and run in order, when NSE is absent the LAST present source among Yahoo→yfinance→FMP wins for cmp (each overwrites prior). For 52-week: candle-seed → (NSE if non-BSE) → yfinance (always) is the final winner when yfinance present.

### Change backfill (after all merges)
If `price.change` is None but `changePercent` (pct) and `cmp` known:
- if `abs(100+pct) > 0.0001`: `change = round(cmp*pct/(100+pct), 2)`
- else `change = round(cmp*pct/100, 2)`

### Final change rounding everywhere: `round(x,2)`; cmp `round(x,2)`.

## 5. PRICE HISTORY (daily candles) — selection & normalization

### Candle SOURCE fallback order (dashboard):
`selected_candles = fmp_candles`; if falsy → `yfinance_bundle["candles"]`; if falsy → `yahoo_candles`. (FMP is PRIMARY for charts.)

### 5a. FMP candles (`get_fmp_candles`, called with timeframe "5Y")
- `GET https://financialmodelingprep.com/stable/historical-price-eod/full?symbol={FMP_SYMBOL}&apikey={key}` via `_get`. payload = list.
- Timeframe→days: "1M"→30, "1W"→7, "5Y"→1825, default→365. cutoff=`now - days`.
- Row map per item: parse `date` `%Y-%m-%d`; skip if `< cutoff`. `open/high/low/close`=`float(r[field])`; `volume`=`float(r.get("volume",0))`.
- FMP returns descending → sort ASC by date.

### 5b. Yahoo candles (`get_yahoo_candles`, days default 1825)
- For ticker in `[SYM.NS, SYM.BO]`: `GET {yahoo_base}/v8/finance/chart/{ticker}?range=5y&interval=1d&includePrePost=false` via `_get`.
- `result = chart.result[0]`. `ts = result.timestamp`. `q = result.indicators.quote[0]` → arrays `open/high/low/close/volume`.
- Per index i: `close=_to_float(closes[i])`; skip if None. `open=_to_float(opens[i]) or close`; same for high/low (fallback to close). `volume=int(volumes[i])` if present else 0. `date=datetime.utcfromtimestamp(ts).date().isoformat()`. Round o/h/l/c to 2.
- Return `candles[-days:]`. First ticker yielding candles wins.

### 5c. yfinance bundle candles (`_get_yfinance_bundle_sync`, days)
- Choose ticker (see §2) by first whose `tk.history(period="10y", interval="1d", auto_adjust=False)` is non-empty.
- Re-fetch history concurrently (ThreadPool): `tk.history(period="10y", interval="1d", auto_adjust=False)`.
- Candle close uses `Adj Close` if column exists else `Close`. open/high/low from `Open/High/Low` rounded 2; volume `int(float(Volume))` or 0. date=`idx.date().isoformat()`.
- `candles = chosen_history.tail(days)`; then sorted ASC; require `len(candles) >= 2` else return None.

### 5d. dashboard history normalization (`_normalize_history`)
Applied to `selected_candles`:
- date: take part before "T"; parse `datetime.fromisoformat`; skip on fail. close required (skip if None). open/high/low = num or close. volume = num or 0.
- Row = `{date: dt.date().isoformat(), open:round2, high:round2, low:round2, close:round2, volume:int}`.
- Sort ASC by date; dedupe by date keeping LAST occurrence (overwrites prior).

### 5e. 52-week from history (when not overridden by NSE/yfinance)
`valid_closes = [close for last 252 history rows if close not None]` → `fiftyTwoWeekLow=min`, `fiftyTwoWeekHigh=max` (raw, not rounded here; NSE/yfinance overrides are round2).

## 6. INTRADAY series
- Source: ONLY `yfinance_bundle["intraday"]`. Set `data.price.intraday = yfinance_bundle["intraday"]` if present.
- Built in `_get_yfinance_bundle_sync`: `tk.history(period="1d", interval="5m", auto_adjust=False)`.
- Per row: `date = idx.isoformat()` (FULL timestamp, NOT date-only — for 1D chart), open/high/low/close round2 from `Open/High/Low/Close` (Close, not Adj Close), volume `int(float(Volume))` or 0.
- No suffix re-resolution; uses the same chosen ticker.

## 7. AI PRICE TARGET (`_calculate_predictive_target`, dashboard) — computed HERE
Inputs: `history` (normalized), `metrics`, `technicals`, `cmp`. Output `data.price.aiTarget`.
- Guard: if no history OR `len(history) < 252` OR cmp falsy/≤0 → return `round(cmp * 1.12**3, 2)` if cmp>0 else `0.0`.
- `oldest_price = history[0].close (or cmp)`; `years_spanned = len(history)/252.0`.
- If `oldest_price<=0 or years_spanned<1`: `base_cagr=0.12`. Else `total_return = cmp/oldest_price`; `base_cagr = total_return**(1/years_spanned) - 1.0`.
- Heuristic 1 (peRatio from metrics): `<15` → +0.02; `>40` → -0.02.
- Heuristic 2 (technicals.trend): "Bullish" → +0.01; "Bearish" → -0.01.
- Cap: `final_cagr=base_cagr`; if pe `>50` → `min(final,0.10)`; if pe `<0` → `min(final,0.05)`.
- Blend: `final_cagr = 0.60*final_cagr + 0.40*0.10`.
- Clamp: `max(-0.10, min(0.30, final_cagr))`.
- `target = cmp * (1+final_cagr)**3`; return `round(target,2)`. (3-year forward value.)

`technicals.trend` (from `_derive_technicals_from_history`): needs ≥20 closes; ema20=`_ema(closes,20)`; trend = "Bullish" if `closes[-1] >= ema20` else "Bearish"; <20 closes → "Neutral". `_ema`: k=2/(period+1), seed ema=values[0], iterate.

## 8. Shared HTTP helpers
- `_get(url, params, headers)`: httpx.AsyncClient(timeout total 5.0 connect 2.0). tenacity retry stop_after_attempt(1) (effectively no retry), wait_exponential(0.2,0.2,1.0). `raise_for_status` then `.json()`.
- `_nse_get(url)` (used for IPOs only, not the equity quote): httpx.AsyncClient(timeout 15, follow_redirects True) with capital-cased NSE headers; primes `GET https://www.nseindia.com` then GETs url. (The equity/index quotes use the synchronous `requests.Session` priming pattern in §3a/§3b, NOT this.)
- `_to_float`: str→strip commas→float; None/non-finite→None.

## 9. NSE market ticker / index constituents (used by ticker tape & heatmap, not single-stock quote)
- `get_nse_market_ticker`: `GET https://www.nseindia.com/api/market-data-pre-open?key=ALL` (session priming + 401/403 retry). Per item: symbol←`metadata.symbol`, cmp←`metadata.lastPrice`, change←`metadata.change`, changePercent←`metadata.pChange`. If change None & pct present: `change=cmp*(pct/100)`. If pct None & change present & cmp-change≠0: `pct=(change/(cmp-change))*100`. round2. Sort by symbol.
- `get_nse_index_constituents`: `GET https://www.nseindia.com/api/equity-stockIndices?index={index_name}` (priming+retry). Per item: skip if symbol==index key. cmp←`lastPrice`, change←`change`, changePercent←`pChange`, prev←`previousClose`. If change None & prev present: `change=cmp-prev`. pct derivation same. round2. Sort by changePercent desc.


## External APIs

### NSE quote-equity (live single-stock quote, PRIMARY for NSE)
- URL: `https://www.nseindia.com/api/quote-equity?symbol={SYMBOL_UPPER}`
- GET via requests.Session, timeout 6. MUST prime cookies first: GET https://www.nseindia.com (timeout 6) with NSE_HEADERS before first call; reuse session. On 401/403: re-GET https://www.nseindia.com then retry the quote-equity GET ONCE. NSE_HEADERS={user-agent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', accept-language:'en-US,en;q=0.9', accept:'application/json, text/plain, */*', referer:'https://www.nseindia.com/', x-requested-with:'XMLHttpRequest'}. Fields: priceInfo.lastPrice->cmp, priceInfo.change->change, priceInfo.pChange->changePercent, priceInfo.weekHighLow.max->fiftyTwoWeekHigh, priceInfo.weekHighLow.min->fiftyTwoWeekLow, securityInfo.faceValue->faceValue, securityInfo.issuedSize/1e7->outstandingShares, metadata.pdSectorPe->industryPe, metadata.pdSymbolPe->peRatio, currency='INR'. Cache last good per key; on fail return cached or index-quote fallback.

### NSE allIndices (index quote + cmp-None fallback)
- URL: `https://www.nseindia.com/api/allIndices`
- GET via primed session timeout 6; 401/403 re-prime+retry once. Match item by normalize(index) or normalize(indexSymbol) == normalize(symbol) where normalize strips non-[A-Z0-9] uppercased. Fields: last->cmp, variation->change, percentChange->changePercent; currency='INR'; 52w/pe/faceValue/outstanding=None.

### NSE market-data-pre-open (ticker tape)
- URL: `https://www.nseindia.com/api/market-data-pre-open?key=ALL`
- GET primed session timeout 8; 401/403 re-prime+retry. data[].metadata: symbol,lastPrice->cmp,change,pChange->changePercent. Derive missing change/pct. round2, sort by symbol.

### NSE equity-stockIndices (index constituents / heatmap; also NIFTY IPO recent)
- URL: `https://www.nseindia.com/api/equity-stockIndices?index={INDEX_NAME}`
- GET primed session timeout 8; 401/403 retry. data[]: symbol,lastPrice->cmp,change,pChange->changePercent,previousClose->prev,yearHigh. change=cmp-prev when missing. NIFTY IPO variant index=NIFTY%20IPO used for recent-IPO list (currentPrice/prevClose/changePercent/yearHigh).

### Yahoo Finance v7 quote (live quote fallback when NSE absent)
- URL: `https://query1.finance.yahoo.com/v7/finance/quote?symbols={KEY}`
- GET via shared httpx _get (timeout 5s, no special headers, 1 attempt). KEY = symbol.upper(); append .NS if not startswith ^ and not endswith .NS/.BO. Parse quoteResponse.result[]; prefer item whose symbol endswith .NS/.BO else result[0]; returns RAW item. Consumed fields: regularMarketPrice->cmp, regularMarketChange->change, regularMarketChangePercent->changePercent, marketCap (/1e7), trailingPE->peRatio, trailingAnnualDividendYield*100->dividendYield. Also ^BSESN for SENSEX ticker.

### Yahoo Finance v8 chart (daily candles fallback, last in chart order)
- URL: `https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}?range=5y&interval=1d&includePrePost=false`
- GET via _get. TICKER iterated over [SYM.NS, SYM.BO]. chart.result[0]: timestamp[], indicators.quote[0].{open,high,low,close,volume}[]. close required; open/high/low fallback to close; volume int or 0; date=utcfromtimestamp(ts).date().isoformat(); round2. return candles[-days:] (days default 1825).

### FMP historical-price-eod/full (daily candles PRIMARY for charts)
- URL: `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol={FMP_SYMBOL}&apikey={FMP_API_KEY}`
- GET via _get. FMP_SYMBOL upper, append .NS if no .NS/.BO. payload list (descending). timeframe '5Y'->1825d (1M->30,1W->7,default 365); cutoff=now-days; skip rows < cutoff (date %Y-%m-%d). open/high/low/close=float, volume=float(r.volume or 0). Sort ASC.

### FMP /stable/quote (last-resort live price)
- URL: `https://financialmodelingprep.com/stable/quote?symbol={FMP_SYMBOL}&apikey={FMP_API_KEY}`
- GET via _get. payload[0]: price->cmp, change->change, changePercentage->changePercent, dayHigh->high, dayLow->low, volume->volume, name->name. Only cmp/change/changePercent/name consumed by dashboard (gated on not nse_quote). float(x or 0.0).

### yfinance Python lib (Ticker.history + info/fast_info) — bundle quote/candles/intraday/52w
- URL: `yfinance.Ticker('{TICKER}') -> .history(period=...,interval=...,auto_adjust=False), .info, .fast_info`
- Underlying is Yahoo chart/quoteSummary APIs via yfinance. Ticker candidates: [SYM.NS, SYM.BO] (or [key] if already suffixed); choose first with non-empty 10y/1d history. Daily candles: history(period='10y',interval='1d',auto_adjust=False), close=Adj Close||Close, tail(days), sort ASC, need>=2. Intraday: history(period='1d',interval='5m',auto_adjust=False), date=idx.isoformat() full timestamp, close=Close. quote.cmp=last close, change=last-prev, changePercent from last two closes; currency=info.currency||INR; fiftyTwoWeekLow/High = min/max of last 252 candle CLOSES. info.currency, trailingPE, etc. for metrics.


## Gotchas
- NSE cookie priming is mandatory: create requests.Session with NSE_HEADERS, GET https://www.nseindia.com FIRST to set cookies, reuse session. On HTTP 401/403, re-GET the homepage once then retry the API call exactly once. Without this NSE returns 401/403.
- NSE quote is applied ONLY when requested_exchange != 'BSE'. For BSE symbols NSE quote is intentionally skipped even if fetched, so BSE live price comes from Yahoo/yfinance/FMP fallbacks.
- Live cmp/change/changePercent from Yahoo, yfinance-bundle, and FMP are each gated on `if not nse_quote`. They run sequentially in that order, so when NSE is absent each later present source OVERWRITES the earlier — net winner among present is FMP > yfinance > Yahoo > candle-seed for cmp. Preserve this exact ordering.
- 52-week high/low precedence: candle-derived (min/max of last 252 closes) is seeded first; NSE 52w overrides (non-BSE) if present; yfinance-bundle 52w (also min/max of last 252 candle closes) is applied ALWAYS afterward and thus has the final say when yfinance is present. yfinance 52w is computed from candle closes, NOT yahoo fiftyTwoWeekHigh/Low info fields.
- Candle source fallback for the chart is FMP -> yfinance-bundle -> Yahoo (FMP is PRIMARY). This is the OPPOSITE priority vs live quote (where NSE is primary).
- There is NO top-level open/high/low/prevClose/volume/vwap on the live quote object anywhere. Do not synthesize them. open/high/low/volume exist only inside history[] and intraday[] candle rows. vwap is never computed. FMP quote's dayHigh/dayLow/volume are fetched but discarded by the dashboard.
- outstandingShares and most financial magnitudes are converted to CRORE by dividing by 10_000_000 (1e7). marketCap from Yahoo/yfinance is /1e7 to crore. yfinance-screener/BSE marketCap additionally divides by 84.0 (hardcoded USD FX) — but that path is the screener, not the dashboard quote.
- Yahoo v7 quote returns RAW item; the .NS/.BO-preferring selection matters because Yahoo may return multiple listings. Append .NS by default unless symbol starts with ^ (index) or already has a suffix.
- Yahoo candles date uses datetime.utcfromtimestamp(ts).date() (UTC). yfinance daily date uses idx.date(); yfinance intraday uses idx.isoformat() FULL timestamp (used to render the 1D intraday chart). _normalize_history strips anything after 'T' so daily rows become date-only and are deduped by date keeping the LAST occurrence.
- AI price target is computed in dashboard (_calculate_predictive_target), NOT in providers. Needs >=252 history rows AND cmp>0 else returns cmp*1.12^3 rounded (or 0.0). Formula: base CAGR from total_return^(1/years)-1, +/-0.02 by PE (<15/>40), +/-0.01 by trend, cap min 0.10 if PE>50 / 0.05 if PE<0, blend 0.6*cagr+0.4*0.10, clamp [-0.10,0.30], target=cmp*(1+cagr)^3, round2. trend Bullish/Bearish from close[-1] vs EMA20.
- change backfill: if change is None but changePercent(pct) and cmp known -> if abs(100+pct)>1e-4 use cmp*pct/(100+pct) else cmp*pct/100, round2. This treats pct as percent-of-previous, not percent-of-current.
- All rounding uses Python round() (round-half-to-even). JS Math.round / toFixed round half-up — replicate banker's rounding to avoid sub-cent drift on .xx5 values.
- _get (httpx) timeout is total 5.0s / connect 2.0s with effectively a single attempt (tenacity stop_after_attempt(1)). Provider-level timeouts also enforced per-call in _fetch_provider_data (5-10s each) plus an overall asyncio.wait timeout of 12s; tasks not done become None. Reproduce these timeouts to match which sources are likely to drop out under load.
- yfinance change uses last two CANDLE closes (close[-1] vs close[-2]); NSE/Yahoo use exchange-provided change/pChange. These can disagree slightly; preserve which source supplies change in each fallback branch.