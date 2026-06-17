# backend/app/services/scoring.py — SMART SCORE and RISK SCORE algorithms (exact reproduction spec for TypeScript)

# Scoring Algorithms — Exact Reproduction Spec

Source file: `C:\Users\KRISH\Desktop\Finance-V2\backend\app\services\scoring.py`

This spec reproduces `compute_smart_score` and `compute_risk_score` bit-for-bit. Two public functions plus all helper functions they depend on. All constants are verbatim from source.

---

## 0. Shared primitives (helpers)

These MUST be reproduced exactly since both scores depend on them.

### 0.1 Constants
```python
IST = timezone(timedelta(hours=5, minutes=30))   # UTC+05:30
```

### 0.2 `_clamp(value, min_v, max_v)`
```python
return max(min_v, min(max_v, value))
```

### 0.3 `_num(value, default=None) -> float | None`
- If `value is None` → return `default`.
- Try `numeric = float(value)`. If not `math.isfinite(numeric)` → return `default`.
- On any exception → return `default`.
- Otherwise return `numeric`.
- TS note: replicate `isfinite` (reject NaN/Inf). `float("")` raises → default. Booleans in Python become 1.0/0.0.

### 0.4 `_avg(values: list[float|None], fallback) -> float`
- `valid = [float(v) for v in values if v is not None and isfinite(float(v))]`
- Return arithmetic `mean(valid)` if non-empty, else `fallback`.

### 0.5 `_median(values: list[float|None], fallback) -> float`
- `valid = [float(v) for v in values if v is not None and isfinite(float(v))]`
- Return `median(valid)` if non-empty, else `fallback`.
- **CRITICAL median semantics (Python `statistics.median`):** sort ascending; if odd count return middle element; if even count return the **average of the two middle elements**. Must match exactly.

### 0.6 `_normalize(value, low, high) -> float | None`
```python
if value is None: return None
if high <= low: return None
return _clamp((value - low) / (high - low), 0.0, 1.0)
```

### 0.7 `_inverse_normalize(value, low, high) -> float | None`
```python
score = _normalize(value, low, high)
return None if score is None else 1.0 - score
```

### 0.8 `_pct_change(current, base) -> float | None`
```python
if current is None or base is None or abs(base) < 1e-9: return None
return ((current - base) / abs(base)) * 100.0
```

### 0.9 `_daily_returns(closes) -> list[float]`
```python
if len(closes) < 2: return []
for idx in 1..len-1:
    prev = closes[idx-1]; curr = closes[idx]
    if prev <= 0: continue
    out.append((curr / prev) - 1.0)
```

### 0.10 `_std(values) -> float | None`  (SAMPLE std, ddof=1)
```python
if len(values) < 2: return None
avg = mean(values)
var = sum((v - avg)**2) / (len(values) - 1)
return sqrt(var)
```

### 0.11 `_max_drawdown(closes) -> float | None`
```python
if not closes: return None
peak = closes[0]; max_dd = 0.0
for price in closes:
    if price > peak: peak = price
    if peak > 0:
        dd = (peak - price) / peak
        if dd > max_dd: max_dd = dd
return max_dd
```

### 0.12 `_sigmoid(value) -> float`
```python
if value < -35: return 0.0
if value > 35:  return 1.0
return 1.0 / (1.0 + exp(-value))
```

### 0.13 `_statement_value(row, keys) -> float | None`
- Normalize each requested key: `re.sub(r"[^a-z0-9]", "", k.lower())`.
- Iterate `row.items()` (insertion order). For each cell, normalize its key the same way. If **any** normalized requested key is a **substring** of the cell's normalized key, run `_num(value)`; if not None, return it immediately.
- Else return None. (First matching cell in dict-iteration order wins.)

### 0.14 `_latest_nonempty_rows(rows) -> list[dict]`
- If not a list → `[]`. Else return only the dict elements (preserving order).

### 0.15 `_parse_trade_date(raw) -> datetime | None`
- Trim; if empty → None. Take `raw.split(" ")[0]` (date part).
- Try formats in order: `%Y-%m-%d`, `%d-%b-%Y`, `%d-%B-%Y`, `%d-%m-%Y`, `%d/%m/%Y`. First parse wins; attach IST tzinfo. Else None.

---

## 1. SMART SCORE — `compute_smart_score`

### 1.1 Signature / inputs
```
compute_smart_score(
  metrics, technicals,
  financials=None, price_history=None,
  returns_summary=None, news_items=None,
  corporate_actions=None, shareholding=None
) -> dict
```
`returns_summary` and `news_items` are **read but unused** (`_ = ... or []`). `financials = financials or {}`.

### 1.2 Input metrics (from `metrics` dict via `_num`)
`roe, roa, roce, profitMargin, peRatio, pbRatio, evToSales, pegRatio, dividendYield, debtToEquity, currentRatio, interestCoverage, marketCap` (marketCap used inside Altman-Z).

### 1.3 Input technicals (from `technicals` dict)
`rsi14, macd, ema20, ema50` via `_num`; `trend = str(technicals.get("trend") or "Neutral").lower()`.

### 1.4 Derived feature blocks

**Growth features** — `_extract_growth_features(financials)`:
- `quarterly = rows(financials["quarterly"])`, `yearly = rows(financials["yearly"])`.
- `qd = rows("quarterlyDetailedConsolidated") OR rows("quarterlyDetailedStandalone")` (consolidated preferred).
- revenueGrowth / profitGrowth:
  - if `len(quarterly) >= 5`: `_pct_change(quarterly[-1].revenue, quarterly[-5].revenue)` and same for `profit` (YoY using 5 quarters back).
  - elif `len(yearly) >= 2`: `_pct_change(yearly[-1].revenue, yearly[-2].revenue)` and `.profit`.
  - else both None.
- epsGrowth: if `len(qd) >= 5`: `latest = _num(qd[-1].basicEps) or _num(qd[-1].dilutedEps)`; `prev = _num(qd[-5].basicEps) or _num(qd[-5].dilutedEps)`; `_pct_change(latest, prev)`. **Note `or` semantics:** a basicEps of 0.0 is falsy → falls through to dilutedEps.
- freeCashFlowGrowth: if `len(yearly) >= 2`: `_pct_change(yearly[-1].cashFlow, yearly[-2].cashFlow)`.
- Returns `{revenueGrowth, profitGrowth, epsGrowth, freeCashFlowGrowth}`.

**Price features** — `_extract_price_features(price_history)`:
- `closes = [float(item.close) for item in history if _num(item.close) is not None]`.
- If `len(closes) < 10` → all five fields None: `{return1M, return3M, return6M, volatility3M, drawdown1Y}`.
- `returns = _daily_returns(closes)`.
- `return1M = _pct_change(closes[-1], closes[-22]) if len(closes) > 22 else None`.
- `return3M = _pct_change(closes[-1], closes[-64]) if len(closes) > 64 else None`.
- `return6M = _pct_change(closes[-1], closes[-127]) if len(closes) > 127 else None`.
- `last_63_returns = returns[-63:] if len(returns) >= 63 else returns`.
- `vol_3m = _std(last_63_returns)`; if not None → `vol_3m *= sqrt(252)` (annualized).
- `window = closes[-252:] if len(closes) >= 252 else closes`; `drawdown_1y = _max_drawdown(window)`.

**Altman-Z** — `_compute_altman_z(metrics, financials)`:
- `bs = rows("balanceSheet")[0]`, `inc = rows("incomeStatement")[0]`. If either list empty → None.
- `total_assets = _statement_value(bs, ["totalAssets","assets"])`
- `total_liabilities = _statement_value(bs, ["totalLiabilities","liabilities"])`
- `retained_earnings = _statement_value(bs, ["retainedEarnings"])`
- `current_assets = _statement_value(bs, ["currentAssets"])`, `current_liabilities = _statement_value(bs, ["currentLiabilities"])`
- `working_capital`: if `_statement_value(bs, ["workingCapital"])` is not None use it; else if both current_assets & current_liabilities present → `current_assets - current_liabilities`; else None.
- `ebit = _statement_value(inc, ["ebit","operatingIncome"])`, `sales = _statement_value(inc, ["revenue","sales"])`.
- `market_value_equity = _num(metrics.marketCap)`.
- Return None if: total_assets None or `abs<1e-9`, total_liabilities None or `abs<1e-9`, market_value_equity None, working_capital None, retained_earnings None, ebit None, sales None.
- Formula (verbatim):
```
z = 1.2*(working_capital/total_assets)
  + 1.4*(retained_earnings/total_assets)
  + 3.3*(ebit/total_assets)
  + 0.6*(market_value_equity/total_liabilities)
  + 1.0*(sales/total_assets)
```
- Return z if finite else None.

**interest_coverage** (in smart score body): `_num(metrics.interestCoverage)`; if None and incomeStatement rows exist: `ebit = _statement_value(inc[0], ["ebit","operatingIncome"])`, `interest = _statement_value(inc[0], ["interestExpense","interestCost"])`; if both present and `abs(interest) > 1e-9` → `interest_coverage = ebit / abs(interest)`.

**Insider signal** — `_insider_signal(corporate_actions)` (used inside financial_health):
- `rows = corporate_actions.get("insiderTrades")`. If not a list → return 0.5.
- `now = datetime.now(IST)`, `cutoff = now - 180 days`.
- For each dict row: parse `_parse_trade_date(row.date)`. If date present and `< cutoff` → skip.
- `signal_text = f"{transactionType} {orderType}".lower()`.
  - contains any of `["buy","acquire","purchase"]` → buys += 1.
  - elif contains any of `["sell","dispose","pledge"]` → sells += 1.
- If `buys+sells == 0` → 0.5. Else `net_ratio = (buys-sells)/(buys+sells)`; return `_clamp((net_ratio+1.0)/2.0, 0.0, 1.0)`.

**Institutional signal** — `_institutional_signal(shareholding)`:
- If not dict → 0.5.
- `fii=_num(.fii)`, `dii=_num(.dii)`, `promoters=_num(.promoters)`.
- `institutional = fii+dii if (fii is not None and dii is not None) else None`.
- `components = [_normalize(institutional, 15.0, 75.0), _normalize(promoters, 20.0, 75.0)]`.
- Return `_avg(components, 0.5)`.

### 1.5 DIMENSION computation (each in [0,1] via `_median(..., fallback=0.5)`)

**profitability** = median of:
- `_normalize(roe, 5.0, 25.0)`
- `_normalize(roa, 1.0, 10.0)`
- `_normalize(roce, 8.0, 30.0)`
- `_normalize(profit_margin, 5.0, 25.0)`

**growth** = median of:
- `_normalize(revenueGrowth, 0.0, 25.0)`
- `_normalize(profitGrowth, 0.0, 25.0)`
- `_normalize(epsGrowth, 0.0, 20.0)`
- `_normalize(freeCashFlowGrowth, 0.0, 20.0)`

**valuation** = median of:
- `_inverse_normalize(pe_ratio, 8.0, 45.0)`
- `_inverse_normalize(pb_ratio, 1.0, 8.0)`
- `_inverse_normalize(peg_ratio, 0.5, 3.0)`
- `_inverse_normalize(ev_to_sales, 1.0, 12.0)`
- `_normalize(dividend_yield, 0.0, 4.0)`

**momentum** — first compute sub-scores:
- `rsi_score`: if rsi14 not None → `_clamp(1.0 - abs(rsi14 - 55.0)/45.0, 0.0, 1.0)` (peak at RSI 55). Else None.
- `macd_score`: if macd not None → `_sigmoid(macd / 2.5)`. Else None.
- `trend_score = 0.7 if trend=="bullish" else 0.35 if trend=="bearish" else 0.5`.
- `ema_score`: if ema20 and ema50 not None → `1.0 if ema20 >= ema50 else 0.25`. Else None.
- momentum = median of: `[rsi_score, macd_score, ema_score, trend_score, _normalize(return3M, -15.0, 35.0), _normalize(return6M, -20.0, 50.0)]`.

**financial_health** = median of:
- `_inverse_normalize(debt_to_equity, 0.0, 2.5)`
- `_normalize(current_ratio, 1.0, 3.0)`
- `_normalize(interest_coverage, 1.5, 8.0)`
- `_normalize(altman_z, 1.8, 4.0)`
- `_insider_signal(corporate_actions)`
- `_institutional_signal(shareholding)`

### 1.6 Base score (weights — MUST sum-match)
```
base_score_01 = 0.25*profitability
              + 0.20*growth
              + 0.20*valuation
              + 0.20*momentum
              + 0.15*financial_health
```
Weights: profitability 0.25, growth 0.20, valuation 0.20, momentum 0.20, financialHealth 0.15.

### 1.7 ML adjustment — `_walk_forward_ml_adjustment(price_history, financial_health, valuation, quarterly_detailed)`

Called as: `_walk_forward_ml_adjustment(price_history, financial_health, valuation, quarterly_detailed=quarterly_detailed)` where `quarterly_detailed = rows("quarterlyDetailedConsolidated") or rows("quarterlyDetailedStandalone")`.

**Build closes/volumes:** for each dict item with non-None `close`: `volume = _num(volume) or _num(vol) or _num(traded_quantity) or _num(tradedQuantity) or 0.0`. (0.0/falsy chains through.)

**Guard:** if `len(closes) < 220` → return `(0.0, 0.0, {"samples":0, "horizonDays":63, "hitRate":None})`.

**latest features row:**
```
latest_eps_surprise = _compute_earnings_surprise(quarterly_detailed)
latest_vpd          = _compute_volume_price_divergence(closes, volumes)   # window default 20
latest_row = [
  (closes[-1]/closes[-22]) - 1.0,
  (closes[-1]/closes[-64]) - 1.0,
  (closes[-1]/closes[-127]) - 1.0,
  _std(_daily_returns(closes[-64:])) or 0.0,
  _max_drawdown(closes[-127:]) or 0.0,
  latest_eps_surprise,
  latest_vpd,
]
```

**horizon_specs:** `[(21,"short",0.25), (63,"base",0.40), (126,"long",0.35)]`.

For each `(horizon, label, weight)`:
- For `idx` in `range(130, len(closes) - horizon)`:
  - `p_now=closes[idx]`, `p_1m=closes[idx-21]`, `p_3m=closes[idx-63]`, `p_6m=closes[idx-126]`, `future=closes[idx+horizon]`.
  - if `min(p_now,p_1m,p_3m,p_6m) <= 0` → skip.
  - `mom_1m=(p_now/p_1m)-1`, `mom_3m=(p_now/p_3m)-1`, `mom_6m=(p_now/p_6m)-1`.
  - `window_returns=_daily_returns(closes[idx-63:idx+1])`; `vol=_std(window_returns) or 0.0`.
  - `drawdown=_max_drawdown(closes[idx-126:idx+1]) or 0.0`.
  - `sample_eps_surprise=_historical_earnings_surprise(quarterly_detailed, (len(closes)-1)-idx)`.
  - `sample_vpd=_compute_volume_price_divergence(closes[:idx+1], volumes[:idx+1])`.
  - `label_value = 1 if ((future/p_now)-1.0) > 0 else 0`.
  - feature vector order: `[mom_1m, mom_3m, mom_6m, vol, drawdown, sample_eps_surprise, sample_vpd]`.
- if `len(samples) < 60` → skip this horizon (continue).
- else fit: `p_up, accuracy = _fit_logistic_probability(features, labels, latest_row)`; append `{label, days:horizon, weight, samples:len, hitRate:accuracy, upProbability:p_up}`.

**If no horizon_results:** return `(0.0, 0.0, {"samples":0, "horizonDays":63, "hitRate":None})`.

**Blend:**
```
total_weight = sum(weight)
blended_probability = sum(upProbability*weight)/total_weight  (else 0.5 if total_weight<=0)
blended_hit_rate    = sum(hitRate*weight)/total_weight        (else 0.5)
total_samples = sum(samples)
coverage = len(horizon_results) / 3            # len(horizon_specs)==3
confidence = _clamp((abs(blended_hit_rate-0.5)*2.0)*coverage*min(1.0, total_samples/320.0), 0.0, 1.0)
fundamentals_bias = (financial_health_score-0.5)*0.08 + (valuation_score-0.5)*0.06
raw_adjustment = ((blended_probability-0.5)*0.20) + fundamentals_bias
return _clamp(raw_adjustment, -0.08, 0.08), confidence, details
```
**details dict (exact keys/rounding):**
```
{
  "samples": total_samples,
  "horizonDays": 63,
  "hitRate": round(blended_hit_rate, 4),
  "upProbability": round(blended_probability, 4),
  "availableHorizons": [int(days) for each result],
  "horizons": { f"{days}d": {"samples":int, "hitRate":round(.,4), "upProbability":round(.,4)} for each },
  "features": { "earningsSurprise": round(latest_eps_surprise,4), "volumePriceDivergence": round(latest_vpd,4) }
}
```

### 1.7a `_compute_earnings_surprise(quarterly_detailed)`
- If not list or `len < 2` → 0.0.
- `actual_keys = ["eps_actual","eps","reportedEPS","reported_eps","epsActual","basicEps","dilutedEps"]`.
- `estimate_keys = ["eps_estimate","estimatedEPS","estimated_eps","epsEstimate","consensus_eps"]`.
- For each of last 4 rows (`[-4:]`): find first non-None `_num` among actual_keys (in listed order), same for estimate_keys. If actual None or estimate None or `abs(estimate) < 0.01` → skip. Else `surprise = _clamp((actual-estimate)/abs(estimate), -1.0, 1.0)`; append.
- If no surprises → 0.0. Else return `_clamp(mean(surprises)*0.5, -0.5, 0.5)`.

### 1.7b `_historical_earnings_surprise(quarterly_detailed, trading_days_from_end)`
- If not list or empty → 0.0.
- `quarters_back = max(0, trading_days_from_end // 63)` (integer floor division).
- `cutoff = max(0, len(quarterly_detailed) - quarters_back)`.
- `visible_rows = quarterly_detailed[:cutoff] if cutoff > 0 else []`.
- Return `_compute_earnings_surprise(visible_rows)`.

### 1.7c `_compute_volume_price_divergence(closes, volumes, window=20)`
- If empty closes or volumes → 0.0.
- `n = min(len(closes), len(volumes))`; if `n < 4` → 0.0; if `n < window` → `window = n`.
- if `window` odd → `window -= 1`; if `window < 4` → 0.0.
- `closes_w=closes[-window:]`, `volumes_w=volumes[-window:]`, `half=window//2`; if `half<=0` → 0.0.
- `price_start=closes_w[0]`, `price_end=closes_w[-1]`; if `price_start<=0` → 0.0; `price_change=(price_end-price_start)/price_start`.
- `prior_vol=volumes_w[:half]`, `recent_vol=volumes_w[half:]`; if either empty → 0.0.
- `avg_prior=mean(prior_vol)`, `avg_recent=mean(recent_vol)`; if `avg_prior<=0` → 0.0.
- `vol_change=(avg_recent-avg_prior)/avg_prior`; return `_clamp(price_change - vol_change, -1.0, 1.0)`.

### 1.7d `_fit_logistic_probability(features, labels, latest_row)` — in-house logistic regression
- `mins=[min(col)]`, `maxs=[max(col)]` over columns (`zip(*features)`).
- `scale_row(row)`: per index, `spread=maxs[i]-mins[i]`; if `spread<=1e-12` → 0.5; else `(value-mins[i])/spread`.
- `x_rows = [scale_row(r) for r in features]`.
- `weights = [0.0]*(num_features+1)` (index 0 = bias/intercept).
- `learning_rate = 0.15`. Run **140** gradient-descent epochs:
  - grad zeros; for each (row,label): `z = w[0] + sum(w[1:]·row)`; `pred=_sigmoid(z)`; `err=pred-label`; `grad[0]+=err`; `grad[i+1]+=err*value`.
  - `inv_n = 1/len(x_rows)`; for each weight: `w[i] -= learning_rate * grad[i] * inv_n`.
- accuracy: over training rows, `pred=_sigmoid(z)`; correct if `(pred>=0.5 and label==1) or (pred<0.5 and label==0)`; `accuracy = correct/len(labels)`.
- `latest_scaled=scale_row(latest_row)`; `z_latest = w[0]+sum(w[1:]·latest_scaled)`; return `(_sigmoid(z_latest), accuracy)`.
- TS reproduction: deterministic (zero init, fixed LR, fixed epochs). Must match float ops & iteration order for bit-for-bit.

### 1.8 Final assembly
```
final_score_01 = _clamp(base_score_01 + (ml_adjustment * ml_confidence), 0.0, 1.0)
score_5        = round(final_score_01 * 5.0, 2)
dimensions = {
  "profitability":   round(profitability   * 5.0, 2),
  "growth":          round(growth          * 5.0, 2),
  "valuation":       round(valuation       * 5.0, 2),
  "momentum":        round(momentum        * 5.0, 2),
  "financialHealth": round(financial_health* 5.0, 2),
}
```
**Return object (exact keys):**
```
{
  "score": score_5,
  "maxScore": 5,
  "dimensions": dimensions,
  "label": "Strong" if score_5 >= 4 else "Moderate" if score_5 >= 2.5 else "Weak",
  "explanation": "Factor score uses normalized profitability, growth, valuation, momentum, and balance-sheet health. A bounded multi-horizon walk-forward ML signal blends price trend persistence with earnings surprise and volume confirmation before applying a small score adjustment.",
  "score10": round(final_score_01 * 10.0, 2),
  "mlAdjustment": round(ml_adjustment * ml_confidence * 5.0, 2),
  "mlConfidence": round(ml_confidence, 2),
  "validation": validation,            # the details dict from 1.7
  "modelVersion": "factor-v3",
}
```
- **score range:** 0–5 (maxScore=5). score10 = same fraction × 10 (0–10).
- **mlAdjustment reported** = `ml_adjustment * ml_confidence * 5.0` rounded 2 (the effective contribution on the 0–5 scale), NOT raw ml_adjustment.

---

## 2. RISK SCORE — `compute_risk_score`

### 2.1 Signature
```
compute_risk_score(
  news_items, metrics, technicals,
  price_history=None, financials=None, brokerage_research=None
) -> dict
```
`financials = financials or {}`.

### 2.2 Sentiment & narrative pass over news_items
For each `article` in `news_items`:
- `sentiment = _num(article.get("sentimentScore"), 0.5)`; append `_clamp(sentiment if sentiment is not None else 0.5, 0.0, 1.0)` to `sentiments`.
- `text = (str(title) + " " + str(summary)).lower()`.
- narrative_risk_scores append:
  - if text contains any of `["lawsuit","forensic","insolvency","raid","restatement"]` → **0.85**.
  - elif contains any of `["fall","pledge","regulatory","volatility","outflow"]` → **0.65**.
  - else → `_article_risk_weight(text)`.

**`_article_risk_weight(text)`** (keyword + negation context):
- `words = [w.strip(".,;:!?()[]{}\"'") for w in text.lower().split()]`, drop empties.
- For each word at idx: `context = set(words[max(0, idx-4):idx])` (prior up to 4 words).
- If word in `HIGH_RISK_WORDS = {"fraud","default","bankruptcy","scam","downgrade","probe","collapse"}`: return `0.35` if context intersects `NEGATION_TOKENS` else `0.85`.
- If word in `MEDIUM_RISK_WORDS = {"decline","debt","penalty","delay","loss","miss","cut","weak"}`: return `0.25` if context∩negation else `0.65`.
- `NEGATION_TOKENS = {"no","not","avoids","cleared","denies","dismisses","rejects","without","free"}`.
- Default (no keyword hit, first hit returns immediately) → `0.35`.

### 2.3 Brokerage research (optional structured sentiment)
If `brokerage_research` is dict:
- `summary = brokerage_research.get("summary") or {}`; `total=_num(.total)`, `buys=_num(.buy)`, `sells=_num(.sell)`, `holds=_num(.hold)`.
- If `total not in {None, 0}` and buys/sells not None:
  - `structured_sentiment = _clamp(0.5 + (((buys-sells)/total)*0.35), 0.0, 1.0)`; append to sentiments.
  - if holds not None and `holds/total > 0.55` → append `0.5` to narrative_risk_scores.

### 2.4 Aggregate sentiment & narrative
```
sentiment_risk = _clamp(1.0 - _avg(sentiments, 0.5), 0.0, 1.0)         # inverted sentiment
narrative_risk = _clamp(_avg(narrative_risk_scores, 0.45), 0.0, 1.0)   # fallback 0.45
```

### 2.5 Financial risk (`_avg`, fallback 0.5)
Inputs: `debt_to_equity, current_ratio, roa` from metrics; `altman_z=_compute_altman_z(metrics, financials)`; `interest_coverage=_num(metrics.interestCoverage)`.
```
financial_risk = _avg([
  _normalize(debt_to_equity, 0.4, 2.5),                       # higher D/E = higher risk
  1.0 - (_normalize(current_ratio, 1.0, 3.0) or 0.5),
  1.0 - (_normalize(roa, 1.0, 10.0) or 0.5),
  1.0 - (_normalize(interest_coverage, 1.5, 8.0) or 0.5),
  1.0 - (_normalize(altman_z, 1.8, 4.0) or 0.5),
], fallback=0.5)
```
**Note:** the first element is a raw `_normalize(...)` that may be None (then `_avg` drops it). Elements 2–5 use `(_normalize(...) or 0.5)` so a None → 0.5 BEFORE the `1.0 -` (i.e. they contribute `1.0-0.5=0.5`); also a normalized value of exactly 0.0 is falsy → becomes 0.5. Replicate Python `or` truthiness exactly.

### 2.6 Technical risk (`_avg`, fallback 0.5)
Inputs: `price_features=_extract_price_features(price_history)`; `rsi14, macd` via `_num`; `trend=str(technicals.trend or "Neutral").lower()`.
```
technical_risk = _avg([
  _normalize(abs((rsi14 or 50.0) - 50.0), 0.0, 35.0),          # distance from neutral RSI
  _normalize(price_features["volatility3M"], 0.15, 0.55),
  _normalize(price_features["drawdown1Y"], 0.08, 0.45),
  0.35 if trend=="bullish" else 0.7 if trend=="bearish" else 0.5,
  0.35 if (macd is not None and macd > 0) else 0.65 if (macd is not None and macd < 0) else 0.5,
], fallback=0.5)
```
**Note `(rsi14 or 50.0)`:** rsi14 None → 50; also rsi14 == 0.0 → 50 (falsy). The MACD ternary: macd exactly 0 → 0.5.

### 2.7 Weighted risk (weights)
```
weighted_risk = 0.25*sentiment_risk
              + 0.25*financial_risk
              + 0.30*narrative_risk
              + 0.20*technical_risk
risk_score = round(_clamp(weighted_risk, 0.0, 1.0) * 5.0, 2)
```
Weights: sentiment 0.25, financialRisk 0.25, narrativeRisk 0.30, technicalRisk 0.20.

### 2.8 Return object (exact keys)
```
{
  "score": risk_score,
  "maxScore": 5,
  "components": {
    "sentiment":     round(sentiment_risk * 5.0, 2),
    "financialRisk": round(financial_risk * 5.0, 2),
    "narrativeRisk": round(narrative_risk * 5.0, 2),
    "technicalRisk": round(technical_risk * 5.0, 2),
  },
  "label": "Low" if risk_score < 2 else "Medium" if risk_score < 3.5 else "High",
  "explanation": "Risk score blends sentiment risk, financial stress, narrative red flags, and technical instability using weighted normalized factors.",
  "modelVersion": "risk-v2",
}
```
- **score range:** 0–5 (maxScore=5). No score10 field on risk. No ML/confidence/validation on risk.

---

## 3. Label thresholds (summary)
- **Smart score** (score on 0–5): `>= 4` → "Strong"; `>= 2.5` → "Moderate"; else "Weak".
- **Risk score** (score on 0–5): `< 2` → "Low"; `< 3.5` → "Medium"; else "High".

## 4. ML / confidence / version fields (summary)
- `modelVersion`: smart = `"factor-v3"`, risk = `"risk-v2"`.
- `mlConfidence` = `round(confidence, 2)` where `confidence = clamp((abs(blended_hit_rate-0.5)*2)*coverage*min(1, total_samples/320), 0, 1)`.
- `mlAdjustment` (reported) = `round(ml_adjustment * ml_confidence * 5.0, 2)`.
- `validation` = the ML details dict (samples, horizonDays=63 fixed, hitRate, upProbability, availableHorizons, per-horizon dict, features {earningsSurprise, volumePriceDivergence}).
- Effective ML impact on the 0–1 base = `ml_adjustment * ml_confidence`, where `ml_adjustment` is clamped to `[-0.08, 0.08]` and `ml_confidence` to `[0,1]`, so max ±0.08 on 0–1 (±0.40 on 0–5).

## Gotchas
- Python statistics.median: for EVEN-length sorted lists returns the AVERAGE of the two middle elements, not a single element. Both _median (smart dimensions) and the dimension medians depend on this — TS Math must replicate.
- _std uses SAMPLE standard deviation (variance divisor = n-1, ddof=1), NOT population std. Returns None if fewer than 2 values.
- Python `or` truthiness: `_num(x) or _num(y)` falls through when the first is 0.0 (zero is falsy), not just when None. Affects epsGrowth (basicEps/dilutedEps), volume fallback chain, and risk's `(_normalize(...) or 0.5)` and `(rsi14 or 50.0)` — a normalized 0.0 or rsi14==0 becomes 0.5/50.0. JS `||` matches this for 0/NaN but NOT for None-vs-0 distinctions; map None->undefined and use `?? `only where Python uses explicit `is not None`, and `||` where Python uses `or`.
- _num must reject non-finite (NaN, Inf) via isfinite and return the default. float('') and other parse failures return default via try/except.
- _normalize returns None (not 0) when value is None or when high<=low. Downstream _median/_avg DROP None entries; only non-None contribute, and if all are None the fallback (0.5, or 0.45 for narrative) is used.
- financial_risk first element `_normalize(debt_to_equity,0.4,2.5)` can be None and is then DROPPED by _avg, whereas elements 2-5 are wrapped `1.0-(_normalize(...) or 0.5)` so None/0.0 -> 0.5 and they ALWAYS contribute. This asymmetry must be preserved.
- rounding: Python round() is banker's rounding (round-half-to-even). round(2.5)->2, round(3.5)->4, round(0.125,2)->0.12. JS Math.round is round-half-up. For bit-for-bit parity implement banker's rounding for all round(x, 2)/round(x, 4) calls.
- ML logistic regression is fully deterministic: zero-initialized weights, learning_rate=0.15, exactly 140 epochs, min-max feature scaling with spread<=1e-12 -> 0.5. Reproduce float arithmetic and iteration order (rows in sample order, gradient accumulation) to match. _sigmoid saturates to 0.0 below -35 and 1.0 above 35.
- ML guard: requires len(closes) >= 220 overall, and each horizon requires >= 60 samples (else skipped). Sample loop index range is range(130, len(closes)-horizon). If no horizon qualifies, returns adjustment 0.0, confidence 0.0, validation {samples:0,horizonDays:63,hitRate:None}.
- Price feature index offsets are fixed trading-day lags: 1M=22, 3M=64, 6M=127; volatility uses last 63 daily returns annualized by sqrt(252); drawdown uses last 252 closes (or all). return1M/3M/6M require len(closes) STRICTLY > 22/64/127 respectively (note > not >=).
- _extract_price_features returns all-None block if len(closes) < 10.
- _statement_value does SUBSTRING matching on alphanumeric-normalized keys and returns the FIRST matching cell in dict iteration (insertion) order — key order in the input JSON matters. e.g. searching 'assets' matches 'totalAssets', 'currentAssets', etc.
- Altman-Z working_capital falls back to currentAssets-currentLiabilities only if the direct workingCapital lookup is None; note the source calls _statement_value(bs,['workingCapital']) THREE times (could be optimized but behavior is: use value if not None).
- _compute_earnings_surprise scales mean by 0.5 and clamps to [-0.5,0.5]; per-quarter surprise clamped [-1,1]; estimate ignored if abs(estimate)<0.01; only last 4 rows considered; needs >=2 rows total to start.
- Risk score has NO score10, NO mlAdjustment/mlConfidence/validation. Smart score HAS score10 and ML fields. Don't cross-contaminate the output shapes.
- Smart score reported mlAdjustment = ml_adjustment * ml_confidence * 5.0 (rounded 2), i.e. effective contribution on 0-5 scale, not the raw clamped adjustment.
- Dates parsed/compared in IST (UTC+5:30); insider cutoff is now(IST)-180 days; rows with unparseable dates are NOT skipped (only rows whose parsed date < cutoff are skipped).
- trend matching is exact lowercase equality to 'bullish'/'bearish' after str(... or 'Neutral').lower(); anything else -> neutral branch.
- returns_summary and news_items params of compute_smart_score are accepted but completely unused (assigned to _).