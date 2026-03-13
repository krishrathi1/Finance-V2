# TradeBrains Comparison Report

Updated: 2026-03-13

Reference page reviewed: `https://portal.tradebrains.in/stocks/ICICIBANK`

## Scope note

This comparison is section/function parity, not pixel-perfect UI parity.

The TradeBrains portal page is JavaScript-rendered and could not be fully scraped in this environment, so this report uses:

- the public stock-page route and visible structure available from the page
- the section set already replicated in your app
- the feature set commonly exposed on the ICICIBANK TradeBrains portal page

Confidence level: medium

## 1) What your app already covers well

| TradeBrains-style area | Current status in your app | Notes |
|---|---|---|
| Company overview | Present | Overview text plus profile card |
| Company essentials / quick metrics | Present | 16-card essentials block now aligned to the reference layout |
| Price chart with ranges | Present | 1D, 1W, 1M, 1Y, 5Y range switching |
| Smart Score / Risk Score | Present | Custom local scoring plus Gemini explanation path |
| Brokerage / analyst report updates | Present | Trendlyne-backed report cards and action mix |
| Corporate actions | Present | Dividends, meetings, insider trades, deals, splits, bonus, rights, AGM/EGM |
| Quarterly results | Present | Standalone + consolidated, latest 4 quarters, expandable rows |
| Financial statements | Present | Trendlyne-backed detailed quarterly + annual view |
| CAGR / growth snapshot | Present | 1Y / 3Y / 5Y growth cards |
| Shareholding pattern | Present | Quarter dropdown, donut chart, top shareholders |
| Key ratio trends | Present | Profitability, valuation, liquidity trend cards |
| Documents | Present | Annual reports, investor presentations, credit ratings, exchange filings |
| News | Present | Symbol-level news section |
| Stock search | Present | Live search universe, not just hardcoded symbols |

## 2) Partial parity areas

| Area | Current status | Gap |
|---|---|---|
| Advanced chart tooling | Partial | You have range switching and expand mode, but not a full advanced chart with overlays/indicator toggles like a full terminal-style panel |
| Sector / peer comparison | Partial | Backend still computes peer context, but the dedicated competitors section is currently removed from the UI |
| Management / company facts | Partial | Profile covers incorporation, HQ, chairman, previous name, website; not a broader management roster |
| Broker consensus summary | Partial | You show buy/hold/sell counts and individual reports, but not a separate consensus target summary block |
| Market-status indicator | Implemented now | Header badge now shows live/closed state with hover timing |

## 3) What is still left if you want closer parity

1. Restore a visible `Competitors / Peer Compare` section
2. Add a richer `About the business` facts grid
3. Add a more advanced chart mode with overlays like moving averages and volume
4. Add broker consensus target aggregation separate from the report list
5. Add more management-level company data if you want closer portal-style company detail depth

## 4) Recommended next priority

If the goal is closest parity with the TradeBrains stock page, the highest-value missing item is:

`Bring back a visible peer/competitor comparison section`

Reason:

- TradeBrains-style stock pages rely heavily on sector/peer context
- your backend already has most of the raw data scaffolding
- it improves valuation interpretation more than adding another decorative widget

## 5) Files relevant to this comparison in your app

- [page.tsx](/c:/Users/KRISH/Desktop/Finance/frontend/app/stocks/[symbol]/page.tsx)
- [company-overview.tsx](/c:/Users/KRISH/Desktop/Finance/frontend/components/sections/company-overview.tsx)
- [metrics-grid.tsx](/c:/Users/KRISH/Desktop/Finance/frontend/components/sections/metrics-grid.tsx)
- [price-sidebar.tsx](/c:/Users/KRISH/Desktop/Finance/frontend/components/sections/price-sidebar.tsx)
- [brokerage-summary.tsx](/c:/Users/KRISH/Desktop/Finance/frontend/components/sections/brokerage-summary.tsx)
- [financials-section.tsx](/c:/Users/KRISH/Desktop/Finance/frontend/components/sections/financials-section.tsx)
- [quarterly-results-section.tsx](/c:/Users/KRISH/Desktop/Finance/frontend/components/sections/quarterly-results-section.tsx)
- [shareholding-section.tsx](/c:/Users/KRISH/Desktop/Finance/frontend/components/sections/shareholding-section.tsx)
- [key-ratios-section.tsx](/c:/Users/KRISH/Desktop/Finance/frontend/components/sections/key-ratios-section.tsx)
- [documents-section.tsx](/c:/Users/KRISH/Desktop/Finance/frontend/components/sections/documents-section.tsx)
