# AI features spec (backend AIAdapter + ai-engine GeminiService): exact prompts, model/env, gen config, parsing, fallbacks, source convention

# AI Features — Precise Spec

Two files implement all AI features:

- `C:\Users\KRISH\Desktop\Finance-V2\backend\app\services\ai_adapter.py` — `AIAdapter` class. Orchestrates calls, owns ALL prompt templates for the "extra" features (portfolio parser, screener, portfolio risk, competitor, earnings, roast, IPO), owns ALL JSON parsing, and owns ALL fallback text/structures. Returns `(value, source)` tuples for some features where `source` is `"gemini"` or `"fallback"`.
- `C:\Users\KRISH\Desktop\Finance-V2\ai-engine\src\ai_engine\gemini_service.py` — `GeminiService` class. Owns the prompt templates for the "core" features (chat, report, smart-score, risk-score, watchlist, compare, profile, news, SWOT), the HTTP call to Gemini, model fallback chain, and response text extraction.

---

## Model, env vars, HTTP, generation config (GeminiService)

- Constructor: `GeminiService(api_key: str, model: str = "gemini-3-flash-preview")`.
- Instantiated in `AIAdapter.__init__` as `GeminiService(api_key=settings.gemini_api_key, model=settings.gemini_model)`.
  - **Env vars** come from `app.core.config.get_settings()`: `settings.gemini_api_key` and `settings.gemini_model` (config field names; actual env var names live in `backend/app/core/config.py`, NOT in these two files — verify there, but the settings attributes are `gemini_api_key` / `gemini_model`).
- `base_url = "https://generativelanguage.googleapis.com/v1beta/models"`.
- Endpoint per model: `{base_url}/{model_name}:generateContent` with query param `key={api_key}` (API key passed as `params={"key": self.api_key}`, NOT a header).
- Timeout: `httpx.Timeout(25.0, connect=5.0)` (25s total, 5s connect).
- **Model fallback chain** (`self.fallback_models`, deduped preserving order via `dict.fromkeys`):
  1. `model` (the configured `settings.gemini_model`)
  2. `"gemini-3-flash-preview"`
  3. `"gemini-2.0-flash"`
  4. `"gemini-2.0-flash-lite"`
  5. `"gemini-1.5-flash-latest"`
  6. `"gemini-1.5-pro-latest"`
- **Request payload** (`_generate`): `{"contents": [{"parts": [{"text": prompt}]}]}`. There is **NO `generationConfig`** sent at all — no temperature, topP, maxOutputTokens, or `responseMimeType`. JSON output is requested purely via prompt text. There is also no `systemInstruction` field; the "system" text is just the first lines of the single user prompt.
- **Model selection loop** (`_generate`): iterate deduped `fallback_models`. POST to each. If `status_code == 404`, record `"{model_name}:404"` and `continue` to next model. Otherwise call `response.raise_for_status()` (any non-404 error like 429/500 raises immediately and is NOT retried with the next model), then `data = response.json()`, set `self.model = model_name`, and `break`. If the for-loop exhausts all models (all 404), the `else` clause raises `httpx.HTTPStatusError("Gemini models not available: {joined errors}", ...)`.
- **Text extraction** (`_generate`): `candidates = data.get("candidates", [])`. If empty → return `"No response generated."`. Else take `candidates[0]["content"]["parts"]`, join all `part["text"]`, `.strip()`. If empty after strip → return `"No response generated."`.
- Note: every GeminiService method returns a raw text string from `_generate`. JSON parsing happens in `AIAdapter`, not here.

---

## The `source` convention

Only some `AIAdapter` methods return a `(value, source)` tuple where `source` ∈ {`"gemini"`, `"fallback"`}:

- `chat` → returns `(answer, "gemini")` on success; `(fallback_text, "fallback")` on exception OR when Gemini/api_key unavailable.
- `generate_watchlist_review` → same tuple convention.
- `generate_compare_analysis` → same tuple convention.
- `analyze_news` → returns `(parsed_dict, "gemini")` on success; `(offline_dict, "fallback")` otherwise.

All other `AIAdapter` methods return ONLY the value (string or dict), NOT a tuple, and have no explicit source marker:
- `generate_report`, `explain_smart_score`, `explain_risk_score`, `parse_portfolio_document`, `extract_profile_details`, `generate_swot`, `parse_screener_query`, `analyze_portfolio_risk`, `generate_competitor_verdict`, `generate_earnings_tldr`, `roast_portfolio`, `generate_ipo_analysis`.

**Guard condition** used everywhere before calling Gemini: `if self._gemini and settings.gemini_api_key:`. `self._gemini` is `None` if the `ai_engine` import failed (path not mounted). On any `Exception` from the Gemini call (rate-limit/429, timeout, all-models-404, JSON failure), the code falls through to the fallback. There is NO special handling that distinguishes rate-limit from other failures — all map to the fallback path.

---

## FEATURE 1 — Chat answer (`AIAdapter.chat` → `GeminiService.chat` → `_build_chat_prompt`)

- Return: `(str, source)`.
- Context sent to Gemini (`compact_context` = `json.dumps` of): `companyName`, `symbol`, `sector`, `metrics`, `smartScore`, `riskScore`, `technicals`, `recentNews` = `context.get("news", [])[:5]`, `financials` = `{quarterly: financials.quarterly[:6], yearly: financials.yearly[:5]}`.
- **Exact prompt template:**
```
You are Financial Forensics AI, a senior Indian stock market analyst.
Use concise, factual language, avoid investment guarantees, and never invent missing facts.
Stock symbol: {symbol}
Question: {question}
Context JSON: {compact_context}

Return:
1) Direct answer
2) Why (financial + technical + sentiment)
3) Key risks
4) Suggested next checks
```
- Parsing: none — raw stripped text returned as the answer.
- **Fallback** (`_offline_chat_response`, param `live_failed`): computes `smart_score`, `risk_score` (floats, default 0.0), `pe_ratio`, `dividend_yield` from context. `setup` = "strong" (smart≥4) / "balanced" (≥2.5) / "weak". `risk_level` = "low" (<2) / "medium" (<3.5) / "high". `pe_text` = `f"P/E is {pe:.2f}"` or `"valuation needs a closer check"`. `dividend_text` = `f"dividend yield is {dy:.2f}%"` or `"income support is limited"`. `lead` = `"Live Gemini reply is unavailable right now."` if `live_failed` else `"AI chat fallback is active."` Exact returned string:
```
{lead} {SYMBOL} currently looks {setup} with a Smart Score of {smart_score:.1f}/5 and a Risk Score of {risk_score:.1f}/5, which means risk is {risk_level}. Right now {pe_text}, and {dividend_text}. Before taking a position, check debt trend, margin stability, and profit consistency.
```
  - `live_failed=True` when the Gemini call threw; `live_failed=False` when Gemini/api_key was unavailable up front.

---

## FEATURE 2 — SWOT (`AIAdapter.generate_swot` → `GeminiService.generate_swot` → `_build_swot_prompt`)

- Return: `dict` (NO source tuple).
- Context sent: `symbol`, `companyName`, `sector`, `profile`, `metrics`, `smartScore`, `riskScore`, `financials` = `{quarterly[:4], yearly[:3]}` (only if `financials` is a dict, else `{}`), `news[:5]`.
- **Exact prompt template:**
```
You are Financial Forensics AI, a senior Indian stock market analyst.
Stock symbol: {symbol}
Context JSON: {compact_context}

Task: Generate a SWOT analysis and bull/bear case for this stock.
Return strict JSON only with these keys:
{"strengths": [string, ...], "weaknesses": [string, ...], "opportunities": [string, ...], "threats": [string, ...], "bullCase": string, "bearCase": string}
Rules:
1) Each SWOT list should have 2-4 concise bullet points.
2) bullCase and bearCase should each be 2-3 sentences.
3) Use simple, clear language suited for retail investors.
4) Base analysis on the provided context data only.
5) Do not give investment guarantees or specific price targets.
6) Return JSON only, no markdown.
```
  (The JSON-keys line above is a single concatenated string in source split across three string literals; rendered verbatim it is one line.)
- **Parsing** (`_parse_swot_json`): strip; if empty → `None`. Regex `re.search(r"\{.*\}", text, re.DOTALL)` to extract first brace-block; if no match, use whole text as candidate. `json.loads(candidate)`; on exception → `None`. Must be a `dict`. Require `strengths`, `weaknesses`, `opportunities`, `threats` to all be `list` (else `None`). Coerces each list element to `str`. `bullCase`/`bearCase` default `""`, coerced to `str`. Returns dict with keys `strengths, weaknesses, opportunities, threats, bullCase, bearCase`. If parse returns `None`/falsy → fallback.
- **Fallback** (`_fallback_swot`): derives `sector` (`profile.sector` or "its sector"), `pe` (`metrics.peRatio`), `smart_score`, `risk_score`.
  - `strengths` base: `[f"Established player in {sector} with consistent market presence.", "Listed on Indian exchanges with adequate trading liquidity."]`; append `f"Strong Smart Score of {smart_score:.1f}/5 indicates solid fundamentals."` if `smart_score >= 3.5`.
  - `weaknesses` base: `["Detailed competitive positioning data is limited without AI analysis."]`; if `pe > 30` append `f"Valuation appears stretched with P/E of {pe:.1f}."`; elif `pe > 0` append `f"Current P/E of {pe:.1f} needs monitoring relative to sector peers."`.
  - `opportunities`: `["India's growing economy provides a positive macro backdrop.", "Potential for margin expansion with operational efficiency gains."]`.
  - `threats` base: `["Macro slowdown or interest rate changes could impact performance.", "Sector-specific regulatory changes may affect operations."]`; if `risk_score >= 3.5` append `f"Elevated risk score of {risk_score:.1f}/5 suggests near-term caution."`.
  - `tone` = "positive" (smart≥3.5) / "neutral" (≥2.5) / "cautious".
  - `bullCase` = `f"{SYMBOL} benefits from a {tone} fundamental picture. If the company sustains earnings growth and the sector cycle turns favorable, the stock could re-rate meaningfully from current levels."`
  - `bearCase` = `f"If macro headwinds intensify or earnings disappoint, {SYMBOL} could see valuation compression. Monitor quarterly results and management commentary closely."`

---

## FEATURE 3 — Research report markdown (`AIAdapter.generate_report` → `GeminiService.generate_report` → `_build_report_prompt`)

- Return: `str` (no source).
- Context sent: `companyName`, `symbol`, `sector`, `profile`, `metrics`, `riskScore`, `smartScore`, `news[:8]`, `financials` (full), `shareholding`.
- **Exact prompt template:**
```
Generate a professional Indian equity research note in markdown.
Symbol: {symbol}
Data: {compact_context}

Use sections:
1. Company overview
2. Industry and positioning
3. Revenue growth trends
4. Profit trends
5. Risk factors
6. Valuation summary
7. AI investment outlook
Keep it neutral and analytical.
```
- Parsing: none — raw markdown string returned.
- **Fallback** (hardcoded in `AIAdapter.generate_report`, exact markdown string):
```
# {symbol} Research Report
## Company Overview
Large-cap Indian listed company with stable financial profile in available data.
## Industry Analysis
Sector remains sensitive to rates and regulatory cycles.
## Revenue Growth Trends
Revenue has shown multi-year expansion with quarterly volatility.
## Profit Trends
Profitability remains positive, monitor margin persistence.
## Risk Factors
Macro slowdown, sector credit stress, and valuation compression risk.
## Valuation Analysis
Current valuation appears fair versus long-term averages.
## AI Investment Summary
Suitable for watchlist; staggered accumulation only after confirming trend continuation.
```
  (Note: fallback section headers differ from the prompt's requested section names.)

---

## FEATURE 4 — Smart-score explanation (`AIAdapter.explain_smart_score` → `GeminiService.explain_smart_score` → `_build_smart_score_prompt`)

- Return: `str` (no source).
- Context sent: `symbol`, `companyName`, `sector`, `smartScore`={score, score10, dimensions}, `riskScore`={score, components, label}, `brokerageSummary`=`brokerageResearch.summary` (or `{}`), `metrics`={peRatio, pbRatio, roe, debtToEquity, currentRatio}, `technicals`={trend, rsi14, macd}, `returnsSummary`=`returnsSummary[:4]`, `recentNews`=`news[:4]`.
- **Exact prompt template:**
```
You are a helpful stock explainer for beginners.
Stock symbol: {symbol}
Context JSON: {compact_context}

Task: Explain what this Smart Score means in very simple language.
Output rules:
1) Use simple words that a 12-year-old can understand.
2) 3 short sentences only.
3) Mention 2 good points and 1 caution.
3a) Use only the facts visible in the context JSON.
4) Replace finance jargon with simple words.
5) Do not use words like setup, allocation, position sizing, conviction, or drawdown.
6) Do not use markdown, bullets, or investment guarantees.
7) Keep under 70 words.
```
  (Note literal duplicate rule numbering: "3)" then "3a)" then "4)".)
- Parsing: none — raw stripped text.
- **Fallback** (in `AIAdapter.explain_smart_score`): `smart = context["smartScore"]`, `score` float (default 0.0), `dimensions` dict. `top` = top-2 dimensions by value desc; `weak` = lowest-1. `top_text` = comma-joined names or "key factors". `weak_text` = weakest name or "momentum". `setup` = "improving" (score≥4) / "neutral" (≥2.5) / "weak". Exact:
```
{SYMBOL} has a Smart Score of {score:.1f} out of 5, so the overall picture is {setup}. The stronger parts are {top_text}. The weak part is {weak_text}, so it is safer to invest slowly until this improves.
```

---

## FEATURE 5 — Risk-score explanation (`AIAdapter.explain_risk_score` → `GeminiService.explain_risk_score` → `_build_risk_score_prompt`)

- Return: `str` (no source).
- Context sent: `symbol`, `companyName`, `sector`, `riskScore`={score, components, label}, `smartScore`={score, dimensions}, `brokerageSummary`, `metrics`={debtToEquity, currentRatio, roa}, `technicals`={trend, rsi14, macd}, `recentNews`=`news[:4]`.
- **Exact prompt template:**
```
You are a helpful stock explainer for beginners.
Stock symbol: {symbol}
Context JSON: {compact_context}

Task: Explain what this Risk Score means in very simple language.
Output rules:
1) Use simple words that a 12-year-old can understand.
2) 3 short sentences only.
3) Say if risk is low, medium, or high in plain words.
3a) Use only the facts visible in the context JSON.
4) Mention one main risk and one positive point.
5) Give one simple safety tip (for example: invest slowly).
6) Do not use markdown, bullets, or investment guarantees.
7) Keep under 70 words.
```
- Parsing: none.
- **Fallback** (in `AIAdapter.explain_risk_score`): `risk = context["riskScore"]`, `score` float, `components` dict. `high` = top-1 component desc; `low` = lowest-1. `high_text` = highest name or "market mood"; `low_text` = lowest name or "financial risk". `level` = "low" (<2) / "medium" (<3.5) / "high". Exact:
```
{SYMBOL} has a Risk Score of {score:.1f} out of 5, so risk is {level}. The main risk now is {high_text}, while {low_text} looks better. To stay safe, invest in small parts instead of all at once.
```

---

## FEATURE 6 — News analysis (`AIAdapter.analyze_news` → `GeminiService.analyze_news` → `_build_news_analysis_prompt`)

- Return: `(dict, source)`. Dict keys: `overview`, `market_impact`, `watchpoint` (note snake_case in the RETURNED dict).
- Context sent: `symbol`, `companyName`, `sector`, `smartScore`=`smartScore.label`, `riskScore`=`riskScore.label`, `article`={title, summary, source, publishedAt, sentimentScore}.
- **Exact prompt template** (note prompt asks for camelCase `marketImpact`):
```
You are Financial Forensics AI, summarizing one stock news item for a retail investor.
Stock symbol: {symbol}
Context JSON: {compact_context}

Task: Return strict JSON only with these keys:
{"overview": string, "marketImpact": string, "watchpoint": string}
Rules:
1) Use only the facts visible in the context JSON.
2) Keep each field to 1 short sentence.
3) Use simple, clear language.
4) Do not give guarantees or price targets.
5) If the article is vague, say what is still unclear.
6) Return JSON only, no markdown.
```
- **Parsing** (`_parse_news_analysis`): strip; empty → `{}`. Regex `re.search(r"\{.*\}", text, re.DOTALL)`; candidate = match or whole text. `json.loads`; on exception → `{}`. Must be dict. `overview` = whitespace-collapsed `parsed["overview"]`; `market_impact` = collapsed `parsed.get("marketImpact") or parsed.get("market_impact")` (accepts BOTH camelCase and snake_case); `watchpoint` collapsed. If any of the three is empty → return `{}` (which triggers fallback in caller since `if parsed:` is falsy). Returns dict with snake_case keys `overview, market_impact, watchpoint`.
- **Fallback** (`_offline_news_analysis`): `title`/`summary`/`source` whitespace-collapsed; `sentiment_value` float (default 0.5).
  - `tone` (→ `market_impact`): sentiment≥0.6 → `"The tone looks broadly positive for the stock, but it still needs confirmation in future updates."`; ≤0.45 → `"The tone looks cautious, so the market may focus on risks until management or results add clarity."`; else → `"The tone looks mixed, so this news alone is not enough to change the full stock view."`
  - `overview`: if `summary` → summary truncated to 180 chars (`f"{summary[:177].rstrip()}..."` if >180); elif `title` → `f"{source} reports: {title}."`; else → `f"This update on {SYMBOL} is available, but the article details are limited."`
  - `watchpoint`: constant `"Watch the next company filing, management comment, or quarterly result to see whether this headline changes earnings or risk."`
  - Returns `{overview, market_impact, watchpoint}`, source `"fallback"`.

---

## FEATURE 7 — Competitor verdict (`AIAdapter.generate_competitor_verdict`; prompt is BUILT IN AIAdapter, calls `GeminiService.chat`)

- Return: `dict` (no source). This feature does NOT use a GeminiService prompt-builder; it builds the prompt locally and calls `self._gemini.chat(symbol=symbol, question=prompt, context={})`. (That means the chat system-preamble from `_build_chat_prompt` wraps this prompt — `chat` always prepends the "Financial Forensics AI" lines and appends the "Return: 1) Direct answer…" block around `question`.)
- Inputs: `symbol`, `stock_metrics`, `peers` (list). `peers_text` = up to first 6 peers each formatted as `"{name|symbol|?}: PE={pe}, PB={pb}, ROE={roe}%, MCap={marketCap}"` joined with `"- "` lines, else `"No peer data"`. `own_pe` = `pe` or `peRatio`; `own_roe` = `roe` or `returnOnEquity`; `own_pb` = `pb` or `priceToBook`.
- **Exact prompt template** (the `question` passed to chat):
```
You are an expert Indian equity analyst. Compare {SYMBOL} against its peers.
{SYMBOL}: PE={own_pe}, PB={own_pb}, ROE={own_roe}%
Peers:
{peers_text}

Respond with ONLY a JSON object with keys:
  winner (str: company name that looks best value right now),
  winnerReason (str: 1-2 sentences why),
  verdict (str: 2-3 sentence AI summary of the competitive landscape),
  subjectRating (str: 'Overvalued'|'Fairly Valued'|'Undervalued'),
  watchOut (str: 1 key risk for the subject stock vs peers).
Be direct and opinionated. No markdown.
```
- **Parsing**: `raw = await chat(...)`. Regex `re.search(r"\{.*\}", str(raw), re.DOTALL)`. `json.loads(match)`. Accept only if `isinstance(dict) and parsed.get("verdict")` truthy; else fallback.
- **Fallback**: `best_pe_peer` = peer with min `pe` (treating missing as 9999) or None. `winner` = that peer's `name` (or `symbol` if no peers). Returns:
```
{
  "winner": winner,
  "winnerReason": "{winner} shows the most attractive valuation metrics among peers.",
  "verdict": "{SYMBOL} competes in a sector with {len(peers)} peers. AI analysis is offline — compare PE, ROE, and PB ratios manually to identify the best value.",
  "subjectRating": "Fairly Valued",
  "watchOut": "Monitor quarterly earnings and margin trends relative to peers."
}
```

---

## FEATURE 8 — Earnings TL;DR (`AIAdapter.generate_earnings_tldr`; prompt built in AIAdapter, calls `chat`)

- Return: `dict` (no source). If no `quarterly_data` → `{"error": "No quarterly data available"}`.
- Uses last 4 quarters (`quarterly_data[:4]`). Each formatted via `fmt_q`: `rev` = `revenue|totalRevenue|0`; `profit` = `profit|netIncome|netProfit|0`; `period` = `period|date|?`; growth: `rev_g`=`totalRevenueGrowthPct|revenueGrowth`, `ni_g`=`niGrowthPct|netIncomeGrowth`. Growth shown as `round(val*100 if abs(val)<5 else val, 1)%` (heuristic: treats small magnitudes as fractions). Line: `"{period}: Revenue={rev:,.0f}, NetProfit={profit:,.0f}{ RevGrowth=…% ProfitGrowth=…%}"`. `name` = `company_name or symbol`.
- **Exact prompt template** (`question` to chat):
```
You are a senior equity research analyst. Summarize {name}'s recent earnings for a retail investor.
Last 4 quarters:
{quarters_text}

Respond with ONLY a JSON object with keys:
  headline (str: punchy 10-word verdict on earnings quality),
  trend (str: 'Accelerating'|'Stable'|'Decelerating'|'Recovering'|'Declining'),
  toneColor (str: 'green'|'amber'|'red'),
  bullets (list of exactly 4 strings: key takeaways a retail investor needs to know),
  ceoSignal (str: what management's numbers are signalling — optimistic, cautious, or mixed),
  watchNext (str: the ONE thing to watch in the next quarterly result).
Be direct. No markdown. Numbers in Indian format (Cr, L).
```
- **Parsing**: regex `\{.*\}` DOTALL on `str(raw)`; `json.loads`; accept if `dict and parsed.get("bullets")` truthy; else fallback.
- **Fallback** (rule-based): `revenues`/`profits` floats per quarter. `rev_trend` = "growing" if `revenues[0] > revenues[-1]` else "declining". `profit_trend` = "improving" if `profits[0] > profits[-1]` else "under pressure". `tone_color` = "green" (growing&improving) / "amber" (growing) / "red". `trend_label` = "Accelerating" (growing&improving) / "Stable" (growing) / "Declining". Returns:
```
{
  "headline": "{name} revenue {rev_trend}, profits {profit_trend}",
  "trend": trend_label,
  "toneColor": tone_color,
  "bullets": [
    "Revenue trend is {rev_trend} over the last 4 reported quarters.",
    "Net profit is {profit_trend} over the same period.",
    "Check operating margins for business quality signals.",
    "Compare with sector peers before drawing conclusions."
  ],
  "ceoSignal": "Management data suggests a mixed picture — verify with the actual earnings call transcript.",
  "watchNext": "Revenue growth consistency and operating margin expansion in the next quarter."
}
```

---

## FEATURE 9 — Watchlist analysis (`AIAdapter.generate_watchlist_review` → `GeminiService.generate_watchlist_review` → `_build_watchlist_review_prompt`)

- Return: `(str, source)`.
- Context sent: `symbol`, `companyName`, `sector`, `profile`, `smartScore`={score, label, dimensions}, `riskScore`={score, label, components}, `metrics`={peRatio, pbRatio, roe, roce, debtToEquity, currentRatio, dividendYield}, `technicals`={trend, rsi14, macd, ema20, ema50}, `financials`={quarterly[:4], yearly[:3]}, `news[:5]`, `brokerageSummary`.
- **Exact prompt template:**
```
You are the lead quantamental researcher at an elite investment fund covering Indian equities.
Think like a high-end buy-side analyst: skeptical, evidence-driven, and concise.
Use only the facts in the context JSON. Do not invent missing numbers. Do not give price targets or guarantees.
Stock symbol: {symbol}
Context JSON: {compact_context}

Task: Write a short watchlist review of what you think about this stock right now.
Output rules:
1) Plain text only, no markdown bullets or tables.
2) Use exactly these section labels on separate lines: Core view:, What supports it:, What can go wrong:, What changes my mind:, Bottom line:.
3) Each section must be 1-2 sentences.
4) Focus on quality, valuation regime, balance-sheet risk, factor profile, news flow, and trend confirmation.
5) If evidence is mixed, say so directly.
6) Keep the whole response under 220 words.
```
- Parsing: none — raw stripped text.
- **Fallback** (`_fallback_watchlist_review`, param `live_failed`): derives smart/risk scores, pe, roe, debtToEquity, trend (default "Neutral"), rsi, news count.
  - `quality_view` = "above average"(smart≥3.5)/"mixed"(≥2.5)/"weak". `risk_view` = "contained"(<2.0)/"watchable"(<3.5)/"elevated". `valuation_view` = `f"valuation is not obviously cheap with P/E near {pe:.1f}"` if pe>0 else `"valuation needs more work because P/E context is incomplete"`. `quality_metric` = `f"ROE is around {roe:.1f}%"` or `"profit quality metrics are incomplete"`. `leverage_view` = `f"debt-to-equity is about {d/e:.2f}"` or `"balance-sheet leverage needs confirmation"`. `momentum_view` = `f"trend reads {trend.lower()} with RSI near {rsi:.1f}"` or `f"trend reads {trend.lower()}"`. `lead` = `"Live quant review is temporarily unavailable."` if live_failed else `"Fallback quant review."`. Exact multi-paragraph string:
```
{lead}

Core view: {SYMBOL} screens as a {quality_view} name with Smart Score {smart:.1f}/5 and risk {risk_view} at {risk:.1f}/5. My first read is that {valuation_view}.

What stands out: {quality_metric}, {leverage_view}, and {momentum_view}. News flow coverage is {active|limited (active if news>=3)}, which affects short-term conviction.

What can break the thesis: any slowdown in earnings quality, weaker margins, or a rise in balance-sheet stress will matter more than narrative. If the stock is already expensive, even decent execution may not protect downside.

Bottom line: keep it on the watchlist if you can justify both valuation and business durability on the next review. I would want stronger evidence on earnings consistency before treating it as a high-conviction position.
```

---

## FEATURE 10 — Compare analysis (`AIAdapter.generate_compare_analysis` → `GeminiService.generate_compare_analysis` → `_build_compare_analysis_prompt`)

- Return: `(str, source)`.
- Context sent: `{stockA: compact(context_a, symbol_a), stockB: compact(context_b, symbol_b)}`. Each `compact()` includes: symbol, companyName, sector, profile, smartScore={score,label,dimensions}, riskScore={score,label,components}, metrics={peRatio, pbRatio, roe, roce, debtToEquity, currentRatio, dividendYield, marketCap, revenueGrowth, profitGrowth, operatingMargin, netMargin}, technicals={trend, rsi14, macd, ema20, ema50}, financials={quarterly[:4], yearly[:3]}, news[:4], brokerageSummary.
- **Exact prompt template:**
```
You are the lead quantamental researcher at an elite investment fund covering Indian equities.
Write like a high-end buy-side analyst: direct, skeptical, evidence-based, and decisive.
Use only the facts in the context JSON. Do not invent numbers. Do not give price targets or guarantees.
Compare {SYMBOL_A} versus {SYMBOL_B}.
Context JSON: {compact_context}

Task: Produce a short comparative AI summary for the user.
Output rules:
1) Plain text only, no markdown bullets or tables.
2) Use exactly these section labels on separate lines: Winner right now:, Why:, What still worries me:, Best fit for:, Bottom line:.
3) Each section must be 1-2 sentences.
4) Judge on quality, valuation regime, risk, trend confirmation, and resilience of the setup.
5) If the answer is close, say it is close instead of forcing a strong winner.
6) Keep the full response under 230 words.
```
- Parsing: none — raw stripped text.
- **Fallback** (`_fallback_compare_analysis`, param `live_failed`): builds a numeric `score_bundle` per stock (smart, risk, roe, roce, pe, debt, rev_growth, profit_growth, trend_up flag where trend ∈ {bullish, uptrend, positive}). `composite` = `smart*1.6 + roe*0.04 + roce*0.04 + rev_growth*0.04 + profit_growth*0.04 + trend_up*0.5 - (risk*0.8 + max(debt,0)*0.15) - (pe*0.02 if pe>0 else 0)`. `winner` = A if `score_a > score_b + 0.35`, B if `score_b > score_a + 0.35`, else `"Close call"`. `lead` = `"Live compare analysis is temporarily unavailable."`/`"Fallback compare analysis."`. Builds `why`, `fit`, fixed `risk_line`, and `bottom` line per branch. Exact final shape:
```
{lead}

Winner right now: {winner}.
Why: {why}
What still worries me: {risk_line}
Best fit for: {fit}
Bottom line: {bottom}
```
  - Close-call `why`: "Both names screen close on the current factor mix. {A} looks better on some quality or trend inputs, while {B} offsets that on valuation or risk." `fit`: "{A} suits a user leaning toward relative quality, while {B} may suit someone prioritizing cheaper entry or lower explicit risk." `bottom`: "I would not force a strong winner between {A} and {B} until the next fundamental or trend confirmation comes through."
  - A-wins / B-wins branches have symmetric `why`/`fit` text (see source lines 420-431); `bottom` for a decisive winner: "If I had to rank them today, I would place {winner} first."
  - `risk_line` (constant): "The main uncertainty is that one or both setups may be paying up for quality without enough earnings confirmation. I would also want to re-check balance-sheet stress and whether the recent trend is durable rather than just noisy."

---

## FEATURE 11 — Portfolio risk (`AIAdapter.analyze_portfolio_risk`; prompt built in AIAdapter, calls `chat` with symbol="PORTFOLIO")

- Return: `dict` (no source). If no holdings → `{"error": "No holdings provided"}`.
- `total_value` = sum of `currentValue or investedValue`. `holdings_text` lines: `"- {symbol}: ₹{value:,.0f} ({weight:.1f}%), sector={sector|Unknown}, beta={beta|N/A}"`.
- **Exact prompt template** (`question` to chat, symbol="PORTFOLIO"):
```
You are a portfolio risk analyst for Indian equity markets. Analyze this portfolio and respond with a JSON object with these keys:
  overallRisk (str: Low/Medium/High), riskScore (float 0-10), diversificationScore (float 0-10), sectorConcentration (str: brief description), topRisks (list of 3 str), recommendations (list of 3 str), summary (str: 2-3 sentences).
Portfolio (total ₹{total_value:,.0f}):
{holdings_text}
Respond with ONLY raw JSON, no markdown.
```
- **Parsing**: regex `\{.*\}` DOTALL on `str(raw)`; `json.loads`; accept if `dict and parsed.get("summary")` truthy; else fallback.
- **Fallback** (`_fallback_portfolio_risk`): `unique_sectors` count; `n`; `largest_weight` = max weight; `concentration` = "concentrated"(>40)/"moderate"(>25)/"diversified". `div_score` = `min(10, unique_sectors*1.5 + n*0.5)`. `risk_score` = `10 - div_score` if largest>40 else `5.0`. `top_sector` = most common sector. Returns:
```
{
  "overallRisk": "High" if risk_score>7 else "Medium" if >4 else "Low",
  "riskScore": round(risk_score,1),
  "diversificationScore": round(div_score,1),
  "sectorConcentration": "Heavy in {top_sector}" if count>n//2 else "{unique_sectors} sectors",
  "topRisks": [
    "Portfolio is {concentration} — top holding is {largest_weight:.0f}% of total",
    "Sector correlation may amplify drawdowns in a market downturn",
    "Monitor quarterly earnings for all holdings regularly"
  ],
  "recommendations": [
    "Consider diversifying across {max(0,5-unique_sectors)} more sectors",
    "Add defensive sectors (FMCG/Pharma) if not already present",
    "Review any holding above 30% weight for trimming opportunity"
  ],
  "summary": "Your portfolio of {n} stocks spans {unique_sectors} sector(s) with a {concentration} allocation profile. The largest holding is {largest_weight:.0f}% of the total. Consider rebalancing to reduce concentration risk and improve long-term resilience."
}
```

---

## FEATURE 12 — Portfolio roast (`AIAdapter.roast_portfolio`; prompt built in AIAdapter, calls `chat` with symbol="PORTFOLIO")

- Return: `dict` (no source). If no holdings → `{"error": "No holdings to analyse"}`.
- `n` = len. `holdings_text` (first 20 holdings): `"- {symbol}: {quantity|?} shares @ avg ₹{avgPrice|?}, current value ₹{currentValue|?:,.0f}, P&L: {+ if pnl>=0}{pnl|?}"`.
- **Exact prompt template** (`question` to chat, symbol="PORTFOLIO"):
```
You are a witty but expert Indian stock market analyst. The user has {n} stocks worth ₹{total_value:,.0f} total. Analyse their portfolio and give honest, slightly roast-y but constructive feedback.
Holdings:
{holdings_text}

Respond with ONLY a JSON object with these keys:
  grade (str: 'S'|'A'|'B'|'C'|'D'|'F'),
  gradeBadge (str: e.g. 'Balanced Beginner' or 'Concentration King' or 'Value Hunter'),
  roast (str: 1-2 funny but true sentences about what's wrong — be honest but not cruel),
  praiseOne (str: 1 thing they did right),
  topRed (str: the single most dangerous holding and why),
  topGreen (str: the single best holding and why),
  fixes (list of 3 str: specific actionable improvements),
  verdict (str: 2-sentence overall portfolio health summary).
Be opinionated, specific, and direct. No markdown.
```
- **Parsing**: regex `\{.*\}` DOTALL; `json.loads`; accept if `dict and parsed.get("roast")` truthy; else fallback.
- **Fallback**: `losers` = pnl<0, `winners` = pnl>0. `grade` = "A"(losers < n*0.2) / "B"(< n*0.4) / "C". Returns:
```
{
  "grade": grade,
  "gradeBadge": "Emerging Investor",
  "roast": "You have {len(losers)} losers out of {n} stocks. Either the market hates you, or you have a gift for buying tops.",
  "praiseOne": "You have {len(winners)} winning positions — not bad.",
  "topRed": "{worst-pnl symbol or N/A} — largest drag on portfolio.",
  "topGreen": "{best-pnl symbol or N/A} — your top performer.",
  "fixes": [
    "Review your losing positions — cut or average down with conviction, not hope.",
    "Ensure no single stock exceeds 20% of portfolio value.",
    "Add 1-2 defensive plays (FMCG/Pharma) to reduce beta."
  ],
  "verdict": "Your portfolio of {n} stocks shows room for improvement. Focus on quality over quantity and review position sizing."
}
```

---

## FEATURE 13 — Profile enrichment (`AIAdapter.extract_profile_details` → `GeminiService.extract_profile_details` → `_build_profile_prompt`)

- Return: `str` (raw JSON string, no source). On any failure returns literally `"{}"`.
- Context sent: `symbol`, `companyName`, `sector`, `profile`, `description` = `profile.description`.
- **Exact prompt template:**
```
You are extracting company profile facts for an Indian listed stock.
Stock symbol: {symbol}
Context JSON: {compact_context}

Task: Return only strict JSON with these keys:
{"incorporationYear": number|null, "headquarters": string|null, "chairman": string|null, "previousName": string|null}
Rules:
1) Use the existing context first.
2) If a field is uncertain, use null.
3) Do not invent facts.
4) Return JSON only, no markdown.
```
- **Parsing**: NONE in `extract_profile_details` — it returns the raw Gemini string directly (caller is responsible for parsing). On exception → returns `"{}"`.
- **Fallback**: literally the string `"{}"`.

---

## FEATURE 14 — IPO ai-analysis (`AIAdapter.generate_ipo_analysis`; prompt built in AIAdapter, calls `chat`)

- Return: `dict` (no source). Calls `self._gemini.chat(symbol, prompt, {})` (positional args). Handles `raw` possibly being a tuple: `raw_str = raw[0] if isinstance(raw, tuple) else str(raw)`.
- Inputs from `ipo_data`: `priceRange|N/A`, `marketCap|N/A`, `exchange|NSE/BSE`, `actions|""`, `date|N/A`, `shares|N/A`.
- **Exact prompt template** (triple-quoted f-string `question`):
```
You are an expert Indian equity analyst. Analyse this IPO and give a concise verdict.

IPO Details:
- Company: {company}
- Symbol: {symbol}
- Exchange: {exchange}
- Listing Date: {date}
- Price Range: {price_range}
- Issue Size: {market_cap}
- Total Shares: {shares}
- Issue Type: {actions}

Respond ONLY with valid JSON in this exact structure:
{
  "verdict": "Subscribe / Avoid / Neutral",
  "verdictColor": "green / red / yellow",
  "summary": "2-3 sentence plain English overview of this IPO",
  "keyStrengths": ["strength 1", "strength 2", "strength 3"],
  "keyRisks": ["risk 1", "risk 2", "risk 3"],
  "valuation": "Brief comment on whether the IPO pricing looks fair, expensive, or cheap based on the price range",
  "listingOutlook": "Short-term listing gain expectation — bullish / neutral / cautious",
  "whoShouldApply": "Type of investor this suits — long-term / listing gain / avoid",
  "quickTake": "One punchy sentence that sums up the entire IPO for a busy investor"
}
```
- **Parsing**: regex `\{.*\}` DOTALL on `raw_str`; `json.loads`. Acceptance requires ALL of: `["verdict","summary","keyStrengths","keyRisks","listingOutlook","quickTake"]` present (`all(k in parsed for k in required)`). Else fallback.
- **Fallback**:
```
{
  "verdict": "Neutral",
  "verdictColor": "yellow",
  "summary": "{company} is coming to market at {price_range}. Investors should review the DRHP for business fundamentals before subscribing.",
  "keyStrengths": ["Accessing public capital markets for growth", "Exchange listing improves liquidity and price discovery", "Brand visibility increases post-listing"],
  "keyRisks": ["Market conditions may affect listing performance", "Post-IPO lock-in expiry could cause price volatility", "Limited trading history as a listed entity"],
  "valuation": "Price range {price_range} needs to be evaluated against sector peers and growth prospects before drawing conclusions.",
  "listingOutlook": "neutral",
  "whoShouldApply": "Investors with medium-to-long term horizon who have reviewed the business fundamentals",
  "quickTake": "Approach {company}'s IPO with caution — do your own research before subscribing."
}
```

---

## FEATURE 15 — AI screener parsing (`AIAdapter.parse_screener_query`; prompt built in AIAdapter, calls `chat` with symbol="SCREENER")

- Return: `dict` (no source). 
- **Exact prompt template** (`question` to chat, symbol="SCREENER"):
```
You are a stock screener assistant for Indian markets (NSE/BSE). Convert the user's natural language query into a JSON object with ONLY these optional keys:
  exchange (str, default 'NSE'), sector (str), market_cap_min (float, in USD), market_cap_max (float, in USD), pe_min (float), pe_max (float), price_min (float), price_max (float), dividend_min (float, percent), volume_min (float), limit (int, default 50).
Rules: Market cap 500 Cr ≈ 60000000 USD. Only include keys the user mentions. Sector must be one of: Technology, Finance, Healthcare, Consumer, Energy, Industrials, Materials, Utilities, Real Estate, Telecom, Auto.
Respond with ONLY raw JSON, no markdown, no explanation.
Query: "{query}"
```
- **Parsing**: regex `re.search(r"\{[^{}]*\}", str(raw), re.DOTALL)` — note this differs from other features: it matches a NON-nested brace block (`[^{}]*`) rather than greedy `.*`. `json.loads`; accept if `dict`; else fall through to rule-based fallback.
- **Fallback** (`_rule_based_screener_parse`): keyword→sector map (it/tech/software→Technology, bank/banking/finance/nbfc→Finance, pharma/health/hospital→Healthcare, fmcg/consumer→Consumer, energy/power/oil→Energy, auto/automobile→Auto, real estate/realty→Real Estate, telecom→Telecom). Regex `pe\s*(under|below|less\s*than|<)\s*(\d+)` → `pe_max`. Regex `dividend\s*(above|over|>|greater\s*than)\s*(\d+(?:\.\d+)?)\s*%?` → `dividend_min`. Cap keywords: "large cap"/"largecap" → market_cap_min=2_400_000_000; "mid cap"/"midcap" → min=600_000_000,max=2_400_000_000; "small cap"/"smallcap" → min=60_000_000,max=600_000_000.

---

## FEATURE 16 — Portfolio document parsing (`AIAdapter.parse_portfolio_document`; prompt built in AIAdapter, calls `chat` with symbol="PORTFOLIO_PARSER")

(Not in the user's enumerated list but present in the file — included for completeness.)
- Return: `list[dict]`. Empty input → `[]`. Any failure → `[]`.
- **Exact prompt template** (`question` to chat, symbol="PORTFOLIO_PARSER"):
```
You are a sophisticated financial extraction AI for Indian markets. Extract stock information from the following unstructured text. For each stock, find: symbol (try to match NSE/BSE tickers if possible), companyName (if symbol is ambiguous), buyDate (YYYY-MM-DD), buyPrice (number), and quantity (number).
Rules:
- If a date is ambiguous (e.g., 01/02/23), use Indian format (DD/MM/YYYY) first.
- If buyPrice or quantity is missing, estimate from context or use null.
- Respond with ONLY a JSON list of objects, no markdown.
Text content:
{text}
```
- **Parsing**: regex `re.search(r"\[.*\]", str(raw), re.DOTALL)` — matches a LIST (square brackets), not an object. `json.loads`; accept if `list`. Else `[]`.
- **Fallback**: empty list `[]`.

---

## Cross-cutting notes / gotchas

- The 7 features routed through `_build_chat_prompt` indirectly (competitor, earnings, portfolio risk, roast, IPO, screener, portfolio-parser all call `GeminiService.chat`) get the chat wrapper text PREPENDED and APPENDED around their custom `question`. So the model sees the "Financial Forensics AI… Return: 1) Direct answer / 2) Why / 3) Key risks / 4) Suggested next checks" scaffold wrapping a "Respond with ONLY JSON" instruction — a conflicting instruction set. The JSON-extraction regex is what salvages the JSON from any extra prose.
- Prompt asks for camelCase `marketImpact` in news; parser accepts both `marketImpact` and `market_impact` and outputs snake_case `market_impact`.
- IPO is the only feature that defends against `chat` returning a tuple (`raw[0] if isinstance(raw, tuple)`), even though `GeminiService.chat` actually returns a plain `str`.
- Screener and portfolio-parser use restrictive regexes (`\{[^{}]*\}` and `\[.*\]`); all other JSON features use greedy `\{.*\}`.
- No `generationConfig` / temperature anywhere — determinism and JSON-mode are not enforced at the API level.
- Rate-limit (HTTP 429) is NOT retried across the model fallback chain — only 404 advances to the next model. 429/500/timeout raise out of `_generate`, caught by the `try/except Exception` in `AIAdapter`, and route to the fallback.

## External APIs

### Google Gemini (Generative Language API) generateContent
- URL: `https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}`
- POST. Auth via query param key={api_key} (NOT a header). Body: {"contents":[{"parts":[{"text": prompt}]}]}. NO generationConfig / systemInstruction sent. httpx.Timeout(25.0, connect=5.0). Model fallback chain (deduped, in order): settings.gemini_model, gemini-3-flash-preview, gemini-2.0-flash, gemini-2.0-flash-lite, gemini-1.5-flash-latest, gemini-1.5-pro-latest. On HTTP 404 -> record '{model}:404' and try next model; on any other error -> raise_for_status() immediately (NOT retried). If all 404 -> raise httpx.HTTPStatusError 'Gemini models not available: ...'. Response parsing: data['candidates'][0]['content']['parts'][*]['text'] joined and stripped; empty candidates or empty text -> 'No response generated.'. Default model gemini-3-flash-preview. API key + model come from settings.gemini_api_key / settings.gemini_model (defined in backend/app/core/config.py).


## Gotchas
- No generationConfig/temperature/responseMimeType is ever sent to Gemini; JSON output is requested only via prompt text. JSON-mode is not enforced at API level.
- Only HTTP 404 advances to the next model in the fallback chain. 429 (rate limit), 500, and timeouts raise immediately from _generate, are caught by AIAdapter's broad 'except Exception', and route to the deterministic fallback. There is NO distinct rate-limit handling.
- The 'source' tuple convention applies to ONLY 4 methods: chat, generate_watchlist_review, generate_compare_analysis, analyze_news. They return (value, 'gemini') on success or (fallback, 'fallback') otherwise. All other methods return just the value with no source marker.
- live_failed flag distinguishes two fallback triggers in chat/watchlist/compare: True = Gemini threw an exception ('Live ... unavailable' lead text); False = Gemini/api_key unavailable up front (e.g. 'AI chat fallback is active.').
- Guard 'if self._gemini and settings.gemini_api_key' gates every Gemini call. self._gemini is None if the ai_engine import at module load failed (path not mounted) -- in that case all features silently use fallbacks.
- Competitor, earnings TL;DR, portfolio risk, portfolio roast, IPO, screener, and portfolio-parser do NOT use a GeminiService prompt-builder. They build the prompt locally in AIAdapter and call GeminiService.chat(symbol=..., question=prompt, context={}). Because chat always wraps question with the _build_chat_prompt scaffold ('You are Financial Forensics AI... Return: 1) Direct answer ...'), the model receives the chat scaffold AROUND the 'Respond with ONLY JSON' instruction -- conflicting instructions salvaged by JSON-regex extraction.
- Sentinel symbols passed to chat for non-stock features: 'PORTFOLIO_PARSER' (doc parse), 'SCREENER', 'PORTFOLIO' (both portfolio risk and roast), and the real symbol for competitor/earnings/IPO.
- JSON extraction regexes differ by feature: most use greedy r'\{.*\}' (DOTALL); screener uses r'\{[^{}]*\}' (non-nested object only); portfolio-parser uses r'\[.*\]' (a list). SWOT/news fall back to using the whole text as candidate if no brace match.
- News: prompt asks for key 'marketImpact' (camelCase) but parser accepts BOTH 'marketImpact' and 'market_impact' and emits snake_case 'market_impact'. All three fields (overview, market_impact, watchpoint) must be non-empty or parser returns {} -> triggers fallback.
- Acceptance gates per feature before trusting Gemini JSON: SWOT requires the 4 SWOT keys to be lists; competitor requires truthy 'verdict'; earnings requires truthy 'bullets'; portfolio risk requires truthy 'summary'; roast requires truthy 'roast'; IPO requires ALL of verdict/summary/keyStrengths/keyRisks/listingOutlook/quickTake present; news requires all 3 fields non-empty. Failing the gate -> fallback.
- extract_profile_details returns the RAW Gemini string unparsed (caller parses); its fallback is the literal string '{}'. parse_portfolio_document fallback is []; analyze_portfolio_risk/roast_portfolio/earnings return {'error': ...} when input lists are empty (before any Gemini call).
- IPO is the only method that defends against chat returning a tuple: raw_str = raw[0] if isinstance(raw, tuple) else str(raw). In practice GeminiService.chat returns a plain str, so this is defensive only.
- The report fallback markdown uses section headers ('Company Overview', 'Industry Analysis', 'Smart Investment Summary'-style) that differ from the section names requested in the live prompt ('Company overview', 'Industry and positioning', 'AI investment outlook').
- Smart-score prompt has duplicated rule numbering on purpose in source: '3)' then '3a)' then '4)'. Both smart and risk score prompts cap output 'under 70 words', 3 sentences, ban markdown, target a 12-year-old reading level; smart-score additionally bans the words setup/allocation/position sizing/conviction/drawdown.
- Earnings fmt_q growth heuristic: round(val*100 if abs(val)<5 else val, 1) -- assumes magnitudes <5 are fractions (0.12 -> 12%) and >=5 are already percents.
- Number/currency formatting in portfolio prompts uses ₹ and ',.0f' (Indian rupee, thousands-separated, no decimals); screener encodes market caps in USD with the comment '500 Cr ≈ 60000000 USD' and large/mid/small-cap thresholds 2.4e9 / 6e8 / 6e7 USD.