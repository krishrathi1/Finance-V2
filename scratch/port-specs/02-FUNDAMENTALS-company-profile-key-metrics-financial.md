# FUNDAMENTALS (company profile, key metrics, financial statements, quarterly results, growth, ratio trends, FMP key-metrics/growth/analyst estimates)


# FUNDAMENTALS — Precise Extraction & Merge Spec

Two files implement fundamentals:

- `C:\Users\KRISH\Desktop\Finance-V2\backend\app\services\providers.py` — raw fetch + parse per source.
- `C:\Users\KRISH\Desktop\Finance-V2\backend\app\services\dashboard.py` — orchestration, fallback order, derivations, and the final shape returned to the frontend.

All amounts are normalized to **INR crore** (divide raw INR by `10_000_000`) unless noted. Market caps from yfinance/FMP-screener are divided by `84.0` (hardcoded USD-conversion hack) in some paths — noted inline. The helper `_to_float` strips commas, rejects non-finite.

Symbol convention: callers strip `.NS`/`.BO` to a `base_symbol`. FMP/yfinance methods re-append `.NS` (default) or use given `.BO`. Trendlyne methods always use the stripped uppercase `key`. `market_symbol` in dashboard = `f"{base}.BO"` if exchange==BSE else `base`.

---

## 1. ORCHESTRATION (dashboard.py `_fetch_provider_data`, lines 645-683; merge in `get_dashboard`, lines 248-618)

18 providers fired concurrently via `asyncio.create_task(_safe_provider_call(coro, timeout))` then `asyncio.wait(tasks, timeout=12)`. Pending tasks are cancelled -> `None`. Each call has its own per-call timeout (seconds, in parens). The tuple unpack order (lines 258-277) is EXACT and must be preserved:

1. `get_nse_quote(base)` (5)
2. `get_nse_corporate_events(base)` (7)
3. `get_nse_quarterly_results(base)` (7)
4. `get_news(f"{base} India stock")` (5)
5. `get_yahoo_quote(market_symbol)` (5)
6. `get_yahoo_candles(base or base.BO->base, history_days)` (7)
7. `get_yfinance_bundle(market_symbol, history_days)` (10)
8. `get_fmp_quote(market_symbol)` (5)
9. `get_fmp_candles(market_symbol, "5Y")` (7)
10. `get_fmp_quarterly_results(market_symbol)` (7)
11. `get_fmp_profile(market_symbol)` (5)
12. `get_fmp_key_metrics(market_symbol)` (6)
13. `get_fmp_financial_growth(market_symbol)` (6)
14. `get_fmp_analyst_estimates(market_symbol)` (5)
15. `get_trendlyne_brokerage(base)` (6)
16. `get_trendlyne_financials(base)` (8)
17. `get_trendlyne_shareholding(base)` (6)
18. `get_trendlyne_documents(base)` (9)

`history_days = max(_timeframe_days(timeframe), 1825)`. Base data starts from `get_sample_dashboard(symbol=base)` then is overwritten by live sources.

---

## 2. COMPANY PROFILE

Final shape: `data["companyName"]`, `data["sector"]`, and `data["profile"]` dict with keys: `industry, description, website, chairman, previousName, ceo, employees, ipoDate, country`.

### 2a. Primary source — yfinance (`providers._get_yfinance_bundle_sync`, profile block lines 3562-3570)
Built from `yf.Ticker(chosen).info` (lazy property fetched in a ThreadPoolExecutor, line 3181). Ticker chosen by trying `[base.NS, base.BO]` (or `[key]` if already suffixed); first whose 10y history is non-empty wins (lines 3127-3148).

Field mapping:
- `companyName` = `info["longName"]` or `info["shortName"]`
- `sector` = `info["sector"]`
- `industry` = `info["industry"]`
- `description` = `info["longBusinessSummary"]`
- `website` = `info["website"]`
- `chairman` = first `officer["name"]` in `info["companyOfficers"]` where `'chairman' in officer["title"].lower()`, else `"N/A"` (line 3568)
- `previousName` = `info.get("previousName", "N/A")`

### 2b. Merge into dashboard (lines 381-396)
yfinance profile applied if present: sets companyName/sector unconditionally if truthy; sets profile.industry/description/website/chairman/previousName if truthy.

### 2c. FMP profile enrichment — FALLBACK ONLY (dashboard lines 414-431)
From `providers.get_fmp_profile` (providers lines 216-243). Endpoint `https://financialmodelingprep.com/stable/profile?symbol={SYM}&apikey={fmp_api_key}` (returns a list; uses `payload[0]`). FMP fields:
- `ceo` = `p["ceo"]` or `p["CEO"]`
- `employees` = `p["fullTimeEmployees"]` or `p["employees"]`
- `ipoDate` = `p["ipoDate"]`  (this is the "incorporation/IPO year" proxy)
- `country`, `city`, `exchange`, `currency`(default INR), `description`, `website`, `industry`, `sector`

Dashboard merge: description/website/industry set **only if not already set** by yfinance (`and not data["profile"].get(...)`). `sector` set only if `data["sector"]` empty. `ceo`/`employees`/`ipoDate`/`country` always set if truthy (these are FMP-exclusive — yfinance doesn't supply them).

### 2d. Company name additional fallbacks
- `get_fmp_quote` sets `data["companyName"] = fmp_quote["name"]` if present (line 410-411).
- Trendlyne supplies company name elsewhere via slug derivation (`_trendlyne_name_from_slug`, providers 945-963) used in search, not in profile merge directly.

### NOTE: incorporation year, HQ, chairman/CEO details
- "Incorporation year" is NOT directly fetched; closest is FMP `ipoDate`. HQ proxied by FMP `country`/`city` (only `country` is merged). Chairman from yfinance officers; CEO from FMP.

---

## 3. KEY METRICS (`data["metrics"]`)

### 3a. Primary — yfinance bundle metrics (providers lines 3473-3561; dashboard merge 352-375)
Computed from `tk.info` + `tk.fast_info` + statements. Dashboard copies these keys if non-None: `marketCap, peRatio, industryPe, pegRatio, pbRatio, bookValue, eps, ebitdaMargin, dividendYield, roe, roce, roa, debtToEquity, totalDebt, faceValue, outstandingShares, currentRatio, evToSales`.

Exact construction (providers):
- `marketCap` = `(fast_info.marketCap or info.marketCap)/10_000_000` (crore) (line 3539)
- `peRatio` = `info["trailingPE"]`
- `industryPe` = None (filled later)
- `pegRatio` = `info["pegRatio"]` or `info["trailingPegRatio"]` or `derived_peg` (derived = `trailingPE / earnings_growth_pct`, earnings_growth from 4Q vs prev-4Q net income, lines 3520-3524)
- `pbRatio` = `info["priceToBook"]`
- `bookValue` = `info["bookValue"]`; if None and pb & price -> `currentPrice/priceToBook` (3484-3486)
- `eps` = `info["trailingEps"]`
- `ebitdaMargin` = `info["ebitdaMargins"] * 100` (3546-3550)
- `dividendYield` (3499-3506): if `dividendRate` & price>0 -> `dividendRate/price*100`; elif `trailingAnnualDividendYield`>0 -> `*100`; elif `dividendYield` -> as-is if >1 else `*100`
- `roe` = `info["returnOnEquity"]*100` else `derived_roe` (3552); derived_roe = `net_income_ttm/avg_equity*100`
- `roa` = `info["returnOnAssets"]*100` else `derived_roa` = `net_income_ttm/avg_assets*100`
- `roce` = `info["returnOnCapital"]*100` else `derived_roce` = `ebit_ttm/invested_capital*100`
- `debtToEquity` = `info["debtToEquity"]` (divided by 100 if raw>5) else `derived_debt_to_equity` = `total_debt/avg_equity` (3496-3497, 3555)
- `totalDebt` = `info["totalDebt"]/10_000_000` (crore)
- `faceValue` = `info["faceValue"]`
- `outstandingShares` = `info["sharesOutstanding"]/10_000_000` (crore)
- `currentRatio` = `info["currentRatio"]` else `derived_current_ratio` (current_assets/current_liabilities from quarterly balance, 3331-3341)
- `evToSales` = `info["enterpriseToRevenue"]`; if None/<=0/>100 and EV & revenue -> `enterpriseValue/totalRevenue`; null if >100 (3508-3518)

Derivation inputs (statements via yfinance, lines 3247-3370):
- TTM net income = sum of net income over `latest_four_quarters` (quarterly_income_stmt cols [:4]); fallback to annual_income col[0] if 0/None.
- TTM EBIT similarly.
- avg_equity = mean(equity latest, prev annual balance); avg_assets similar.
- invested_capital = annual `Invested Capital`; fallback `assets_latest - current_liabilities`.
- statement key lists (lines 3275-3292): revenue_keys=["Total Revenue","Revenue","Operating Revenue"]; net_income_keys=["Net Income","Net Income Common Stockholders","Net Income From Continuing Operation Net Minority Interest"]; ebit_keys=["EBIT","Operating Income","Operating Income Or Loss","Pretax Income","Pre Tax Income"]; equity_keys=["Stockholders Equity","Total Equity Gross Minority Interest","Common Stock Equity"]; assets_keys=["Total Assets"]; current_assets_keys=["Current Assets","Total Current Assets"]; current_liabilities_keys=["Current Liabilities","Total Current Liabilities"]; working_capital_keys=["Working Capital"]; debt_keys=["Total Debt","Net Debt"]; invested_capital_keys=["Invested Capital"].

### 3b. NSE quote metrics overlay (dashboard 305-323, only when exchange != BSE)
From `_get_nse_quote_sync` (providers 2213-2261) endpoint `https://www.nseindia.com/api/quote-equity?symbol={KEY}` (cookie-primed session). Sets if non-None: `peRatio` = `metadata.pdSymbolPe`; `industryPe` = `metadata.pdSectorPe`; `faceValue` = `securityInfo.faceValue`; `outstandingShares` = `securityInfo.issuedSize/10_000_000`. Also price fields (cmp/change/52wk).

### 3c. Yahoo quote overlay (dashboard 325-336)
From `get_yahoo_quote` v7 endpoint. `marketCap` = `yahoo.marketCap/10_000_000`; `peRatio` = `yahoo.trailingPE`; `dividendYield` = `yahoo.trailingAnnualDividendYield*100`. (Only fills price if no nse_quote.)

### 3d. FMP key-metrics back-fill (dashboard 434-464)
From `get_fmp_key_metrics` (providers 245-286). Endpoint `https://financialmodelingprep.com/stable/key-metrics?symbol={SYM}&period=annual&limit=5&apikey={fmp_api_key}`. Whole list -> `data["fmpKeyMetrics"]`. Most-recent row `[0]` back-fills metrics ONLY IF target key empty:
- `evToEbitda` <- `evToEbitda`; `pe` <- `peRatio`; `pb` <- `pbRatio`; `roe` <- `roe`; `roa` <- `roa`; `roic` <- `roic`; `debtToEquity` <- `debtToEquity`; `currentRatio` <- `currentRatio`.
- Always sets (no guard): `freeCashFlowPerShare, freeCashFlowYield, earningsYield, netDebtToEBITDA, priceToSales`(<-priceToSalesRatio).

FMP key-metrics row field map (providers 259-283): period(=date), revenuePerShare, netIncomePerShare, operatingCashFlowPerShare, freeCashFlowPerShare, cashPerShare, bookValuePerShare, enterpriseValue, evToEbitda(=evToEbitda or enterpriseValueOverEBITDA), evToOperatingCashFlow, evToFreeCashFlow, peRatio, priceToSalesRatio, pbRatio(=pbRatio or priceToBookRatio), dividendYield, debtToEquity, roe(=roe or returnOnEquity), roa(=roa or returnOnAssets), roic(=roic or returnOnInvestedCapital), currentRatio, earningsYield, freeCashFlowYield, netDebtToEBITDA.

### 3e. Final metric reconciliation (`_finalize_key_metrics`, dashboard 1303-1400)
- outstandingShares <- marketCap/cmp if missing; marketCap <- outstanding*cmp if missing.
- pbRatio <- cmp/bookValue; bookValue <- cmp/pbRatio (cross-fill).
- industryPe <- mean of competitor PEs (competitors empty here, so no-op).
- pegRatio <- pe/growth_pct using quarterly profit (q[-1] vs q[-5]) if peg missing.
- dividendYield: if >100 -> /100; if <0 -> None.
- debtToEquity: if >10 -> /100.
- evToSales: if >100 -> None.
- profitMargin derived from quarterlyDetailed netProfitMarginPct or NPM ratio-trend.
- pegRatio nulled if <=0.2 or >10. All values rounded to 2 dp at end.

### 3f. Ratio-trends metric enrichment (`_enrich_metrics_from_ratio_trends`, 1402-1434)
Adds `casaRatio` and `netInterestMargin` from `keyRatioTrends.liquidity` cards (latest series value or average3Y) if missing — banking metrics.

---

## 4. FINANCIAL STATEMENTS (income statement, balance sheet, cash flow — annual)

Final keys under `data["financials"]`: `quarterly, yearly, incomeStatement, balanceSheet, cashFlow` (each list of period rows in INR crore).

### 4a. Primary — yfinance (providers `_get_yfinance_bundle_sync` lines 3372-3448, dashboard merge 376-380)
Statements fetched as yfinance properties in parallel: `quarterly_income_stmt, income_stmt, balance_sheet, cashflow, quarterly_balance_sheet` (lines 3176-3193). `scaled_amount(v) = round(v/10_000_000, 2)` (crore). Period label = `col.strftime("%b %y")`.

- **financials["quarterly"]** (8 quarters, reversed): per col -> {period, revenue(=revenue_keys), profit(=net_income_keys)} (3380-3393).
- **financials["yearly"]** (5 annual, reversed; requires income+balance cols): {period, revenue, profit, assets(=Total Assets), cashFlow(=operating_cf_keys)} (3395-3412).
- **financials["incomeStatement"]** (5 annual cols [:5]): {period, revenue, ebit(=ebit_keys), netIncome(=net_income_keys)} (3414-3423).
- **financials["balanceSheet"]** (5 cols): {period, totalAssets, totalDebt(=debt_keys), equity(=equity_keys), currentAssets, currentLiabilities} (3425-3436).
- **financials["cashFlow"]** (5 cols): {period, operatingCashFlow, investingCashFlow(=["Investing Cash Flow","Cash Flow From Continuing Investing Activities"]), financingCashFlow(=["Financing Cash Flow","Cash Flow From Continuing Financing Activities"]), freeCashFlow(=["Free Cash Flow"])} (3438-3448). operating_cf_keys = ["Operating Cash Flow","Cash Flow From Continuing Operating Activities","Operating Cash Flow"].

Dashboard copies each of these 5 keys only if the yfinance value is truthy (376-380).

### 4b. Annual statement back-fill from Trendlyne (`_backfill_statement_tables`, dashboard 1200-1301)
If yfinance statement tables empty, build from `trendlyne_financials["annualConsolidated"] or ["annualStandalone"]` (preferring consolidated). Mapping from Trendlyne annual row (see 6c):
- yearly <- {period, revenue=totalRevenue, profit=netProfit, assets=assets, cashFlow=operatingCashFlow or financingProfit}.
- incomeStatement <- {period, revenue=totalRevenue, ebit=ebit, netIncome=netProfit}.
- balanceSheet <- {period, totalAssets=assets, totalDebt=totalDebt, equity=equity, currentAssets, currentLiabilities}.
- cashFlow <- {period, operatingCashFlow, investingCashFlow, financingCashFlow=financingCashFlow or financingProfit, freeCashFlow}.
Rows kept only if at least one numeric field present (`clean_rows`).

### 4c. FMP financial statements
Not used for the income/balance/cash tables directly except FMP quarterly results (section 5b) and FMP financial-growth/key-metrics. There is NO FMP annual income/balance/cashflow merge into `incomeStatement/balanceSheet/cashFlow`.

---

## 5. QUARTERLY RESULTS (standalone & consolidated, detailed incl. banking NPA/NIM)

Final keys: `data["financials"]["quarterly"]` (summary), `quarterlyConsolidated`, `quarterlyStandalone`, `quarterlyDetailedConsolidated`, `quarterlyDetailedStandalone`, plus `fmpQuarterly`. Merge precedence (dashboard 499-547): **NSE first (5a), then FMP overlay (5b), then Trendlyne OVERWRITES (5c)** — Trendlyne is the winning source when present.

### 5a. NSE quarterly results (providers `_get_nse_quarterly_results_sync`, lines 2263-2476)
Endpoint: `https://www.nseindia.com/api/corporates-financial-results?index=equities&symbol={KEY}&period=Quarterly&from_date={dd-mm-yyyy}&to_date={dd-mm-yyyy}` (6-year window). Cookie-primed session; 401/403 -> re-prime `https://www.nseindia.com` once and retry.
Each result row has an `xbrl` URL (`.xml`). Up to 4 quarters per mode (`standalone`/`consolidated`, mode = consolidated if `item["consolidated"]` startswith "consolidated"). XBRL files fetched in parallel ThreadPoolExecutor.

**XBRL parsing** (`_parse_nse_quarter_xbrl_values`, 2558-2630): namespace `{http://www.xbrl.org/2003/instance}`. Maps contexts to (startDate,endDate). For each numeric element (local tag), scores by context-date match to the quarter's from/to ISO dates (+10 exact both, +6 endDate match) and contextRef prefix (`one*`+4, `four*`+1); keeps highest-scoring value per tag. Returns `{localTag: value}`. Cached by xbrl_url.

`_pick_metric(values, keys)` returns first present key. Field key lists:
- revenue_keys = [RevenueFromOperations, RevenueFromOperationsDisclosedInStatementOfProfitAndLoss, TotalRevenue, Revenue, Income, SegmentRevenueFromOperations]
- profit_keys = [ProfitLossForThePeriod, ProfitLossForPeriod, ProfitLossForPeriodFromContinuingOperations, ProfitLossAfterTaxesMinorityInterestAndShareOfProfitLossOfAssociates, NetProfitLossForPeriod, NetProfitLoss, ProfitLossFromOrdinaryActivitiesAfterTax]
- Detailed row (2419-2458): interestEarned=[InterestEarned,RevenueOnInvestments]; otherIncome=[OtherIncome]; expenses=[Expenses,ExpenditureExcludingProvisionsAndContingencies]; interestExpended=[InterestExpended,FinanceCosts]; operatingExpenses=[OperatingExpenses,OtherOperatingExpenses,EmployeeBenefitExpense,OtherExpenses]; operatingProfit=[OperatingProfitBeforeProvisionAndContingencies,OperatingProfit,ProfitBeforeExceptionalItemsAndTax,SegmentProfitBeforeTax]; depreciations=[DepreciationDepletionAndAmortisationExpense,DepreciationAndAmortisationExpense]; profitBeforeTax=[ProfitBeforeTax,ProfitLossFromOrdinaryActivitiesBeforeTax,ProfitBeforeExceptionalItemsAndTax,SegmentProfitBeforeTax]; tax=[TaxExpense,CurrentTax]; basicEps=[BasicEarningsPerShareAfterExtraordinaryItems,...BeforeExtraordinaryItems, ...FromContinuingAndDiscontinuedOperations, ...FromContinuingOperations]; dilutedEps similar (Diluted*).
- **Banking NPA**: grossNpa amount=[GrossNPA,GrossNpa]; netNpa amount=[NetNPA,NetNpa]; grossNpa pct=[PercentageOfGrossNpa,GrossNpaPercentage]; netNpa pct=[PercentageOfNpa,NetNpaPercentage]. Row sets `grossNpa`= amount if present else pct; `grossNpaIsPercent = amount is None and pct is not None` (same for netNpa).

period text = `to_d` parsed `%d-%b-%Y` -> `%b %y`. Summary rows: {period, revenue(/1e7 crore), profit(/1e7 crore), fromDate, toDate, filingDate}.
`_compute_nse_quarterly_derived_rows` (2478-2549): computes `netInterestIncome` (=interestEarned-interestExpended if missing), `opmPct`, `taxPct`, `netProfitMarginPct`, YoY growth (`*GrowthPct` vs row idx-4), then scales monetary keys /1e7 (skipping NPA when isPercent), rounds.

Dashboard merge (499-516): sets quarterlyConsolidated/Standalone and quarterlyDetailed* from NSE; `quarterly` = consolidated or standalone.

### 5b. FMP quarterly results (providers `get_fmp_quarterly_results`, lines 151-214)
Endpoint `https://financialmodelingprep.com/stable/income-statement?symbol={SYM}&period=quarter&limit=12&apikey={fmp_api_key}`. Returns most-recent 8 quarters (`sorted[-8:]`). Per item maps FMP -> TradeBrains-style fields, monetary /1e7 crore: period(=date `%b %y`), totalRevenue(=revenue), netProfit(=netIncome), profitBeforeTax(=incomeBeforeTax), tax(=incomeTaxExpense), expenses(=operatingExpenses), operatingProfit(=operatingIncome), basicEps(=eps), dilutedEps(=epsdiluted), interestEarned(=interestIncome), interestExpended(=interestExpense), netInterestIncome(=netInterestIncome, or earned-expended if 0), opmPct, taxPct, netProfitMarginPct.
Dashboard (518-525): always sets `data["financials"]["fmpQuarterly"]`; if no NSE quarterly, FMP becomes `quarterly` + `quarterlyConsolidated`.

### 5c. Trendlyne financials/quarterly (providers `_get_trendlyne_financials_sync`, 1447-1737) — WINNING SOURCE
Page URL pattern: `https://trendlyne.com/fundamentals/financials/{stock_id}/{KEY}/{slug}/` (referer `https://trendlyne.com/`). stock_id+slug from equity meta map (section 7). HTML scraped with regex `data-tablesurl="([^"]+)"`; that data URL is fetched with `NSE_HEADERS` + referer=page_url; JSON parsed, `payload["body"]`.

`_parse_trendlyne_financials_payload` (1493-1737) reads body keys: `quarterlyOrder`(list), `quarterlyDataDump`(dict keyed by `"standalone"`/`"consolidated"` then period), `annualOrder`, `annualDataDump`. Selects latest 4 quarters (reversed), latest 6 annual.
period_label: parse `%b %Y`/`%B %Y` -> `%b %y`.

**Quarterly modes** (`parse_mode`, 1526-1592): For each mode key:
- revenue = first of [TOTAL_SR_Q, SR_Q, OperatingIncome_Q, TOTAL_INCOME_Q, Income_Q]
- profit = first of [NP_Q, PAT_Q, PL_After_TaxFromOrdineryActivities_Q, ProfitAfterTax_Q, NetProfit_Q]
- pbt = PBT_Q; tax = TAX_Q.
- summary row: {period, revenue, profit}.
- detailed row keys: totalRevenue([TOTAL_SR_Q,SR_Q,TOTAL_INCOME_Q,Income_Q]), totalRevenueGrowthPct(REV4Q_Q), operatingRevenue([OperatingIncome_Q,SR_Q,RevenueFromOperations_Q]), otherIncome([OI_Q,Others_Q,IncomeOnInvestment_Q,OtherIncome_Q]), expenses(OEXPNS_Q), interestExpended(INT_Q), operatingExpenses(OEXPNS_Q), operatingProfit([OP_Q,OperatingProfitBeforeProvisionsAndContingencies_Q,EBITDA_Q,EBIT_Q]), opmPct([OPMPCT_Q,EBITDAMargin_Q,OperatingMargin_Q]), depreciations(DEP_Q), profitBeforeTax(pbt), tax, taxPct(tax/pbt*100), netProfit, netProfitGrowthPct(NP_Q_GROWTH), netProfitMarginPct(NETPCT_Q), epsAdjusted([EPS_adj_Q,EPSAdjusted_Q]), basicEps([EPS_Q,BasicEPS_Q]), dilutedEps(AfterDilutedEPS_Q), netProfitTtm(NP_TTM), basicEpsTtm(EPS_TTM), **grossNpa([GNPARAT_Q,GrossNPA_Q]), netNpa([NNPARAT_Q,NetNPA_Q]), grossNpaIsPercent(=GNPARAT_Q present), netNpaIsPercent(=NNPARAT_Q present)** — banking.

Dashboard merge (527-547): Trendlyne consolidated/standalone OVERWRITE quarterlyConsolidated/Standalone and Detailed*; `quarterly` = trendlyne consolidated or standalone; sets `data["financials"]["keyRatioTrends"]` = ratioTrendsConsolidated or ratioTrendsStandalone.

### 5d. Quarterly back-fill (`_backfill_quarterly_financials`, 1153-1198)
Cleans quarterly/quarterlyConsolidated/quarterlyStandalone to last 4 rows; if summary empty but Detailed present, derives summary from totalRevenue/netProfit.

---

## 6. ANNUAL / GROWTH / KEY RATIO TRENDS (Trendlyne body)

### 6a. Annual statements (`parse_annual_mode`, 1594-1627) -> trendlyne_financials["annualStandalone"|"annualConsolidated"]
Per annual period row keys: totalRevenue([TOTAL_SR_A,SR_A,TotalOperatingRevenues_A,TOTAL_INCOME_A,Income_A]), netProfit([NP_A,PAT_A,NetProfit_A,ProfitAfterTax_A]), ebit([OP_A,EBIT_A,EBITDA_A,OperatingProfit_A]), assets([TA_A,TotalAssets_A,TOT_ASSETS_A]), totalDebt([TD_A,TotalDebt_A,Borrowings_A]), equity([NW_A,NetWorth_A,Equity_A]), currentAssets([CA_A,CurrentAssets_A]), currentLiabilities([CL_A,CurrentLiabilities_A]), operatingCashFlow([CFO_A,OperatingCashFlow_A,OCF_A]), investingCashFlow([CFI_A,InvestingCashFlow_A,ICF_A]), financingProfit([CFA_A,CashFlowFromFinancingActivities_A]), freeCashFlow([FCF_A,FreeCashFlow_A]), dividend([DividendPerShare_A,DIV_A,EquityShareDividend_A,Dividend_A]).

### 6b. Key ratio trends (`parse_ratio_trends`, 1629-1717) -> trendlyne_financials["ratioTrends{Standalone|Consolidated}"]
From annualDataDump mode, up to 6 annual periods (reversed). Annual point keys: roe(ROE_A), roce(ROCE_A), roa(ROA_A), npm(NETPCT_A), pe(PE_A), evEbitda(EVPerEBITDA_A), pbv(PBV_A), pcf(PCFO_A), netNpa([NNPARAT_A,NetNPAToAdvancesPercentage_A]), casa(CASA_A), nim(NIM_A), advances(Advances_A). period label = year (parse `%b %Y` -> year, else last 4 chars).
Output 3 groups, each list of cards {label, average3Y(mean last 3), series(last 5 {period,value})}:
- **profitability**: ROE, ROCE, ROA, NPM
- **valuation**: P/E Ratio(pe), EV/EBITDA(evEbitda), Price to Book Value(pbv), Price to Cash Flow(pcf)
- **liquidity** (banking): NET NPA(netNpa), CASA Ratio(casa), Advance Growth(YoY growth of advances, computed), Net Interest Margin(nim)

### 6c. Final key-ratio-trend assembly (`_finalize_key_ratio_trends`, dashboard 1460-1677)
Clones Trendlyne cards. Derives missing cards: Price-to-Cash-Flow (from cashFlow rows + price history + sharesOutstanding); NET NPA (from quarterlyDetailed netNpa). For NON-financial sectors (sector lacks financial/bank/insurance) it REPLACES the liquidity group entirely with: Current Ratio (currentAssets/currentLiabilities from balanceSheet), Debt to Equity (totalDebt/equity), Asset Turnover (revenue/assets from yearly), Operating CF Margin (cashFlow/revenue*100). Blank cards dropped. (NOTE: function is duplicated in the file at 1679-1872 — a stray/dead second copy with a bug referencing `net_npa_card`/`recent_values` out of scope; the live one is 1460-1677.)

### 6d. Financial growth snapshot (`_build_financial_growth_snapshot`, dashboard 1874-2008; also stray duplicate at 1679 region)
Source priority: `trendlyne_financials.annualConsolidated` else `annualStandalone` else derive from `financials["yearly"]`. basis = "consolidated"/"standalone". Builds 3 periods (1/3/5 Year CAGR) each with metrics: Revenue Growth(totalRevenue), Net Profit Growth(netProfit), Dividend Growth(dividend or grouped dividend totals from corporate-actions dividends), Stock Returns CAGR(from returnsSummary). 1yr = simple % change; 3/5yr = CAGR. Returns `{basis, periods}` -> `data["financials"]["growthSnapshot"]`.

### 6e. FMP financial-growth (providers `get_fmp_financial_growth`, 288-318; dashboard 467-478)
Endpoint `https://financialmodelingprep.com/stable/financial-growth?symbol={SYM}&period=annual&limit=5&apikey={fmp_api_key}`. List -> `data["fmpFinancialGrowth"]`. Most-recent `[0]` sets `data["financials"]["growthSnapshot"]` = {revenueGrowth, netIncomeGrowth, epsGrowth, freeCashFlowGrowth, operatingIncomeGrowth} (NOTE: this assignment happens BEFORE the Trendlyne-based snapshot at 587-594, which OVERWRITES it if non-empty — so Trendlyne growth snapshot is the final winner; FMP snapshot survives only if Trendlyne/yearly produce nothing).
FMP growth row map (302-314): period(=date), revenueGrowth, netIncomeGrowth, epsGrowth(=epsGrowth or epsgrowth), operatingIncomeGrowth, grossProfitGrowth, ebitgrowth, freeCashFlowGrowth, assetGrowth, bookValueperShareGrowth, debtGrowth, dividendsperShareGrowth.

---

## 7. ANALYST ESTIMATES (`data["analystEstimates"]`)
From `get_fmp_analyst_estimates` (providers 320-350; dashboard 481-482). Endpoint `https://financialmodelingprep.com/stable/analyst-estimates?symbol={SYM}&period=annual&limit=4&apikey={fmp_api_key}`. List set directly to `data["analystEstimates"]` if truthy. Row map (334-346): period(=date), estimatedRevenueLow/High/Avg, estimatedEpsLow/High/Avg, estimatedNetIncomeLow/High/Avg, numberAnalystEstimatedRevenue, numberAnalystsEstimatedEps.

---

## 8. TRENDLYNE EQUITY META RESOLUTION (needed for ALL Trendlyne fundamentals URLs)
`_resolve_trendlyne_equity_meta(symbol)` (providers 638-654) -> `(stock_id, slug)` via `_refresh_trendlyne_equity_map_if_needed` (595-636), 6-hour cache. Built from sitemap `https://trendlyne.com/equity-sitemap-stocks.xml`, regex `/equity/(\d+)/([^/]+)/([^/]+)/` -> {symbol_upper: (stock_id, slug)}. Fallback fills from research-report map (`/research-reports/stock/(\d+)/([^/]+)/([^/]+)/`). Lookup: exact symbol, else normalized (strip non-alnum) match. All Trendlyne fundamentals URLs (financials, shareholding, documents, bulk-block) embed `{stock_id}` and `{slug}`.

Caches: trendlyne_financials/shareholding/documents caches are 900s (15 min); on fetch exception, return stale cached value.


## External APIs

### FMP company profile
- URL: `https://financialmodelingprep.com/stable/profile?symbol={SYM}&apikey={fmp_api_key}`
- GET via httpx _get (retry stop_after_attempt(1)). SYM = base or base.NS/.BO. Returns JSON list, use payload[0]. Fields: ceo|CEO, fullTimeEmployees|employees, ipoDate, country, city, exchange, currency(def INR), description, website, industry, sector. Dashboard: description/website/industry only fill if yfinance missing; ceo/employees/ipoDate/country always.

### FMP key-metrics
- URL: `https://financialmodelingprep.com/stable/key-metrics?symbol={SYM}&period=annual&limit=5&apikey={fmp_api_key}`
- GET. List of annual rows. Fields incl revenuePerShare, bookValuePerShare, enterpriseValue, evToEbitda(or enterpriseValueOverEBITDA), peRatio, priceToSalesRatio, pbRatio(or priceToBookRatio), dividendYield, debtToEquity, roe(or returnOnEquity), roa, roic(or returnOnInvestedCapital), currentRatio, earningsYield, freeCashFlowYield, netDebtToEBITDA, freeCashFlowPerShare. -> data.fmpKeyMetrics + back-fill metrics.

### FMP financial-growth
- URL: `https://financialmodelingprep.com/stable/financial-growth?symbol={SYM}&period=annual&limit=5&apikey={fmp_api_key}`
- GET. List. Fields: revenueGrowth, netIncomeGrowth, epsGrowth(or epsgrowth), operatingIncomeGrowth, grossProfitGrowth, ebitgrowth, freeCashFlowGrowth, assetGrowth, bookValueperShareGrowth, debtGrowth, dividendsperShareGrowth. -> data.fmpFinancialGrowth; latest[0] -> growthSnapshot (overwritten later by Trendlyne snapshot).

### FMP analyst-estimates
- URL: `https://financialmodelingprep.com/stable/analyst-estimates?symbol={SYM}&period=annual&limit=4&apikey={fmp_api_key}`
- GET. List -> data.analystEstimates. Fields: estimatedRevenue/Eps/NetIncome Low/High/Avg, numberAnalystEstimatedRevenue, numberAnalystsEstimatedEps.

### FMP quarterly income-statement
- URL: `https://financialmodelingprep.com/stable/income-statement?symbol={SYM}&period=quarter&limit=12&apikey={fmp_api_key}`
- GET. Returns 12, kept last 8 sorted asc. Maps revenue,netIncome,incomeBeforeTax,incomeTaxExpense,operatingExpenses,operatingIncome,eps,epsdiluted,interestIncome,interestExpense,netInterestIncome -> crore (/1e7). -> data.financials.fmpQuarterly; fallback for quarterly if no NSE.

### FMP quote
- URL: `https://financialmodelingprep.com/stable/quote?symbol={SYM}&apikey={fmp_api_key}`
- GET list[0]. price,change,changePercentage,dayHigh,dayLow,volume,name. Used as price fallback + companyName.

### NSE quote-equity
- URL: `https://www.nseindia.com/api/quote-equity?symbol={KEY}`
- GET with cookie-primed requests.Session (NSE_HEADERS, prime GET https://www.nseindia.com). 401/403 -> re-prime + retry once. metadata.pdSymbolPe->peRatio, metadata.pdSectorPe->industryPe, securityInfo.faceValue->faceValue, securityInfo.issuedSize/1e7->outstandingShares, priceInfo.* price, weekHighLow.max/min->52wk. Overlay only when exchange!=BSE.

### NSE corporates-financial-results (quarterly)
- URL: `https://www.nseindia.com/api/corporates-financial-results?index=equities&symbol={KEY}&period=Quarterly&from_date={dd-mm-yyyy}&to_date={dd-mm-yyyy}`
- GET cookie-primed. 6-year window. Each row has xbrl .xml URL. Up to 4 quarters x standalone/consolidated. mode=consolidated if item.consolidated startswith 'consolidated'.

### NSE XBRL instance docs
- URL: `{xbrl_url from results} (e.g. https://www.nseindia.com/.../*.xml)`
- GET with accept xml + referer nseindia. ns {http://www.xbrl.org/2003/instance}. Score elements by context start/end date vs quarter from/to ISO and contextRef prefix (one*/four*). Cached by url. Returns {localTag:value}. NPA tags: GrossNPA/GrossNpa, NetNPA/NetNpa, PercentageOfGrossNpa, PercentageOfNpa.

### Trendlyne financials page
- URL: `https://trendlyne.com/fundamentals/financials/{stock_id}/{KEY}/{slug}/`
- GET (WEB_PAGE_HEADERS + referer https://trendlyne.com/). Scrape regex data-tablesurl="([^"]+)" -> data URL fetched with NSE_HEADERS + referer=page_url -> JSON payload['body']. body keys: quarterlyOrder, quarterlyDataDump{standalone|consolidated}{period}, annualOrder, annualDataDump. 15-min cache, stale-on-error.

### Trendlyne equity sitemap (id/slug resolver)
- URL: `https://trendlyne.com/equity-sitemap-stocks.xml`
- GET (WEB_PAGE_HEADERS). regex /equity/(\d+)/([^/]+)/([^/]+)/ -> {SYMBOL:(stock_id,slug)}. 6h cache. Fallback fill from research-report map. Required to build every Trendlyne fundamentals URL.


## Gotchas
- Source precedence for QUARTERLY results: NSE (XBRL) -> FMP (overlay, fmpQuarterly + fallback) -> Trendlyne OVERWRITES quarterlyConsolidated/Standalone/Detailed and quarterly. Trendlyne is the final winner when present. keyRatioTrends only comes from Trendlyne body.
- Source precedence for PROFILE/METRICS: yfinance is primary; FMP profile fills description/website/industry ONLY if yfinance left them empty, but ceo/employees/ipoDate/country always (FMP-exclusive). NSE quote overlays PE/industryPE/faceValue/outstandingShares (exchange!=BSE only). Yahoo quote overlays marketCap/PE/divYield.
- growthSnapshot is set TWICE: FMP financial-growth[0] at lines 467-478, then Trendlyne/yearly-based _build_financial_growth_snapshot at 587-594 OVERWRITES it if it returns non-empty. So FMP growth snapshot survives only when Trendlyne+yearly yield nothing.
- All INR monetary values normalized to crore by dividing by 10_000_000. EXCEPTION: yfinance screener marketCap and BSE scrip marketCap divided by 84.0 (USD hack) — but yfinance BUNDLE marketCap is /1e7 (crore). FMP screener marketCap is raw USD (not converted).
- Banking detection: NPA fields (grossNpa/netNpa with *IsPercent flags) come through both NSE XBRL and Trendlyne (GNPARAT_Q/NNPARAT_Q = percent form). NIM/CASA only from Trendlyne ratio trends (NIM_A/CASA_A) and surfaced into metrics via _enrich_metrics_from_ratio_trends.
- Trendlyne URLs REQUIRE (stock_id, slug) from the equity sitemap map; if the 6h-cached map is empty/missing the symbol, ALL Trendlyne fundamentals return None silently.
- Trendlyne financials data-tablesurl indirection: the financials PAGE only contains a pointer (data-tablesurl) to a second JSON endpoint; you must fetch that second URL with NSE_HEADERS and referer=page_url to get body.
- Trendlyne caches (financials/shareholding/documents) are 900s; on any fetch exception the method returns the STALE cached value (graceful degradation), or None if never cached.
- yfinance ticker selection: tries [base.NS, base.BO] (or [key] if already suffixed); picks first with non-empty 10y history. Statements/info/news/fast_info fetched in a ThreadPoolExecutor for speed.
- derived metrics (roe/roa/roce/peg/debtToEquity/currentRatio/evToSales) are computed in yfinance bundle as fallbacks when info-provided values are absent; _finalize_key_metrics then cross-fills and sanitizes (divYield>100 ->/100, D/E>10 ->/100, evToSales>100->None, peg in (0.2,10] only).
- _finalize_key_ratio_trends and _build_financial_growth_snapshot each appear DUPLICATED in dashboard.py; the second copies (around lines 1679-1872 / earlier 1796-1800 fragment) contain out-of-scope variable references (net_npa_card, recent_values) and are stray/dead — the canonical live definitions are _finalize_key_ratio_trends @1460-1677 and _build_financial_growth_snapshot @1874-2008.
- NSE quarterly: max 4 quarters per mode; xbrl URL must end with .xml or row skipped; revenue AND profit both required or quarter dropped.
- FMP append-suffix guard: every FMP/yfinance method checks for existing .NS/.BO before appending .NS to avoid double-suffix (.NS.NS).