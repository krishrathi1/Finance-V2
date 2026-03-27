import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Manrope, Space_Grotesk } from "next/font/google";

import { DisplaySettingsProvider } from "@/components/display-settings-provider";
import { DisplaySettingsToggle } from "@/components/display-settings-toggle";
import { MarketStatusBadge } from "@/components/market-status-badge";
import { ModeToggle } from "@/components/mode-toggle";
import { NavLinks } from "@/components/nav-links";
import { MarketTicker } from "@/components/market-ticker";
import { ScrollProgress } from "@/components/scroll-progress";
import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-space" });

const BASE_URL = "https://mystockvision.com";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "MyStockVision — AI Stock Analysis India | NSE & BSE",
    template: "%s | MyStockVision",
  },
  description:
    "India's AI-powered stock analysis platform. Get Smart Scores, risk ratings, financial statements, brokerage reports, key ratios, IPO calendar, and live NSE & BSE market data — free.",
  keywords: [
    "stock analysis India",
    "NSE BSE stock screener",
    "Indian stock market",
    "share price today",
    "AI stock score",
    "fundamental analysis India",
    "stock research platform",
    "free stock analysis",
    "best stocks to buy India",
    "IPO 2024 India",
    "Nifty 50 analysis",
    "Sensex stocks",
    "equity research India",
    "smart score stock",
    "stock risk analysis",
    "financial statements India",
    "brokerage report",
    "stock screener India",
    "portfolio tracker India",
    "stock comparison tool",
    "market cap India",
    "PE ratio India",
    "dividend stocks India",
    "smallcap midcap largecap India",
    "NSE stock data",
    "BSE stock data",
    "Reliance TCS Infosys HDFC stock",
    "mystockvision",
    "financial forensics AI",
  ],
  authors: [{ name: "MyStockVision", url: BASE_URL }],
  creator: "MyStockVision",
  publisher: "MyStockVision",
  category: "Finance",
  classification: "Stock Market Analysis",
  alternates: {
    canonical: BASE_URL,
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: BASE_URL,
    siteName: "MyStockVision",
    title: "MyStockVision — AI Stock Analysis India | NSE & BSE",
    description:
      "India's AI-powered stock research platform. Smart Scores, risk ratings, financials, IPO calendar & live market data for NSE & BSE stocks — completely free.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "MyStockVision — AI Stock Analysis India",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@mystockvision",
    creator: "@mystockvision",
    title: "MyStockVision — AI Stock Analysis India | NSE & BSE",
    description:
      "Free AI-powered stock analysis for Indian equities. Smart Scores, risk ratings, financials & live NSE/BSE data.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "add-your-google-search-console-verification-code-here",
  },
  other: {
    "theme-color": "#f59e0b",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  "@id": `${BASE_URL}/#website`,
                  url: BASE_URL,
                  name: "MyStockVision",
                  description: "AI-powered Indian stock analysis platform — NSE & BSE",
                  publisher: { "@id": `${BASE_URL}/#organization` },
                  potentialAction: {
                    "@type": "SearchAction",
                    target: {
                      "@type": "EntryPoint",
                      urlTemplate: `${BASE_URL}/stocks/{search_term_string}`,
                    },
                    "query-input": "required name=search_term_string",
                  },
                  inLanguage: "en-IN",
                },
                {
                  "@type": "Organization",
                  "@id": `${BASE_URL}/#organization`,
                  name: "MyStockVision",
                  url: BASE_URL,
                  logo: {
                    "@type": "ImageObject",
                    url: `${BASE_URL}/favicon.ico`,
                  },
                  sameAs: [],
                },
                {
                  "@type": "WebApplication",
                  "@id": `${BASE_URL}/#webapp`,
                  name: "MyStockVision — AI Stock Analysis",
                  url: BASE_URL,
                  applicationCategory: "FinanceApplication",
                  operatingSystem: "All",
                  offers: {
                    "@type": "Offer",
                    price: "0",
                    priceCurrency: "INR",
                  },
                  featureList: [
                    "AI Smart Score for NSE & BSE stocks",
                    "Risk analysis and rating",
                    "Financial statements and key ratios",
                    "Brokerage research reports",
                    "IPO calendar and analysis",
                    "Stock screener with filters",
                    "Portfolio tracker",
                    "Live market data",
                  ],
                },
              ],
            }),
          }}
        />
      </head>
      <body className={`${manrope.variable} ${space.variable} min-h-screen font-[var(--font-manrope)]`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <DisplaySettingsProvider>
            <ScrollProgress />

            {/* ── Header ── */}
            <header className="header-enter sticky top-0 z-40 border-b border-border/40 bg-bg/80 backdrop-blur-xl">
              <div className="mx-auto flex max-w-[1640px] items-center justify-between px-3 py-2.5 sm:px-5 sm:py-3 md:px-7">

                {/* Logo */}
                <Link href="/" className="group min-w-0 flex-shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-amber-400 shadow-lg shadow-accent/30 transition group-hover:shadow-accent/50 group-hover:scale-105">
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="relative z-10">
                        <polyline points="1,12 5,7 9,10 15,3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="15" cy="3" r="1.5" fill="white"/>
                      </svg>
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-[var(--font-space)] text-sm font-bold leading-none tracking-tight sm:text-base">
                        <span className="bg-gradient-to-r from-accent via-amber-400 to-orange-400 bg-clip-text text-transparent">
                          Financial Forensics
                        </span>
                        <span className="ml-1 text-text/80">AI</span>
                      </p>
                      <p className="mt-0.5 hidden text-[10px] font-medium text-muted sm:block">
                        NSE · BSE Intelligence Platform
                      </p>
                    </div>
                  </div>
                </Link>

                {/* Right controls */}
                <div className="flex items-center gap-1.5 sm:gap-2.5">
                  <NavLinks />
                  <div className="hidden h-4 w-px bg-border/60 sm:block" />
                  <DisplaySettingsToggle />
                  <ModeToggle />
                </div>
              </div>

              <div className="border-t border-border/25 bg-bg/40">
                <MarketTicker />
              </div>
            </header>

            {/* ── Main ── */}
            <main className="page-enter mx-auto max-w-[1640px] px-3 py-4 sm:px-5 sm:py-5 md:px-7 md:py-7">
              {children}
            </main>

            {/* ── Footer ── */}
            <footer className="mt-12 border-t border-border/40 bg-panel/20 backdrop-blur-sm">
              <div className="h-px w-full bg-gradient-to-r from-transparent via-accent/35 to-transparent" />

              <div className="mx-auto max-w-[1640px] px-5 py-10 md:px-7">
                <div className="grid grid-cols-2 gap-8 sm:grid-cols-2 md:grid-cols-4">

                  {/* Brand */}
                  <div className="col-span-2 md:col-span-1">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-amber-400 shadow-md shadow-accent/25">
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <polyline points="1,12 5,7 9,10 15,3" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                          <circle cx="15" cy="3" r="1.5" fill="white"/>
                        </svg>
                      </div>
                      <p className="font-[var(--font-space)] text-sm font-bold">
                        <span className="bg-gradient-to-r from-accent to-amber-400 bg-clip-text text-transparent">StockVision AI</span>
                      </p>
                    </div>
                    <p className="mt-3 max-w-[210px] text-xs leading-5 text-muted">
                      AI-powered equity research for NSE &amp; BSE — Smart Scores, risk analysis &amp; live market data.
                    </p>
                    <div className="mt-3">
                      <MarketStatusBadge />
                    </div>
                  </div>

                  {/* Tools */}
                  <div>
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted">Tools</p>
                    <nav className="flex flex-col gap-2.5">
                      {[
                        { href: "/screener", label: "Stock Screener" },
                        { href: "/screener/ai", label: "AI Screener" },
                        { href: "/compare", label: "Compare Stocks" },
                        { href: "/portfolio", label: "Portfolio Tracker" },
                      ].map(({ href, label }) => (
                        <Link key={href} href={href} className="text-xs text-muted transition hover:text-accent">
                          {label}
                        </Link>
                      ))}
                    </nav>
                  </div>

                  {/* Market */}
                  <div>
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted">Market</p>
                    <nav className="flex flex-col gap-2.5">
                      {[
                        { href: "/watchlist", label: "Watchlist" },
                        { href: "/ipo", label: "IPO Calendar" },
                        { href: "/alerts", label: "Price Alerts" },
                      ].map(({ href, label }) => (
                        <Link key={href} href={href} className="text-xs text-muted transition hover:text-accent">
                          {label}
                        </Link>
                      ))}
                    </nav>
                  </div>

                  {/* AI Features */}
                  <div>
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted">AI Features</p>
                    <div className="flex flex-col gap-2">
                      {["Smart Score™", "AI Risk Analysis", "Earnings TL;DR", "Portfolio Doctor", "Competitor Verdict"].map((f) => (
                        <div key={f} className="flex items-center gap-1.5 text-xs text-muted">
                          <span className="h-1 w-1 flex-shrink-0 rounded-full bg-accent/70" />
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom bar */}
                <div className="mt-8 flex flex-col items-start justify-between gap-3 border-t border-border/30 pt-5 sm:flex-row sm:items-center">
                  <p className="text-[11px] text-muted/60">
                    Data sourced from NSE, BSE &amp; public APIs. Not investment advice.
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full border border-border/50 bg-panel/60 px-2 py-0.5 text-[10px] font-medium text-muted">
                      Beta v1.0
                    </span>
                    <p className="text-[11px] text-muted/60">
                      &copy; {new Date().getFullYear()} StockVision AI
                    </p>
                  </div>
                </div>
              </div>
            </footer>
          </DisplaySettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
